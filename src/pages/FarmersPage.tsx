import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Farmer, FarmerSummary } from '@/types';
import {
  Plus, Search, Trash2, Edit2, RotateCcw, X, Check, EyeOff, Eye, MessageCircle, ChevronRight,
} from 'lucide-react';
import { normalizeWhatsAppNumber, formatWhatsAppDisplay } from '@/lib/whatsapp';

type FarmerTab = 'active' | 'disabled' | 'deleted';

// Form state shape — whatsapp_number is the raw user input (we normalize on save).
// whatsapp_consent is a local boolean derived from whether whatsapp_consent_at is set.
interface FarmerForm {
  name: string;
  mobile: string;
  notes: string;
  whatsapp_number: string;
  whatsapp_enabled: boolean;
  whatsapp_consent: boolean;
}

const EMPTY_FORM: FarmerForm = {
  name: '',
  mobile: '',
  notes: '',
  whatsapp_number: '',
  whatsapp_enabled: false,
  whatsapp_consent: false,
};

const FarmersPage: React.FC = () => {
  const navigate = useNavigate();
  const [farmers, setFarmers] = useState<FarmerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FarmerTab>('active');
  const [showForm, setShowForm] = useState(false);
  const [editFarmer, setEditFarmer] = useState<Farmer | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [targetFarmer, setTargetFarmer] = useState<Farmer | null>(null);
  const [toast, setToast] = useState('');

  const [form, setForm] = useState<FarmerForm>(EMPTY_FORM);
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
        whatsapp_number: f.whatsapp_number ?? null,
        whatsapp_enabled: f.whatsapp_enabled ?? false,
        whatsapp_consent_at: f.whatsapp_consent_at ?? null,
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
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (f: Farmer) => {
    setEditFarmer(f);
    setForm({
      name: f.name,
      mobile: f.mobile || '',
      notes: f.notes || '',
      whatsapp_number: f.whatsapp_number || '',
      whatsapp_enabled: !!f.whatsapp_enabled,
      whatsapp_consent: !!f.whatsapp_consent_at,
    });
    setFormError('');
    setShowForm(true);
  };

  // Live-normalized WhatsApp preview (computed on every render of the modal)
  const normalizedPreview = normalizeWhatsAppNumber(form.whatsapp_number);
  const numberInputDirty = form.whatsapp_number.trim().length > 0;
  const numberInvalid = numberInputDirty && !normalizedPreview;

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('Kisan ka naam bharna zaroori hai');
      return;
    }

    // WhatsApp validation — only enforced when toggle is ON
    let normalizedNumber: string | null = null;
    if (numberInputDirty) {
      normalizedNumber = normalizeWhatsAppNumber(form.whatsapp_number);
      if (!normalizedNumber) {
        setFormError('WhatsApp number sahi nahi hai — 10-digit India ka mobile number daalo (6/7/8/9 se shuru)');
        return;
      }
    }

    if (form.whatsapp_enabled) {
      if (!normalizedNumber) {
        setFormError('WhatsApp enable karne ke liye valid 10-digit number bharna zaroori hai');
        return;
      }
      if (!form.whatsapp_consent) {
        setFormError('WhatsApp enable karne ke liye farmer ka consent zaroori hai — checkbox tick karo');
        return;
      }
    }

    setSaving(true);
    setFormError('');

    // Build whatsapp_consent_at:
    //   - If checkbox checked AND farmer already had a consent timestamp → keep existing (don't overwrite original consent date)
    //   - If checkbox checked AND no previous timestamp → set to NOW
    //   - If checkbox unchecked → null
    let consentAt: string | null = null;
    if (form.whatsapp_consent) {
      consentAt = editFarmer?.whatsapp_consent_at ?? new Date().toISOString();
    }

    const payload = {
      name: form.name.trim(),
      mobile: form.mobile.trim(),
      notes: form.notes.trim(),
      whatsapp_number: normalizedNumber,    // may be null if user left it blank
      whatsapp_enabled: form.whatsapp_enabled,
      whatsapp_consent_at: consentAt,
    };

    const { error } = editFarmer
      ? await supabase.from('farmers').update(payload).eq('id', editFarmer.id)
      : await supabase.from('farmers').insert(payload);

    if (error) {
      setFormError('Save nahi hua. Dobara try karo.');
      setSaving(false);
      return;
    }

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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4 my-4">
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

              {/* ───── WhatsApp section ──────────────────────── */}
              <div className="pt-3 mt-2 border-t" style={{ borderColor: '#e5e2dc' }}>
                <div className="flex items-center gap-2 mb-2">
                  <MessageCircle size={16} className="text-green-600" />
                  <span className="text-sm font-semibold text-gray-800">WhatsApp Notifications</span>
                  <span className="text-[10px] text-gray-400">(optional)</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-2.5">
                  Agar kisan ke paas WhatsApp hai, toh pani entry aur payment pe automatic message bhej sakte ho. Smartphone nahi hai? Yeh khali chhod do.
                </p>

                {/* Number input */}
                <div>
                  <label className="text-sm font-medium text-gray-700">WhatsApp Number</label>
                  <input
                    value={form.whatsapp_number}
                    onChange={e => setForm(p => ({ ...p, whatsapp_number: e.target.value }))}
                    placeholder="10 digits — e.g. 9876543210"
                    type="tel"
                    inputMode="tel"
                    className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-green-500"
                    style={{ borderColor: numberInvalid ? '#f87171' : '#e5e2dc' }}
                  />
                  {normalizedPreview && (
                    <div className="text-[11px] text-green-700 mt-1.5 flex items-center gap-1">
                      <Check size={12} /> Will send to: {formatWhatsAppDisplay(normalizedPreview)}
                    </div>
                  )}
                  {numberInvalid && (
                    <div className="text-[11px] text-red-500 mt-1.5">
                      Number sahi nahi hai. 10-digit India ka mobile chahiye (6/7/8/9 se shuru).
                    </div>
                  )}
                </div>

                {/* Toggle: enable WhatsApp messages */}
                <div className="flex items-center justify-between mt-3 py-2">
                  <div className="flex-1 pr-3">
                    <div className="text-sm font-medium text-gray-800">WhatsApp messages enable karo</div>
                    <div className="text-[11px] text-gray-500">
                      Toggle off rakhoge toh number save rahega lekin koi message nahi jaayega.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, whatsapp_enabled: !p.whatsapp_enabled }))}
                    aria-pressed={form.whatsapp_enabled}
                    aria-label="Toggle WhatsApp messaging"
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      form.whatsapp_enabled ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        form.whatsapp_enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Consent checkbox — only meaningful when toggle is on */}
                <label
                  className={`flex items-start gap-2.5 mt-1 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    form.whatsapp_enabled
                      ? 'bg-green-50 hover:bg-green-100'
                      : 'bg-gray-50 opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.whatsapp_consent}
                    onChange={e => setForm(p => ({ ...p, whatsapp_consent: e.target.checked }))}
                    disabled={!form.whatsapp_enabled}
                    className="mt-0.5 accent-green-600"
                  />
                  <span className="text-xs text-gray-700 leading-snug">
                    Farmer ne WhatsApp messages ke liye haan boli hai.
                    {editFarmer?.whatsapp_consent_at && form.whatsapp_consent && (
                      <span className="block text-[10px] text-gray-400 mt-0.5">
                        Pehle se record hai: {new Date(editFarmer.whatsapp_consent_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </span>
                </label>
              </div>
              {/* ───── end WhatsApp section ──────────────────── */}

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
                <button
                  onClick={() => navigate(`/farmers/${f.id}`)}
                  className="flex-1 min-w-0 text-left flex items-center gap-2 -mx-1 px-1 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                  title="Pura hisab dekho"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{f.name}</span>
                      {f.whatsapp_enabled && f.whatsapp_number && (
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100"
                          title={`WhatsApp: ${formatWhatsAppDisplay(f.whatsapp_number)}`}
                        >
                          <MessageCircle size={12} className="text-green-600" />
                        </span>
                      )}
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
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>

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
