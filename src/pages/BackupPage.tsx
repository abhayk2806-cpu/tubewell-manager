import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { BackupData } from '@/types';
import { Download, Upload, AlertTriangle, Check, Database } from 'lucide-react';

const BackupPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importPreview, setImportPreview] = useState<BackupData | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg); setToastType(type);
    setTimeout(() => setToast(''), 4000);
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const [{ data: farmers }, { data: usage }, { data: payments }] = await Promise.all([
        supabase.from('farmers').select('*').order('name'),
        supabase.from('usage_entries').select('*').order('date'),
        supabase.from('payments').select('*').order('date'),
      ]);

      const backup: BackupData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        farmers: farmers || [],
        usage_entries: usage || [],
        payments: payments || [],
      };

      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tubewell-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Backup download ho gaya! ${farmers?.length || 0} farmers, ${usage?.length || 0} entries, ${payments?.length || 0} payments`);
    } catch {
      showToast('Backup fail hua. Dobara try karo.', 'error');
    }
    setLoading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as BackupData;
        if (!data.farmers || !data.usage_entries || !data.payments) {
          showToast('Invalid backup file format', 'error');
          return;
        }
        setImportPreview(data);
      } catch {
        showToast('File read nahi hua. Valid JSON hona chahiye.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importPreview) return;
    if (!confirm(`${importMode === 'replace' ? 'SAARA data delete hokar replace hoga!' : 'Data merge hoga.'} Continue?`)) return;

    setImporting(true);
    try {
      if (importMode === 'replace') {
        await supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('usage_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('farmers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }

      if (importPreview.farmers.length > 0) {
        await supabase.from('farmers').upsert(importPreview.farmers, { onConflict: 'id' });
      }
      if (importPreview.usage_entries.length > 0) {
        await supabase.from('usage_entries').upsert(importPreview.usage_entries, { onConflict: 'id' });
      }
      if (importPreview.payments.length > 0) {
        await supabase.from('payments').upsert(importPreview.payments, { onConflict: 'id' });
      }

      showToast(`Import successful! ${importPreview.farmers.length} farmers, ${importPreview.usage_entries.length} entries restore ho gaye ✓`);
      setImportPreview(null);
    } catch (err) {
      showToast('Import fail hua. Dobara try karo.', 'error');
    }
    setImporting(false);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      {toast && (
        <div className={`fixed top-16 left-4 right-4 z-50 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${toastType === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          <Check size={16} /> {toast}
        </div>
      )}

      <div className="pt-2">
        <h1 className="text-xl font-bold text-gray-900">Backup & Restore</h1>
        <p className="text-sm text-gray-500">Data safe rakhna zaroori hai</p>
      </div>

      {/* Export Section */}
      <div className="bg-white rounded-2xl p-5 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-xl bg-blue-50">
            <Download size={20} className="text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Backup Data</h2>
            <p className="text-xs text-gray-500">Saara data JSON mein download karo</p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={loading}
          className="w-full py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
        >
          <Download size={18} />
          {loading ? 'Backup ho raha hai...' : 'Backup Data Download karo'}
        </button>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Farmers, pani entries aur payments — sab included hoga
        </p>
      </div>

      {/* Import Section */}
      <div className="bg-white rounded-2xl p-5 border shadow-sm space-y-4" style={{ borderColor: '#e5e2dc' }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-green-50">
            <Upload size={20} className="text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Import / Restore</h2>
            <p className="text-xs text-gray-500">Purana backup file upload karo</p>
          </div>
        </div>

        {/* Import Mode */}
        <div className="flex gap-2">
          <button
            onClick={() => setImportMode('merge')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${importMode === 'merge' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600'}`}
            style={importMode !== 'merge' ? { borderColor: '#e5e2dc' } : {}}
          >
            Merge karo
          </button>
          <button
            onClick={() => setImportMode('replace')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${importMode === 'replace' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600'}`}
            style={importMode !== 'replace' ? { borderColor: '#e5e2dc' } : {}}
          >
            Replace karo
          </button>
        </div>

        {importMode === 'replace' && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-600">
              <strong>Warning:</strong> Replace mode mein saara existing data delete ho jayega aur backup se replace hoga. Yeh undo nahi ho sakta.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Backup JSON File</label>
          <input
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 cursor-pointer"
          />
        </div>

        {/* Preview */}
        {importPreview && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1">
            <div className="font-medium text-gray-700 text-sm mb-2 flex items-center gap-2">
              <Database size={14} /> Backup Preview
            </div>
            <div className="text-xs text-gray-600">📅 Exported: {new Date(importPreview.exported_at).toLocaleString('en-IN')}</div>
            <div className="text-xs text-gray-600">👨‍🌾 Farmers: {importPreview.farmers.length}</div>
            <div className="text-xs text-gray-600">💧 Pani Entries: {importPreview.usage_entries.length}</div>
            <div className="text-xs text-gray-600">💰 Payments: {importPreview.payments.length}</div>
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!importPreview || importing}
          className="w-full py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-95"
          style={{ background: importMode === 'replace' ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #16a34a, #15803d)' }}
        >
          <Upload size={18} />
          {importing ? 'Import ho raha hai...' : `${importMode === 'replace' ? 'Replace karke' : 'Merge karke'} Import karo`}
        </button>
      </div>
    </div>
  );
};

export default BackupPage;
