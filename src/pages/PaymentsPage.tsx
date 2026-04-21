import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Farmer, Payment } from '@/types';
import { format, parse } from 'date-fns';
import { Plus, Trash2, Edit2, X, Check, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';

const PaymentsPage: React.FC = () => {
  const { user } = useAuth();
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [usageData, setUsageData] = useState<{ farmer_id: string; amount: number; month: string }[]>([]);
  const [closedMonths, setClosedMonths] = useState<{ farmer_id: string; month: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [expandedFarmer, setExpandedFarmer] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'success' | 'info'>('success');
  const [farmerDues, setFarmerDues] = useState<Record<string, number>>({});

  const [form, setForm] = useState({ farmer_id: '', amount: '', date: format(new Date(), "yyyy-MM-dd'T'HH:mm") });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string, type: 'success' | 'info' = 'success') => {
    setToast(msg); setToastType(type); setTimeout(() => setToast(''), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    const { data: f } = await supabase.from('farmers').select('*').eq('is_deleted', false).order('name');
    const { data: p } = await supabase.from('payments').select('*').order('date', { ascending: false });
    const { data: u } = await supabase.from('usage_entries').select('farmer_id, amount, month');
    const { data: mc } = await supabase.from('month_closings').select('farmer_id, month');

    setFarmers(f || []);
    setPayments(p || []);
    setUsageData(u || []);
    setClosedMonths(mc || []);

    // All-time dues
    const dues: Record<string, number> = {};
    for (const farmer of (f || [])) {
      const usage = (u || []).filter(e => e.farmer_id === farmer.id).reduce((s, e) => s + Number(e.amount), 0);
      const paid = (p || []).filter(e => e.farmer_id === farmer.id).reduce((s, e) => s + Number(e.amount), 0);
      dues[farmer.id] = Math.max(0, usage - paid);
    }
    setFarmerDues(dues);

    // Default month
    const currentMonth = format(new Date(), 'MMMM yyyy');
    const months = [...new Set((p || []).map((x: Payment) => format(new Date(x.date), 'MMMM yyyy')))];
    if (months.includes(currentMonth)) setSelectedMonth(currentMonth);
    else if (months.length > 0) setSelectedMonth(months[0]);
    else setSelectedMonth(currentMonth);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const allMonths = [...new Set(payments.map(p => format(new Date(p.date), 'MMMM yyyy')))].sort((a, b) => {
    const da = parse(a, 'MMMM yyyy', new Date());
    const db = parse(b, 'MMMM yyyy', new Date());
    return db.getTime() - da.getTime();
  });

  // Filter payments by month
  const monthPayments = selectedMonth
    ? payments.filter(p => format(new Date(p.date), 'MMMM yyyy') === selectedMonth)
    : payments;

  // Group by farmer
  const grouped = farmers.map(f => ({
    farmer: f,
    payments: monthPayments.filter(p => p.farmer_id === f.id),
  })).filter(g => g.payments.length > 0);

  const openAdd = () => {
    setEditPayment(null);
    setForm({ farmer_id: '', amount: '', date: format(new Date(), "yyyy-MM-dd'T'HH:mm") });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (p: Payment) => {
    setEditPayment(p);
    setForm({ farmer_id: p.farmer_id, amount: p.amount.toString(), date: format(new Date(p.date), "yyyy-MM-dd'T'HH:mm") });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.farmer_id) { setFormError('Kisan select karo'); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setFormError('Valid amount bharo'); return; }
    setSaving(true);
    setFormError('');

    const payload = {
      farmer_id: form.farmer_id, amount,
      date: new Date(form.date).toISOString(),
      created_by: user?.id, created_by_email: user?.email,
    };

    if (editPayment) {
      const { error } = await supabase.from('payments').update(payload).eq('id', editPayment.id);
      if (error) { setFormError('Update nahi hua'); setSaving(false); return; }
      showToast('Payment update ho gayi ✓');
    } else {
      const { error } = await supabase.from('payments').insert(payload);
      if (error) { setFormError('Payment save nahi hui'); setSaving(false); return; }
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

  const handleCloseMonth = async (farmerId: string, month: string) => {
    const farmerName = farmers.find(f => f.id === farmerId)?.name || '';
    if (!confirm(`${farmerName} ka ${month} close karna chahte ho? Iska matlab hoga ki is month ka hisaab poora ho gaya.`)) return;
    const { error } = await supabase.from('month_closings').upsert(
      { farmer_id: farmerId, month, closed_by: user?.id, closed_by_email: user?.email },
      { onConflict: 'farmer_id,month' }
    );
    if (!error) { showToast(`${farmerName} ka ${month} closed ✓`, 'info'); loadData(); }
  };

  const isMonthClosed = (farmerId: string, month: string) =>
    closedMonths.some(c => c.farmer_id === farmerId && c.month === month);

  const selectedDue = form.farmer_id ? (farmerDues[form.farmer_id] || 0) : null;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {toast && (
        <div className={`fixed top-16 left-4 right-4 z-50 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${toastType === 'info' ? 'bg-blue-600' : 'bg-green-600'}`}>
          <Check size={16} /> {toast}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">{editPayment ? 'Payment Edit karo' : 'Paisa Add karo'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Kisan *</label>
                <select value={form.farmer_id} onChange={e => setForm(p => ({ ...p, farmer_id: e.target.value }))}
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  style={{ borderColor: '#e5e2dc' }}>
                  <option value="">-- Kisan chunein --</option>
                  {farmers.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} {farmerDues[f.id] > 0 ? `(Baki: ₹${farmerDues[f.id].toLocaleString('en-IN')})` : '✓'}
                    </option>
                  ))}
                </select>
              </div>
              {selectedDue !== null && selectedDue > 0 && (
                <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl text-sm text-amber-700">
                  Total Baki: <strong>₹{selectedDue.toLocaleString('en-IN')}</strong>
                </div>
              )}
              {selectedDue !== null && selectedDue === 0 && (
                <div className="bg-green-50 border border-green-200 px-4 py-2 rounded-xl text-sm text-green-700">
                  ✓ Is kisan ka koi baki nahi
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">Amount (₹) *</label>
                <input type="number" min="1" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-green-500"
                  style={{ borderColor: '#e5e2dc' }} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Date</label>
                <input type="datetime-local" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-green-500"
                  style={{ borderColor: '#e5e2dc' }} />
              </div>
              {formError && <div className="text-red-500 text-sm">{formError}</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-xl border font-medium text-gray-600" style={{ borderColor: '#e5e2dc' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 rounded-xl text-white font-semibold disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}>
                {saving ? 'Save ho raha...' : 'Save karo'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 pt-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500">{monthPayments.length} records</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium text-sm"
          style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}>
          <Plus size={16} /> Paisa Add karo
        </button>
      </div>

      {/* Month Filter */}
      <div className="mb-4">
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border text-sm bg-white outline-none"
          style={{ borderColor: '#e5e2dc' }}>
          <option value="">Sabhi Months</option>
          {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Load ho raha hai...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          {selectedMonth ? `${selectedMonth} mein koi payment nahi` : 'Koi payment nahi hai'}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ farmer, payments: fPayments }) => {
            const totalPaid = fPayments.reduce((s, p) => s + Number(p.amount), 0);
            const monthUsage = usageData
              .filter(u => u.farmer_id === farmer.id && (!selectedMonth || u.month === selectedMonth))
              .reduce((s, u) => s + Number(u.amount), 0);
            const isClosed = selectedMonth ? isMonthClosed(farmer.id, selectedMonth) : false;
            const isOpen = expandedFarmer === farmer.id;

            return (
              <div key={farmer.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden"
                style={{ borderColor: isClosed ? '#86efac' : '#e5e2dc' }}>
                {/* Farmer Header */}
                <button onClick={() => setExpandedFarmer(isOpen ? null : farmer.id)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: isClosed ? 'linear-gradient(135deg, #16a34a, #15803d)' : 'linear-gradient(135deg, #16a34a, #15803d)' }}>
                      {farmer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{farmer.name}</span>
                        {isClosed && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Closed ✓</span>}
                      </div>
                      <div className="text-xs text-gray-400">{fPayments.length} payments</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-bold text-green-600">₹{totalPaid.toLocaleString('en-IN')}</div>
                      {monthUsage > 0 && (
                        <div className="text-xs text-gray-400">of ₹{monthUsage.toLocaleString('en-IN')}</div>
                      )}
                    </div>
                    {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </div>
                </button>

                {/* Expanded Payments */}
                {isOpen && (
                  <div className="border-t" style={{ borderColor: '#f0ede8' }}>
                    {fPayments.map((p, idx) => (
                      <div key={p.id} className={`px-4 py-3 flex items-start justify-between ${idx < fPayments.length - 1 ? 'border-b' : ''}`}
                        style={{ borderColor: '#f5f5f4' }}>
                        <div className="flex-1">
                          <div className="text-sm text-gray-600">{format(new Date(p.date), 'dd MMM yyyy, hh:mm a')}</div>
                          {p.created_by_email && <div className="text-xs text-gray-400 mt-0.5">by: {p.created_by_email}</div>}
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <div className="font-bold text-green-600">₹{Number(p.amount).toLocaleString('en-IN')}</div>
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(p)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50">
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
