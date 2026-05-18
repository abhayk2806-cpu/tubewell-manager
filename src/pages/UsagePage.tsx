import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Farmer, UsageEntry } from '@/types';
import { format, parse } from 'date-fns';
import {
  Plus, Trash2, Edit2, X, Check, Droplets, ChevronDown, ChevronUp, MessageCircle, Send,
} from 'lucide-react';
import {
  DEFAULT_USAGE_TEMPLATE,
  buildUsageMessage,
  buildWaMeUrl,
  fetchTemplate,
  formatDateForMessage,
  logWhatsAppSend,
  splitHoursMinutes,
} from '@/lib/whatsapp';

const getMonth = (date: string) => format(new Date(date), 'MMMM yyyy');

interface SendArgs {
  entry: UsageEntry;
  farmer: Farmer;
  messageType: 'usage_entry' | 'manual_resend';
  userId: string | null;
  userEmail: string | null;
}

/**
 * Build the WhatsApp message for a usage entry, log the send, and return the wa.me URL.
 *
 * CRITICAL: totals are computed by querying Supabase at send-time, NOT from React state —
 * this protects against concurrent entries by other family members. See PROJECT_MEMORY.md
 * section 6 and tasks/lessons.md.
 *
 * Returns null if farmer has no whatsapp_number (caller should not have invoked us).
 */
async function buildAndLogUsageWhatsApp({
  entry, farmer, messageType, userId, userEmail,
}: SendArgs): Promise<string | null> {
  if (!farmer.whatsapp_number) return null;

  // Send-time DB query: sum of total_minutes for the SAME farmer + SAME month,
  // EXCLUDING this entry. Gives us the "previous total" before this entry.
  const { data: others, error: othersErr } = await supabase
    .from('usage_entries')
    .select('total_minutes')
    .eq('farmer_id', entry.farmer_id)
    .eq('month', entry.month)
    .neq('id', entry.id);

  if (othersErr) {
    console.error('[whatsapp] failed to fetch other entries:', othersErr);
    // Fall through with previousTotal=0 — message will still be coherent for this entry alone
  }

  const previousTotalMinutes = (others || []).reduce(
    (s, e) => s + Number(e.total_minutes || 0),
    0,
  );
  const newTotalMinutes = previousTotalMinutes + Number(entry.total_minutes || 0);
  const prev = splitHoursMinutes(previousTotalMinutes);
  const newTot = splitHoursMinutes(newTotalMinutes);

  // Fetch template (fallback to default if missing/error)
  const tpl = await fetchTemplate('usage_entry');
  const templateText = tpl?.template_text ?? DEFAULT_USAGE_TEMPLATE;

  const message = buildUsageMessage(templateText, {
    farmer_name: farmer.name,
    today_hours: Number(entry.hours) || 0,
    today_minutes: Number(entry.minutes) || 0,
    previous_total_hours: prev.hours,
    previous_total_minutes: prev.minutes,
    new_total_hours: newTot.hours,
    new_total_minutes: newTot.minutes,
    date: formatDateForMessage(entry.date),
  });

  // Audit log insert — best effort. Don't block the wa.me link if this fails.
  const { error: logErr } = await logWhatsAppSend({
    farmerId: farmer.id,
    messageType,
    relatedEntryId: entry.id,
    messageText: message,
    whatsappNumber: farmer.whatsapp_number,
    userId,
    userEmail,
  });
  if (logErr) console.error('[whatsapp] log insert failed:', logErr);

  return buildWaMeUrl(farmer.whatsapp_number, message);
}

const UsagePage: React.FC = () => {
  const { user } = useAuth();
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<UsageEntry | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [expandedFarmer, setExpandedFarmer] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  // After a successful save, if the farmer has WhatsApp enabled, this holds the
  // entry + farmer so the green "WhatsApp Bhejo" banner can render.
  const [lastSaved, setLastSaved] = useState<{ entry: UsageEntry; farmer: Farmer } | null>(null);
  const [sendingWa, setSendingWa] = useState(false);

  const [form, setForm] = useState({
    farmer_id: '',
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    hours: '',
    minutes: '',
    rate_per_hour: '100',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadData = async () => {
    setLoading(true);
    const { data: f } = await supabase.from('farmers').select('*').eq('is_deleted', false).eq('is_disabled', false).order('name');
    const { data: e } = await supabase.from('usage_entries').select('*').order('date', { ascending: false });
    const activeFarmerIds = new Set((f || []).map((x) => x.id));
    // Only show entries from active (non-deleted, non-disabled) farmers
    const activeEntries = (e || []).filter((x) => activeFarmerIds.has(x.farmer_id));
    setFarmers(f || []);
    setEntries(activeEntries);

    // Default to current month if it has entries, else latest month
    const currentMonth = format(new Date(), 'MMMM yyyy');
    const months = [...new Set((e || []).map((x: UsageEntry) => x.month))];
    if (months.includes(currentMonth)) setSelectedMonth(currentMonth);
    else if (months.length > 0) setSelectedMonth(months[0]);
    else setSelectedMonth(currentMonth);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // All unique months sorted descending
  const allMonths = [...new Set(entries.map(e => e.month))].sort((a, b) => {
    const da = parse(a, 'MMMM yyyy', new Date());
    const db = parse(b, 'MMMM yyyy', new Date());
    return db.getTime() - da.getTime();
  });

  // Entries filtered by selected month
  const monthEntries = selectedMonth
    ? entries.filter(e => e.month === selectedMonth)
    : entries;

  // Group by farmer
  const grouped = farmers.map(f => ({
    farmer: f,
    entries: monthEntries.filter(e => e.farmer_id === f.id),
  })).filter(g => g.entries.length > 0);

  const calcAmount = (hours: number, mins: number, rate: number) =>
    parseFloat(((hours + mins / 60) * rate).toFixed(2));

  const openAdd = () => {
    setEditEntry(null);
    setForm({ farmer_id: '', date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), hours: '', minutes: '', rate_per_hour: '100' });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (e: UsageEntry) => {
    setEditEntry(e);
    setForm({
      farmer_id: e.farmer_id,
      date: format(new Date(e.date), "yyyy-MM-dd'T'HH:mm"),
      hours: e.hours.toString(),
      minutes: e.minutes.toString(),
      rate_per_hour: e.rate_per_hour.toString(),
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.farmer_id) { setFormError('Kisan select karo'); return; }
    const h = parseInt(form.hours || '0');
    const m = parseInt(form.minutes || '0');
    const rate = parseFloat(form.rate_per_hour || '100');
    if (h === 0 && m === 0) { setFormError('Hours ya minutes bharo'); return; }
    if (m > 59) { setFormError('Minutes 0-59 ke beech hone chahiye'); return; }
    if (rate <= 0) { setFormError('Rate valid hona chahiye'); return; }

    const total_minutes = h * 60 + m;
    const amount = calcAmount(h, m, rate);
    const month = getMonth(form.date);

    setSaving(true);
    setFormError('');

    const payload = {
      farmer_id: form.farmer_id,
      date: new Date(form.date).toISOString(),
      hours: h, minutes: m, total_minutes, amount, rate_per_hour: rate, month,
      created_by: user?.id, created_by_email: user?.email,
    };

    let savedRow: UsageEntry | null = null;
    if (editEntry) {
      const { data, error } = await supabase
        .from('usage_entries')
        .update(payload)
        .eq('id', editEntry.id)
        .select()
        .maybeSingle();
      if (error) { setFormError('Update nahi hua'); setSaving(false); return; }
      savedRow = data as UsageEntry | null;
      showToast('Entry update ho gayi ✓');
    } else {
      const { data, error } = await supabase
        .from('usage_entries')
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) { setFormError('Entry save nahi hui'); setSaving(false); return; }
      savedRow = data as UsageEntry | null;
      showToast('Entry save ho gayi ✓');
    }

    setSaving(false);
    setShowForm(false);

    // If the farmer has WhatsApp enabled + a number, surface the send banner.
    // Edits trigger the banner too — owner can decide whether to re-send.
    const farmerOfEntry = farmers.find(f => f.id === form.farmer_id) || null;
    if (
      savedRow &&
      farmerOfEntry &&
      farmerOfEntry.whatsapp_enabled &&
      farmerOfEntry.whatsapp_number
    ) {
      setLastSaved({ entry: savedRow, farmer: farmerOfEntry });
    } else {
      setLastSaved(null);
    }

    loadData();
  };

  const handleDelete = async (e: UsageEntry) => {
    if (!confirm('Yeh entry delete karna chahte ho?')) return;
    await supabase.from('usage_entries').delete().eq('id', e.id);
    showToast('Entry delete ho gayi');
    // If the deleted entry was the "last saved" one, clear the banner.
    if (lastSaved && lastSaved.entry.id === e.id) setLastSaved(null);
    loadData();
  };

  // ── WhatsApp send handlers ────────────────────────────────────────────────
  const handleSendBannerWhatsApp = async () => {
    if (!lastSaved || sendingWa) return;
    setSendingWa(true);
    try {
      const url = await buildAndLogUsageWhatsApp({
        entry: lastSaved.entry,
        farmer: lastSaved.farmer,
        messageType: 'usage_entry',
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
      });
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        showToast('WhatsApp open ho gaya — message bhejo');
      }
    } catch (err) {
      console.error('[whatsapp] send banner failed:', err);
      showToast('WhatsApp nahi khul saka — dobara try karo');
    } finally {
      setSendingWa(false);
      setLastSaved(null);
    }
  };

  const handleResendWhatsApp = async (entry: UsageEntry, farmer: Farmer) => {
    if (sendingWa) return;
    if (!farmer.whatsapp_enabled || !farmer.whatsapp_number) return;
    setSendingWa(true);
    try {
      const url = await buildAndLogUsageWhatsApp({
        entry,
        farmer,
        messageType: 'manual_resend',
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
      });
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        showToast('WhatsApp open ho gaya — message bhejo');
      }
    } catch (err) {
      console.error('[whatsapp] resend failed:', err);
      showToast('WhatsApp nahi khul saka — dobara try karo');
    } finally {
      setSendingWa(false);
    }
  };

  const liveAmount = () => {
    const h = parseInt(form.hours || '0');
    const m = parseInt(form.minutes || '0');
    const r = parseFloat(form.rate_per_hour || '100');
    if ((h > 0 || m > 0) && r > 0) return `₹${calcAmount(h, m, r).toFixed(2)}`;
    return null;
  };

  const toggleFarmer = (id: string) =>
    setExpandedFarmer(prev => prev === id ? null : id);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <Check size={16} /> {toast}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg">{editEntry ? 'Entry Edit karo' : 'Pani Entry karo'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Kisan *</label>
                <select value={form.farmer_id} onChange={e => setForm(p => ({ ...p, farmer_id: e.target.value }))}
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  style={{ borderColor: '#e5e2dc' }}>
                  <option value="">-- Kisan chunein --</option>
                  {farmers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Date & Time</label>
                <input type="datetime-local" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: '#e5e2dc' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Hours</label>
                  <input type="number" min="0" value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))}
                    placeholder="0" className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: '#e5e2dc' }} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Minutes</label>
                  <input type="number" min="0" max="59" value={form.minutes} onChange={e => setForm(p => ({ ...p, minutes: e.target.value }))}
                    placeholder="0" className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: '#e5e2dc' }} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Rate (₹/hour)</label>
                <input type="number" min="1" value={form.rate_per_hour} onChange={e => setForm(p => ({ ...p, rate_per_hour: e.target.value }))}
                  className="w-full mt-1 px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: '#e5e2dc' }} />
              </div>
              {liveAmount() && (
                <div className="bg-blue-50 px-4 py-3 rounded-xl">
                  <div className="text-sm text-blue-600">Amount: <strong className="text-lg">{liveAmount()}</strong></div>
                </div>
              )}
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

      {/* Header */}
      <div className="flex items-center justify-between mb-4 pt-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pani Entries</h1>
          <p className="text-sm text-gray-500">{monthEntries.length} entries</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium text-sm"
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
          <Plus size={16} /> Pani Entry karo
        </button>
      </div>

      {/* WhatsApp send banner — shown after save if farmer has WhatsApp enabled */}
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
                {lastSaved.entry.hours}h {lastSaved.entry.minutes}m · ₹{Number(lastSaved.entry.amount).toLocaleString('en-IN')} — message mein mahine ka total bhi jaayega
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
          {selectedMonth ? `${selectedMonth} mein koi entry nahi` : 'Koi entry nahi hai'}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ farmer, entries: fEntries }) => {
            const totalHours = Math.floor(fEntries.reduce((s, e) => s + e.total_minutes, 0) / 60);
            const totalMins = fEntries.reduce((s, e) => s + e.total_minutes, 0) % 60;
            const totalAmt = fEntries.reduce((s, e) => s + Number(e.amount), 0);
            const isOpen = expandedFarmer === farmer.id;
            const waReady = farmer.whatsapp_enabled && !!farmer.whatsapp_number;

            return (
              <div key={farmer.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#e5e2dc' }}>
                {/* Farmer Header — click to expand */}
                <button
                  onClick={() => toggleFarmer(farmer.id)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
                      {farmer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                        {farmer.name}
                        {waReady && (
                          <span
                            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100"
                            title="WhatsApp enabled"
                          >
                            <MessageCircle size={10} className="text-green-600" />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{fEntries.length} entries · {totalHours}h {totalMins}m</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-bold text-gray-900">₹{totalAmt.toLocaleString('en-IN')}</div>
                    </div>
                    {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </div>
                </button>

                {/* Entries List — shown when expanded */}
                {isOpen && (
                  <div className="border-t" style={{ borderColor: '#f0ede8' }}>
                    {fEntries.map((e, idx) => (
                      <div key={e.id} className={`px-4 py-3 flex items-start justify-between ${idx < fEntries.length - 1 ? 'border-b' : ''}`}
                        style={{ borderColor: '#f5f5f4' }}>
                        <div className="flex-1">
                          <div className="text-sm text-gray-600">{format(new Date(e.date), 'dd MMM yyyy, hh:mm a')}</div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-sm text-blue-600">
                              <Droplets size={13} /> {e.hours}h {e.minutes}m
                            </span>
                            <span className="text-sm font-bold text-gray-900">₹{Number(e.amount).toLocaleString('en-IN')}</span>
                            <span className="text-xs text-gray-400">@₹{e.rate_per_hour}/hr</span>
                          </div>
                          {e.created_by_email && (
                            <div className="text-xs text-gray-400 mt-0.5">by: {e.created_by_email}</div>
                          )}
                        </div>
                        <div className="flex gap-1 ml-2">
                          {waReady && (
                            <button
                              onClick={() => handleResendWhatsApp(e, farmer)}
                              disabled={sendingWa}
                              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 disabled:opacity-50"
                              title="WhatsApp dobara bhejo"
                            >
                              <MessageCircle size={14} />
                            </button>
                          )}
                          <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(e)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
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

export default UsagePage;
