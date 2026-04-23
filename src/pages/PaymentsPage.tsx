import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Farmer, Payment } from '@/types';
import { format, parse } from 'date-fns';
import { Plus, Trash2, Edit2, X, Check, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from 'lucide-react';

// Raw usage shape for month-wise due computation
type RawUsage = { farmer_id: string; amount: number; month: string };

const PaymentsPage: React.FC = () => {
  const { user } = useAuth();
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

  const [form, setForm] = useState({
    farmer_id: '',
    amount: '',
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    for_month: '',
  });
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

    setFarmers(f || []);
    setPayments(p || []);
    setRawUsage(u || []);
    setClosedMonths(mc || []);

    // Default selected month: current month if it has any usage/payments, else latest
    const currentMonth = format(new Date(), 'MMMM yyyy');
    const usageMonths = [...new Set((u || []).map((x: RawUsage) => x.month))];
    if (usageMonths.includes(currentMonth)) setSelectedMonth(currentMonth);
    else if (usageMonths.length > 0) setSelectedMonth(usageMonths[0]);
    else setSelectedMonth(currentMonth);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // -------------------------------------------------------
  // Per-farmer month-wise due computation (for FIFO in form)
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
        return da.getTime() - db.getTime(); // oldest first (FIFO)
      });
  };

  // Months available in form (when farmer is selected)
  const farmerMonthDues = useMemo(() => {
    if (!form.farmer_id) return [];
    return getMonthDuesForFarmer(form.farmer_id, editPayment?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.farmer_id, payments, rawUsage, editPayment]);

  // All-time due per farmer (for dropdown label)
  const farmerAllTimeDue = useMemo(() => {
    const map: Record<string, number> = {};
    farmers.forEach(f => {
      const usage = rawUsage.filter(u => u.farmer_id === f.id).reduce((s, u) => s + Number(u.amount), 0);
      const paid = payments.filter(p => p.farmer_id === f.id).reduce((s, p) => s + Number(p.amount), 0);
      map[f.id] = Math.max(0, usage - paid);
    });
    return map;
  }, [farmers, rawUsage, payments]);

  // Balance for the currently selected for_month in form
  const selectedMonthBalance = useMemo(() => {
    if (!form.farmer_id || !form.for_month) return null;
    const due = farmerMonthDues.find(m => m.month === form.for_month);
    return due ? due.balance : 0;
  }, [form.farmer_id, form.for_month, farmerMonthDues]);

  // -------------------------------------------------------
  // Form open handlers
  // -------------------------------------------------------
  const openAdd = () => {
    setEditPayment(null);
    const defaultDate = format(new Date(), "yyyy-MM-dd'T'HH:mm");
    setForm({ farmer_id: '', amount: '', date: defaultDate, for_month: '' });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (p: Payment) => {
    setEditPayment(p);
    setForm({
      farmer_id: p.farmer_id,
      amount: p.amount.toString(),
      date: format(new Date(p.date), "yyyy-MM-dd'T'HH:mm"),
      for_month: p.for_month || '',
    });
    setFormError('');
    setShowForm(true);
  };

  // Auto-select oldest unpaid month (FIFO) when farmer changes in add mode
  const handleFarmerChange = (farmerId: string) => {
    setForm(prev => {
      const newForm = { ...prev, farmer_id: farmerId, for_month: '' };
      return newForm;
    });
    // We'll set for_month in a useEffect watching form.farmer_id
  };

  // FIFO auto-select: when farmer_id changes in add mode, pick oldest month with balance > 0
  useEffect(() => {
    if (editPayment) return; // don't override when editing
    if (!form.farmer_id) return;
    const dues = getMonthDuesForFarmer(form.farmer_id);
    const oldestUnpaid = dues.find(m => m.balance > 0);
    setForm(prev => ({
      ...prev,
      for_month: oldestUnpaid ? oldestUnpaid.month : (dues[0]?.month || ''),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.farmer_id]);

  // -------------------------------------------------------
  // Save payment
  // -------------------------------------------------------
  const handleSave = async () => {
    if (!form.farmer_id) { setFormError('Kisan select karo'); return; }
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
    };

    if (editPayment) {
      const { error } = await supabase.from('payments').update(payload).eq('id', editPayment.id);
      if (error) { setFormError('Update nahi hua. Dobara try karo.'); setSaving(false); return; }
      showToast('Payment update ho gayi ✓');
    } else {
      const { error } = await supabase.from('payments').insert(payload);
      if (error) { setFormError('Payment save nahi hui. Dobara try karo.'); setSaving(false); return; }
      showToast('Payment add ho gaya ✓');
    }

    setSaving(false);
    setShowForm(false);
    loadData();
  };

  const handleDelete = async (p: Payment) => {
    if (!confirm('Yeh payment delete karna chahte ho?')) return;
    await supabase.from('payments').delete().eq('id', p.id);
    showToast('Payment delete ho gayi');
    loadData();
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
  // Filter / display logic
  // -------------------------------------------------------
  const allMonths = [...new Set(rawUsage.map(u => u.month))].sort((a, b) => {
    const da = parse(a, 'MMMM yyyy', new Date());
    const db = parse(b, 'MMMM yyyy', new Date());
    return db.getTime() - da.getTime();
  });

  // Payments filtered by selected month (using for_month — accurate allocation)
  const monthPayments = selectedMonth
    ? payments.filter(p => p.for_month === selectedMonth)
    : payments;

  // Group by farmer
  const grouped = farmers.map(f => ({
    farmer: f,
    payments: monthPayments.filter(p => p.farmer_id === f.id),
  })).filter(g => g.payments.length > 0);

  // Month usage for each farmer (for "paid of total" display)
  const getMonthUsage = (farmerId: string, month: string) =>
    rawUsage
      .filter(u => u.farmer_id === farmerId && u.month === month)
      .reduce((s, u) => s + Number(u.amount), 0);

  // Toast color
  const toastBg =
    toastType === 'warn' ? 'bg-amber-500' :
    toastType === 'info' ? 'bg-blue-600' :
    'bg-green-600';

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

              {/* Month selector (for_month) — shown only when farmer selected */}
              {form.farmer_id && (
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

                  {/* Balance info for selected month */}
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
              )}

              {/* Amount */}
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
              </div>

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

      {/* Month Filter (uses for_month — accurate allocation) */}
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

            return (
              <div
                key={farmer.id}
                className="bg-white rounded-2xl border shadow-sm overflow-hidden"
                style={{ borderColor: isClosed ? '#86efac' : '#e5e2dc' }}
              >
                {/* Farmer Header */}
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
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{farmer.name}</span>
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

                {/* Expanded Payment Entries */}
                {isOpen && (
                  <div className="border-t" style={{ borderColor: '#f0ede8' }}>
                    {fPayments.map((p, idx) => (
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
                          {p.created_by_email && (
                            <div className="text-xs text-gray-400 mt-0.5">by: {p.created_by_email}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <div className="font-bold text-green-600">
                            ₹{Number(p.amount).toLocaleString('en-IN')}
                          </div>
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
                    ))}

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
