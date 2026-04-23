import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Farmer, UsageEntry, Payment } from '@/types';
import { format, parse } from 'date-fns';
import { ChevronDown, CalendarDays } from 'lucide-react';

const MonthsPage: React.FC = () => {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [filterFarmer, setFilterFarmer] = useState('');

  const loadData = async () => {
    setLoading(true);
    const [{ data: f }, { data: e }, { data: p }] = await Promise.all([
      supabase.from('farmers').select('*').eq('is_deleted', false).order('name'),
      supabase.from('usage_entries').select('*').order('date', { ascending: false }),
      supabase.from('payments').select('*').order('date', { ascending: false }),
    ]);
    setFarmers(f || []);
    setEntries(e || []);
    setPayments(p || []);

    const current = format(new Date(), 'MMMM yyyy');
    const months = [...new Set((e || []).map((x: UsageEntry) => x.month))];
    setSelectedMonth(months.includes(current) ? current : (months[0] || current));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const allMonths = [...new Set(entries.map(e => e.month))].sort((a, b) => {
    const da = parse(a, 'MMMM yyyy', new Date());
    const db = parse(b, 'MMMM yyyy', new Date());
    return db.getTime() - da.getTime();
  });

  const farmerMap = Object.fromEntries(farmers.map(f => [f.id, f.name]));

  // FIXED: Remaining = month usage - payments WHERE for_month = this month
  // (not payments by date, because a farmer may pay April dues in May)
  const getMonthData = (month: string, farmerId?: string) => {
    const monthEntries = entries.filter(e =>
      e.month === month && (!farmerId || e.farmer_id === farmerId)
    );
    const totalMinutes = monthEntries.reduce((s, e) => s + e.total_minutes, 0);
    const totalAmount = monthEntries.reduce((s, e) => s + Number(e.amount), 0);

    // KEY FIX: filter payments by for_month (not payment date)
    const monthPayments = payments.filter(p =>
      p.for_month === month && (!farmerId || p.farmer_id === farmerId)
    );
    const totalPaid = monthPayments.reduce((s, p) => s + Number(p.amount), 0);

    return {
      entries: monthEntries,
      payments: monthPayments,
      totalMinutes,
      totalHours: Math.floor(totalMinutes / 60),
      totalMins: totalMinutes % 60,
      totalAmount,
      totalPaid,
      remaining: Math.max(0, totalAmount - totalPaid),
    };
  };

  const overallData = selectedMonth
    ? getMonthData(selectedMonth, filterFarmer || undefined)
    : null;

  // Farmer breakdown (only shown when no farmer filter active)
  const farmerBreakdown = farmers.map(f => ({
    ...f,
    ...getMonthData(selectedMonth, f.id),
  })).filter(f => f.entries.length > 0);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-4 pt-2">
        <CalendarDays size={20} className="text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">Month-wise View</h1>
      </div>

      {/* Month Selector */}
      <div className="relative mb-3">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border text-base bg-white outline-none appearance-none"
          style={{ borderColor: '#e5e2dc' }}
        >
          {allMonths.length === 0 && <option value="">-- Koi data nahi --</option>}
          {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>

      {/* Farmer Filter */}
      <div className="mb-4">
        <select
          value={filterFarmer}
          onChange={e => setFilterFarmer(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border text-sm bg-white outline-none"
          style={{ borderColor: '#e5e2dc' }}
        >
          <option value="">Sabhi Kisan</option>
          {farmers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Load ho raha hai...</div>
      ) : !selectedMonth || !overallData ? (
        <div className="text-center py-10 text-gray-400 text-sm">Koi data nahi is month ka</div>
      ) : (
        <div className="space-y-4">

          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
              <div className="text-xs text-gray-500 mb-1">Total Hours</div>
              <div className="text-xl font-bold text-blue-600">
                {overallData.totalHours}h {overallData.totalMins}m
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
              <div className="text-xs text-gray-500 mb-1">Total Amount</div>
              <div className="text-xl font-bold text-gray-900">
                ₹{overallData.totalAmount.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
              <div className="text-xs text-gray-500 mb-1">Collected (for this month)</div>
              <div className="text-xl font-bold text-green-600">
                ₹{overallData.totalPaid.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
              <div className="text-xs text-gray-500 mb-1">Remaining</div>
              <div className="text-xl font-bold text-red-500">
                ₹{overallData.remaining.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          {/* Collection Progress Bar */}
          {overallData.totalAmount > 0 && (
            <div className="bg-white rounded-2xl p-4 border shadow-sm" style={{ borderColor: '#e5e2dc' }}>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Collection Progress</span>
                <span className="font-semibold">
                  {Math.min(100, Math.round((overallData.totalPaid / overallData.totalAmount) * 100))}%
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (overallData.totalPaid / overallData.totalAmount) * 100)}%`
                  }}
                />
              </div>
              {overallData.totalPaid > overallData.totalAmount && (
                <div className="text-xs text-blue-500 mt-1">
                  ₹{(overallData.totalPaid - overallData.totalAmount).toLocaleString('en-IN')} extra paid
                </div>
              )}
            </div>
          )}

          {/* Farmer Breakdown (only if no farmer filter) */}
          {!filterFarmer && (
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#e5e2dc' }}>
              <div className="px-4 py-3 border-b font-semibold text-gray-800" style={{ borderColor: '#e5e2dc' }}>
                Kisan-wise Breakdown
              </div>
              {farmerBreakdown.length === 0 ? (
                <div className="px-4 py-6 text-center text-gray-400 text-sm">Koi data nahi</div>
              ) : (
                <div className="divide-y" style={{ borderColor: '#f5f5f4' }}>
                  {farmerBreakdown.map(f => (
                    <div key={f.id} className="px-4 py-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-gray-900">{f.name}</div>
                          <div className="text-xs text-gray-400">
                            {f.totalHours}h {f.totalMins}m · {f.entries.length} entries
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-gray-900">
                            ₹{f.totalAmount.toLocaleString('en-IN')}
                          </div>
                          {f.remaining > 0 ? (
                            <div className="text-xs text-red-500">
                              Baki: ₹{f.remaining.toLocaleString('en-IN')}
                            </div>
                          ) : (
                            <div className="text-xs text-green-600">✓ Clear</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Usage Entries */}
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#e5e2dc' }}>
            <div className="px-4 py-3 border-b font-semibold text-gray-800" style={{ borderColor: '#e5e2dc' }}>
              Pani Entries ({overallData.entries.length})
            </div>
            {overallData.entries.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">Koi entry nahi</div>
            ) : (
              <div className="divide-y" style={{ borderColor: '#f5f5f4' }}>
                {overallData.entries.map(e => (
                  <div key={e.id} className="px-4 py-3">
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{farmerMap[e.farmer_id]}</div>
                        <div className="text-xs text-gray-400">
                          {format(new Date(e.date), 'dd MMM, hh:mm a')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-gray-900">
                          ₹{Number(e.amount).toLocaleString('en-IN')}
                        </div>
                        <div className="text-xs text-gray-400">{e.hours}h {e.minutes}m</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payments for this month */}
          {overallData.payments.length > 0 && (
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#e5e2dc' }}>
              <div className="px-4 py-3 border-b font-semibold text-gray-800" style={{ borderColor: '#e5e2dc' }}>
                Payments (for {selectedMonth})
              </div>
              <div className="divide-y" style={{ borderColor: '#f5f5f4' }}>
                {overallData.payments.map(p => (
                  <div key={p.id} className="px-4 py-3 flex justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{farmerMap[p.farmer_id]}</div>
                      <div className="text-xs text-gray-400">
                        {format(new Date(p.date), 'dd MMM yyyy')}
                      </div>
                    </div>
                    <div className="font-bold text-green-600">
                      ₹{Number(p.amount).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default MonthsPage;
