import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Farmer, UsageEntry, Payment, MonthClosing } from '@/types';
import { format, parse } from 'date-fns';
import {
  ArrowLeft,
  Droplets,
  Wallet,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Send,
  Phone,
  Layers,
  CalendarDays,
  TrendingUp,
} from 'lucide-react';
import {
  formatWhatsAppDisplay,
  buildWaMeUrl,
  buildPaymentMessage,
  fetchTemplate,
  DEFAULT_PAYMENT_TEMPLATE,
  formatDateForMessage,
  formatRupees,
  logWhatsAppSend,
} from '@/lib/whatsapp';
import { allocateMonth, formatMinutes, type EntryAllocation } from '@/lib/allocation';

// ── Helpers ──────────────────────────────────────────────────────────────────

interface MonthBreakdown {
  month: string;                 // "April 2026"
  usage_amount: number;
  usage_total_minutes: number;
  paid: number;
  due: number;                   // max(0, usage - paid)
  is_settled: boolean;           // due === 0 (and either usage or paid was nonzero)
  entries: UsageEntry[];
  payments: Payment[];
  is_closed: boolean;            // has a month_closing row
}

type LedgerRow =
  | { kind: 'usage'; date: string; entry: UsageEntry }
  | { kind: 'payment'; date: string; payment: Payment };

function formatHM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── Component ────────────────────────────────────────────────────────────────

const FarmerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [closings, setClosings] = useState<MonthClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState('');
  const [sendingWaPaymentId, setSendingWaPaymentId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ── Data load ──────────────────────────────────────────────────────────────
  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    const [
      { data: farmerData, error: farmerErr },
      { data: usageData },
      { data: paymentData },
      { data: closingData },
    ] = await Promise.all([
      supabase.from('farmers').select('*').eq('id', id).maybeSingle(),
      supabase.from('usage_entries').select('*').eq('farmer_id', id).order('date', { ascending: false }),
      supabase.from('payments').select('*').eq('farmer_id', id).order('date', { ascending: false }),
      supabase.from('month_closings').select('*').eq('farmer_id', id),
    ]);

    if (farmerErr || !farmerData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setFarmer({
      ...farmerData,
      is_disabled: farmerData.is_disabled ?? false,
      whatsapp_number: farmerData.whatsapp_number ?? null,
      whatsapp_enabled: farmerData.whatsapp_enabled ?? false,
      whatsapp_consent_at: farmerData.whatsapp_consent_at ?? null,
    });
    setEntries(usageData || []);
    setPayments(paymentData || []);
    setClosings(closingData || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const totalUsage = entries.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalDue = Math.max(0, totalUsage - totalPaid);
    const totalMinutes = entries.reduce((s, e) => s + Number(e.total_minutes || 0), 0);
    return { totalUsage, totalPaid, totalDue, totalMinutes };
  }, [entries, payments]);

  // Per-month breakdown — combines entries (by entry.month) + payments (by payment.for_month)
  const monthBreakdown: MonthBreakdown[] = useMemo(() => {
    const monthSet = new Set<string>();
    entries.forEach(e => e.month && monthSet.add(e.month));
    payments.forEach(p => p.for_month && monthSet.add(p.for_month));

    const closingMonths = new Set(closings.map(c => c.month));

    const rows: MonthBreakdown[] = Array.from(monthSet).map(month => {
      const mEntries = entries.filter(e => e.month === month);
      const mPayments = payments.filter(p => p.for_month === month);
      const usage_amount = mEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
      const usage_total_minutes = mEntries.reduce((s, e) => s + Number(e.total_minutes || 0), 0);
      const paid = mPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
      const due = Math.max(0, usage_amount - paid);
      const is_settled = due === 0 && (usage_amount > 0 || paid > 0);
      return {
        month,
        usage_amount,
        usage_total_minutes,
        paid,
        due,
        is_settled,
        entries: mEntries,
        payments: mPayments,
        is_closed: closingMonths.has(month),
      };
    });

    // Sort most-recent month first (parse "April 2026" → Date)
    return rows.sort((a, b) => {
      const da = parse(a.month, 'MMMM yyyy', new Date());
      const db = parse(b.month, 'MMMM yyyy', new Date());
      return db.getTime() - da.getTime();
    });
  }, [entries, payments, closings]);

  // Full chronological ledger — entries + payments interleaved by row date
  const ledger: LedgerRow[] = useMemo(() => {
    const rows: LedgerRow[] = [
      ...entries.map(e => ({ kind: 'usage' as const, date: e.date, entry: e })),
      ...payments.map(p => ({ kind: 'payment' as const, date: p.date, payment: p })),
    ];
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [entries, payments]);

  // Per-entry paid/partial/unpaid allocation (DERIVED — see src/lib/allocation.ts).
  // For each month, distribute that month's total paid across its entries FIFO.
  // Keyed by entry.id so the ledger can look up any entry's status in O(1).
  const entryAllocations = useMemo(() => {
    const map = new Map<string, EntryAllocation>();
    monthBreakdown.forEach(m => {
      const alloc = allocateMonth(m.entries, m.paid);
      alloc.entries.forEach(a => map.set(a.entry.id, a));
    });
    return map;
  }, [monthBreakdown]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleQuickPay = (forMonth?: string, prefillAmount?: number) => {
    if (!farmer) return;
    const params = new URLSearchParams();
    params.set('farmer_id', farmer.id);
    if (forMonth) params.set('for_month', forMonth);
    if (prefillAmount !== undefined && prefillAmount > 0) {
      params.set('amount', prefillAmount.toFixed(2));
    }
    navigate(`/payments?${params.toString()}`);
  };

  const handleAddUsage = () => {
    if (!farmer) return;
    const params = new URLSearchParams();
    params.set('farmer_id', farmer.id);
    navigate(`/usage?${params.toString()}`);
  };

  // Re-send a single-month payment WhatsApp from the ledger / month card.
  // For multi-month payments (with payment_group_id), we fall back to a single-month
  // message — full multi-month resend lives on PaymentsPage (already implemented).
  const handleResendPaymentWa = async (payment: Payment) => {
    if (!farmer || !farmer.whatsapp_enabled || !farmer.whatsapp_number) return;
    if (sendingWaPaymentId) return;
    setSendingWaPaymentId(payment.id);
    try {
      // Send-time DB queries (NOT React state) — see whatsapp.ts rules
      const [{ data: usageRows }, { data: paymentRows }] = await Promise.all([
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
      const usageSum = (usageRows || []).reduce((s, u) => s + Number(u.amount || 0), 0);
      const paidBefore = (paymentRows || []).reduce((s, p) => s + Number(p.amount || 0), 0);
      const paidAfter = paidBefore + Number(payment.amount || 0);
      const previousDue = Math.max(0, usageSum - paidBefore);
      const newDue = Math.max(0, usageSum - paidAfter);

      const tpl = await fetchTemplate('payment_received');
      const tplText = tpl?.template_text ?? DEFAULT_PAYMENT_TEMPLATE;
      const message = buildPaymentMessage(tplText, {
        farmer_name: farmer.name,
        previous_due: formatRupees(previousDue),
        amount_paid: formatRupees(Number(payment.amount || 0)),
        new_due: formatRupees(newDue),
        for_month: payment.for_month,
        date: formatDateForMessage(payment.date),
      });
      await logWhatsAppSend({
        farmerId: farmer.id,
        messageType: 'manual_resend',
        relatedEntryId: payment.id,
        messageText: message,
        whatsappNumber: farmer.whatsapp_number,
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
      });
      window.open(buildWaMeUrl(farmer.whatsapp_number, message), '_blank', 'noopener,noreferrer');
      showToast('WhatsApp open ho gaya — message bhejo');
    } catch (err) {
      console.error('[detail] resend payment wa failed:', err);
      showToast('WhatsApp nahi khul saka — dobara try karo');
    } finally {
      setSendingWaPaymentId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto pt-10 text-center text-gray-400">
        Load ho raha hai...
      </div>
    );
  }

  if (notFound || !farmer) {
    return (
      <div className="p-4 max-w-2xl mx-auto pt-10 text-center">
        <div className="text-gray-500 mb-3">Yeh kisan nahi mila.</div>
        <button
          onClick={() => navigate('/farmers')}
          className="px-4 py-2 rounded-xl text-white text-sm font-medium"
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
        >
          Kisan List pe wapas
        </button>
      </div>
    );
  }

  const waReady = farmer.whatsapp_enabled && !!farmer.whatsapp_number;
  const settledMonthsCount = monthBreakdown.filter(m => m.is_settled).length;
  const pendingMonthsCount = monthBreakdown.filter(m => m.due > 0).length;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}

      {/* Back + Header */}
      <div className="flex items-center gap-2 pt-2 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          aria-label="Wapas"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 truncate">{farmer.name}</h1>
            {waReady && (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100"
                title={`WhatsApp: ${formatWhatsAppDisplay(farmer.whatsapp_number!)}`}
              >
                <MessageCircle size={12} className="text-green-600" />
              </span>
            )}
            {farmer.is_disabled && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Disabled</span>
            )}
            {farmer.is_deleted && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Deleted</span>
            )}
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
            {farmer.mobile && (
              <span className="flex items-center gap-1"><Phone size={11} />{farmer.mobile}</span>
            )}
            {waReady && (
              <span className="flex items-center gap-1 text-green-700">
                <MessageCircle size={11} />
                {formatWhatsAppDisplay(farmer.whatsapp_number!)}
              </span>
            )}
          </div>
        </div>
      </div>

      {farmer.notes && (
        <div
          className="mb-4 px-3 py-2 rounded-xl text-xs text-gray-600 bg-amber-50"
          style={{ border: '1px solid #fde68a' }}
        >
          📝 {farmer.notes}
        </div>
      )}

      {/* Summary Cards — 3 stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <SummaryCard
          icon={<Droplets size={16} />}
          color="#2563eb"
          bg="#eff6ff"
          label="Total Usage"
          value={`₹${totals.totalUsage.toLocaleString('en-IN')}`}
          sub={formatHM(totals.totalMinutes)}
        />
        <SummaryCard
          icon={<TrendingUp size={16} />}
          color="#16a34a"
          bg="#f0fdf4"
          label="Total Paid"
          value={`₹${totals.totalPaid.toLocaleString('en-IN')}`}
          sub={`${payments.length} payments`}
        />
        <SummaryCard
          icon={<Wallet size={16} />}
          color={totals.totalDue > 0 ? '#ef4444' : '#16a34a'}
          bg={totals.totalDue > 0 ? '#fef2f2' : '#f0fdf4'}
          label="Baki"
          value={`₹${totals.totalDue.toLocaleString('en-IN')}`}
          sub={totals.totalDue > 0 ? `${pendingMonthsCount} months pending` : 'Cleared ✓'}
        />
      </div>

      {/* Quick Action Buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleAddUsage}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
        >
          <Droplets size={15} /> Pani Add karo
        </button>
        <button
          onClick={() => handleQuickPay()}
          disabled={totals.totalDue === 0}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: totals.totalDue > 0
              ? 'linear-gradient(135deg, #16a34a, #15803d)'
              : '#9ca3af',
          }}
        >
          <Wallet size={15} /> Payment Add karo
        </button>
      </div>

      {/* Month-by-Month Breakdown */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden mb-4" style={{ borderColor: '#e5e2dc' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#e5e2dc' }}>
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <CalendarDays size={16} className="text-gray-500" />
            Month-wise Hisab
          </h2>
          <span className="text-xs text-gray-400">
            {pendingMonthsCount} pending · {settledMonthsCount} settled
          </span>
        </div>
        {monthBreakdown.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            Abhi tak koi entry ya payment nahi
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#f5f5f4' }}>
            {monthBreakdown.map(m => (
              <div key={m.month} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{m.month}</span>
                      {m.is_settled && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                          <CheckCircle2 size={10} /> Cleared
                        </span>
                      )}
                      {!m.is_settled && m.due > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                          <AlertCircle size={10} /> Pending
                        </span>
                      )}
                      {m.is_closed && (
                        <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                          Month Closed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="text-blue-600">
                        {formatHM(m.usage_total_minutes)} · ₹{m.usage_amount.toLocaleString('en-IN')} usage
                      </span>
                      <span className="text-green-700">
                        ₹{m.paid.toLocaleString('en-IN')} paid
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-base font-bold ${m.due > 0 ? 'text-red-500' : 'text-green-600'}`}>
                      {m.due > 0 ? `₹${m.due.toLocaleString('en-IN')}` : '✓'}
                    </div>
                    <div className="text-[10px] text-gray-400">{m.due > 0 ? 'baki' : 'cleared'}</div>
                  </div>
                </div>

                {/* Quick "Pay full" button for months with due > 0 */}
                {m.due > 0 && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => handleQuickPay(m.month, m.due)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                      style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
                    >
                      <Wallet size={12} /> ₹{m.due.toLocaleString('en-IN')} bharo
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full Ledger — chronological */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#e5e2dc' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#e5e2dc' }}>
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Layers size={16} className="text-gray-500" />
            Pura Hisab (Ledger)
          </h2>
          <span className="text-xs text-gray-400">
            {entries.length} entries · {payments.length} payments
          </span>
        </div>
        {ledger.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            Koi entry ya payment nahi hai abhi tak
          </div>
        ) : (
          <div className="divide-y max-h-[480px] overflow-y-auto" style={{ borderColor: '#f5f5f4' }}>
            {ledger.map(row => {
              if (row.kind === 'usage') {
                const e = row.entry;
                const alloc = entryAllocations.get(e.id);
                return (
                  <div key={`u-${e.id}`} className="px-4 py-2.5 flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: '#eff6ff', color: '#2563eb' }}
                    >
                      <Droplets size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500">
                        {format(new Date(e.date), 'dd MMM yyyy, hh:mm a')} · {e.month}
                      </div>
                      <div className="text-sm text-gray-800">
                        Pani: <strong>{e.hours}h {e.minutes}m</strong>
                        <span className="text-gray-400"> @ ₹{e.rate_per_hour}/hr</span>
                      </div>
                      {alloc && <PaidBadge alloc={alloc} />}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-blue-600">
                        ₹{Number(e.amount).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-gray-400">usage</div>
                    </div>
                  </div>
                );
              }
              // payment row
              const p = row.payment;
              const grouped = !!p.payment_group_id;
              return (
                <div key={`p-${p.id}`} className="px-4 py-2.5 flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: '#f0fdf4', color: '#16a34a' }}
                  >
                    <Wallet size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500">
                      {format(new Date(p.date), 'dd MMM yyyy')} · for {p.for_month}
                    </div>
                    <div className="text-sm text-gray-800 flex items-center gap-2 flex-wrap">
                      Payment
                      {grouped && (
                        <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                          <Layers size={9} /> multi-month
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {waReady && (
                      <button
                        onClick={() => handleResendPaymentWa(p)}
                        disabled={sendingWaPaymentId === p.id}
                        className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 disabled:opacity-50"
                        title="WhatsApp dobara bhejo"
                      >
                        {sendingWaPaymentId === p.id ? (
                          <Send size={13} className="animate-pulse" />
                        ) : (
                          <MessageCircle size={13} />
                        )}
                      </button>
                    )}
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-600">
                        ₹{Number(p.amount).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-gray-400">payment</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// Paid / partial / unpaid badge for a single usage entry (derived allocation).
const PaidBadge: React.FC<{ alloc: EntryAllocation }> = ({ alloc }) => {
  if (alloc.status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 mt-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
        <CheckCircle2 size={9} /> Paid
      </span>
    );
  }
  if (alloc.status === 'partial') {
    const totalMin = Number(alloc.entry.total_minutes || 0);
    return (
      <span className="inline-flex items-center gap-1 mt-1 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
        <AlertCircle size={9} /> Partial: {formatMinutes(alloc.paidMinutes)} of {formatMinutes(totalMin)} paid · ₹{alloc.dueAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} baki
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 mt-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
      Unpaid
    </span>
  );
};

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  color: string;
  bg: string;
  label: string;
  value: string;
  sub?: string;
}> = ({ icon, color, bg, label, value, sub }) => (
  <div className="bg-white rounded-2xl p-3 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
    <div className="flex items-center gap-1.5 mb-1.5">
      <div className="p-1 rounded-lg" style={{ background: bg, color }}>{icon}</div>
    </div>
    <div className="text-base font-bold text-gray-900 truncate">{value}</div>
    <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    {sub && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</div>}
  </div>
);

export default FarmerDetailPage;
