// Worked examples E1-E24 from docs/LEDGER_AND_ALLOCATION.md, one named test each.
// Every expected number is transcribed from the spec as integer paise; none is computed by the engine.
import { describe, expect, it } from 'vitest';
import {
  buildDashboard,
  buildFarmerLedger,
  endOfIstDayMs,
  entryAmountPaise,
  findDuplicatePayments,
  istMonthKey,
  parseInstantMs,
} from './index';
import type { FarmerLedger, LedgerPayment, LedgerUsage } from './index';
import {
  DELETED_AT,
  FARMER_A,
  FARMER_B,
  FARMER_C,
  RAMU,
  e1Payments,
  e1Usage,
  farmer,
  m,
  monthView,
  payment,
  usage,
} from './test-support/fixtures';

function ledger(u: readonly LedgerUsage[], p: readonly LedgerPayment[], cutoffMs?: number): FarmerLedger {
  return buildFarmerLedger({ usage: u, payments: p }, cutoffMs === undefined ? {} : { cutoffMs });
}

function months(l: FarmerLedger) {
  return l.months.map(monthView);
}

function trail(l: FarmerLedger) {
  return l.trail.map((t) => ({
    paymentId: t.paymentId,
    pieces: t.pieces.map((p) => [p.monthKey, p.amountPaise]),
    unappliedPaise: t.unappliedPaise,
  }));
}

function totals(l: FarmerLedger) {
  const t = l.totals;
  return [t.chargesPaise, t.totalPaidPaise, t.outstandingPaise, t.creditPaise];
}

function dashboardFigures(d: ReturnType<typeof buildDashboard>) {
  return [d.chargesCreatedPaise, d.cashReceivedPaise, d.outstandingPaise, d.creditPaise];
}

describe('worked examples (docs/LEDGER_AND_ALLOCATION.md)', () => {
  it('E1 canonical Ramu: months, totals, trail and running balance', () => {
    const l = ledger(e1Usage(), e1Payments());
    expect(months(l)).toEqual([
      m(['2026-05', 215, 35833, 35833, 0, 0, 'settled']),
      m(['2026-06', 265, 44167, 14167, 30000, 0, 'partial']),
      m(['2026-07', 315, 52500, 0, 52500, 0, 'unpaid']),
      m(['2026-08', 270, 45000, 0, 45000, 0, 'unpaid']),
      m(['2026-09', 0, 0, 0, 0, 50000, 'payment_only']),
    ]);
    expect(totals(l)).toEqual([177500, 50000, 127500, 0]);
    expect(trail(l)).toEqual([
      { paymentId: 'p1', pieces: [['2026-05', 35833], ['2026-06', 14167]], unappliedPaise: 0 },
    ]);
    expect(l.rows.map((r) => r.balancePaise)).toEqual([35833, 80000, 132500, 177500, 127500]);
    expect(l.rows.map((r) => r.kind)).toEqual(['usage', 'usage', 'usage', 'usage', 'payment']);
  });

  it('E2 two partial payments on one month', () => {
    const l = ledger(
      [usage('u1', RAMU, '2026-05-05', 3, 0)],
      [payment('p1', RAMU, '2026-05-20', 10000), payment('p2', RAMU, '2026-05-28', 15000)],
    );
    expect(months(l)).toEqual([m(['2026-05', 180, 30000, 25000, 5000, 25000, 'partial'])]);
    expect(l.totals.outstandingPaise).toBe(5000);
    expect(l.totals.creditPaise).toBe(0);
    expect(trail(l)).toEqual([
      { paymentId: 'p1', pieces: [['2026-05', 10000]], unappliedPaise: 0 },
      { paymentId: 'p2', pieces: [['2026-05', 15000]], unappliedPaise: 0 },
    ]);
  });

  it('E3 exact payment', () => {
    const l = ledger([usage('u1', RAMU, '2026-05-05', 2, 0)], [payment('p1', RAMU, '2026-05-25', 20000)]);
    expect(months(l)).toEqual([m(['2026-05', 120, 20000, 20000, 0, 20000, 'settled'])]);
    expect(l.totals.outstandingPaise).toBe(0);
    expect(l.totals.creditPaise).toBe(0);
    expect(trail(l)).toEqual([{ paymentId: 'p1', pieces: [['2026-05', 20000]], unappliedPaise: 0 }]);
  });

  it('E4 overpayment becomes credit', () => {
    const l = ledger([usage('u1', RAMU, '2026-05-05', 2, 0)], [payment('p1', RAMU, '2026-05-25', 50000)]);
    expect(months(l)).toEqual([m(['2026-05', 120, 20000, 20000, 0, 50000, 'settled'])]);
    expect(l.totals.outstandingPaise).toBe(0);
    expect(l.totals.creditPaise).toBe(30000);
    expect(trail(l)).toEqual([{ paymentId: 'p1', pieces: [['2026-05', 20000]], unappliedPaise: 30000 }]);
  });

  it('E5a credit consumed by later usage (June)', () => {
    const l = ledger(
      [usage('u1', RAMU, '2026-05-05', 2, 0), usage('u2', RAMU, '2026-06-15', 1, 30)],
      [payment('p1', RAMU, '2026-05-25', 50000)],
    );
    expect(months(l)[1]).toEqual(m(['2026-06', 90, 15000, 15000, 0, 0, 'settled']));
    expect(l.totals.outstandingPaise).toBe(0);
    expect(l.totals.creditPaise).toBe(15000);
    expect(trail(l)).toEqual([
      { paymentId: 'p1', pieces: [['2026-05', 20000], ['2026-06', 15000]], unappliedPaise: 15000 },
    ]);
  });

  it('E5b credit consumed by later usage (July becomes partial)', () => {
    const l = ledger(
      [
        usage('u1', RAMU, '2026-05-05', 2, 0),
        usage('u2', RAMU, '2026-06-15', 1, 30),
        usage('u3', RAMU, '2026-07-15', 2, 0),
      ],
      [payment('p1', RAMU, '2026-05-25', 50000)],
    );
    expect(months(l)[2]).toEqual(m(['2026-07', 120, 20000, 15000, 5000, 0, 'partial']));
    expect(l.totals.outstandingPaise).toBe(5000);
    expect(l.totals.creditPaise).toBe(0);
    expect(trail(l)).toEqual([
      {
        paymentId: 'p1',
        pieces: [['2026-05', 20000], ['2026-06', 15000], ['2026-07', 15000]],
        unappliedPaise: 0,
      },
    ]);
  });

  it('E6a several entries in one month form one bucket', () => {
    const l = ledger(
      [
        usage('u1', RAMU, '2026-05-03', 1, 0),
        usage('u2', RAMU, '2026-05-12', 0, 45),
        usage('u3', RAMU, '2026-05-25', 2, 20),
      ],
      [],
    );
    expect(months(l)).toEqual([m(['2026-05', 245, 40833, 0, 40833, 0, 'unpaid'])]);
    expect(l.months[0]?.entryCount).toBe(3);
  });

  it('E6b three 10-minute entries make 50.01, one 30-minute entry makes 50.00', () => {
    const three = ledger(
      [
        usage('u1', RAMU, '2026-05-03', 0, 10),
        usage('u2', RAMU, '2026-05-04', 0, 10),
        usage('u3', RAMU, '2026-05-05', 0, 10),
      ],
      [],
    );
    expect(months(three)).toEqual([m(['2026-05', 30, 5001, 0, 5001, 0, 'unpaid'])]);
    const one = ledger([usage('u1', RAMU, '2026-05-03', 0, 30)], []);
    expect(one.totals.chargesPaise).toBe(5000);
  });

  it('E7 payment-only month', () => {
    const l = ledger([usage('u1', RAMU, '2026-05-05', 2, 0)], [payment('p1', RAMU, '2026-06-05', 20000)]);
    expect(months(l)).toEqual([
      m(['2026-05', 120, 20000, 20000, 0, 0, 'settled']),
      m(['2026-06', 0, 0, 0, 0, 20000, 'payment_only']),
    ]);
    expect(l.totals.outstandingPaise).toBe(0);
    expect(l.totals.creditPaise).toBe(0);
    expect(trail(l)).toEqual([{ paymentId: 'p1', pieces: [['2026-05', 20000]], unappliedPaise: 0 }]);
  });

  it('E8 edit an old usage entry (June 4h25 to 2h25)', () => {
    const edited = e1Usage().map((row) => (row.id === 'u-jun' ? usage('u-jun', RAMU, '2026-06-10', 2, 25) : row));
    const l = ledger(edited, e1Payments());
    expect(months(l)[1]).toEqual(m(['2026-06', 145, 24167, 14167, 10000, 0, 'partial']));
    expect(l.totals.chargesPaise).toBe(157500);
    expect(l.totals.outstandingPaise).toBe(107500);
    expect(l.totals.creditPaise).toBe(0);
    expect(trail(l)).toEqual([
      { paymentId: 'p1', pieces: [['2026-05', 35833], ['2026-06', 14167]], unappliedPaise: 0 },
    ]);
  });

  it('E9 soft-delete an old usage entry, then restore it', () => {
    const deleted = e1Usage().map((row) => (row.id === 'u-may' ? { ...row, deleted_at: DELETED_AT } : row));
    const l = ledger(deleted, e1Payments());
    // The spec table lists 06-08; the payment-only 2026-09 row also exists by L11 (see E1).
    expect(months(l)).toEqual([
      m(['2026-06', 265, 44167, 44167, 0, 0, 'settled']),
      m(['2026-07', 315, 52500, 5833, 46667, 0, 'partial']),
      m(['2026-08', 270, 45000, 0, 45000, 0, 'unpaid']),
      m(['2026-09', 0, 0, 0, 0, 50000, 'payment_only']),
    ]);
    expect(l.totals.chargesPaise).toBe(141667);
    expect(l.totals.outstandingPaise).toBe(91667);
    expect(trail(l)).toEqual([
      { paymentId: 'p1', pieces: [['2026-06', 44167], ['2026-07', 5833]], unappliedPaise: 0 },
    ]);
    const restored = deleted.map((row) => ({ ...row, deleted_at: null }));
    expect(ledger(restored, e1Payments())).toEqual(ledger(e1Usage(), e1Payments()));
  });

  it('E10 edit a payment (500 to 300)', () => {
    const l = ledger(e1Usage(), e1Payments(30000));
    expect(months(l).slice(0, 4)).toEqual([
      m(['2026-05', 215, 35833, 30000, 5833, 0, 'partial']),
      m(['2026-06', 265, 44167, 0, 44167, 0, 'unpaid']),
      m(['2026-07', 315, 52500, 0, 52500, 0, 'unpaid']),
      m(['2026-08', 270, 45000, 0, 45000, 0, 'unpaid']),
    ]);
    expect(l.totals.outstandingPaise).toBe(147500);
    expect(trail(l)).toEqual([{ paymentId: 'p1', pieces: [['2026-05', 30000]], unappliedPaise: 0 }]);
  });

  it('E11 soft-delete a payment', () => {
    const p = e1Payments().map((row) => ({ ...row, deleted_at: DELETED_AT }));
    const l = ledger(e1Usage(), p);
    expect(l.months.map((row) => row.status)).toEqual(['unpaid', 'unpaid', 'unpaid', 'unpaid']);
    expect(l.totals.outstandingPaise).toBe(177500);
    expect(l.totals.totalPaidPaise).toBe(0);
    expect(l.trail).toEqual([]);
  });

  it('E12 two same-day, same-amount payments both count; the second warns', () => {
    const p1 = payment('p1', RAMU, '2026-06-02T10:00', 20000);
    const p2 = payment('p2', RAMU, '2026-06-02T18:00', 20000);
    const l = ledger([usage('u1', RAMU, '2026-05-05', 5, 0)], [p1, p2]);
    expect(months(l)).toEqual([
      m(['2026-05', 300, 50000, 40000, 10000, 0, 'partial']),
      m(['2026-06', 0, 0, 0, 0, 40000, 'payment_only']),
    ]);
    expect(trail(l)).toEqual([
      { paymentId: 'p1', pieces: [['2026-05', 20000]], unappliedPaise: 0 },
      { paymentId: 'p2', pieces: [['2026-05', 20000]], unappliedPaise: 0 },
    ]);
    expect(findDuplicatePayments(p2, [p1, p2]).map((row) => row.id)).toEqual(['p1']);
  });

  it('E13 usage after an earlier payment, with as-of views', () => {
    const u = [
      usage('u1', RAMU, '2026-05-15', 3, 0),
      usage('u2', RAMU, '2026-06-15', 4, 0),
      usage('u3', RAMU, '2026-07-15', 5, 0),
    ];
    const p = [payment('p1', RAMU, '2026-05-01', 100000)];
    const l = ledger(u, p);
    expect(l.months.map((row) => row.status)).toEqual(['settled', 'settled', 'partial']);
    expect(months(l)[2]).toEqual(m(['2026-07', 300, 50000, 30000, 20000, 0, 'partial']));
    expect(l.totals.outstandingPaise).toBe(20000);
    expect(l.totals.creditPaise).toBe(0);
    expect(trail(l)).toEqual([
      { paymentId: 'p1', pieces: [['2026-05', 30000], ['2026-06', 40000], ['2026-07', 30000]], unappliedPaise: 0 },
    ]);
    const may = ledger(u, p, endOfIstDayMs('2026-05-31'));
    expect([may.totals.chargesPaise, may.totals.totalPaidPaise, may.totals.creditPaise]).toEqual([30000, 100000, 70000]);
    expect(ledger(u, p, endOfIstDayMs('2026-06-30')).totals.creditPaise).toBe(30000);
  });

  it('E14 farmer summary: outstanding (Ramu, E1)', () => {
    const l = ledger(e1Usage(), e1Payments());
    expect([...totals(l), l.totals.paymentCount]).toEqual([177500, 50000, 127500, 0, 1]);
  });

  it('E15 farmer summary: zero balance (E3)', () => {
    const l = ledger([usage('u1', RAMU, '2026-05-05', 2, 0)], [payment('p1', RAMU, '2026-05-25', 20000)]);
    expect([...totals(l), l.totals.paymentCount]).toEqual([20000, 20000, 0, 0, 1]);
  });

  it('E16 farmer summary: credit (E4)', () => {
    const l = ledger([usage('u1', RAMU, '2026-05-05', 2, 0)], [payment('p1', RAMU, '2026-05-25', 50000)]);
    expect([...totals(l), l.totals.paymentCount]).toEqual([20000, 50000, 0, 30000, 1]);
  });

  it('E17 farmer summary: no payment history (usage 1h00 only)', () => {
    const l = ledger([usage('u1', RAMU, '2026-05-05', 1, 0)], []);
    expect([...totals(l), l.totals.paymentCount]).toEqual([10000, 0, 10000, 0, 0]);
    expect(l.trail).toEqual([]);
  });

  it("E18 one farmer's credit never offsets another's due", () => {
    const d = buildDashboard(
      {
        farmers: [farmer(FARMER_A), farmer(FARMER_B)],
        usage: [usage('ua', FARMER_A, '2026-05-05', 1, 0), usage('ub', FARMER_B, '2026-05-05', 2, 0)],
        payments: [payment('pa', FARMER_A, '2026-05-25', 30000)],
      },
      { kind: 'all' },
    );
    expect(d.outstandingPaise).toBe(20000);
    expect(d.creditPaise).toBe(20000);
    const a = d.farmers.find((row) => row.farmerId === FARMER_A);
    const b = d.farmers.find((row) => row.farmerId === FARMER_B);
    expect([a?.outstandingPaise, a?.creditPaise]).toEqual([0, 20000]);
    expect([b?.outstandingPaise, b?.creditPaise]).toEqual([20000, 0]);
    // No field carries the netted figure (outstanding - credit = 0).
    const numeric = Object.entries(d).filter(([, v]) => typeof v === 'number');
    expect(numeric.filter(([k, v]) => k !== 'periodStartMs' && v === 0)).toEqual([]);
  });

  it('E19 as-of view (Ramu, E1 data)', () => {
    const cases = [
      ['2026-06-30', ['2026-05', '2026-06'], 80000, 0, 80000],
      ['2026-09-09', ['2026-05', '2026-06', '2026-07', '2026-08'], 177500, 0, 177500],
      ['2026-09-10', ['2026-05', '2026-06', '2026-07', '2026-08'], 177500, 50000, 127500],
    ] as const;
    for (const [day, chargedMonths, charges, paid, outstanding] of cases) {
      const l = ledger(e1Usage(), e1Payments(), endOfIstDayMs(day));
      // The spec's "Months" column lists the charge months; a payment-only month may follow (L11).
      expect(l.months.filter((row) => row.chargePaise > 0).map((row) => row.monthKey)).toEqual(chargedMonths);
      expect([l.totals.chargesPaise, l.totals.totalPaidPaise, l.totals.outstandingPaise]).toEqual([
        charges,
        paid,
        outstanding,
      ]);
    }
  });

  it('E20 IST month boundaries', () => {
    expect(istMonthKey(parseInstantMs('2026-05-31T23:30:00+05:30'))).toBe('2026-05');
    expect(istMonthKey(parseInstantMs('2026-06-01T00:10:00+05:30'))).toBe('2026-06');
    expect(istMonthKey(parseInstantMs('2026-05-31T18:40:00Z'))).toBe('2026-06');
    expect(istMonthKey(parseInstantMs('2026-05-31T18:29:00Z'))).toBe('2026-05');
  });

  it('E21 disabled farmer excluded from totals, restored farmer counted', () => {
    const rows = {
      usage: [usage('ua', FARMER_A, '2026-05-05', 1, 0), usage('uc', FARMER_C, '2026-05-05', 5, 0)],
      payments: [],
    };
    const disabled = buildDashboard({ farmers: [farmer(FARMER_A), farmer(FARMER_C, { disabled: true })], ...rows }, { kind: 'all' });
    expect([disabled.activeFarmerCount, disabled.outstandingPaise]).toEqual([1, 10000]);
    const restored = buildDashboard({ farmers: [farmer(FARMER_A), farmer(FARMER_C)], ...rows }, { kind: 'all' });
    expect([restored.activeFarmerCount, restored.outstandingPaise]).toEqual([2, 60000]);
  });

  it('E22 rounding table', () => {
    expect(entryAmountPaise(215, 10000)).toBe(35833);
    expect(entryAmountPaise(265, 10000)).toBe(44167);
    expect(entryAmountPaise(10, 10000)).toBe(1667);
    expect(entryAmountPaise(1, 10050)).toBe(168);
    expect(entryAmountPaise(3, 10010)).toBe(501);
    expect(entryAmountPaise(1, 10030)).toBe(167);
  });

  it('E23 monthly dashboard views (Ramu, E1 data)', () => {
    const input = { farmers: [farmer(RAMU)], usage: e1Usage(), payments: e1Payments() };
    const cases = [
      ['2026-05', 35833, 0, 35833, 0],
      ['2026-06', 44167, 0, 80000, 0],
      ['2026-07', 52500, 0, 132500, 0],
      ['2026-08', 45000, 0, 177500, 0],
      ['2026-09', 0, 50000, 127500, 0],
    ] as const;
    for (const [monthKey, ...figures] of cases) {
      expect(dashboardFigures(buildDashboard(input, { kind: 'month', monthKey }))).toEqual(figures);
    }
  });

  it('E24a yearly view: Ramu 2026', () => {
    const input = { farmers: [farmer(RAMU)], usage: e1Usage(), payments: e1Payments() };
    expect(dashboardFigures(buildDashboard(input, { kind: 'year', yearKey: '2026' }))).toEqual([
      177500, 50000, 127500, 0,
    ]);
  });

  it('E24b yearly views: usage in 2025, payment in 2026', () => {
    const input = {
      farmers: [farmer(RAMU)],
      usage: [usage('u1', RAMU, '2025-12-20', 1, 0)],
      payments: [payment('p1', RAMU, '2026-01-05', 10000)],
    };
    expect(dashboardFigures(buildDashboard(input, { kind: 'year', yearKey: '2025' }))).toEqual([10000, 0, 10000, 0]);
    expect(dashboardFigures(buildDashboard(input, { kind: 'year', yearKey: '2026' }))).toEqual([0, 10000, 0, 0]);
  });

  it('E24c IST year boundary: 2025-12-31T18:40Z counts in 2026', () => {
    const input = {
      farmers: [farmer(RAMU)],
      usage: [usage('u1', RAMU, '2025-12-31T18:40:00Z', 1, 0)],
      payments: [],
    };
    expect(istMonthKey(parseInstantMs('2025-12-31T18:40:00Z'))).toBe('2026-01');
    expect(buildDashboard(input, { kind: 'year', yearKey: '2026' }).chargesCreatedPaise).toBe(10000);
    expect(buildDashboard(input, { kind: 'year', yearKey: '2025' }).chargesCreatedPaise).toBe(0);
  });
});
