import { describe, expect, it } from 'vitest';
import { buildAllFarmersMonths } from '@/lib/ledger';
import type { DashboardView, MonthRow } from '@/lib/ledger';
import {
  CHART_MIN_PERCENT,
  RECENT_LIMIT,
  buildDashboardScreen,
  buildPeriodOptions,
  buildRecentActivity,
  chartBars,
  filterDashboardRows,
  periodView,
  sortDashboardRows,
  summarizeDashboard,
} from './dashboardRules';
import type { DashboardRow } from './dashboardRules';
import { buildFarmerProfile } from './profileRules';
import { farmerRow, paymentRow, usageRow } from './test-support/fakeSupabase';

// Fictional farmers. Worked numbers (rate 100/hour):
// A (Asha): 3 h 35 min in Oct = 358.33; payments 100 + 200 in Oct -> baaki 58.33, credit 0.
// B (Bholu): 2 h 00 min in Sep = 200.00, no payment -> baaki 200.00.
// C (Chhotu): only a payment of 50.00 in Aug -> credit 50.00.
const asha = farmerRow({ id: 'a', name: 'Asha Test' });
const bholu = farmerRow({ id: 'b', name: 'bholu Test' });
const chhotu = farmerRow({ id: 'c', name: 'Chhotu Test' });
const bandOwes = farmerRow({ id: 'd', name: 'Band Owes', is_disabled: true });
const bandCredit = farmerRow({ id: 'd2', name: 'Band Credit', is_disabled: true });
const bandZero = farmerRow({ id: 'd3', name: 'Band Zero', is_disabled: true });
const gone = farmerRow({ id: 'e', name: 'Gone Test', deleted_at: '2026-10-01T00:00:00+00:00' });
const farmers = [asha, bholu, chhotu, bandOwes, bandCredit, bandZero, gone];

const aUse = usageRow({ id: 'ua', farmer_id: 'a', used_at: '2026-10-02T04:30:00+00:00', hours: 3, minutes: 35 });
const aPay100 = paymentRow({ id: 'pa1', farmer_id: 'a', paid_at: '2026-10-05T05:30:00+00:00', amount_paise: 10000 });
const aPay200 = paymentRow({ id: 'pa2', farmer_id: 'a', paid_at: '2026-10-06T05:30:00+00:00', amount_paise: 20000 });
const bUse = usageRow({ id: 'ub', farmer_id: 'b', used_at: '2026-09-20T04:30:00+00:00', hours: 2, minutes: 0 });
const cPay = paymentRow({ id: 'pc', farmer_id: 'c', paid_at: '2026-08-10T05:30:00+00:00', amount_paise: 5000 });
const dUse = usageRow({ id: 'ud', farmer_id: 'd', used_at: '2026-10-03T04:30:00+00:00', hours: 1, minutes: 0 });
const d2Pay = paymentRow({ id: 'pd2', farmer_id: 'd2', paid_at: '2026-10-03T05:30:00+00:00', amount_paise: 2000 });
const eUse = usageRow({ id: 'ue', farmer_id: 'e', used_at: '2026-10-04T04:30:00+00:00', hours: 9, minutes: 0 });
const ePay = paymentRow({ id: 'pe', farmer_id: 'e', paid_at: '2026-10-04T05:30:00+00:00', amount_paise: 99900 });
const deletedUse = usageRow({ id: 'ux', farmer_id: 'a', used_at: '2026-10-06T06:00:00+00:00', hours: 7, minutes: 0, deleted_at: '2026-10-06T07:00:00+00:00' });
const deletedPay = paymentRow({ id: 'px', farmer_id: 'b', paid_at: '2026-10-06T06:00:00+00:00', amount_paise: 77700, deleted_at: '2026-10-06T07:00:00+00:00' });

const usageRows = [aUse, bUse, dUse, eUse, deletedUse];
const paymentRows = [aPay100, aPay200, cPay, d2Pay, ePay, deletedPay];
const now = { dateKey: '2026-10-06', timeKey: '14:05', monthKey: '2026-10' };

function screenFor(view: DashboardView, input: { usage?: typeof usageRows; payments?: typeof paymentRows; farmerList?: typeof farmers } = {}) {
  const result = buildDashboardScreen({
    farmers: input.farmerList ?? farmers,
    usageRows: input.usage ?? usageRows,
    paymentRows: input.payments ?? paymentRows,
    view,
    now,
  });
  if (!result.ok) throw new Error('expected a dashboard');
  return result.screen;
}

const totals = (s: ReturnType<typeof screenFor>) => {
  const d = s.dashboard;
  return [d.chargesCreatedPaise, d.cashReceivedPaise, d.outstandingPaise, d.creditPaise];
};

describe('buildDashboardScreen: worked numbers', () => {
  it('All Time: charges 558.33, cash 350.00, baaki 258.33 and credit 50.00, never combined', () => {
    const s = screenFor({ kind: 'all' });
    expect(totals(s)).toEqual([55833, 35000, 25833, 5000]);
    expect(s.dashboard.activeFarmerCount).toBe(3);
    expect(s.periodHasActivity).toBe(true);
  });

  it('rows: highest baaki first, then name; each with its engine figures and name', () => {
    const s = screenFor({ kind: 'all' });
    expect(s.rows.map((r) => [r.name, r.outstandingPaise, r.creditPaise, r.chargesCreatedPaise, r.cashReceivedPaise])).toEqual([
      ['bholu Test', 20000, 0, 20000, 0],
      ['Asha Test', 5833, 0, 35833, 30000],
      ['Chhotu Test', 0, 5000, 0, 5000],
    ]);
  });

  it('summary: 2 farmers with baaki, top is B with 200.00; 1 with credit', () => {
    expect(screenFor({ kind: 'all' }).summary).toEqual({
      baakiCount: 2,
      creditCount: 1,
      top: { farmerId: 'b', name: 'bholu Test', outstandingPaise: 20000 },
    });
  });

  it('Mahina 2026-10: charges and cash of October, balances at the end of October', () => {
    const s = screenFor({ kind: 'month', monthKey: '2026-10' });
    expect(totals(s)).toEqual([35833, 30000, 25833, 5000]);
    expect(s.periodHasActivity).toBe(true);
  });

  it('Mahina 2026-09: the charge in September, the payment of October not yet counted', () => {
    const s = screenFor({ kind: 'month', monthKey: '2026-09' });
    expect(totals(s)).toEqual([20000, 0, 20000, 5000]);
    expect(s.rows.find((r) => r.farmerId === 'a')).toMatchObject({ outstandingPaise: 0, creditPaise: 0, chargesCreatedPaise: 0 });
  });

  it('Mahina 2026-08: a payment-only month (cash 50.00, no charge)', () => {
    const s = screenFor({ kind: 'month', monthKey: '2026-08' });
    expect(totals(s)).toEqual([0, 5000, 0, 5000]);
    expect(s.summary).toEqual({ baakiCount: 0, creditCount: 1, top: null });
  });

  it('Mahina with no data: zeros and no activity', () => {
    const s = screenFor({ kind: 'month', monthKey: '2026-07' });
    expect(totals(s)).toEqual([0, 0, 0, 0]);
    expect(s.periodHasActivity).toBe(false);
  });

  it('Saal 2026 and 2025', () => {
    expect(totals(screenFor({ kind: 'year', yearKey: '2026' }))).toEqual([55833, 35000, 25833, 5000]);
    const s2025 = screenFor({ kind: 'year', yearKey: '2025' });
    expect(totals(s2025)).toEqual([0, 0, 0, 0]);
    expect(s2025.periodHasActivity).toBe(false);
  });

  it('IST month boundary: 2026-09-30 23:59 IST is September, 2026-10-01 00:01 IST is October', () => {
    const late = usageRow({ id: 'u-late', farmer_id: 'a', used_at: '2026-09-30T18:29:00+00:00', hours: 1, minutes: 0 });
    const early = usageRow({ id: 'u-early', farmer_id: 'b', used_at: '2026-09-30T18:31:00+00:00', hours: 2, minutes: 0 });
    const input = { usage: [late, early], payments: [] };
    expect(screenFor({ kind: 'month', monthKey: '2026-09' }, input).dashboard.chargesCreatedPaise).toBe(10000);
    expect(screenFor({ kind: 'month', monthKey: '2026-10' }, input).dashboard.chargesCreatedPaise).toBe(20000);
    expect(screenFor({ kind: 'month', monthKey: '2026-09' }, input).dashboard.outstandingPaise).toBe(10000);
  });

  it('IST year boundary (E24c): 2025-12-31T18:40Z is IST 2026-01-01 00:10 and counts in 2026', () => {
    const entry = usageRow({ id: 'u-ny', farmer_id: 'a', used_at: '2025-12-31T18:40:00+00:00', hours: 1, minutes: 0 });
    const input = { usage: [entry], payments: [] };
    expect(screenFor({ kind: 'year', yearKey: '2026' }, input).dashboard.chargesCreatedPaise).toBe(10000);
    expect(screenFor({ kind: 'year', yearKey: '2025' }, input).dashboard.chargesCreatedPaise).toBe(0);
  });
});

describe('separate, never netted (L8, E18)', () => {
  it('one farmer owing 200.00 and one with credit 200.00: both sums shown separately', () => {
    const owes = usageRow({ id: 'u1', farmer_id: 'b', used_at: '2026-10-02T04:30:00+00:00', hours: 2, minutes: 0 });
    const aUsage = usageRow({ id: 'u2', farmer_id: 'a', used_at: '2026-10-02T04:30:00+00:00', hours: 1, minutes: 0 });
    const aPay = paymentRow({ id: 'p1', farmer_id: 'a', paid_at: '2026-10-03T04:30:00+00:00', amount_paise: 30000 });
    const s = screenFor({ kind: 'all' }, { usage: [owes, aUsage], payments: [aPay], farmerList: [asha, bholu] });
    expect(s.dashboard.outstandingPaise).toBe(20000);
    expect(s.dashboard.creditPaise).toBe(20000);
  });
});

describe('inactive farmers (L12)', () => {
  it('deleted and Band farmers are absent from totals, rows, summary, chart and recent activity', () => {
    const s = screenFor({ kind: 'all' });
    const ids = ['d', 'd2', 'd3', 'e'];
    expect(s.rows.some((r) => ids.includes(r.farmerId))).toBe(false);
    expect(s.recent.some((r) => ids.includes(r.farmerId))).toBe(false);
    // Chart: October charge is A's 358.33 only (B is in September), cash is A's 300.00 only.
    expect(s.chart.find((m) => m.monthKey === '2026-10')).toMatchObject({ chargePaise: 35833, cashPaise: 30000 });
  });

  it('Band note: only Band farmers with a balance, outstanding and credit kept apart', () => {
    expect(screenFor({ kind: 'all' }).band).toEqual({ farmerCount: 2, outstandingPaise: 10000, creditPaise: 2000 });
  });

  it('Band note follows the view (balances at the period end) and is null without a Band balance', () => {
    expect(screenFor({ kind: 'month', monthKey: '2026-09' }).band).toBeNull();
    expect(screenFor({ kind: 'all' }, { usage: [aUse], payments: [] }).band).toBeNull();
  });

  it('a deleted farmer with a balance is never mentioned', () => {
    const s = screenFor({ kind: 'all' }, { usage: [eUse], payments: [], farmerList: [asha, gone] });
    expect(s.band).toBeNull();
    expect(s.dashboard.chargesCreatedPaise).toBe(0);
  });
});

describe('bad data', () => {
  it.each([
    ['total_minutes null', usageRow({ id: 'bad', farmer_id: 'a', used_at: '2026-10-02T04:30:00+00:00', hours: 1, minutes: 0, total_minutes: null })],
    ['total_minutes not hours*60+minutes', usageRow({ id: 'bad', farmer_id: 'a', used_at: '2026-10-02T04:30:00+00:00', hours: 1, minutes: 0, total_minutes: 61 })],
  ])('%s gives { ok: false }', (_name, bad) => {
    expect(buildDashboardScreen({ farmers, usageRows: [aUse, bad], paymentRows, view: { kind: 'all' }, now })).toEqual({ ok: false });
  });

  it('bad data of a Band farmer also gives { ok: false } (nothing fixed silently)', () => {
    const bad = usageRow({ id: 'bad', farmer_id: 'd', used_at: '2026-10-02T04:30:00+00:00', hours: 1, minutes: 0, total_minutes: null });
    expect(buildDashboardScreen({ farmers, usageRows: [bad], paymentRows: [], view: { kind: 'all' }, now })).toEqual({ ok: false });
  });

  it('an invalid month key gives { ok: false }', () => {
    expect(buildDashboardScreen({ farmers, usageRows, paymentRows, view: { kind: 'month', monthKey: '2026-13' }, now })).toEqual({ ok: false });
  });
});

describe('consistency with the profile and the months list', () => {
  it('All Time totals and each row equal the active farmers\' profile totals', () => {
    const s = screenFor({ kind: 'all' });
    let outstanding = 0;
    let credit = 0;
    for (const row of s.rows) {
      const profile = buildFarmerProfile({ farmerId: row.farmerId, usageRows, paymentRows });
      if (!profile.ok) throw new Error('expected a profile');
      const t = profile.profile.totals;
      expect([row.outstandingPaise, row.creditPaise, row.chargesCreatedPaise, row.cashReceivedPaise]).toEqual([
        t.outstandingPaise,
        t.creditPaise,
        t.chargesPaise,
        t.totalPaidPaise,
      ]);
      outstanding += t.outstandingPaise;
      credit += t.creditPaise;
    }
    expect([s.dashboard.outstandingPaise, s.dashboard.creditPaise]).toEqual([outstanding, credit]);
  });

  it('chart charge and cash per month equal buildAllFarmersMonths', () => {
    const s = screenFor({ kind: 'all' });
    const months = buildAllFarmersMonths({ farmers, usage: usageRows, payments: paymentRows });
    expect(s.chart.map((m) => [m.monthKey, m.chargePaise, m.cashPaise])).toEqual(months.map((m) => [m.monthKey, m.chargePaise, m.cashPaise]));
  });
});

function month(monthKey: string, chargePaise: number, cashPaise: number, counts = { entryCount: 1, paymentCount: 1 }): MonthRow {
  return { monthKey, totalMinutes: 60, chargePaise, paidPaise: 0, remainingPaise: chargePaise, cashPaise, status: 'unpaid', ...counts };
}

describe('chartBars', () => {
  it('last 6 months with data, oldest to newest; months without data absent', () => {
    const months = [
      month('2026-01', 100, 0),
      month('2026-02', 100, 0),
      month('2026-03', 0, 0, { entryCount: 0, paymentCount: 0 }),
      month('2026-04', 100, 0),
      month('2026-05', 100, 0),
      month('2026-06', 100, 0),
      month('2026-07', 100, 0),
      month('2026-08', 100, 0),
    ];
    expect(chartBars(months).map((m) => m.monthKey)).toEqual(['2026-02', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  });

  it('heights are integer percents of the largest bar; tiny amounts stay visible; zero has no bar', () => {
    const bars = chartBars([month('2026-09', 20000, 0), month('2026-10', 35833, 30000), month('2026-11', 1, 0)]);
    expect(bars.map((b) => [b.chargePercent, b.cashPercent])).toEqual([
      [55, 0],
      [100, 83],
      [CHART_MIN_PERCENT, 0],
    ]);
    for (const b of bars) {
      expect(Number.isInteger(b.chargePercent)).toBe(true);
      expect(Number.isInteger(b.cashPercent)).toBe(true);
    }
  });

  it('no months: no bars', () => {
    expect(chartBars([])).toEqual([]);
  });
});

const row = (farmerId: string, name: string, outstandingPaise: number, creditPaise = 0): DashboardRow => ({
  farmerId,
  name,
  outstandingPaise,
  creditPaise,
  chargesCreatedPaise: 0,
  cashReceivedPaise: 0,
});

describe('sorting, search and summary', () => {
  it('highest baaki first; ties by name ignoring case, then id', () => {
    const rows = [row('1', 'zed', 0), row('2', 'Amar', 500), row('3', 'bina', 500), row('4', 'Ajay', 0), row('5', 'ajay', 0)];
    expect(sortDashboardRows(rows).map((r) => r.farmerId)).toEqual(['2', '3', '4', '5', '1']);
  });

  it('search: name contains, case-insensitive, trimmed; blank keeps all; no match is empty', () => {
    const rows = [row('1', 'Asha Test', 0), row('2', 'Bholu Test', 0)];
    expect(filterDashboardRows(rows, '  ASHA ').map((r) => r.farmerId)).toEqual(['1']);
    expect(filterDashboardRows(rows, 'test')).toHaveLength(2);
    expect(filterDashboardRows(rows, '   ')).toHaveLength(2);
    expect(filterDashboardRows(rows, 'xyz')).toEqual([]);
  });

  it('summary with nobody owing has no top farmer', () => {
    expect(summarizeDashboard([row('1', 'A', 0, 100), row('2', 'B', 0)])).toEqual({ baakiCount: 0, creditCount: 1, top: null });
  });
});

describe('buildRecentActivity', () => {
  it('newest first, mixed kinds, live rows of active farmers only, engine amounts', () => {
    const items = buildRecentActivity({ farmers, usageRows, paymentRows });
    expect(items.map((i) => [i.kind, i.id, i.farmerName, i.amountPaise])).toEqual([
      ['payment', 'pa2', 'Asha Test', 20000],
      ['payment', 'pa1', 'Asha Test', 10000],
      ['usage', 'ua', 'Asha Test', 35833],
      ['usage', 'ub', 'bholu Test', 20000],
      ['payment', 'pc', 'Chhotu Test', 5000],
    ]);
  });

  it(`keeps only the newest ${RECENT_LIMIT}`, () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      paymentRow({ id: `p${i}`, farmer_id: 'a', paid_at: `2026-10-${String(i + 10)}T05:30:00+00:00`, amount_paise: 100 }),
    );
    const items = buildRecentActivity({ farmers, usageRows: [], paymentRows: many });
    expect(items).toHaveLength(RECENT_LIMIT);
    expect(items[0]?.id).toBe('p11');
    expect(items[RECENT_LIMIT - 1]?.id).toBe('p4');
  });
});

describe('periodView', () => {
  it('Abhi tak, the current IST month, the current IST year', () => {
    expect(periodView('all', now)).toEqual({ kind: 'all' });
    expect(periodView('month', now)).toEqual({ kind: 'month', monthKey: '2026-10' });
    expect(periodView('year', now)).toEqual({ kind: 'year', yearKey: '2026' });
  });
});

describe('buildPeriodOptions', () => {
  it('months with data plus the current month, newest first; years from them plus the current year', () => {
    expect(buildPeriodOptions(['2025-12', '2026-08'], now, { kind: 'all' })).toEqual({
      months: ['2026-10', '2026-08', '2025-12'],
      years: ['2026', '2025'],
    });
  });

  it('the selected month or year is always offered', () => {
    expect(buildPeriodOptions([], now, { kind: 'month', monthKey: '2024-03' }).months).toEqual(['2026-10', '2024-03']);
    expect(buildPeriodOptions([], now, { kind: 'year', yearKey: '2023' }).years).toEqual(['2026', '2023']);
  });

  it('the screen offers the months of active farmers with data', () => {
    expect(screenFor({ kind: 'all' }).periodOptions).toEqual({ months: ['2026-10', '2026-09', '2026-08'], years: ['2026'] });
  });
});
