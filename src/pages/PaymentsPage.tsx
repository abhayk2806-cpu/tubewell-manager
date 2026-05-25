import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Farmer, Payment } from '@/types';
import { format, parse } from 'date-fns';
import {
  Plus, Trash2, Edit2, X, Check, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle, MessageCircle, Send, Zap, Layers,
} from 'lucide-react';
import {
  DEFAULT_PAYMENT_TEMPLATE,
  buildPaymentMessage,
  buildWaMeUrl,
  fetchTemplate,
  formatDateForMessage,
  formatRupees,
  logWhatsAppSend,
} from '@/lib/whatsapp';

// Raw usage shape for month-wise due computation
type RawUsage = { farmer_id: string; amount: number; month: string };

// ============================================================================
// WhatsApp helpers — single & multi-month
// ============================================================================
//
// IMPORTANT RULES (also in CLAUDE.md):
//   - previous_due / new_due are ALWAYS computed by querying Supabase at send-time
//     (NOT from React state) — protects against concurrent entries by other users.
//   - For multi-month groups: paid_before for each month MUST exclude every row
//     in the SAME payment_group_id (not just the current row), so that the
//     "before this user action" baseline is correct.
//   - Single-month payments use the editable DB template (DEFAULT_PAYMENT_TEMPLATE).
//   - Multi-month summary uses a hard-coded format (not template-driven) because
//     the existing template placeholders ({previous_due}, {amount_paid}, ...) only
//     support one month. The hard-coded format is single-message and shows each
//     month's allocation, previous_due, and new_due.
// ============================================================================

interface PaymentSendArgs {
  payment: Payment;
  farmer: Farmer;
  messageType: 'payment_received' | 'manual_resend';
  userId: string | null;
  userEmail: string | null;
}

async function buildAndLogPaymentWhatsApp({
  payment, farmer, messageType, userId, userEmail,
}: PaymentSendArgs): Promise<string | null> {
  if (!farmer.whatsapp_number) return null;
  if (!payment.for_month) {
    console.error('[whatsapp] payment has no for_month — cannot compute due correctly');
    return null;
  }

  // Send-time DB queries — DO NOT read from React state.
  const [{ data: usageRows, error: usageErr }, { data: paymentRows, error: paymentsErr }] =
    await Promise.all([
      supabase
        .from('usage_entries')
        .select('amount')
        .eq('farmer_id', payment.farmer_id)
        .eq('month', payment.for_month),
      supabase
        .from('payments')
        .select('amount, id')
        .eq('farmer_id', payment.farmer_id)
        .eq('for_month', payment.for_month)
        .neq('id', payment.id),
    ]);

  if (usageErr) console.error('[whatsapp] usage fetch failed:', usageErr);
  if (paymentsErr) console.error('[whatsapp] payments fetch failed:', paymentsErr);

  const usageSum = (usageRows || []).reduce((s, u) => s + Number(u.amount || 0), 0);
  const paidBefore = (paymentRows || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const paidAfter = paidBefore + Number(payment.amount || 0);

  // Cap at 0 per Option 1 overpayment policy (no advance credit tracking)
  const previousDue = Math.max(0, usageSum - paidBefore);
  const newDue = Math.max(0, usageSum - paidAfter);

  const tpl = await fetchTemplate('payment_received');
  const templateText = tpl?.template_text ?? DEFAULT_PAYMENT_TEMPLATE;

  const message = buildPaymentMessage(templateText, {
    farmer_name: farmer.name,
    previous_due: formatRupees(previousDue),
    amount_paid: formatRupees(Number(payment.amount || 0)),
    new_due: formatRupees(newDue),
    for_month: payment.for_month,
    date: formatDateForMessage(payment.date),
  });

  const { error: logErr } = await logWhatsAppSend({
    farmerId: farmer.id,
    messageType,
    relatedEntryId: payment.id,
    messageText: message,
    whatsappNumber: farmer.whatsapp_number,
    userId,
    userEmail,
  });
  if (logErr) console.error('[whatsapp] payment log insert failed:', logErr);

  return buildWaMeUrl(farmer.whatsapp_number, message);
}

interface MultiPaymentSendArgs {
  payments: Payment[]; // all rows in one payment_group_id; same farmer_id; same date
  farmer: Farmer;
  messageType: 'payment_received' | 'manual_resend';
  userId: string | null;
  userEmail: string | null;
}

async function buildAndLogMultiMonthPaymentWhatsApp({
  payments, farmer, messageType, userId, userEmail,
}: MultiPaymentSendArgs): Promise<string | null> {
  if (!farmer.whatsapp_number) return null;
  if (payments.length === 0) return null;
  const groupId = payments[0].payment_group_id;
  if (!groupId) return null;

  const farmerId = payments[0].farmer_id;
  const months = payments.map(p => p.for_month).filter(Boolean);
  if (months.length === 0) return null;

  // Order months chronologically for a sensible message order
  const sortedMonths = [...new Set(months)].sort((a, b) => {
    const da = parse(a, 'MMMM yyyy', new Date());
    const db = parse(b, 'MMMM yyyy', new Date());
    return da.getTime() - db.getTime();
  });

  // Send-time DB queries: usage per month + ALL payments for those months for this farmer
  const [{ data: usageRows, error: usageErr }, { data: allPayments, error: paymentsErr }] =
    await Promise.all([
      supabase
        .from('usage_entries')
        .select('amount, month')
        .eq('farmer_id', farmerId)
        .in('month', sortedMonths),
      supabase
        .from('payments')
        .select('amount, for_month, payment_group_id')
        .eq('farmer_id', farmerId)
        .in('for_month', sortedMonths),
    ]);

  if (usageErr) console.error('[whatsapp] multi usage fetch failed:', usageErr);
  if (paymentsErr) console.error('[whatsapp] multi payments fetch failed:', paymentsErr);

  // Build per-month sums
  const usageSumByMonth: Record<string, number> = {};
  sortedMonths.forEach(m => (usageSumByMonth[m] = 0));
  (usageRows || []).forEach(u => {
    usageSumByMonth[u.month] = (usageSumByMonth[u.month] || 0) + Number(u.amount || 0);
  });

  // paid_before for each month = sum of all payments EXCLUDING this payment_group
  // (so single-month payments outside this group are still included)
  const paidBeforeByMonth: Record<string, number> = {};
  sortedMonths.forEach(m => (paidBeforeByMonth[m] = 0));
  (allPayments || []).forEach(p => {
    if (p.payment_group_id !== groupId) {
      paidBeforeByMonth[p.for_month] =
        (paidBeforeByMonth[p.for_month] || 0) + Number(p.amount || 0);
    }
  });

  // Per-month allocations from THIS group
  const allocatedByMonth: Record<string, number> = {};
  payments.forEach(p => {
    allocatedByMonth[p.for_month] =
      (allocatedByMonth[p.for_month] || 0) + Number(p.amount || 0);
  });

  const totalAmount = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  // Compose message (hard-coded — see comment block at top of file)
  const lines: string[] = [];
  lines.push(`Namaste ${farmer.name} ji 🙏`);
  lines.push('');
  lines.push(`Payment receive ho gaya: ₹${formatRupees(totalAmount)}`);
  lines.push('');
  lines.push('💰 Allocation:');

  sortedMonths.forEach(m => {
    const usageSum = usageSumByMonth[m] || 0;
    const paidBefore = paidBeforeByMonth[m] || 0;
    const allocated = allocatedByMonth[m] || 0;
    const previousDue = Math.max(0, usageSum - paidBefore);
    const newDue = Math.max(0, usageSum - paidBefore - allocated);
    lines.push(`📅 ${m}`);
    lines.push(`   Pichla baki: ₹${formatRupees(previousDue)}`);
    lines.push(`   Abhi diya: ₹${formatRupees(allocated)}`);
    lines.push(`   Ab baki: ₹${formatRupees(newDue)}`);
  });

  lines.push('');
  lines.push(`Date: ${formatDateForMessage(payments[0].date)}`);
  lines.push('');
  lines.push('— Tubewell Manager');

  const message = lines.join('\n');

  // Log ONE entry (related_entry_id = first row's id)
  const { error: logErr } = await logWhatsAppSend({
    farmerId: farmer.id,
    messageType,
    relatedEntryId: payments[0].id,
    messageText: message,
    whatsappNumber: farmer.whatsapp_number,
    userId,
    userEmail,
  });
  if (logErr) console.error('[whatsapp] multi-month payment log insert failed:', logErr);

  return buildWaMeUrl(farmer.whatsapp_number, message);
}

// ============================================================================
// Component
// ============================================================================

type PayMode = 'single' | 'multi';

const PaymentsPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [prefillHandled, setPrefillHandled] = useState(false);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [rawUsage, setRawUsage] = useState<RawUsage[]>([]);
  const [closedMonths, setClosedMonths] = useState<{ farmer_id: string; month: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [expandedFarmer, setExpandedFarmer] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'success' | 'info' | 'warn'>('success');

  // Banner state — after a successful save (single or multi)
  type LastSavedSingle = { kind: 'single'; payment: Payment; farmer: Farmer };
  type LastSavedMulti = { kind: 'multi'; payments: Payment[]; farmer: Farmer };
  const [lastSaved, setLastSaved] = useState<LastSavedSingle | LastSavedMulti | null>(null);
  const [sendingWa, setSendingWa] = useState(false);

  // Form state — single mode (existing flow)
  const [form, setForm] = useState({
    farmer_id: '',
    amount: '',
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    for_month: '',
  });
  // Form state — multi mode
  const [payMode, setPayMode] = useState<PayMode>('single');
  // Per-month allocation { month: amount as string }; presence in object = selected
  const [multiAllocations, setMultiAllocations] = useState<Record<string, string>>({});

  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string, type: 'success' | 'info' | 'warn' = 'success') => {
    setToast(msg); setToastType(type); setTimeout(() => setToast(''), 3500);
  };

  const loadData = async () => {
    setLoading(true);
    const [{ data: f }, { data: p }, { data: u }, { data: mc }] = await Promise.all([
      supabase.from('farmers').select('*').eq('is_deleted', false).eq('is_disabled', false).order('name'),
      supabase.from('payments').select('*').order('date', { ascending: false }),
      supabase.from('usage_entries').select('farmer_id, amount, month'),
      supabase.from('month_closings').select('farmer_id, month'),
    ]);

    const activeFarmerIds = new Set((f || []).map((x) => x.id));
    const activeUsage = (u || []).filter((x) => activeFarmerIds.has(x.farmer_id));

    setFarmers(f || []);
    setPayments(p || []);
    setRawUsage(activeUsage);
    setClosedMonths(mc || []);

    const currentMonth = format(new Date(), 'MMMM yyyy');
    const usageMonths = [...new Set((u || []).map((x: RawUsage) => x.month))];
    if (usageMonths.includes(currentMonth)) setSelectedMonth(currentMonth);
    else if (usageMonths.length > 0) setSelectedMonth(usageMonths[0]);
    else setSelectedMonth(currentMonth);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // ── Deep-link prefill ──────────────────────────────────────
  // Opens the Add Payment form pre-filled from URL params, e.g.
  //   /payments?farmer_id=xxx&for_month=April 2026&amount=500
  // Triggered from FarmerDetailPage's "Pay" buttons. Single-shot — params are
  // cleared after handling so refresh / re-navigation doesn't re-open.
  useEffect(() => {
    if (loading || prefillHandled || farmers.length === 0) return;
    const farmerId = searchParams.get('farmer_id');
    if (!farmerId) { setPrefillHandled(true); return; }
    const farmer = farmers.find(f => f.id === farmerId);
    if (!farmer) { setPrefillHandled(true); return; }
    const forMonth = searchParams.get('for_month') || '';
    const amount = searchParams.get('amount') || '';

    setEditPayment(null);
    setPayMode('single');
    setMultiAllocations({});
    setForm({
      farmer_id: farmerId,
      amount,
      date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      for_month: forMonth,
    });
    setFormError('');
    setShowForm(true);
    setPrefillHandled(true);
    // Clear URL params so refresh doesn't re-open the form
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, farmers, prefillHandled]);

  // -------------------------------------------------------
  // Per-farmer month-wise due computation
  // -------------------------------------------------------
  const getMonthDuesForFarmer = (farmerId: string, excludePaymentId?: string) => {
    const farmerUsage = rawUsage.filter(u => u.farmer_id === farmerId);
    const usageByMonth: Record<string, number> = {};
    farmerUsage.forEach(u => {
      usageByMonth[u.month] = (usageByMonth[u.month] || 0) + Number(u.amount);
    });

    const farmerPayments = payments.filter(p =>
      p.farmer_id === farmerId && p.id !== excludePaymentId
    );
    const paidByMonth: Record<string, number> = {};
    farmerPayments.forEach(p => {
      if (p.for_month) {
        paidByMonth[p.for_month] = (paidByMonth[p.for_month] || 0) + Number(p.amount);
      }
    });

    return Object.entries(usageByMonth)
      .map(([month, usage]) => ({
        month,
        usage,
        paid: paidByMonth[month] || 0,
        balance: usage - (paidByMonth[month] || 0),
      }))
      .sort((a, b) => {
        const da = parse(a.month, 'MMMM yyyy', new Date());
        const db = parse(b.month, 'MMMM yyyy', new Date());
        return da.getTime() - db.getTime(); // oldest first
      });
  };

  const farmerMonthDues = useMemo(() => {
    if (!form.farmer_id) return [];
    return getMonthDuesForFarmer(form.farmer_id, editPayment?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.farmer_id, payments, rawUsage, editPayment]);

  // Months eligible for multi-month selection (balance > 0)
  const farmerPendingMonths = useMemo(
    () => farmerMonthDues.filter(m => m.balance > 0),
    [farmerMonthDues],
  );

  const farmerAllTimeDue = useMemo(() => {
    const map: Record<string, number> = {};
    farmers.forEach(f => {
      const usage = rawUsage.filter(u => u.farmer_id === f.id).reduce((s, u) => s + Number(u.amount), 0);
      const paid = payments.filter(p => p.farmer_id === f.id).reduce((s, p) => s + Number(p.amount), 0);
      map[f.id] = Math.max(0, usage - paid);
    });
    return map;
  }, [farmers, rawUsage, payments]);

  const selectedMonthBalance = useMemo(() => {
    if (!form.farmer_id || !form.for_month) return null;
    const due = farmerMonthDues.find(m => m.month === form.for_month);
    return due ? due.balance : 0;
  }, [form.farmer_id, form.for_month, farmerMonthDues]);

  // Multi-mode total (sum of allocations)
  const multiTotal = useMemo(() => {
    return Object.values(multiAllocations).reduce((s, v) => {
      const n = parseFloat(v || '0');
      return s + (isFinite(n) ? n : 0);
    }, 0);
  }, [multiAllocations]);

  // Selected month list in multi-mode (chronological)
  const selectedMultiMonths = useMemo(() => {
    return Object.keys(multiAllocations).sort((a, b) => {
      const da = parse(a, 'MMMM yyyy', new Date());
      const db = parse(b, 'MMMM yyyy', new Date());
      return da.getTime() - db.getTime();
    });
  }, [multiAllocations]);

  // -------------------------------------------------------
  // Form open/close
  // -------------------------------------------------------
  const openAdd = () => {
    setEditPayment(null);
    const defaultDate = format(new Date(), "yyyy-MM-dd'T'HH:mm");
    setForm({ farmer_id: '', amount: '', date: defaultDate, for_month: '' });
    setMultiAllocations({});
    setPayMode('single');
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (p: Payment) => {
    setEditPayment(p);
    // Edit mode always operates on a SINGLE row (multi-month is a creation-time
    // convenience only). If the row has payment_group_id, the form shows a note
    // explaining that only this row is being edited.
    setPayMode('single');
    setMultiAllocations({});
    setForm({
      farmer_id: p.farmer_id,
      amount: p.amount.toString(),
      date: format(new Date(p.date), "yyyy-MM-dd'T'HH:mm"),
      for_month: p.for_month || '',
    });
    setFormError('');
    setShowForm(true);
  };

  const handleFarmerChange = (farmerId: string) => {
    setForm(prev => ({ ...prev, farmer_id: farmerId, for_month: '', amount: '' }));
    setMultiAllocations({}); // reset multi when farmer changes
  };

  const switchToMode = (mode: PayMode) => {
    setPayMode(mode);
    setFormError('');
    if (mode === 'single') {
      setMultiAllocations({});
    } else {
      // Switching to multi — reset single-mode month/amount; user picks chips next
      setForm(prev => ({ ...prev, for_month: '', amount: '' }));
    }
  };

  // FIFO auto-select for single mode: when farmer changes (add mode only),
  // pre-pick oldest unpaid month
  useEffect(() => {
    if (editPayment) return;
    if (payMode !== 'single') return;
    if (!form.farmer_id) return;
    const dues = getMonthDuesForFarmer(form.farmer_id);
    const oldestUnpaid = dues.find(m => m.balance > 0);
    setForm(prev => ({
      ...prev,
      for_month: oldestUnpaid ? oldestUnpaid.month : (dues[0]?.month || ''),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.farmer_id, payMode]);

  // -------------------------------------------------------
  // "Pura pending bharo" — single mode auto-fill
  // -------------------------------------------------------
  const handleFillFullPending = () => {
    if (selectedMonthBalance === null || selectedMonthBalance <= 0) return;
    setForm(prev => ({ ...prev, amount: selectedMonthBalance.toFixed(2) }));
  };

  // -------------------------------------------------------
  // Multi-mode toggle / allocation handlers
  // -------------------------------------------------------
  const toggleMultiMonth = (month: string, balance: number) => {
    setMultiAllocations(prev => {
      const next = { ...prev };
      if (month in next) {
        delete next[month];
      } else {
        // Default = full pending for that month
        next[month] = balance.toFixed(2);
      }
      return next;
    });
  };

  const updateMultiAllocation = (month: string, value: string) => {
    setMultiAllocations(prev => ({ ...prev, [month]: value }));
  };

  const handleFillAllPending = () => {
    // Select every pending month, default each to its full balance
    const next: Record<string, string> = {};
    farmerPendingMonths.forEach(m => {
      next[m.month] = m.balance.toFixed(2);
    });
    setMultiAllocations(next);
  };

  // -------------------------------------------------------
  // Save payment
  // -------------------------------------------------------
  const handleSave = async () => {
    if (!form.farmer_id) { setFormError('Kisan select karo'); return; }

    if (payMode === 'single') {
      if (!form.for_month) { setFormError('Kis month ke liye payment hai? Month select karo'); return; }
      const amount = parseFloat(form.amount);
      if (!amount || amount <= 0) { setFormError('Valid amount bharo'); return; }

      setSaving(true);
      setFormError('');

      const payload = {
        farmer_id: form.farmer_id,
        amount,
        date: new Date(form.date).toISOString(),
        for_month: form.for_month,
        created_by: user?.id,
        created_by_email: user?.email,
        // payment_group_id stays NULL for single-month payments
      };

      let savedRow: Payment | null = null;
      if (editPayment) {
        const { data, error } = await supabase
          .from('payments')
          .update(payload)
          .eq('id', editPayment.id)
          .select()
          .maybeSingle();
        if (error) { setFormError('Update nahi hua. Dobara try karo.'); setSaving(false); return; }
        savedRow = data as Payment | null;
        showToast('Payment update ho gayi ✓');
      } else {
        const { data, error } = await supabase
          .from('payments')
          .insert(payload)
          .select()
          .maybeSingle();
        if (error) { setFormError('Payment save nahi hui. Dobara try karo.'); setSaving(false); return; }
        savedRow = data as Payment | null;
        showToast('Payment add ho gaya ✓');
      }

      setSaving(false);
      setShowForm(false);

      const farmerOfPayment = farmers.find(f => f.id === form.farmer_id) || null;
      if (
        savedRow &&
        farmerOfPayment &&
        farmerOfPayment.whatsapp_enabled &&
        farmerOfPayment.whatsapp_number
      ) {
        setLastSaved({ kind: 'single', payment: savedRow, farmer: farmerOfPayment });
      } else {
        setLastSaved(null);
      }

      loadData();
      return;
    }

    // ============ MULTI MODE ============
    const months = Object.keys(multiAllocations);
    if (months.length === 0) {
      setFormError('Kam se kam ek month select karo'); return;
    }
    if (months.length < 2) {
      setFormError('Multi-month ke liye 2 ya zyada months chunein (ya single mode use karo)'); return;
    }
    // Validate every allocation
    const parsedAllocs: { month: string; amount: number }[] = [];
    for (const m of months) {
      const v = parseFloat(multiAllocations[m] || '0');
      if (!v || v <= 0 || !isFinite(v)) {
        setFormError(`${m} ka amount valid nahi hai`); return;
      }
      parsedAllocs.push({ month: m, amount: v });
    }

    setSaving(true);
    setFormError('');

    // Generate a single group UUID for all rows
    const groupId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        // Fallback (very old browsers) — unlikely needed
        : Array.from({ length: 36 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join('');

    const isoDate = new Date(form.date).toISOString();
    const rows = parsedAllocs.map(a => ({
      farmer_id: form.farmer_id,
      amount: a.amount,
      date: isoDate,
      for_month: a.month,
      created_by: user?.id,
      created_by_email: user?.email,
      payment_group_id: groupId,
    }));

    const { data, error } = await supabase
      .from('payments')
      .insert(rows)
      .select();

    if (error) {
      setFormError('Payment save nahi hui. Dobara try karo.');
      setSaving(false);
      console.error('[payments] multi-month insert failed:', error);
      return;
    }

    const savedRows = (data || []) as Payment[];
    showToast(`Multi-month payment ho gaya ✓ (${parsedAllocs.length} months)`);

    setSaving(false);
    setShowForm(false);

    const farmerOfPayment = farmers.find(f => f.id === form.farmer_id) || null;
    if (
      savedRows.length > 0 &&
      farmerOfPayment &&
      farmerOfPayment.whatsapp_enabled &&
      farmerOfPayment.whatsapp_number
    ) {
      setLastSaved({ kind: 'multi', payments: savedRows, farmer: farmerOfPayment });
    } else {
      setLastSaved(null);
    }

    loadData();
  };

  const handleDelete = async (p: Payment) => {
    // Warn if this row is part of a multi-month group
    if (p.payment_group_id) {
      const groupSize = payments.filter(x => x.payment_group_id === p.payment_group_id).length;
      if (groupSize > 1) {
        if (!confirm(
          `Yeh payment ${groupSize} months ke multi-month payment ka part hai.\n\n` +
          `Sirf is row (${p.for_month} — ₹${Number(p.amount).toLocaleString('en-IN')}) ko delete karna chahte ho?\n\n` +
          `Baki ke ${groupSize - 1} months affect nahi honge.`
        )) return;
      } else {
        if (!confirm('Yeh payment delete karna chahte ho?')) return;
      }
    } else {
      if (!confirm('Yeh payment delete karna chahte ho?')) return;
    }
    await supabase.from('payments').delete().eq('id', p.id);
    showToast('Payment delete ho gayi');
    if (lastSaved?.kind === 'single' && lastSaved.payment.id === p.id) setLastSaved(null);
    if (lastSaved?.kind === 'multi' && lastSaved.payments.some(x => x.id === p.id)) setLastSaved(null);
    loadData();
  };

  // -------------------------------------------------------
  // WhatsApp send handlers
  // -------------------------------------------------------
  const handleSendBannerWhatsApp = async () => {
    if (!lastSaved || sendingWa) return;
    setSendingWa(true);
    try {
      let url: string | null = null;
      if (lastSaved.kind === 'single') {
        url = await buildAndLogPaymentWhatsApp({
          payment: lastSaved.payment,
          farmer: lastSaved.farmer,
          messageType: 'payment_received',
          userId: user?.id ?? null,
          userEmail: user?.email ?? null,
        });
      } else {
        url = await buildAndLogMultiMonthPaymentWhatsApp({
          payments: lastSaved.payments,
          farmer: lastSaved.farmer,
          messageType: 'payment_received',
          userId: user?.id ?? null,
          userEmail: user?.email ?? null,
        });
      }
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        showToast('WhatsApp open ho gaya — message bhejo');
      } else {
        showToast('WhatsApp message build nahi ho saka', 'warn');
      }
    } catch (err) {
      console.error('[whatsapp] payment send banner failed:', err);
      showToast('WhatsApp nahi khul saka — dobara try karo', 'warn');
    } finally {
      setSendingWa(false);
      setLastSaved(null);
    }
  };

  const handleResendWhatsApp = async (payment: Payment, farmer: Farmer) => {
    if (sendingWa) return;
    if (!farmer.whatsapp_enabled || !farmer.whatsapp_number) return;
    setSendingWa(true);
    try {
      let url: string | null = null;
      // If this row is part of a multi-month group, send the summary message for the whole group
      if (payment.payment_group_id) {
        const groupRows = payments.filter(p => p.payment_group_id === payment.payment_group_id);
        if (groupRows.length > 1) {
          url = await buildAndLogMultiMonthPaymentWhatsApp({
            payments: groupRows,
            farmer,
            messageType: 'manual_resend',
            userId: user?.id ?? null,
            userEmail: user?.email ?? null,
          });
        } else {
          url = await buildAndLogPaymentWhatsApp({
            payment, farmer, messageType: 'manual_resend',
            userId: user?.id ?? null, userEmail: user?.email ?? null,
          });
        }
      } else {
        url = await buildAndLogPaymentWhatsApp({
          payment, farmer, messageType: 'manual_resend',
          userId: user?.id ?? null, userEmail: user?.email ?? null,
        });
      }
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        showToast('WhatsApp open ho gaya — message bhejo');
      } else {
        showToast('WhatsApp message build nahi ho saka', 'warn');
      }
    } catch (err) {
      console.error('[whatsapp] payment resend failed:', err);
      showToast('WhatsApp nahi khul saka — dobara try karo', 'warn');
    } finally {
      setSendingWa(false);
    }
  };

  // -------------------------------------------------------
  // Month close
  // -------------------------------------------------------
  const handleCloseMonth = async (farmerId: string, month: string) => {
    const farmerName = farmers.find(f => f.id === farmerId)?.name || '';
    const monthDues = getMonthDuesForFarmer(farmerId);
    const monthData = monthDues.find(m => m.month === month);
    const balance = monthData ? monthData.balance : 0;

    if (balance > 0) {
      if (!confirm(
        `${farmerName} ka ${month} abhi bhi ₹${balance.toFixed(2)} BAKI hai!\n\nKya aap fir bhi close karna chahte ho?`
      )) return;
    } else {
      if (!confirm(`${farmerName} ka ${month} fully cleared hai. Close mark karo?`)) return;
    }

    const { error } = await supabase.from('month_closings').upsert(
      { farmer_id: farmerId, month, closed_by: user?.id, closed_by_email: user?.email },
      { onConflict: 'farmer_id,month' }
    );
    if (!error) {
      showToast(
        balance > 0
          ? `${farmerName} ka ${month} closed (₹${balance.toFixed(2)} baaki tha)`
          : `${farmerName} ka ${month} closed ✓`,
        balance > 0 ? 'warn' : 'info'
      );
      loadData();
    }
  };

  const isMonthClosed = (farmerId: string, month: string) =>
    closedMonths.some(c => c.farmer_id === farmerId && c.month === month);

  // -------------------------------------------------------
  // Display
  // -------------------------------------------------------
  const allMonths = [...new Set(rawUsage.map(u => u.month))].sort((a, b) => {
    const da = parse(a, 'MMMM yyyy', new Date());
    const db = parse(b, 'MMMM yyyy', new Date());
    return db.getTime() - da.getTime();
  });

  const monthPayments = selectedMonth
    ? payments.filter(p => p.for_month === selectedMonth)
    : payments;

  const grouped = farmers.map(f => ({
    farmer: f,
    payments: monthPayments.filter(p => p.farmer_id === f.id),
  })).filter(g => g.payments.length > 0);

  const getMonthUsage = (farmerId: string, month: string) =>
    rawUsage
      .filter(u => u.farmer_id === farmerId && u.month === month)
      .reduce((s, u) => s + Number(u.amount), 0);

  // Group total amount lookup (for multi-month badge)
  const getGroupTotal = (groupId: string | null | undefined) => {
    if (!groupId) return 0;
    return payments
      .filter(p => p.payment_group_id === groupId)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
  };
  const getGroupSize = (groupId: string | null | undefined) => {
    if (!groupId) return 0;
    return payments.filter(p => p.payment_group_id === groupId).length;
  };

  const toastBg =
    toastType === 'warn' ? 'bg-amber-500' :
    toastType === 'info' ? 'bg-blue-600' :
    'bg-green-600';

  // Banner subtitle (single vs multi)
  const bannerSubtitle = (() => {
    if (!lastSaved) return '';
    if (lastSaved.kind === 'single') {
      return `₹${Number(lastSaved.payment.amount).toLocaleString('en-IN')} · For ${lastSaved.payment.for_month} — message mein baki balance bhi jaayega`;
    }
    const total = lastSaved.payments.reduce((s, p) => s + Number(p.amount), 0);
    const monthList = lastSaved.payments.map(p => p.for_month).join(', ');
    return `₹${total.toLocaleString('en-IN')} · ${lastSaved.payments.length} months: ${monthList}`;
  })();

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 left-4 right-4 z-50 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${toastBg}`}>
          <Check size={16} /> {toast}
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">
                {editPayment ? 'Payment Edit karo' : 'Paisa Add karo'}
              </h2>
              <button onClick={() => setShowForm(false)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Mode toggle — only in add mode (edit is always single-row) */}
            {!editPayment && (
              <div
                className="grid grid-cols-2 gap-1 p-1 rounded-xl"
                style={{ background: '#f3f4f6' }}
              >
                <button
                  type="button"
                  onClick={() => switchToMode('single')}
                  className={`py-2 rounded-lg text-sm font-medium transition-all ${
                    payMode === 'single'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500'
                  }`}
                >
                  Ek month
                </button>
                <button
                  type="button"
                  onClick={() => switchToMode('multi')}
                  className={`py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                    payMode === 'multi'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500'
                  }`}
                >
                  <Layers size={14} /> Multiple months
                </button>
              </div>
            )}

            {/* Edit notice for multi-month rows */}
            {editPayment?.payment_group_id && getGroupSize(editPayment.payment_group_id) > 1 && (
              <div className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
                <strong>Note:</strong> Yeh row ek {getGroupSize(editPayment.payment_group_id)}-month
                payment (kul ₹{getGroupTotal(editPayment.payment_group_id).toLocaleString('en-IN')}) ka part hai.
                Sirf is row ko edit kar rahe ho.
              </div>
            )}

            <div className="space-y-3">
              {/* Farmer select */}
              <div>
                <label className="text-sm font-medium text-gray-700">Kisan *</label>
                <select
                  value={form.farmer_id}
                  onChange={e => handleFarmerChange(e.target.value)}
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  style={{ borderColor: '#e5e2dc' }}
                >
                  <option value="">-- Kisan chunein --</option>
                  {farmers.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {farmerAllTimeDue[f.id] > 0
                        ? ` — Baki: ₹${farmerAllTimeDue[f.id].toLocaleString('en-IN')}`
                        : ' — ✓ Clear'}
                    </option>
                  ))}
                </select>
              </div>

              {/* ============ SINGLE MODE ============ */}
              {payMode === 'single' && form.farmer_id && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Kis month ke liye payment hai? *
                    </label>
                    {farmerMonthDues.length === 0 ? (
                      <div className="mt-1 px-4 py-3 rounded-xl bg-gray-50 text-sm text-gray-500">
                        Is kisan ka koi usage record nahi mila
                      </div>
                    ) : (
                      <select
                        value={form.for_month}
                        onChange={e => setForm(p => ({ ...p, for_month: e.target.value }))}
                        className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-green-500 bg-white"
                        style={{ borderColor: '#e5e2dc' }}
                      >
                        <option value="">-- Month chunein --</option>
                        {farmerMonthDues.map(m => (
                          <option key={m.month} value={m.month}>
                            {m.month}
                            {m.balance > 0
                              ? ` — Baki: ₹${m.balance.toFixed(2)}`
                              : ' — ✓ Clear'}
                          </option>
                        ))}
                      </select>
                    )}

                    {form.for_month && selectedMonthBalance !== null && (
                      <div className={`mt-2 px-4 py-2 rounded-xl text-sm border ${
                        selectedMonthBalance > 0
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-green-50 border-green-200 text-green-700'
                      }`}>
                        {form.for_month} ka balance:{' '}
                        <strong>
                          {selectedMonthBalance > 0
                            ? `₹${selectedMonthBalance.toFixed(2)} baki hai`
                            : '✓ Fully cleared'}
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Amount with "Pura pending bharo" chip */}
                  <div>
                    <label className="text-sm font-medium text-gray-700">Amount (₹) *</label>
                    <input
                      type="number" min="1"
                      value={form.amount}
                      onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-green-500"
                      style={{ borderColor: '#e5e2dc' }}
                    />
                    {/* "Pura pending bharo" button — shows only when month has balance > 0 */}
                    {selectedMonthBalance !== null && selectedMonthBalance > 0 && (
                      <button
                        type="button"
                        onClick={handleFillFullPending}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
                      >
                        <Zap size={12} />
                        Pura ₹{selectedMonthBalance.toFixed(2)} bharo
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* ============ MULTI MODE ============ */}
              {payMode === 'multi' && form.farmer_id && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-gray-700">
                        Kaunse months pay kar rahe ho? *
                      </label>
                      {farmerPendingMonths.length > 0 && (
                        <button
                          type="button"
                          onClick={handleFillAllPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                        >
                          <Zap size={11} /> Sab pending select
                        </button>
                      )}
                    </div>

                    {farmerPendingMonths.length === 0 ? (
                      <div className="mt-1 px-4 py-3 rounded-xl bg-gray-50 text-sm text-gray-500">
                        Is kisan ka koi pending month nahi hai
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {farmerPendingMonths.map(m => {
                          const selected = m.month in multiAllocations;
                          return (
                            <div
                              key={m.month}
                              className={`rounded-xl border p-3 transition-all ${
                                selected
                                  ? 'bg-green-50 border-green-300'
                                  : 'bg-white border-gray-200'
                              }`}
                            >
                              <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleMultiMonth(m.month, m.balance)}
                                  className="mt-1 w-4 h-4 accent-green-600"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm text-gray-900">{m.month}</span>
                                    <span className="text-xs text-amber-700 font-medium">
                                      Pending: ₹{m.balance.toFixed(2)}
                                    </span>
                                  </div>
                                  {selected && (
                                    <div className="mt-2 flex items-center gap-2">
                                      <span className="text-xs text-gray-600">Allocate:</span>
                                      <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={multiAllocations[m.month]}
                                        onChange={e => updateMultiAllocation(m.month, e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        className="flex-1 px-3 py-1.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                        style={{ borderColor: '#d1fae5' }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Multi total summary */}
                  {selectedMultiMonths.length > 0 && (
                    <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-green-800">
                          Total payment ({selectedMultiMonths.length} months):
                        </div>
                        <div className="text-lg font-bold text-green-800">
                          ₹{multiTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="text-xs text-green-700 mt-1">
                        {selectedMultiMonths.join(' + ')}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Date */}
              <div>
                <label className="text-sm font-medium text-gray-700">Payment Date</label>
                <input
                  type="datetime-local"
                  value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-green-500"
                  style={{ borderColor: '#e5e2dc' }}
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-red-500 text-sm">
                  <AlertCircle size={14} /> {formError}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-xl border font-medium text-gray-600"
                style={{ borderColor: '#e5e2dc' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave} disabled={saving}
                className="flex-1 py-3 rounded-xl text-white font-semibold disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
              >
                {saving ? 'Save ho raha...' : 'Save karo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between mb-4 pt-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500">{monthPayments.length} records</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium text-sm"
          style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
        >
          <Plus size={16} /> Paisa Add karo
        </button>
      </div>

      {/* WhatsApp send banner */}
      {lastSaved && (
        <div
          className="mb-4 rounded-2xl p-3 flex items-center justify-between gap-2"
          style={{ background: '#dcfce7', borderLeft: '4px solid #16a34a' }}
        >
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <MessageCircle size={18} className="text-green-700 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">
                {lastSaved.farmer.name} ko WhatsApp bhejo?
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {bannerSubtitle}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleSendBannerWhatsApp}
              disabled={sendingWa}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
            >
              <Send size={13} /> {sendingWa ? 'Bhej raha...' : 'WhatsApp Bhejo'}
            </button>
            <button
              onClick={() => setLastSaved(null)}
              disabled={sendingWa}
              className="p-2 rounded-lg text-gray-500 hover:bg-white/60 disabled:opacity-50"
              title="Skip"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Month Filter */}
      <div className="mb-4">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border text-sm bg-white outline-none"
          style={{ borderColor: '#e5e2dc' }}
        >
          <option value="">Sabhi Months</option>
          {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Payment List */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">Load ho raha hai...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          {selectedMonth ? `${selectedMonth} ke liye koi payment nahi` : 'Koi payment nahi hai'}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ farmer, payments: fPayments }) => {
            const totalPaid = fPayments.reduce((s, p) => s + Number(p.amount), 0);
            const monthUsage = selectedMonth ? getMonthUsage(farmer.id, selectedMonth) : 0;
            const isClosed = selectedMonth ? isMonthClosed(farmer.id, selectedMonth) : false;
            const isOpen = expandedFarmer === farmer.id;
            const waReady = farmer.whatsapp_enabled && !!farmer.whatsapp_number;

            return (
              <div
                key={farmer.id}
                className="bg-white rounded-2xl border shadow-sm overflow-hidden"
                style={{ borderColor: isClosed ? '#86efac' : '#e5e2dc' }}
              >
                <button
                  onClick={() => setExpandedFarmer(isOpen ? null : farmer.id)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
                    >
                      {farmer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{farmer.name}</span>
                        {waReady && (
                          <span
                            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100"
                            title="WhatsApp enabled"
                          >
                            <MessageCircle size={10} className="text-green-600" />
                          </span>
                        )}
                        {isClosed && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                            Closed ✓
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{fPayments.length} payments</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-bold text-green-600">
                        ₹{totalPaid.toLocaleString('en-IN')}
                      </div>
                      {monthUsage > 0 && (
                        <div className="text-xs text-gray-400">
                          of ₹{monthUsage.toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>
                    {isOpen
                      ? <ChevronUp size={18} className="text-gray-400" />
                      : <ChevronDown size={18} className="text-gray-400" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t" style={{ borderColor: '#f0ede8' }}>
                    {fPayments.map((p, idx) => {
                      const isGrouped = !!p.payment_group_id && getGroupSize(p.payment_group_id) > 1;
                      const groupTotal = isGrouped ? getGroupTotal(p.payment_group_id) : 0;
                      const groupSize = isGrouped ? getGroupSize(p.payment_group_id) : 0;
                      return (
                        <div
                          key={p.id}
                          className={`px-4 py-3 flex items-start justify-between ${idx < fPayments.length - 1 ? 'border-b' : ''}`}
                          style={{ borderColor: '#f5f5f4' }}
                        >
                          <div className="flex-1">
                            <div className="text-sm text-gray-600">
                              {format(new Date(p.date), 'dd MMM yyyy, hh:mm a')}
                            </div>
                            {p.for_month && (
                              <div className="text-xs text-blue-500 mt-0.5">
                                For: {p.for_month}
                              </div>
                            )}
                            {isGrouped && (
                              <div className="text-xs text-purple-600 mt-0.5 flex items-center gap-1">
                                <Layers size={10} />
                                Part of ₹{groupTotal.toLocaleString('en-IN')} ({groupSize}-month payment)
                              </div>
                            )}
                            {p.created_by_email && (
                              <div className="text-xs text-gray-400 mt-0.5">by: {p.created_by_email}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <div className="font-bold text-green-600">
                              ₹{Number(p.amount).toLocaleString('en-IN')}
                            </div>
                            {waReady && (
                              <button
                                onClick={() => handleResendWhatsApp(p, farmer)}
                                disabled={sendingWa}
                                className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 disabled:opacity-50"
                                title={isGrouped ? 'Multi-month WhatsApp dobara bhejo' : 'WhatsApp dobara bhejo'}
                              >
                                <MessageCircle size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => openEdit(p)}
                              className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(p)}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Month Close Button */}
                    {selectedMonth && !isClosed && (
                      <div className="px-4 py-3 bg-gray-50">
                        <button
                          onClick={() => handleCloseMonth(farmer.id, selectedMonth)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-green-300 text-green-700 text-sm font-medium hover:bg-green-50 transition-colors"
                        >
                          <CheckCircle2 size={16} />
                          {selectedMonth} ka hisaab close karo
                        </button>
                      </div>
                    )}
                    {selectedMonth && isClosed && (
                      <div className="px-4 py-2 bg-green-50 text-center text-xs text-green-700 font-medium">
                        ✓ {selectedMonth} ka hisaab cleared hai
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PaymentsPage;
