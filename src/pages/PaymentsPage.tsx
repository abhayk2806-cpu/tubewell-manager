import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Farmer, Payment } from '@/types';
import { format } from 'date-fns';
import { Plus, Trash2, Edit2, X, Check } from 'lucide-react';

const PaymentsPage: React.FC = () => {
  const { user } = useAuth();
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [filterFarmer, setFilterFarmer] = useState('');
  const [toast, setToast] = useState('');
  const [farmerDues, setFarmerDues] = useState<Record<string, number>>({});

  const [form, setForm] = useState({
    farmer_id: '',
    amount: '',
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadData = async () => {
    setLoading(true);
    const { data: f } = await supabase.from('farmers').select('*').eq('is_deleted', false).order('name');
    const { data: p } = await supabase.from('payments').select('*').order('date', { ascending: false });
    const { data: u } = await supabase.from('usage_entries').select('farmer_id, amount');

    setFarmers(f || []);
    setPayments(p || []);

    // Calculate dues per farmer
    const dues: Record<string, number> = {};
    for (const farmer of (f || [])) {
      const usage = (u || []).filter(e => e.farmer_id === farmer.id).reduce((s, e) => s + Number(e.amount), 0);
      const paid = (p || []).filter(e => e.farmer_id === farmer.id).reduce((s, e) => s + Number(e.amount), 0);
      dues[farmer.id] = Math.max(0, usage - paid);
    }
    setFarmerDues(dues);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const openAdd = () => {
    setEditPayment(null);
    setForm({ farmer_id: '', amount: '', date: format(new Date(), "yyyy-MM-dd'T'HH:mm") });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (p: Payment) => {
    setEditPayment(p);
    setForm({
      farmer_id: p.farmer_id,
      amount: p.amount.toString(),
      date: format(new Date(p.date), "yyyy-MM-dd'T'HH:mm"),
    });
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
      farmer_id: form.farmer_id,
      amount,
      date: new Date(form.date).toISOString(),
      created_by: user?.id,
      created_by_email: user?.email,
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

  const farmerMap = Object.fromEntries(farmers.map(f => [f.id, f.name]));
  const filtered = filterFarmer ? payments.filter(p => p.farmer_id === filterFarmer) : payments;
  const selectedDue = form.farmer_id ? (farmerDues[form.farmer_id] || 0) : null;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
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
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  style={{ borderColor: '#e5e2dc' }}>
                  <option value="">-- Kisan chunein --</option>
                  {farmers.map(f => (
                    <option key={f.id} value={f.id}>{f.name} {farmerDues[f.id] > 0 ? `(Baki: ₹${farmerDues[f.id].toLocaleString('en-IN')})` : ''}</option>
                  ))}
                </select>
              </div>
              {selectedDue !== null && (
                <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl text-sm text-amber-700">
                  Kitna Baki Hai: <strong>₹{selectedDue.toLocaleString('en-IN')}</strong>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">Amount (₹) *</label>
                <input type="number" min="1" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: '#e5e2dc' }} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Date</label>
                <input type="datetime-local" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500"
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
          <p className="text-sm text-gray-500">{filtered.length} records</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium text-sm"
          style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}>
          <Plus size={16} /> Paisa Add karo
        </button>
      </div>

      <div className="mb-3">
        <select value={filterFarmer} onChange={e => setFilterFarmer(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border text-sm bg-white outline-none"
          style={{ borderColor: '#e5e2dc' }}>
          <option value="">Sabhi Kisan</option>
          {farmers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Load ho raha hai...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">Koi payment nahi hai</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <div key={p.id} className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{farmerMap[p.farmer_id] || 'Unknown'}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{format(new Date(p.date), 'dd MMM yyyy, hh:mm a')}</div>
                  {p.created_by_email && (
                    <div className="text-xs text-gray-400 mt-1">Entry by: {p.created_by_email}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <div className="text-right mr-1">
                    <div className="font-bold text-green-600 text-lg">₹{Number(p.amount).toLocaleString('en-IN')}</div>
                  </div>
                  <button onClick={() => openEdit(p)} className="p-2 rounded-lg text-blue-500 hover:bg-blue-50">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => handleDelete(p)} className="p-2 rounded-lg text-red-400 hover:bg-red-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PaymentsPage;
