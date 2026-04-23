import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Farmer, FarmerSummary } from '@/types';
import { Plus, Search, Trash2, Edit2, RotateCcw, X, Check, EyeOff, Eye } from 'lucide-react';

type FarmerTab = 'active' | 'disabled' | 'deleted';

const FarmersPage: React.FC = () => {
  const [farmers, setFarmers] = useState<FarmerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FarmerTab>('active');
  const [showForm, setShowForm] = useState(false);
  const [editFarmer, setEditFarmer] = useState<Farmer | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [targetFarmer, setTargetFarmer] = useState<Farmer | null>(null);
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
    const [{ data: farmersData }, { data: usageData }, { data: paymentData }] = await Promise.all([
      supabase.from('farmers').select('*').order('name'),
      supabase.from('usage_entries').select('farmer_id, amount'),
      supabase.from('payments').select('farmer_id, amount'),
    ]);

    if (!farmersData) { setLoading(false); return; }

    const summaries: FarmerSummary[] = farmersData.map(f => {
      const usage = (usageData || [])
        .filter(u => u.farmer_id === f.id)
        .reduce((s, u) => s + Number(u.amount), 0);
      const paid = (paymentData || [])
        .filter(p => p.farmer_id === f.id)
        .reduce((s, p) => s + Number(p.amount), 0);
      return {
        ...f,
        is_disabled: f.is_disabled ?? false,
        total_usage_amount: usage,
        total_paid: paid,
        total_due: Math.max(0, usage - paid),
      };
    });
    setFarmers(summaries);
    setLoading(false);
  };

  useEffect(() => { loadFarmers(); }, []);

  // ── Form handlers ──────────────────────────────────────────
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
    const payload = { name: form.name.trim(), mobile: form.mobile.trim(), notes: form.notes.trim() };
    const { error } = editFarmer
      ? await supabase.from('farmers').update(payload).eq('id', editFarmer.id)
      : await supabase.from('farmers').insert(payload);
    if (error) { setFormError('Save nahi hua. Dobara try karo.'); setSaving(false); return; }
    showToast(editFarmer ? 'Kisan update ho gaya ✓' : 'Kisan add ho gaya ✓');
    setSaving(false);
    setShowForm(false);
    loadFarmers();
  };

  // ── Delete modal handlers ──────────────────────────────────
  const openDeleteModal = (f: Farmer) => {
    setTargetFarmer(f);
    setShowDeleteModal(true);
  };

  const handleDisable = async () => {
    if (!targetFarmer) return;
    await supabase.from('farmers').update({ is_disabled: true }).eq('id', targetFarmer.id);
    showToast(`${targetFarmer.name} disable ho gaya — data count nahi hoga`);
    setShowDeleteModal(false);
    loadFarmers();
  };

  const handlePermanentDelete = async () => {
    if (!targetFarmer) return;
    if (!confirm(`FINAL CONFIRM: "${targetFarmer.name}" permanently delete karna chahte ho? Yeh undo nahi hoga.`)) return;
    await supabase.from('farmers').update({ is_deleted: true, is_disabled: false }).eq('id', targetFarmer.id);
    showToast(`${targetFarmer.name} permanently delete ho gaya`);
    setShowDeleteModal(false);
    loadFarmers();
  };

  const handleRestore = async (f: Farmer) => {
    await supabase.from('farmers').update({ is_deleted: false, is_disabled: false }).eq('id', f.id);
    showToast('Kisan restore ho gaya ✓');
    loadFarmers();
  };

  const handleEnable = async (f: Farmer) => {
    await supabase.from('farmers').update({ is_disabled: false }).eq('id', f.id);
    showToast(`${f.name} enable ho gaya ✓`);
    loadFarmers();
  };

  // ── Filter logic ───────────────────────────────────────────
  const tabFarmers = farmers
    .filter(f => {
      if (activeTab === 'active') return !f.is_deleted && !f.is_disabled;
      if (activeTab === 'disabled') return !f.is_deleted && f.is_disabled;
      return f.is_deleted;
    })
    .filter(f =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      (f.mobile || '').includes(search)
    );

  const counts = {
    active: farmers.filter(f => !f.is_deleted && !f.is_disabled).length,
    disabled: farmers.filter(f => !f.is_deleted && f.is_disabled).length,
    deleted: farmers.filter(f => f.is_deleted).length,
  };

  const tabs: { key: FarmerTab; label: string; color: string }[] = [
    { key: 'active', label: `Active (${counts.active})`, color: 'bg-blue-600' },
    { key: 'disabled', label: `Disabled (${counts.disabled})`, color: 'bg-amber-500' },
    { key: 'deleted', label: `Deleted (${counts.deleted})`, color: 'bg-gray-600' },
  ];

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <Check size={16} /> {toast}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">
                {editFarmer ? 'Kisan Edit karo' : 'Kisan Add karo'}
              </h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Naam *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Kisan ka naam"
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: '#e5e2dc' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mobile</label>
                <input
                  value={form.mobile}
                  onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))}
                  placeholder="Mobile number" type="tel"
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: '#e5e2dc' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Koi notes (optional)" rows={2}
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  style={{ borderColor: '#e5e2dc' }}
                />
              </div>
              {formError && <div className="text-red-500 text-sm">{formError}</div>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-xl border font-medium text-gray-600"
                style={{ borderColor: '#e5e2dc' }}
              >Cancel</button>
              <button
                onClick={handleSave} disabled={saving}
                className="flex-1 py-3 rounded-xl text-white font-semibold disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
              >
                {saving ? 'Save ho raha...' : 'Save karo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Disable Choice Modal */}
      {showDeleteModal && targetFarmer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">"{targetFarmer.name}" ke liye kya karna hai?</h2>
              <button onClick={() => setShowDeleteModal(false)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <p className="text-sm text-gray-500">
              Dono options mein is kisan ka data system ki kisi bhi calculation mein count nahi hoga.
            </p>

            {/* Option 1: Disable */}
            <button
              onClick={handleDisable}
              className="w-full p-4 rounded-xl border-2 text-left transition-all hover:border-amber-400 hover:bg-amber-50"
              style={{ borderColor: '#e5e2dc' }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50">
                  <EyeOff size={20} className="text-amber-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Temporarily Disable karo</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Kisan ka data safe rahega. Baad mein wapas enable kar sakte ho.
                    Jab kisan pani lena band kar de ya season mein break ho.
                  </div>
                </div>
              </div>
            </button>

            {/* Option 2: Permanent Delete */}
            <button
              onClick={handlePermanentDelete}
              className="w-full p-4 rounded-xl border-2 text-left transition-all hover:border-red-400 hover:bg-red-50"
              style={{ borderColor: '#e5e2dc' }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-50">
                  <Trash2 size={20} className="text-red-500" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Permanently Delete karo</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Kisan system se hata diya jayega. Data record mein rahega lekin
                    koi bhi calculation mein count nahi hoga. Wapas restore bhi ho sakta hai.
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setShowDeleteModal(false)}
              className="w-full py-2.5 rounded-xl border text-sm text-gray-500 font-medium"
              style={{ borderColor: '#e5e2dc' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 pt-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Kisan List</h1>
          <p className="text-sm text-gray-500">{tabFarmers.length} kisan</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium text-sm"
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
        >
          <Plus size={16} /> Kisan Add karo
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Naam ya mobile se dhundo..."
          className="w-full pl-9 pr-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500"
          style={{ borderColor: '#e5e2dc', background: 'white' }}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              activeTab === t.key ? `${t.color} text-white` : 'bg-white text-gray-500 border'
            }`}
            style={activeTab !== t.key ? { borderColor: '#e5e2dc' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Farmer Cards */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">Load ho raha hai...</div>
      ) : tabFarmers.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">Koi kisan nahi mila</div>
      ) : (
        <div className="space-y-2">
          {tabFarmers.map(f => (
            <div
              key={f.id}
              className="bg-white rounded-2xl p-4 border shadow-sm"
              style={{ borderColor: f.is_disabled ? '#fde68a' : '#e5e2dc' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{f.name}</span>
                    {f.is_disabled && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        Disabled
                      </span>
                    )}
                    {f.is_deleted && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                        Deleted
                      </span>
                    )}
                  </div>
                  {f.mobile && <div className="text-sm text-gray-400">{f.mobile}</div>}
                  {f.notes && <div className="text-xs text-gray-400 mt-1 truncate">{f.notes}</div>}
                </div>

                <div className="flex items-center gap-2 ml-2">
                  {activeTab === 'active' && (
                    <>
                      <div className="text-right mr-1">
                        <div className="text-sm font-bold text-red-500">
                          ₹{f.total_due.toLocaleString('en-IN')}
                        </div>
                        <div className="text-xs text-gray-400">baki</div>
                      </div>
                      <button onClick={() => openEdit(f)} className="p-2 rounded-lg text-blue-500 hover:bg-blue-50">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => openDeleteModal(f)} className="p-2 rounded-lg text-red-400 hover:bg-red-50">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  {activeTab === 'disabled' && (
                    <button onClick={() => handleEnable(f)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-amber-700 bg-amber-50 text-sm font-medium">
                      <Eye size={15} /> Enable karo
                    </button>
                  )}
                  {activeTab === 'deleted' && (
                    <button onClick={() => handleRestore(f)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-green-700 bg-green-50 text-sm font-medium">
                      <RotateCcw size={15} /> Restore karo
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
