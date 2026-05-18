import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Check, X, RotateCcw, Eye, Save, MessageCircle, Info,
} from 'lucide-react';
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_PLACEHOLDERS,
  fetchAllTemplates,
  saveTemplate,
  resetTemplateToDefault,
  renderTemplate,
  sampleUsageVars,
  samplePaymentVars,
  formatDateForMessage,
} from '@/lib/whatsapp';
import type {
  WhatsAppMessageTemplate,
  WhatsAppTemplateType,
} from '@/types';

// ── Per-template UI metadata ────────────────────────────────────────────────
interface TemplateMeta {
  type: WhatsAppTemplateType;
  title: string;
  subtitle: string;
  fires: string;
}

const TEMPLATE_META: TemplateMeta[] = [
  {
    type: 'usage_entry',
    title: 'Pani Entry ka Message',
    subtitle: 'Jab koi nayi pani entry add hoti hai, yeh message kisan ko jaata hai',
    fires: 'UsagePage pe naya entry save hone ke baad',
  },
  {
    type: 'payment_received',
    title: 'Payment Receive ka Message',
    subtitle: 'Jab koi payment add hoti hai, yeh message kisan ko jaata hai',
    fires: 'PaymentsPage pe naya payment save hone ke baad',
  },
];

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Record<WhatsAppTemplateType, WhatsAppMessageTemplate | null>>({
    usage_entry: null,
    payment_received: null,
  });
  const [draft, setDraft] = useState<Record<WhatsAppTemplateType, string>>({
    usage_entry: '',
    payment_received: '',
  });
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<WhatsAppTemplateType | null>(null);
  const [resettingType, setResettingType] = useState<WhatsAppTemplateType | null>(null);
  const [toast, setToast] = useState('');
  const [previewType, setPreviewType] = useState<WhatsAppTemplateType | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadTemplates = async () => {
    setLoading(true);
    const all = await fetchAllTemplates();
    const byType: Record<WhatsAppTemplateType, WhatsAppMessageTemplate | null> = {
      usage_entry: null,
      payment_received: null,
    };
    const drafts: Record<WhatsAppTemplateType, string> = {
      usage_entry: DEFAULT_TEMPLATES.usage_entry,
      payment_received: DEFAULT_TEMPLATES.payment_received,
    };
    for (const row of all) {
      byType[row.template_type] = row;
      drafts[row.template_type] = row.template_text;
    }
    setTemplates(byType);
    setDraft(drafts);
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = async (type: WhatsAppTemplateType) => {
    setSavingType(type);
    const { error } = await saveTemplate({
      type,
      text: draft[type],
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
    });
    setSavingType(null);
    if (error) {
      showToast('Save nahi hua: ' + error.message);
      return;
    }
    showToast('Template save ho gaya ✓');
    loadTemplates();
  };

  const handleReset = async (type: WhatsAppTemplateType) => {
    const meta = TEMPLATE_META.find(t => t.type === type)!;
    if (!confirm(`"${meta.title}" ko default Hindi text se replace karna chahte ho? Tera current text khatm ho jayega.`)) return;
    setResettingType(type);
    const { error } = await resetTemplateToDefault(
      type,
      user?.id ?? null,
      user?.email ?? null,
    );
    setResettingType(null);
    if (error) {
      showToast('Reset nahi hua: ' + error.message);
      return;
    }
    showToast('Default text restore ho gaya ✓');
    loadTemplates();
  };

  const isDirty = (type: WhatsAppTemplateType): boolean => {
    const saved = templates[type]?.template_text ?? DEFAULT_TEMPLATES[type];
    return draft[type] !== saved;
  };

  // ── Preview render ────────────────────────────────────────────────────────
  const previewText = (() => {
    if (!previewType) return '';
    const vars = previewType === 'usage_entry' ? sampleUsageVars() : samplePaymentVars();
    return renderTemplate(draft[previewType], vars as unknown as Record<string, string | number>);
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <Check size={16} /> {toast}
        </div>
      )}

      {/* Preview Modal */}
      {previewType && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <Eye size={18} className="text-blue-500" /> Preview
              </h2>
              <button onClick={() => setPreviewType(null)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="text-xs text-gray-500">
              Sample data ke saath message kaisa dikhega:
            </div>
            <div
              className="rounded-xl p-4 text-sm whitespace-pre-wrap font-medium text-gray-800"
              style={{ background: '#dcf8c6', fontFamily: 'system-ui, sans-serif' }}
            >
              {previewText}
            </div>
            <div className="text-[11px] text-gray-400 text-center">
              Yeh sirf preview hai — actual message mein real farmer data aayega
            </div>
            <button
              onClick={() => setPreviewType(null)}
              className="w-full py-3 rounded-xl text-white font-semibold"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
            >
              Theek hai
            </button>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="mb-4 pt-2">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <MessageCircle size={20} className="text-green-600" /> WhatsApp Templates
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Yeh templates farmers ko bhejne wale messages mein use hote hain
        </p>
      </div>

      {/* Info banner */}
      <div className="mb-4 rounded-xl p-3 flex items-start gap-2 bg-blue-50 border border-blue-100">
        <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-900">
          <div className="font-semibold mb-1">Placeholder kaise kaam karte hain:</div>
          Template mein <code className="bg-white px-1 rounded">{'{farmer_name}'}</code> jaise placeholders likho.
          Message bhejte time woh real data se replace ho jaate hain. Niche har template ke
          allowed placeholders ki list di hai. Typo ho toh placeholder literal dikhega
          (jaise <code className="bg-white px-1 rounded">{'{farmerr_name}'}</code>) — Preview button se check kar lo.
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Load ho raha hai...</div>
      ) : (
        <div className="space-y-4">
          {TEMPLATE_META.map(meta => {
            const dirty = isDirty(meta.type);
            const tpl = templates[meta.type];
            const placeholders = TEMPLATE_PLACEHOLDERS[meta.type];
            return (
              <div
                key={meta.type}
                className="bg-white rounded-2xl p-4 border shadow-sm"
                style={{ borderColor: '#e5e2dc' }}
              >
                {/* Card header */}
                <div className="mb-3">
                  <h2 className="font-bold text-gray-900">{meta.title}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{meta.subtitle}</p>
                  <p className="text-[11px] text-gray-400 mt-1">⏱ Trigger: {meta.fires}</p>
                </div>

                {/* Placeholder reference */}
                <details className="mb-3 group">
                  <summary className="text-xs font-medium text-blue-600 cursor-pointer select-none">
                    Allowed placeholders ({placeholders.length}) — click to show
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {placeholders.map(p => (
                      <code
                        key={p}
                        className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md"
                      >
                        {`{${p}}`}
                      </code>
                    ))}
                  </div>
                </details>

                {/* Textarea */}
                <textarea
                  value={draft[meta.type]}
                  onChange={e => setDraft(p => ({ ...p, [meta.type]: e.target.value }))}
                  rows={9}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  style={{ borderColor: dirty ? '#fbbf24' : '#e5e2dc' }}
                  placeholder="Template text yahan likho..."
                />

                {/* Last updated info */}
                {tpl && tpl.updated_by_email && (
                  <div className="mt-2 text-[11px] text-gray-400">
                    Last updated: {tpl.updated_by_email} • {formatDateForMessage(tpl.updated_at)}
                  </div>
                )}

                {dirty && (
                  <div className="mt-2 text-[11px] text-amber-600 font-medium">
                    ⚠ Unsaved changes — Save karna mat bhulna
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setPreviewType(meta.type)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-medium text-gray-700"
                    style={{ borderColor: '#e5e2dc' }}
                  >
                    <Eye size={15} /> Preview
                  </button>
                  <button
                    onClick={() => handleReset(meta.type)}
                    disabled={resettingType === meta.type}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-medium text-amber-700 disabled:opacity-50"
                    style={{ borderColor: '#e5e2dc' }}
                  >
                    <RotateCcw size={15} />
                    {resettingType === meta.type ? 'Reset...' : 'Reset Default'}
                  </button>
                  <button
                    onClick={() => handleSave(meta.type)}
                    disabled={savingType === meta.type || !dirty}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
                  >
                    <Save size={15} />
                    {savingType === meta.type ? 'Save...' : 'Save'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
