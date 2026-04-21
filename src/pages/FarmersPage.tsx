import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Farmer, FarmerSummary } from '@/types';
import { Plus, Search, Trash2, Edit2, RotateCcw, X, Check } from 'lucide-react';

const FarmersPage: React.FC = () => {
  const [farmers, setFarmers] = useState<FarmerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editFarmer, setEditFarmer] = useState<Farmer | null>(null);
  const [toast, setToast] = useState('');

  const [form, setForm] = useState({ name: '', mobile: '', notes: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadFarmers = async () => {
    setLoading(true);
    const { data: farmersData } = await supabase.from('farmers').select('*').order('name');
    const { data: usageData } = await supabase.from('usage_entries').select('farmer_id, amount');
    const { data: paymentData } = await supabase.from('payments').select('farmer_id, amount');

    if (!farmersData) { setLoading(false); return; }

    const summaries: FarmerSummary[] = farmersData.map(f => {
      const usage = (usageData || []).filter(u => u.farmer_id === f.id).reduce((s, u) => s + Number(u.amount), 0);
      const paid = (paymentData || []).filter(p => p.farmer_id === f.id).reduce((s, p) => s + Number(p.amount), 0);
      return { ...f, total_usage_amount: usage, total_paid: paid, total_due: Math.max(0, usage - paid) };
    });
    setFarmers(summaries);
    setLoading(false);
  };

  useEffect(() => { loadFarmers(); }, []);

  const openAdd = () => {
    setEditFarmer(null);
    setForm({ name: '', mobile: '', notes: '' });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (f: Farmer) => {
    setEditFarmer(f);
    setForm({ name: f.name, mobile: f.mobile || '', notes: f.notes || '' });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Kisan ka naam bharna zaroori hai'); return; }
    setSaving(true);
    setFormError('');
    if (editFarmer) {
      const { error } = await supabase.from('farmers').update({
        name: form.name.trim(), mobile: form.mobile.trim(), notes: form.notes.trim()
      }).eq('id', editFarmer.id);
      if (error) { setFormError('Save nahi hua. Dobara try karo.'); setSaving(false); return; }
      showToast('Kisan update ho gaya ✓');
    } else {
      const { error } = await supabase.from('farmers').insert({
        name: form.name.trim(), mobile: form.mobile.trim(), notes: form.notes.trim()
      });
      if (error) { setFormError('Save nahi hua. Dobara try karo.'); setSaving(false); return; }
      showToast('Kisan add ho gaya ✓');
    }
    setSaving(false);
    setShowForm(false);
    loadFarmers();
  };

  const handleDelete = async (f: Farmer) => {
    if (!confirm(`${f.name} ko delete karna chahte ho?`)) return;
    await supabase.from('farmers').update({ is_deleted: true }).eq('id', f.id);
    showToast('Kisan delete ho gaya');
    loadFarmers();
  };

  const handleRestore = async (f: Farmer) => {
    await supabase.from('farmers').update({ is_deleted: false }).eq('id', f.id);
    showToast('Kisan restore ho gaya ✓');
    loadFarmers();
  };

  const filtered = farmers
    .filter(f => f.is_deleted === showDeleted)
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.mobile?.includes(search));

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <Check size={16} /> {toast}
        </div>
      )}

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">{editFarmer ? 'Kisan Edit karo' : 'Kisan Add karo'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Naam *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Kisan ka naam"
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: '#e5e2dc' }} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mobile</label>
                <input value={form.mobile} onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))}
                  placeholder="Mobile number"
                  type="tel"
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: '#e5e2dc' }} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Koi notes (optional)"
                  rows={2}
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
                {saving ? 'Save ho raha...' : 'Save karo'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 pt-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Kisan List</h1>
          <p className="text-sm text-gray-500">{filtered.length} kisan</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium text-sm"
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
          <Plus size={16} /> Kisan Add karo
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Naam ya mobile se dhundo..."
          className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500"
          style={{ borderColor: '#e5e2dc', background: 'white' }} />
      </div>

      {/* Toggle Deleted */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setShowDeleted(false)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${!showDeleted ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border'}`}
          style={showDeleted ? { borderColor: '#e5e2dc' } : {}}>
          Active
        </button>
        <button onClick={() => setShowDeleted(true)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${showDeleted ? 'bg-gray-600 text-white' : 'bg-white text-gray-500 border'}`}
          style={!showDeleted ? { borderColor: '#e5e2dc' } : {}}>
          Deleted
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Load ho raha hai...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">Koi kisan nahi mila</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(f => (
            <div key={f.id} className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{f.name}</div>
                  {f.mobile && <div className="text-sm text-gray-400">{f.mobile}</div>}
                  {f.notes && <div className="text-xs text-gray-400 mt-1 truncate">{f.notes}</div>}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  {!showDeleted ? (
                    <>
                      <div className="text-right mr-2">
                        <div className="text-sm font-bold text-red-500">₹{f.total_due.toLocaleString('en-IN')}</div>
                        <div className="text-xs text-gray-400">baki</div>
                      </div>
                      <button onClick={() => openEdit(f)} className="p-2 rounded-lg text-blue-500 hover:bg-blue-50">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(f)} className="p-2 rounded-lg text-red-400 hover:bg-red-50">
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleRestore(f)} className="p-2 rounded-lg text-green-500 hover:bg-green-50">
                      <RotateCcw size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FarmersPage;
