// Phase 9: the oracle reproduces the spec's worked examples E1-E24 (numbers transcribed from
// docs/LEDGER_AND_ALLOCATION.md as paise), and the engine agrees with the oracle on every input.
import { describe, expect, it } from 'vitest';
import { buildDashboard, buildFarmerLedger, endOfIstDayMs } from '@/lib/ledger';
import type { DashboardView, LedgerPayment, LedgerUsage } from '@/lib/ledger';
import { DELETED_AT, FARMER_A, FARMER_B, FARMER_C, RAMU, e1Payments, e1Usage, payment, usage } from '@/lib/ledger/test-support/fixtures';
import { monthShape, n, totalsShape, trailShape } from './compare';
import { vDashboard, vEntry, vFarmer, vMonth, vMs } from './oracle';
import type { VFarmerRow } from './oracle';

type Months = [string, number, number, number, string][]; // month, charge, paid, remaining, status

function months(u: readonly LedgerUsage[], p: readonly LedgerPayment[], cutoff?: number): Months {
  return vFarmer(u, p, cutoff).months.map((m) => [m.monthKey, n(m.charge), n(m.paid), n(m.remaining), m.status]);
}
function totals(u: readonly LedgerUsage[], p: readonly LedgerPayment[], cutoff?: number): number[] {
  const v = vFarmer(u, p, cutoff);
  return [n(v.charges), n(v.paid), n(v.outstanding), n(v.credit)];
}
function trail(u: readonly LedgerUsage[], p: readonly LedgerPayment[]) {
  return vFarmer(u, p).trail.map((t) => [t.paymentId, t.pieces.map((x) => [x.monthKey, n(x.amount)]), n(t.unapplied)]);
}
/** The engine agrees with the oracle on the same input (months, totals, trail). */
function agrees(u: readonly LedgerUsage[], p: readonly LedgerPayment[], cutoffMs?: number): void {
  const e = buildFarmerLedger({ usage: u, payments: p }, cutoffMs === undefined ? {} : { cutoffMs });
  const v = vFarmer(u, p, cutoffMs);
  expect(e.months.map((m) => ({ ...m }))).toEqual(v.months.map(monthShape));
  expect(e.totals).toMatchObject(totalsShape(v));
  expect(e.trail.map((t) => ({ paymentId: t.paymentId, pieces: t.pieces.map((x) => ({ ...x })), unappliedPaise: t.unappliedPaise }))).toEqual(v.trail.map(trailShape));
}
const named = (id: string, opts: { disabled?: boolean } = {}): VFarmerRow => ({ id, name: id, is_disabled: opts.disabled ?? false, deleted_at: null });
function dash(farmers: VFarmerRow[], u: LedgerUsage[], p: LedgerPayment[], view: DashboardView) {
  const v = vDashboard({ farmers, usage: u, payments: p }, view);
  const e = buildDashboard({ farmers, usage: u, payments: p }, view);
  const figures = [n(v.charges), n(v.cash), n(v.outstanding), n(v.credit)];
  expect([e.chargesCreatedPaise, e.cashReceivedPaise, e.outstandingPaise, e.creditPaise]).toEqual(figures);
  return { figures, active: v.activeCount };
}

describe('oracle reproduces the spec examples (and the engine agrees)', () => {
  it('E1 canonical Ramu: months, totals, trail, running balance', () => {
    const u = e1Usage();
    const p = e1Payments();
    expect(months(u, p)).toEqual([
      ['2026-05', 35833, 35833, 0, 'settled'],
      ['2026-06', 44167, 14167, 30000, 'partial'],
      ['2026-07', 52500, 0, 52500, 'unpaid'],
      ['2026-08', 45000, 0, 45000, 'unpaid'],
      ['2026-09', 0, 0, 0, 'payment_only'],
    ]);
    expect(totals(u, p)).toEqual([177500, 50000, 127500, 0]);
    expect(trail(u, p)).toEqual([['p1', [['2026-05', 35833], ['2026-06', 14167]], 0]]);
    expect(vFarmer(u, p).balances.map((b) => n(b.balance))).toEqual([35833, 80000, 132500, 177500, 127500]);
    agrees(u, p);
  });

  it('E2-E4 partial, exact, over-payment', () => {
    const e2u = [usage('u1', RAMU, '2026-05-05', 3, 0)];
    const e2p = [payment('p1', RAMU, '2026-05-20', 10000), payment('p2', RAMU, '2026-05-28', 15000)];
    expect(months(e2u, e2p)).toEqual([['2026-05', 30000, 25000, 5000, 'partial']]);
    expect(trail(e2u, e2p)).toEqual([['p1', [['2026-05', 10000]], 0], ['p2', [['2026-05', 15000]], 0]]);
    const u = [usage('u1', RAMU, '2026-05-05', 2, 0)];
    expect(totals(u, [payment('p1', RAMU, '2026-05-25', 20000)])).toEqual([20000, 20000, 0, 0]);
    expect(totals(u, [payment('p1', RAMU, '2026-05-25', 50000)])).toEqual([20000, 50000, 0, 30000]);
    expect(trail(u, [payment('p1', RAMU, '2026-05-25', 50000)])).toEqual([['p1', [['2026-05', 20000]], 30000]]);
    agrees(e2u, e2p);
    agrees(u, [payment('p1', RAMU, '2026-05-25', 50000)]);
  });

  it('E5a / E5b credit consumed by later usage', () => {
    const p = [payment('p1', RAMU, '2026-05-25', 50000)];
    const a = [usage('u1', RAMU, '2026-05-05', 2, 0), usage('u2', RAMU, '2026-06-15', 1, 30)];
    expect(totals(a, p)).toEqual([35000, 50000, 0, 15000]);
    expect(trail(a, p)).toEqual([['p1', [['2026-05', 20000], ['2026-06', 15000]], 15000]]);
    const b = [...a, usage('u3', RAMU, '2026-07-15', 2, 0)];
    expect(months(b, p).at(-1)).toEqual(['2026-07', 20000, 15000, 5000, 'partial']);
    expect(totals(b, p)).toEqual([55000, 50000, 5000, 0]);
    agrees(b, p);
  });

  it('E6a / E6b one bucket per month; per-entry rounding gives 50.01', () => {
    const a = [usage('u1', RAMU, '2026-05-03', 1, 0), usage('u2', RAMU, '2026-05-12', 0, 45), usage('u3', RAMU, '2026-05-25', 2, 20)];
    expect(months(a, [])).toEqual([['2026-05', 40833, 0, 40833, 'unpaid']]);
    expect(vFarmer(a, []).minutes).toBe(245);
    const b = [usage('u1', RAMU, '2026-05-03', 0, 10), usage('u2', RAMU, '2026-05-04', 0, 10), usage('u3', RAMU, '2026-05-05', 0, 10)];
    expect(totals(b, [])[0]).toBe(5001);
    expect(totals([usage('u1', RAMU, '2026-05-03', 0, 30)], [])[0]).toBe(5000);
    agrees(b, []);
  });

  it('E7 payment-only month ("Sirf Payment")', () => {
    const u = [usage('u1', RAMU, '2026-05-05', 2, 0)];
    const p = [payment('p1', RAMU, '2026-06-05', 20000)];
    expect(months(u, p)).toEqual([['2026-05', 20000, 20000, 0, 'settled'], ['2026-06', 0, 0, 0, 'payment_only']]);
    expect(vFarmer(u, p).months[1]?.cash).toBe(20000n);
    agrees(u, p);
  });

  it('E8-E11 edit / soft-delete usage and payments, restore', () => {
    const edited = e1Usage().map((r) => (r.id === 'u-jun' ? usage('u-jun', RAMU, '2026-06-10', 2, 25) : r));
    expect(totals(edited, e1Payments())).toEqual([157500, 50000, 107500, 0]);
    expect(months(edited, e1Payments())[1]).toEqual(['2026-06', 24167, 14167, 10000, 'partial']);
    const deleted = e1Usage().map((r) => (r.id === 'u-may' ? { ...r, deleted_at: DELETED_AT } : r));
    expect(months(deleted, e1Payments())).toEqual([
      ['2026-06', 44167, 44167, 0, 'settled'],
      ['2026-07', 52500, 5833, 46667, 'partial'],
      ['2026-08', 45000, 0, 45000, 'unpaid'],
      ['2026-09', 0, 0, 0, 'payment_only'],
    ]);
    expect(totals(deleted, e1Payments())).toEqual([141667, 50000, 91667, 0]);
    const restored = deleted.map((r) => ({ ...r, deleted_at: null }));
    expect(totals(restored, e1Payments())).toEqual([177500, 50000, 127500, 0]);
    expect(months(e1Usage(), e1Payments(30000))[0]).toEqual(['2026-05', 35833, 30000, 5833, 'partial']);
    expect(totals(e1Usage(), e1Payments(30000))[2]).toBe(147500);
    const gone = e1Payments().map((r) => ({ ...r, deleted_at: DELETED_AT }));
    expect(totals(e1Usage(), gone)).toEqual([177500, 0, 177500, 0]);
    expect(trail(e1Usage(), gone)).toEqual([]);
    agrees(deleted, e1Payments());
    agrees(e1Usage(), gone);
  });

  it('E12 two same-day, same-amount payments both count', () => {
    const u = [usage('u1', RAMU, '2026-05-05', 5, 0)];
    const p = [payment('p1', RAMU, '2026-06-02T10:00', 20000), payment('p2', RAMU, '2026-06-02T18:00', 20000)];
    expect(months(u, p)).toEqual([['2026-05', 50000, 40000, 10000, 'partial'], ['2026-06', 0, 0, 0, 'payment_only']]);
    expect(vFarmer(u, p).months[1]?.cash).toBe(40000n);
    agrees(u, p);
  });

  it('E13 usage after an earlier payment, with as-of views', () => {
    const u = [usage('u1', RAMU, '2026-05-15', 3, 0), usage('u2', RAMU, '2026-06-15', 4, 0), usage('u3', RAMU, '2026-07-15', 5, 0)];
    const p = [payment('p1', RAMU, '2026-05-01', 100000)];
    expect(totals(u, p)).toEqual([120000, 100000, 20000, 0]);
    expect(trail(u, p)).toEqual([['p1', [['2026-05', 30000], ['2026-06', 40000], ['2026-07', 30000]], 0]]);
    expect(totals(u, p, endOfIstDayMs('2026-05-31'))).toEqual([30000, 100000, 0, 70000]);
    expect(totals(u, p, endOfIstDayMs('2026-06-30'))[3]).toBe(30000);
    agrees(u, p, endOfIstDayMs('2026-05-31'));
  });

  it('E14-E17 farmer summary states', () => {
    expect(totals([usage('u1', RAMU, '2026-05-05', 1, 0)], [])).toEqual([10000, 0, 10000, 0]);
    expect(trail([usage('u1', RAMU, '2026-05-05', 1, 0)], [])).toEqual([]);
  });

  it('E18 credit never offsets another farmer\'s due (separate sums)', () => {
    const u = [usage('ua', FARMER_A, '2026-05-05', 1, 0), usage('ub', FARMER_B, '2026-05-05', 2, 0)];
    const p = [payment('pa', FARMER_A, '2026-05-25', 30000)];
    expect(dash([named(FARMER_A), named(FARMER_B)], u, p, { kind: 'all' }).figures).toEqual([30000, 30000, 20000, 20000]);
  });

  it('E19 as-of views (Ramu)', () => {
    expect(totals(e1Usage(), e1Payments(), endOfIstDayMs('2026-06-30'))).toEqual([80000, 0, 80000, 0]);
    expect(totals(e1Usage(), e1Payments(), endOfIstDayMs('2026-09-09'))).toEqual([177500, 0, 177500, 0]);
    expect(totals(e1Usage(), e1Payments(), endOfIstDayMs('2026-09-10'))).toEqual([177500, 50000, 127500, 0]);
    agrees(e1Usage(), e1Payments(), endOfIstDayMs('2026-09-09'));
  });

  it('E20 IST month boundaries', () => {
    expect(['2026-05-31T23:30:00+05:30', '2026-06-01T00:10:00+05:30', '2026-05-31T18:40:00Z', '2026-05-31T18:29:00Z'].map((t) => vMonth(vMs(t)))).toEqual([
      '2026-05',
      '2026-06',
      '2026-06',
      '2026-05',
    ]);
  });

  it('E21 a disabled farmer is excluded; restoring counts it again', () => {
    const u = [usage('ua', FARMER_A, '2026-05-05', 1, 0), usage('uc', FARMER_C, '2026-05-05', 5, 0)];
    const off = dash([named(FARMER_A), named(FARMER_C, { disabled: true })], u, [], { kind: 'all' });
    expect([off.active, off.figures[2]]).toEqual([1, 10000]);
    const on = dash([named(FARMER_A), named(FARMER_C)], u, [], { kind: 'all' });
    expect([on.active, on.figures[2]]).toEqual([2, 60000]);
  });

  it('E22 rounding table (D7)', () => {
    expect([vEntry(215, 10000), vEntry(265, 10000), vEntry(10, 10000), vEntry(1, 10050), vEntry(3, 10010), vEntry(1, 10030)].map(n)).toEqual([
      35833, 44167, 1667, 168, 501, 167,
    ]);
  });

  it('E23 monthly Dashboard views (as of each month end)', () => {
    const f = [named(RAMU)];
    const got = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((monthKey) => dash(f, e1Usage(), e1Payments(), { kind: 'month', monthKey }).figures);
    expect(got).toEqual([
      [35833, 0, 35833, 0],
      [44167, 0, 80000, 0],
      [52500, 0, 132500, 0],
      [45000, 0, 177500, 0],
      [0, 50000, 127500, 0],
    ]);
  });

  it('E24a-c yearly views and the IST year boundary', () => {
    const f = [named(RAMU)];
    expect(dash(f, e1Usage(), e1Payments(), { kind: 'year', yearKey: '2026' }).figures).toEqual([177500, 50000, 127500, 0]);
    const u = [usage('u1', RAMU, '2025-12-20', 1, 0)];
    const p = [payment('p1', RAMU, '2026-01-05', 10000)];
    expect(dash(f, u, p, { kind: 'year', yearKey: '2025' }).figures).toEqual([10000, 0, 10000, 0]);
    expect(dash(f, u, p, { kind: 'year', yearKey: '2026' }).figures).toEqual([0, 10000, 0, 0]);
    const edge = [usage('u1', RAMU, '2025-12-31T18:40:00Z', 1, 0)];
    expect(dash(f, edge, [], { kind: 'year', yearKey: '2026' }).figures[0]).toBe(10000);
    expect(dash(f, edge, [], { kind: 'year', yearKey: '2025' }).figures[0]).toBe(0);
  });
});
