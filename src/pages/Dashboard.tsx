import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { FarmerSummary } from '@/types';
import { format, parse } from 'date-fns';
import { Droplets, Wallet, Users, TrendingUp, ChevronRight, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

type ViewMode = 'all' | 'monthly' | 'yearly';

// Internal types for raw fetched data
type RawUsage = { farmer_id: string; amount: number; month: string; date: string };
type RawPayment = { farmer_id: string; amount: number; date: string; for_month: string };

const Dashboard: React.FC = () => {
  const [farmers, setFarmers] = useState<FarmerSummary[]>([]);
  const [allUsage, setAllUsage] = useState<RawUsage[]>([]);
  const [allPayments, setAllPayments] = useState<RawPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const navigate = useNavigate();

  const loadData = async () => {
    setLoading(true);

    const [{ data: farmersData }, { data: usageData }, { data: paymentData }] = await Promise.all([
      supabase.from('farmers').select('*').eq('is_deleted', false).order('name'),
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
            {farmerPeriodDues.filter(f => f.total_due > 0).slice(0, 10).map(f => (
              <div key={f.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{f.name}</div>
                  {f.mobile && <div className="text-xs text-gray-400">{f.mobile}</div>}
                </div>
                <div className="text-right">
                  <div className="font-bold text-red-500">₹{f.total_due.toLocaleString('en-IN')}</div>
                  <div className="text-xs text-gray-400">baki</div>
                </div>
              </div>
            ))}
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
