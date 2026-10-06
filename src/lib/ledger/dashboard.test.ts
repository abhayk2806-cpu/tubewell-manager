import { describe, expect, it } from 'vitest';
import {
  LedgerInputError,
  buildAllFarmersMonths,
  buildDashboard,
  buildFarmerLedger,
  filterActiveFarmers,
  isActiveFarmer,
} from './index';
import { DELETED_AT, FARMER_A, FARMER_B, FARMER_C, RAMU, e1Payments, e1Usage, farmer, payment, usage } from './test-support/fixtures';
import { seeded, shuffled } from './test-support/random';

describe('active farmers (C6, L12)', () => {
  it('active iff not soft-deleted and not disabled', () => {
    expect(isActiveFarmer(farmer('f'))).toBe(true);
    expect(isActiveFarmer(farmer('f', { disabled: true }))).toBe(false);
    expect(isActiveFarmer(farmer('f', { deletedAt: DELETED_AT }))).toBe(false);
    expect(isActiveFarmer(farmer('f', { disabled: true, deletedAt: DELETED_AT }))).toBe(false);
  });

  it('filterActiveFarmers keeps input order and does not mutate', () => {
    const list = [farmer('b'), farmer('a', { disabled: true }), farmer('c')];
    expect(filterActiveFarmers(list).map((f) => f.id)).toEqual(['b', 'c']);
    expect(list).toHaveLength(3);
  });
});

describe('buildDashboard (L11, D1)', () => {
  const twoFarmers = {
    farmers: [farmer(FARMER_A), farmer(FARMER_B)],
    usage: [usage('ua', FARMER_A, '2026-05-05', 1, 0), usage('ub', FARMER_B, '2026-05-05', 2, 0)],
    payments: [payment('pa', FARMER_A, '2026-05-25', 30000)],
  };

  it('E18 credit and outstanding are summed separately', () => {
    const d = buildDashboard(twoFarmers, { kind: 'all' });
    expect(d.activeFarmerCount).toBe(2);
    expect(d.chargesCreatedPaise).toBe(30000);
    expect(d.cashReceivedPaise).toBe(30000);
    expect(d.outstandingPaise).toBe(20000);
    expect(d.creditPaise).toBe(20000);
    expect(Object.keys(d).some((k) => /net|balance/i.test(k))).toBe(false);
  });

  it('deleted farmers and their rows are excluded; restoring brings them back', () => {
    const deleted = buildDashboard(
      { ...twoFarmers, farmers: [farmer(FARMER_A), farmer(FARMER_B, { deletedAt: DELETED_AT })] },
      { kind: 'all' },
    );
    expect([deleted.activeFarmerCount, deleted.chargesCreatedPaise, deleted.outstandingPaise]).toEqual([1, 10000, 0]);
    expect(deleted.farmers.map((f) => f.farmerId)).toEqual([FARMER_A]);
    expect(buildDashboard(twoFarmers, { kind: 'all' }).activeFarmerCount).toBe(2);
  });

  it('E21 disabled farmer excluded', () => {
    const input = {
      farmers: [farmer(FARMER_A), farmer(FARMER_C, { disabled: true })],
      usage: [usage('ua', FARMER_A, '2026-05-05', 1, 0), usage('uc', FARMER_C, '2026-05-05', 5, 0)],
      payments: [],
    };
    expect(buildDashboard(input, { kind: 'all' }).outstandingPaise).toBe(10000);
  });

  it('rows of unknown farmers are ignored, even when invalid', () => {
    const d = buildDashboard(
      {
        farmers: [farmer(FARMER_A)],
        usage: [usage('ua', FARMER_A, '2026-05-05', 1, 0), { ...usage('ux', 'ghost', '2026-05-05', 1, 0), used_at: 'bad' }],
        payments: [payment('px', 'ghost', '2026-05-05', 99999)],
      },
      { kind: 'all' },
    );
    expect([d.activeFarmerCount, d.chargesCreatedPaise, d.cashReceivedPaise]).toEqual([1, 10000, 0]);
  });

  it('per-farmer rows are sorted by id and match buildFarmerLedger', () => {
    const d = buildDashboard(
      {
        farmers: [farmer(RAMU), farmer(FARMER_A)],
        usage: [...e1Usage(), usage('ua', FARMER_A, '2026-05-05', 1, 0)],
        payments: e1Payments(),
      },
      { kind: 'all' },
    );
    expect(d.farmers.map((f) => f.farmerId)).toEqual([FARMER_A, RAMU]);
    const ramu = buildFarmerLedger({ usage: e1Usage(), payments: e1Payments() });
    expect(d.farmers[1]).toEqual({
      farmerId: RAMU,
      chargesCreatedPaise: ramu.totals.chargesPaise,
      cashReceivedPaise: ramu.totals.totalPaidPaise,
      outstandingPaise: ramu.totals.outstandingPaise,
      creditPaise: ramu.totals.creditPaise,
    });
  });

  it('active farmers with no rows count, with zero figures', () => {
    const d = buildDashboard({ farmers: [farmer(FARMER_A)], usage: [], payments: [] }, { kind: 'month', monthKey: '2026-05' });
    expect(d.activeFarmerCount).toBe(1);
    expect(d.farmers).toEqual([
      { farmerId: FARMER_A, chargesCreatedPaise: 0, cashReceivedPaise: 0, outstandingPaise: 0, creditPaise: 0 },
    ]);
  });

  it('period bounds are reported', () => {
    const input = { farmers: [], usage: [], payments: [] };
    expect(buildDashboard(input, { kind: 'all' })).toMatchObject({ periodStartMs: null, periodEndMs: null });
    const month = buildDashboard(input, { kind: 'month', monthKey: '2026-05' });
    expect(month.periodEndMs).toBe(Date.UTC(2026, 4, 31, 18, 29, 59, 999));
    expect(month.periodStartMs).toBe(Date.UTC(2026, 3, 30, 18, 30));
  });

  it('rejects bad views and duplicate farmers', () => {
    const input = { farmers: [], usage: [], payments: [] };
    expect(() => buildDashboard(input, { kind: 'month', monthKey: '2026-13' })).toThrow(LedgerInputError);
    expect(() => buildDashboard(input, { kind: 'year', yearKey: '26' })).toThrow(LedgerInputError);
    expect(() => buildDashboard({ ...input, farmers: [farmer('a'), farmer('a')] }, { kind: 'all' })).toThrow(LedgerInputError);
  });

  it('output does not depend on input order', () => {
    const rng = seeded(3);
    const input = {
      farmers: [farmer(RAMU), farmer(FARMER_A), farmer(FARMER_B)],
      usage: [...e1Usage(), usage('ua', FARMER_A, '2026-05-05', 1, 0), usage('ub', FARMER_B, '2026-07-05', 2, 0)],
      payments: [...e1Payments(), payment('pa', FARMER_A, '2026-05-25', 30000)],
    };
    const expected = buildDashboard(input, { kind: 'year', yearKey: '2026' });
    for (let i = 0; i < 20; i += 1) {
      const mixed = {
        farmers: shuffled(rng, input.farmers),
        usage: shuffled(rng, input.usage),
        payments: shuffled(rng, input.payments),
      };
      expect(buildDashboard(mixed, { kind: 'year', yearKey: '2026' })).toEqual(expected);
    }
  });
});

describe('buildAllFarmersMonths (C9)', () => {
  it('sums active farmers per month; credit is never netted into remaining', () => {
    const rows = buildAllFarmersMonths({
      farmers: [farmer(FARMER_A), farmer(FARMER_B), farmer(FARMER_C, { disabled: true })],
      usage: [
        usage('ua', FARMER_A, '2026-05-05', 1, 0),
        usage('ub', FARMER_B, '2026-05-05', 2, 0),
        usage('uc', FARMER_C, '2026-05-05', 5, 0),
        usage('ub2', FARMER_B, '2026-06-05', 1, 0),
      ],
      payments: [payment('pa', FARMER_A, '2026-05-25', 30000), payment('pb', FARMER_B, '2026-07-01', 5000)],
    });
    expect(rows).toEqual([
      {
        monthKey: '2026-05',
        totalMinutes: 180,
        chargePaise: 30000,
        paidPaise: 15000,
        remainingPaise: 15000,
        cashPaise: 30000,
        status: 'partial',
        entryCount: 2,
        paymentCount: 1,
      },
      {
        monthKey: '2026-06',
        totalMinutes: 60,
        chargePaise: 10000,
        paidPaise: 0,
        remainingPaise: 10000,
        cashPaise: 0,
        status: 'unpaid',
        entryCount: 1,
        paymentCount: 0,
      },
      {
        monthKey: '2026-07',
        totalMinutes: 0,
        chargePaise: 0,
        paidPaise: 0,
        remainingPaise: 0,
        cashPaise: 5000,
        status: 'payment_only',
        entryCount: 0,
        paymentCount: 1,
      },
    ]);
  });

  it('E1 alone equals the farmer months', () => {
    const rows = buildAllFarmersMonths({ farmers: [farmer(RAMU)], usage: e1Usage(), payments: e1Payments() });
    expect(rows).toEqual(buildFarmerLedger({ usage: e1Usage(), payments: e1Payments() }).months);
  });
});
