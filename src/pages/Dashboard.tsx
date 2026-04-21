import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { FarmerSummary } from '@/types';
import { Droplets, Wallet, Users, TrendingUp, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const Dashboard: React.FC = () => {
  const [farmers, setFarmers] = useState<FarmerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const totalDue = farmers.reduce((s, f) => s + f.total_due, 0);
  const totalCollected = farmers.reduce((s, f) => s + f.total_paid, 0);
  const totalUsage = farmers.reduce((s, f) => s + f.total_usage_amount, 0);
  const activeFarmers = farmers.filter(f => !f.is_deleted).length;

  const pieData = [
    { name: 'Collected', value: totalCollected },
    { name: 'Due', value: totalDue },
  ];

  const loadData = async () => {
    setLoading(true);
    const { data: farmersData } = await supabase
      .from('farmers')
      .select('*')
      .eq('is_deleted', false)
      .order('name');

    if (!farmersData) { setLoading(false); return; }

    const { data: usageData } = await supabase.from('usage_entries').select('farmer_id, amount');
    const { data: paymentData } = await supabase.from('payments').select('farmer_id, amount');

    const summaries: FarmerSummary[] = farmersData.map(f => {
      const usage = (usageData || []).filter(u => u.farmer_id === f.id).reduce((s, u) => s + Number(u.amount), 0);
      const paid = (paymentData || []).filter(p => p.farmer_id === f.id).reduce((s, p) => s + Number(p.amount), 0);
      return { ...f, total_usage_amount: usage, total_paid: paid, total_due: Math.max(0, usage - paid) };
    });

    setFarmers(summaries.sort((a, b) => b.total_due - a.total_due));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Kitna Baki Hai"
          value={`₹${totalDue.toLocaleString('en-IN')}`}
          icon={<Wallet size={20} />}
          color="#ef4444"
          bg="#fef2f2"
        />
        <StatCard
          label="Total Collected"
          value={`₹${totalCollected.toLocaleString('en-IN')}`}
          icon={<TrendingUp size={20} />}
          color="#16a34a"
          bg="#f0fdf4"
        />
        <StatCard
          label="Total Usage"
          value={`₹${totalUsage.toLocaleString('en-IN')}`}
          icon={<Droplets size={20} />}
          color="#2563eb"
          bg="#eff6ff"
        />
        <StatCard
          label="Active Farmers"
          value={activeFarmers.toString()}
          icon={<Users size={20} />}
          color="#7c3aed"
          bg="#f5f3ff"
        />
      </div>

      {/* Chart */}
      {(totalDue + totalCollected) > 0 && (
        <div className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
          <h2 className="font-semibold text-gray-800 mb-3">Paid vs Due</h2>
          <div className="flex items-center gap-4">
            <div style={{ width: 120, height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" strokeWidth={0}>
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
                <span className="text-sm text-gray-600">Collected: <strong>₹{totalCollected.toLocaleString('en-IN')}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm text-gray-600">Due: <strong>₹{totalDue.toLocaleString('en-IN')}</strong></span>
              </div>
              {totalUsage > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-gray-400">Recovery Rate</div>
                  <div className="text-lg font-bold text-green-600">
                    {Math.round((totalCollected / totalUsage) * 100)}%
                  </div>
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
          <button onClick={() => navigate('/farmers')} className="text-blue-600 text-sm font-medium flex items-center gap-1">
            Sabhi <ChevronRight size={16} />
          </button>
        </div>
        {farmers.filter(f => f.total_due > 0).length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">Koi baki nahi! Sab cleared hai 🎉</div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#f5f5f4' }}>
            {farmers.filter(f => f.total_due > 0).slice(0, 10).map(f => (
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
