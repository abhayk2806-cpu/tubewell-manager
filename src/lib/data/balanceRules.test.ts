import { describe, expect, it } from 'vitest';
import { sumPaise } from '@/lib/ledger';
import type { DashboardView } from '@/lib/ledger';
import { buildFarmerBalances, buildPaymentTrails } from './balanceRules';
import { buildDashboardScreen, periodTime } from './dashboardRules';
import { buildMonthsScreen, filterMonthsByYear, monthsStrip } from './monthsRules';
import { buildFarmerProfile } from './profileRules';
import { farmerRow, paymentRow, usageRow } from './test-support/fakeSupabase';

// Fictional farmers. Worked numbers (rate 100/hour):
// Asha: 3 h 35 min on 2026-09-10 (358.33), paid 100.00 on 2026-10-01 -> Baaki 258.33, Advance 0.
// Bholu: 2 h 00 min on 2026-10-05 (200.00), no payment -> Baaki 200.00.
// Chhotu: only a payment of 50.00 -> Baaki 0, Advance 50.00 (a payment-only month).
// Dinu (Band) and Eku (deleted) each have a usage entry and a payment.
const asha = farmerRow({ id: 'a', name: 'Asha Test', mobile: '90000 11111' });
const bholu = farmerRow({ id: 'b', name: 'Bholu Test' });
const chhotu = farmerRow({ id: 'c', name: 'Chhotu Test' });
const dinu = farmerRow({ id: 'd', name: 'Dinu Test', is_disabled: true });
const eku = farmerRow({ id: 'e', name: 'Eku Test', deleted_at: '2026-10-01T00:00:00+00:00' });
const farmers = [asha, bholu, chhotu, dinu, eku];

const usageRows = [
  usageRow({ id: 'ua', farmer_id: 'a', used_at: '2026-09-10T04:30:00+00:00', hours: 3, minutes: 35 }),
  usageRow({ id: 'ub', farmer_id: 'b', used_at: '2026-10-05T04:30:00+00:00', hours: 2, minutes: 0 }),
  usageRow({ id: 'ud', farmer_id: 'd', used_at: '2026-10-04T04:30:00+00:00', hours: 1, minutes: 0 }),
  usageRow({ id: 'ue', farmer_id: 'e', used_at: '2026-10-04T04:30:00+00:00', hours: 4, minutes: 0 }),
  usageRow({ id: 'ux', farmer_id: 'a', used_at: '2026-10-06T04:30:00+00:00', hours: 9, minutes: 0, deleted_at: '2026-10-06T05:00:00+00:00' }),
];
const paymentRows = [
  paymentRow({ id: 'pa', farmer_id: 'a', paid_at: '2026-10-01T04:30:00+00:00', amount_paise: 10000 }),
  paymentRow({ id: 'pc', farmer_id: 'c', paid_at: '2026-08-12T04:30:00+00:00', amount_paise: 5000 }),
  paymentRow({ id: 'pd', farmer_id: 'd', paid_at: '2026-10-04T05:30:00+00:00', amount_paise: 2000 }),
  paymentRow({ id: 'pe', farmer_id: 'e', paid_at: '2026-10-04T05:30:00+00:00', amount_paise: 3000 }),
  paymentRow({ id: 'px', farmer_id: 'b', paid_at: '2026-10-06T04:30:00+00:00', amount_paise: 77700, deleted_at: '2026-10-06T05:00:00+00:00' }),
];
const now = { dateKey: '2026-10-06', timeKey: '14:05', monthKey: '2026-10' };

function profileOf(farmerId: string, usage = usageRows, payments = paymentRows) {
  const result = buildFarmerProfile({ farmerId, usageRows: usage, paymentRows: payments });
  if (!result.ok) throw new Error('expected a profile');
  return result.profile;
}

function dashboardOf(view: DashboardView = { kind: 'all' }) {
  const result = buildDashboardScreen({ farmers, usageRows, paymentRows, view, now });
  if (!result.ok) throw new Error('expected a dashboard');
  return result.screen;
}

describe('buildFarmerBalances', () => {
  it('worked numbers for every non-deleted farmer; outstanding and credit separate', () => {
    const balances = buildFarmerBalances({ farmers, usageRows, paymentRows });
    expect([...balances.keys()]).toEqual(['a', 'b', 'c', 'd']);
    expect(balances.get('a')).toEqual({ ok: true, outstandingPaise: 25833, creditPaise: 0 });
    expect(balances.get('b')).toEqual({ ok: true, outstandingPaise: 20000, creditPaise: 0 });
    expect(balances.get('c')).toEqual({ ok: true, outstandingPaise: 0, creditPaise: 5000 });
    expect(balances.get('d')).toEqual({ ok: true, outstandingPaise: 8000, creditPaise: 0 });
    expect(balances.has('e')).toBe(false);
  });

  it('equals the profile totals and the Dashboard All Time row of every Chalu farmer', () => {
    const balances = buildFarmerBalances({ farmers, usageRows, paymentRows });
    const rows = dashboardOf().rows;
    for (const id of ['a', 'b', 'c']) {
      const t = profileOf(id).totals;
      const row = rows.find((r) => r.farmerId === id);
      expect(balances.get(id)).toEqual({ ok: true, outstandingPaise: t.outstandingPaise, creditPaise: t.creditPaise });
      expect([row?.outstandingPaise, row?.creditPaise]).toEqual([t.outstandingPaise, t.creditPaise]);
    }
    // A Band farmer's figure equals its profile too.
    expect(balances.get('d')).toEqual({ ok: true, outstandingPaise: profileOf('d').totals.outstandingPaise, creditPaise: 0 });
  });

  it('bad data for one farmer gives that farmer { ok: false }, the others are unaffected', () => {
    const bad = usageRow({ id: 'bad', farmer_id: 'b', used_at: '2026-10-05T04:30:00+00:00', hours: 1, minutes: 0, total_minutes: null });
    const balances = buildFarmerBalances({ farmers, usageRows: [...usageRows, bad], paymentRows });
    expect(balances.get('b')).toEqual({ ok: false });
    expect(balances.get('a')).toEqual({ ok: true, outstandingPaise: 25833, creditPaise: 0 });
  });
});

describe('buildPaymentTrails', () => {
  it('every live payment of any farmer, equal to the profile trail; deleted payments absent', () => {
    const trails = buildPaymentTrails({ usageRows, paymentRows });
    expect([...trails.keys()].sort()).toEqual(['pa', 'pc', 'pd', 'pe']);
    expect(trails.get('pa')).toEqual({ ok: true, pieces: [{ monthKey: '2026-09', amountPaise: 10000 }], unappliedPaise: 0 });
    expect(trails.get('pc')).toEqual({ ok: true, pieces: [], unappliedPaise: 5000 });
    for (const id of ['a', 'c', 'd', 'e']) {
      for (const p of profileOf(id).payments) {
        expect(trails.get(p.row.id)).toEqual({ ok: true, pieces: p.pieces, unappliedPaise: p.unappliedPaise });
      }
    }
  });

  it('a farmer with bad data gets { ok: false } trails', () => {
    const bad = usageRow({ id: 'bad', farmer_id: 'a', used_at: '2026-10-05T04:30:00+00:00', hours: 1, minutes: 0, total_minutes: 1 });
    expect(buildPaymentTrails({ usageRows: [...usageRows, bad], paymentRows }).get('pa')).toEqual({ ok: false });
  });
});

describe('Pani time: Dashboard and profile (D32)', () => {
  it('All Time: 3 h 35 + 2 h 00 = 5 h 35 min for the three Chalu farmers; 3 Chalu farmers', () => {
    const s = dashboardOf();
    expect(s.time).toEqual({ totalMinutes: 335, hours: 5, minutes: 35 });
    expect(s.activeFarmerCount).toBe(3);
  });

  it('equals the sum of the Mahine month times for All Time, a year and a month; payment-only months add 0', () => {
    const months = buildMonthsScreen({ farmers, usageRows, paymentRows });
    if (!months.ok) throw new Error('expected months');
    expect(dashboardOf().time.totalMinutes).toBe(monthsStrip(months.screen.months).totalMinutes);
    expect(dashboardOf({ kind: 'year', yearKey: '2026' }).time.totalMinutes).toBe(monthsStrip(filterMonthsByYear(months.screen.months, '2026')).totalMinutes);
    for (const m of months.screen.months) {
      expect(dashboardOf({ kind: 'month', monthKey: m.monthKey }).time.totalMinutes).toBe(m.totalMinutes);
    }
    expect(dashboardOf({ kind: 'month', monthKey: '2026-08' }).time).toEqual({ totalMinutes: 0, hours: 0, minutes: 0 });
    expect(dashboardOf({ kind: 'month', monthKey: '2026-07' }).time.totalMinutes).toBe(0);
  });

  it('periodTime adds the month minutes with sumPaise', () => {
    const rows = [
      { monthKey: '2026-09', totalMinutes: 215 },
      { monthKey: '2026-10', totalMinutes: 120 },
    ].map((m) => ({ ...m, chargePaise: 0, paidPaise: 0, remainingPaise: 0, cashPaise: 0, status: 'settled' as const, entryCount: 1, paymentCount: 0 }));
    expect(periodTime(rows, { kind: 'month', monthKey: '2026-10' })).toEqual({ totalMinutes: 120, hours: 2, minutes: 0 });
    expect(periodTime(rows, { kind: 'all' })).toEqual({ totalMinutes: 335, hours: 5, minutes: 35 });
  });

  it('profile total time equals the sum of its month rows', () => {
    const p = profileOf('a');
    expect(p.time).toEqual({ totalMinutes: 215, hours: 3, minutes: 35 });
    expect(p.time.totalMinutes).toBe(sumPaise(p.months.map((m) => m.totalMinutes)));
    expect(profileOf('c').time).toEqual({ totalMinutes: 0, hours: 0, minutes: 0 });
  });
});

describe('editing a usage date into another IST month (audit gap)', () => {
  it('moves the charge to that month and recomputes the whole allocation', () => {
    const before = profileOf('a');
    expect(before.months.map((m) => [m.monthKey, m.chargePaise, m.paidPaise, m.remainingPaise, m.cashPaise, m.status])).toEqual([
      ['2026-10', 0, 0, 0, 10000, 'payment_only'],
      ['2026-09', 35833, 10000, 25833, 0, 'partial'],
    ]);
    expect(before.payments[0]?.pieces).toEqual([{ monthKey: '2026-09', amountPaise: 10000 }]);

    const moved = usageRows.map((u) => (u.id === 'ua' ? { ...u, used_at: '2026-10-03T04:30:00+00:00' } : u));
    const after = profileOf('a', moved);
    expect(after.months.map((m) => [m.monthKey, m.chargePaise, m.paidPaise, m.remainingPaise, m.cashPaise, m.status])).toEqual([
      ['2026-10', 35833, 10000, 25833, 10000, 'partial'],
    ]);
    expect(after.payments[0]?.pieces).toEqual([{ monthKey: '2026-10', amountPaise: 10000 }]);
    expect(after.totals.outstandingPaise).toBe(25833);
    expect(buildFarmerBalances({ farmers, usageRows: moved, paymentRows }).get('a')).toEqual({ ok: true, outstandingPaise: 25833, creditPaise: 0 });
  });
});
