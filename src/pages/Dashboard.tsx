import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { FarmerSummary } from '@/types';
import { format, parse } from 'date-fns';
import {
  Droplets, Wallet, Users, TrendingUp, ChevronRight, ChevronDown,
  MessageCircle, Send,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { buildWaMeUrl, formatRupees, logWhatsAppSend } from '@/lib/whatsapp';

type ViewMode = 'all' | 'monthly' | 'yearly';

// Internal types for raw fetched data
type RawUsage = { farmer_id: string; amount: number; month: string; date: string };
type RawPayment = { farmer_id: string; amount: number; date: string; for_month: string };

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [farmers, setFarmers] = useState<FarmerSummary[]>([]);
  const [allUsage, setAllUsage] = useState<RawUsage[]>([]);
  const [allPayments, setAllPayments] = useState<RawPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [sendingWaForFarmer, setSendingWaForFarmer] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const navigate = useNavigate();

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const loadData = async () => {
    setLoading(true);

    const [{ data: farmersData }, { data: usageData }, { data: paymentData }] = await Promise.all([
      supabase.from('farmers').select('*').eq('is_deleted', false).eq('is_disabled', false).order('name'),
      supabase.from('usage_entries').select('farmer_id, amount, month, date'),
      supabase.from('payments').select('farmer_id, amount, date, for_month'),
    ]);

    if (!farmersData) { setLoading(false); return; }

    // KEY FIX: Only include data from ACTIVE (non-deleted) farmers.
    // Deleted farmers' usage/payments were causing stat card totals to mismatch.
    const activeFarmerIds = new Set(farmersData.map(f => f.id));
    const activeUsage = (usageData || []).filter(u => activeFarmerIds.has(u.farmer_id));
    const activePayments = (paymentData || []).filter(p => activeFarmerIds.has(p.farmer_id));

    setAllUsage(activeUsage);
    setAllPayments(activePayments);

    // All-time farmer summaries (used in "All Time" view and farmer due list)
    const summaries: FarmerSummary[] = farmersData.map(f => {
      const usage = activeUsage
        .filter(u => u.farmer_id === f.id)
        .reduce((s, u) => s + Number(u.amount), 0);
      const paid = activePayments
        .filter(p => p.farmer_id === f.id)
        .reduce((s, p) => s + Number(p.amount), 0);
      return {
        ...f,
        total_usage_amount: usage,
        total_paid: paid,
        total_due: Math.max(0, usage - paid),
      };
    });

    setFarmers(summaries.sort((a, b) => b.total_due - a.total_due));

    const currentMonth = format(new Date(), 'MMMM yyyy');
    const currentYear = format(new Date(), 'yyyy');
    setSelectedMonth(currentMonth);
    setSelectedYear(currentYear);

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // ── WhatsApp reminder send ─────────────────────────────────
  // Quick-action reminder for farmers with outstanding due. Uses a hard-coded
  // Hindi message (not template-driven — different shape than usage/payment
  // templates). Logs with message_type='reminder'. Send is decoupled from any
  // data save (read-only operation against farmer + dues snapshot).
  const handleReminderWa = async (farmer: FarmerSummary) => {
    if (sendingWaForFarmer) return;
    if (!farmer.whatsapp_enabled || !farmer.whatsapp_number) return;
    if (farmer.total_due <= 0) return;

    setSendingWaForFarmer(farmer.id);
    try {
      const message =
        `Namaste ${farmer.name} ji 🙏\n\n` +
        `Aapke kuch paise abhi tak baki hain:\n` +
        `💰 Total baki: ₹${formatRupees(farmer.total_due)}\n\n` +
        `Jab convenient ho, please clear kar dijiye.\n\n` +
        `— Tubewell Manager`;

      await logWhatsAppSend({
        farmerId: farmer.id,
        messageType: 'reminder',
        relatedEntryId: null,
        messageText: message,
        whatsappNumber: farmer.whatsapp_number,
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
      });
      window.open(buildWaMeUrl(farmer.whatsapp_number, message), '_blank', 'noopener,noreferrer');
      showToast('WhatsApp open ho gaya — reminder bhejo');
    } catch (err) {
      console.error('[dashboard] reminder send failed:', err);
      showToast('WhatsApp nahi khul saka — dobara try karo');
    } finally {
      setSendingWaForFarmer(null);
    }
  };

  // --- Month / Year options for selectors ---
  const allMonths = [...new Set(allUsage.map(u => u.month))].sort((a, b) => {
    const da = parse(a, 'MMMM yyyy', new Date());
    const db = parse(b, 'MMMM yyyy', new Date());
    return db.getTime() - da.getTime();
  });

  const allYears = [...new Set([
    ...allUsage.map(u => format(new Date(u.date), 'yyyy')),
    ...allPayments.map(p => format(new Date(p.date), 'yyyy')),
  ])].sort((a, b) => Number(b) - Number(a));

  // --- Period-filtered usage & payments ---
  // Monthly usage: filter by usage.month (the month when water was used)
  // Monthly payments: filter by payment.for_month (the month the payment is FOR — proper allocation)
  // Yearly usage: filter by year of entry date
  // Yearly payments: filter by year of payment date (cash received)
  const filteredUsage: RawUsage[] = (() => {
    if (viewMode === 'monthly' && selectedMonth)
      return allUsage.filter(u => u.month === selectedMonth);
    if (viewMode === 'yearly' && selectedYear)
      return allUsage.filter(u => format(new Date(u.date), 'yyyy') === selectedYear);
    return allUsage;
  })();

  const filteredPayments: RawPayment[] = (() => {
    if (viewMode === 'monthly' && selectedMonth)
      // Use for_month: shows how much was collected FOR this month, regardless of when paid
      return allPayments.filter(p => p.for_month === selectedMonth);
    if (viewMode === 'yearly' && selectedYear)
      // Use payment date year: cash received during this year
      return allPayments.filter(p => format(new Date(p.date), 'yyyy') === selectedYear);
    return allPayments;
  })();

  // --- Stats ---
  const totalUsage = filteredUsage.reduce((s, u) => s + Number(u.amount), 0);
  const totalCollected = filteredPayments.reduce((s, p) => s + Number(p.amount), 0);

  // Per-farmer dues for the current period (more accurate than global subtraction)
  // Each farmer's due is individually capped at 0 (no farmer has negative due)
  const farmerPeriodDues = farmers.map(f => {
    const fUsage = filteredUsage
      .filter(u => u.farmer_id === f.id)
      .reduce((s, u) => s + Number(u.amount), 0);
    const fPaid = filteredPayments
      .filter(p => p.farmer_id === f.id)
      .reduce((s, p) => s + Number(p.amount), 0);
    return {
      ...f,
      total_usage_amount: fUsage,
      total_paid: fPaid,
      total_due: Math.max(0, fUsage - fPaid),
    };
  }).filter(f => f.total_usage_amount > 0)
    .sort((a, b) => b.total_due - a.total_due);

  // Total due = sum of individual farmer dues
  const totalDue = farmerPeriodDues.reduce((s, f) => s + f.total_due, 0);

  // Recovery rate: capped at 100%
  const recoveryRate = totalUsage > 0
    ? Math.min(100, Math.round((totalCollected / totalUsage) * 100))
    : 0;

  const activeFarmers = farmers.length;

  const pieData = [
    { name: 'Collected', value: totalCollected },
    { name: 'Due', value: totalDue },
  ];

  const periodLabel = viewMode === 'monthly' && selectedMonth
    ? selectedMonth
    : viewMode === 'yearly' && selectedYear
      ? selectedYear
      : '';

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 animate-pulse">Data load ho raha hai...</div>
    </div>
  );

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {toast && (
        <div className="fixed top-16 left-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <MessageCircle size={16} /> {toast}
        </div>
      )}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Saara hisaab ek jagah</p>
      </div>

      {/* View Mode Tabs */}
      <div className="bg-white rounded-2xl p-1.5 border flex gap-1" style={{ borderColor: '#e5e2dc' }}>
        {(['all', 'monthly', 'yearly'] as ViewMode[]).map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
              viewMode === mode ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {mode === 'all' ? 'All Time' : mode === 'monthly' ? 'Monthly' : 'Yearly'}
          </button>
        ))}
      </div>

      {/* Period Selector */}
      {viewMode === 'monthly' && (
        <div className="relative">
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border text-sm bg-white outline-none appearance-none"
            style={{ borderColor: '#e5e2dc' }}>
            {allMonths.length === 0
              ? <option value={selectedMonth}>{selectedMonth}</option>
              : allMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      )}
      {viewMode === 'yearly' && (
        <div className="relative">
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border text-sm bg-white outline-none appearance-none"
            style={{ borderColor: '#e5e2dc' }}>
            {allYears.length === 0
              ? <option value={selectedYear}>{selectedYear}</option>
              : allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Kitna Baki Hai"
          value={`₹${totalDue.toLocaleString('en-IN')}`}
          icon={<Wallet size={20} />} color="#ef4444" bg="#fef2f2"
        />
        <StatCard
          label="Total Collected"
          value={`₹${totalCollected.toLocaleString('en-IN')}`}
          icon={<TrendingUp size={20} />} color="#16a34a" bg="#f0fdf4"
        />
        <StatCard
          label="Total Usage"
          value={`₹${totalUsage.toLocaleString('en-IN')}`}
          icon={<Droplets size={20} />} color="#2563eb" bg="#eff6ff"
        />
        <StatCard
          label="Active Farmers"
          value={activeFarmers.toString()}
          icon={<Users size={20} />} color="#7c3aed" bg="#f5f3ff"
        />
      </div>

      {/* Pie Chart */}
      {(totalDue + totalCollected) > 0 && (
        <div className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
          <h2 className="font-semibold text-gray-800 mb-3">
            Paid vs Due
            {periodLabel && (
              <span className="text-sm font-normal text-gray-400 ml-2">({periodLabel})</span>
            )}
          </h2>
          <div className="flex items-center gap-4">
            <div style={{ width: 120, height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={30} outerRadius={50}
                    dataKey="value" strokeWidth={0}
                  >
                    <Cell fill="#16a34a" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip formatter={(val) => [`₹${Number(val).toLocaleString('en-IN')}`, '']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-600" />
                <span className="text-sm text-gray-600">
                  Collected: <strong>₹{totalCollected.toLocaleString('en-IN')}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm text-gray-600">
                  Due: <strong>₹{totalDue.toLocaleString('en-IN')}</strong>
                </span>
              </div>
              {totalUsage > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-gray-400">Recovery Rate</div>
                  <div className="text-lg font-bold text-green-600">{recoveryRate}%</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Farmer Due List */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#e5e2dc' }}>
        <div className="px-4 py-3 border-b flex justify-between items-center" style={{ borderColor: '#e5e2dc' }}>
          <h2 className="font-semibold text-gray-800">Kisan-wise Baki</h2>
          <button
            onClick={() => navigate('/farmers')}
            className="text-blue-600 text-sm font-medium flex items-center gap-1"
          >
            Sabhi <ChevronRight size={16} />
          </button>
        </div>
        {farmerPeriodDues.filter(f => f.total_due > 0).length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            {viewMode === 'all'
              ? 'Koi baki nahi! Sab cleared hai 🎉'
              : `${periodLabel} mein koi baki nahi`}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#f5f5f4' }}>
            {farmerPeriodDues.filter(f => f.total_due > 0).slice(0, 10).map(f => {
              const waReady = f.whatsapp_enabled && !!f.whatsapp_number;
              return (
                <div key={f.id} className="px-3 py-2.5 flex items-center gap-1">
                  <button
                    onClick={() => navigate(`/farmers/${f.id}`)}
                    className="flex-1 min-w-0 text-left px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="font-medium text-gray-900 truncate">{f.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-bold text-red-500 text-sm">₹{f.total_due.toLocaleString('en-IN')} baki</span>
                      {f.mobile && <span className="text-[11px] text-gray-400 truncate">· {f.mobile}</span>}
                    </div>
                  </button>
                  <button
                    onClick={() => navigate(`/payments?farmer_id=${f.id}`)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-white text-xs font-semibold"
                    style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
                    title="Payment add karo"
                  >
                    <Wallet size={12} /> Pay
                  </button>
                  {waReady && (
                    <button
                      onClick={() => handleReminderWa(f)}
                      disabled={sendingWaForFarmer === f.id}
                      className="shrink-0 p-1.5 rounded-lg text-green-600 hover:bg-green-50 disabled:opacity-50"
                      title="WhatsApp reminder bhejo"
                    >
                      {sendingWaForFarmer === f.id ? (
                        <Send size={14} className="animate-pulse" />
                      ) : (
                        <MessageCircle size={14} />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  label: string; value: string; icon: React.ReactNode; color: string; bg: string;
}> = ({ label, value, icon, color, bg }) => (
  <div className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
    <div className="flex items-center gap-2 mb-2">
      <div className="p-1.5 rounded-lg" style={{ background: bg, color }}>{icon}</div>
    </div>
    <div className="text-xl font-bold text-gray-900">{value}</div>
    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
  </div>
);

export default Dashboard;
