import { describe, expect, it } from 'vitest';
import { buildDashboard, sumPaise } from '@/lib/ledger';
import {
  buildMonthsScreen,
  deepLinkMonth,
  filterMonthsByYear,
  monthsStrip,
  monthsYearOptions,
  sortMonthFarmers,
} from './monthsRules';
import { buildFarmerProfile } from './profileRules';
import { farmerRow, paymentRow, usageRow } from './test-support/fakeSupabase';

// Fictional farmers. Worked numbers (rate 100/hour, IST dates in the past):
// A: 3 h 35 min on 2026-09-10 (358.33); payments 100 on 2026-10-02 and 200 on 2026-10-03.
// B: 2 h 00 min on 2026-10-05 (200.00), no payment. C: only a payment of 50 on 2026-08-12.
const asha = farmerRow({ id: 'a', name: 'Asha Test' });
const bholu = farmerRow({ id: 'b', name: 'Bholu Test' });
const chhotu = farmerRow({ id: 'c', name: 'Chhotu Test' });
const band = farmerRow({ id: 'd', name: 'Band Test', is_disabled: true });
const gone = farmerRow({ id: 'e', name: 'Gone Test', deleted_at: '2026-10-01T00:00:00+00:00' });
const farmers = [asha, bholu, chhotu, band, gone];

const aUse = usageRow({ id: 'ua', farmer_id: 'a', used_at: '2026-09-10T04:30:00+00:00', hours: 3, minutes: 35 });
const aPay1 = paymentRow({ id: 'pa1', farmer_id: 'a', paid_at: '2026-10-02T04:30:00+00:00', amount_paise: 10000 });
const aPay2 = paymentRow({ id: 'pa2', farmer_id: 'a', paid_at: '2026-10-03T04:30:00+00:00', amount_paise: 20000 });
const bUse = usageRow({ id: 'ub', farmer_id: 'b', used_at: '2026-10-05T04:30:00+00:00', hours: 2, minutes: 0 });
const cPay = paymentRow({ id: 'pc', farmer_id: 'c', paid_at: '2026-08-12T04:30:00+00:00', amount_paise: 5000 });
// Inactive farmers' rows and soft-deleted rows: never counted.
const dUse = usageRow({ id: 'ud', farmer_id: 'd', used_at: '2026-07-03T04:30:00+00:00', hours: 4, minutes: 0 });
const ePay = paymentRow({ id: 'pe', farmer_id: 'e', paid_at: '2026-06-03T04:30:00+00:00', amount_paise: 99900 });
const deletedUse = usageRow({ id: 'ux', farmer_id: 'a', used_at: '2026-05-06T06:00:00+00:00', hours: 7, minutes: 0, deleted_at: '2026-10-06T07:00:00+00:00' });
const deletedPay = paymentRow({ id: 'px', farmer_id: 'b', paid_at: '2026-10-06T06:00:00+00:00', amount_paise: 77700, deleted_at: '2026-10-06T07:00:00+00:00' });

const usageRows = [aUse, bUse, dUse, deletedUse];
const paymentRows = [aPay1, aPay2, cPay, ePay, deletedPay];

function screenOf(input: { farmers?: typeof farmers; usage?: typeof usageRows; payments?: typeof paymentRows } = {}) {
  const result = buildMonthsScreen({ farmers: input.farmers ?? farmers, usageRows: input.usage ?? usageRows, paymentRows: input.payments ?? paymentRows });
  if (!result.ok) throw new Error('expected a months screen');
  return result.screen;
}

const figures = (m: { monthKey: string; hours: number; minutes: number; chargePaise: number; paidPaise: number; remainingPaise: number; cashPaise: number; status: string }) => [
  m.monthKey,
  m.hours,
  m.minutes,
  m.chargePaise,
  m.paidPaise,
  m.remainingPaise,
  m.cashPaise,
  m.status,
];

describe('buildMonthsScreen: worked numbers', () => {
  it('all-farmers months, newest first, incl. "Unpaid with Cash Mila" and "Sirf Payment"', () => {
    const s = screenOf();
    expect(s.months.map(figures)).toEqual([
      ['2026-10', 2, 0, 20000, 0, 20000, 30000, 'unpaid'],
      ['2026-09', 3, 35, 35833, 30000, 5833, 0, 'partial'],
      ['2026-08', 0, 0, 0, 0, 0, 5000, 'payment_only'],
    ]);
    expect(s.months.map((m) => [m.entryCount, m.paymentCount])).toEqual([
      [1, 2],
      [1, 0],
      [0, 1],
    ]);
    expect(s.years).toEqual(['2026']);
    expect(s.hasFarmers).toBe(true);
  });

  it('breakdown: October has B (higher baaki) then A; September only A; August only C', () => {
    const [oct, sep, aug] = screenOf().months;
    expect(oct?.farmers.map((f) => [f.farmerId, f.name, f.chargePaise, f.paidPaise, f.remainingPaise, f.cashPaise, f.status])).toEqual([
      ['b', 'Bholu Test', 20000, 0, 20000, 0, 'unpaid'],
      ['a', 'Asha Test', 0, 0, 0, 30000, 'payment_only'],
    ]);
    expect(sep?.farmers.map((f) => [f.farmerId, f.hours, f.minutes, f.remainingPaise])).toEqual([['a', 3, 35, 5833]]);
    expect(aug?.farmers.map((f) => [f.farmerId, f.cashPaise, f.status])).toEqual([['c', 5000, 'payment_only']]);
  });

  it('year strip over all months: Charge 558.33, Cash Mila 350.00, time 5 h 35 min (no Baaki, no credit)', () => {
    expect(monthsStrip(screenOf().months)).toEqual({ totalMinutes: 335, hours: 5, minutes: 35, chargePaise: 55833, cashPaise: 35000 });
  });

  it('year 2026 shows the same three months and strip', () => {
    const s = screenOf();
    const in2026 = filterMonthsByYear(s.months, '2026');
    expect(in2026.map((m) => m.monthKey)).toEqual(['2026-10', '2026-09', '2026-08']);
    expect(monthsStrip(in2026)).toMatchObject({ chargePaise: 55833, cashPaise: 35000 });
    expect(filterMonthsByYear(s.months, '2025')).toEqual([]);
    expect(filterMonthsByYear(s.months, null)).toHaveLength(3);
  });
});

describe('IST boundaries', () => {
  it('2026-09-30 23:59 IST is September, 2026-10-01 00:01 IST is October', () => {
    const late = usageRow({ id: 'u1', farmer_id: 'a', used_at: '2026-09-30T18:29:00+00:00', hours: 1, minutes: 0 });
    const early = usageRow({ id: 'u2', farmer_id: 'a', used_at: '2026-09-30T18:31:00+00:00', hours: 2, minutes: 0 });
    const s = screenOf({ usage: [late, early], payments: [] });
    expect(s.months.map((m) => [m.monthKey, m.chargePaise])).toEqual([
      ['2026-10', 20000],
      ['2026-09', 10000],
    ]);
  });

  it('2026-12-31 23:59 IST is 2026, 2027-01-01 00:01 IST is 2027; the year filter separates them', () => {
    const late = usageRow({ id: 'u1', farmer_id: 'a', used_at: '2026-12-31T18:29:00+00:00', hours: 1, minutes: 0 });
    const early = usageRow({ id: 'u2', farmer_id: 'b', used_at: '2026-12-31T18:31:00+00:00', hours: 2, minutes: 0 });
    const s = screenOf({ usage: [late, early], payments: [] });
    expect(s.years).toEqual(['2027', '2026']);
    expect(filterMonthsByYear(s.months, '2027').map((m) => [m.monthKey, m.chargePaise])).toEqual([['2027-01', 20000]]);
    expect(filterMonthsByYear(s.months, '2026').map((m) => [m.monthKey, m.chargePaise])).toEqual([['2026-12', 10000]]);
  });
});

describe('inactive farmers and deleted rows (L12)', () => {
  it('Band and deleted farmers are in no month, breakdown, year or strip; deleted rows are ignored', () => {
    const s = screenOf();
    expect(s.months.some((m) => ['2026-07', '2026-06', '2026-05'].includes(m.monthKey))).toBe(false);
    expect(s.months.flatMap((m) => m.farmers.map((f) => f.farmerId)).some((id) => id === 'd' || id === 'e')).toBe(false);
    expect(s.months[0]?.cashPaise).toBe(30000);
  });

  it('only inactive farmers: no farmers and no months', () => {
    expect(screenOf({ farmers: [band, gone] })).toEqual({ months: [], years: [], hasFarmers: false });
  });

  it('active farmers without any row: no months', () => {
    expect(screenOf({ usage: [], payments: [] })).toEqual({ months: [], years: [], hasFarmers: true });
  });
});

describe('bad data', () => {
  it('a usage row with total_minutes null gives { ok: false }', () => {
    const bad = usageRow({ id: 'bad', farmer_id: 'a', used_at: '2026-10-02T04:30:00+00:00', hours: 1, minutes: 0, total_minutes: null });
    expect(buildMonthsScreen({ farmers, usageRows: [aUse, bad], paymentRows })).toEqual({ ok: false });
  });
});

describe('consistency with the engine, the Dashboard and the profile', () => {
  it('farmer-wise figures add up to the all-farmers month; the month status is the engine status of the sums', () => {
    for (const m of screenOf().months) {
      const add = (pick: (f: (typeof m.farmers)[number]) => number) => sumPaise(m.farmers.map(pick));
      expect([add((f) => f.chargePaise), add((f) => f.paidPaise), add((f) => f.remainingPaise), add((f) => f.cashPaise)]).toEqual([
        m.chargePaise,
        m.paidPaise,
        m.remainingPaise,
        m.cashPaise,
      ]);
      expect([add((f) => f.totalMinutes), add((f) => f.entryCount), add((f) => f.paymentCount)]).toEqual([m.totalMinutes, m.entryCount, m.paymentCount]);
    }
    // October: B is Unpaid and A is Sirf Payment; the sums are Unpaid (engine C7), not a recomputation.
    expect(screenOf().months[0]?.status).toBe('unpaid');
  });

  it('months charge and cash equal the Dashboard All Time and year views; months Baaki equals All Time outstanding', () => {
    const s = screenOf();
    const input = { farmers, usage: usageRows, payments: paymentRows };
    const allTime = buildDashboard(input, { kind: 'all' });
    const strip = monthsStrip(s.months);
    expect([strip.chargePaise, strip.cashPaise]).toEqual([allTime.chargesCreatedPaise, allTime.cashReceivedPaise]);
    expect(sumPaise(s.months.map((m) => m.remainingPaise))).toBe(allTime.outstandingPaise);
    // C's 50.00 is Advance / Credit: separate, and in no month row.
    expect(allTime.creditPaise).toBe(5000);
    const year = buildDashboard(input, { kind: 'year', yearKey: '2026' });
    const yearStrip = monthsStrip(filterMonthsByYear(s.months, '2026'));
    expect([yearStrip.chargePaise, yearStrip.cashPaise]).toEqual([year.chargesCreatedPaise, year.cashReceivedPaise]);
  });

  it('each farmer-wise row equals that farmer\'s profile month card', () => {
    for (const m of screenOf().months) {
      for (const f of m.farmers) {
        const profile = buildFarmerProfile({ farmerId: f.farmerId, usageRows, paymentRows });
        if (!profile.ok) throw new Error('expected a profile');
        const card = profile.profile.months.find((x) => x.monthKey === m.monthKey);
        expect(f).toEqual({ ...card, farmerId: f.farmerId, name: f.name });
      }
    }
  });
});

describe('helpers', () => {
  it('sortMonthFarmers: Baaki desc, then name ignoring case, then id', () => {
    const row = (farmerId: string, name: string, remainingPaise: number) => ({ farmerId, name, remainingPaise });
    const rows = [row('1', 'zed', 0), row('2', 'Amar', 500), row('3', 'bina', 500), row('5', 'ajay', 0), row('4', 'Ajay', 0)];
    expect(sortMonthFarmers(rows).map((r) => r.farmerId)).toEqual(['2', '3', '4', '5', '1']);
  });

  it('monthsYearOptions: distinct, newest first', () => {
    expect(monthsYearOptions(['2026-10', '2025-01', '2026-01', '2024-12'])).toEqual(['2026', '2025', '2024']);
  });

  it('deepLinkMonth: a listed valid month gives its year; anything else is ignored', () => {
    const keys = ['2026-10', '2026-09'];
    expect(deepLinkMonth('2026-09', keys)).toEqual({ monthKey: '2026-09', yearKey: '2026' });
    expect(deepLinkMonth('2026-07', keys)).toBeNull();
    expect(deepLinkMonth('2026-13', keys)).toBeNull();
    expect(deepLinkMonth('oct', keys)).toBeNull();
    expect(deepLinkMonth(null, keys)).toBeNull();
  });
});
