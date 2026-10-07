// Test-only helpers shared by the Phase 9 comparison tests: oracle results in the engine's number
// shapes (plain numbers), and the seed list.
import type { VFarmerResult, VMonth, VTrail } from './oracle';

/** At least 300 seeded scenarios (Phase 9); the seed is in every failure message. */
export const SEEDS: readonly number[] = Array.from({ length: 320 }, (_, i) => 9000 + i);

export const n = (value: bigint): number => Number(value);

export function monthShape(m: VMonth) {
  return {
    monthKey: m.monthKey,
    totalMinutes: m.minutes,
    chargePaise: n(m.charge),
    paidPaise: n(m.paid),
    remainingPaise: n(m.remaining),
    cashPaise: n(m.cash),
    status: m.status,
    entryCount: m.entries,
    paymentCount: m.payments,
  };
}

export function trailShape(t: VTrail) {
  return { paymentId: t.paymentId, pieces: t.pieces.map((p) => ({ monthKey: p.monthKey, amountPaise: n(p.amount) })), unappliedPaise: n(t.unapplied) };
}

export function totalsShape(v: VFarmerResult) {
  return { chargesPaise: n(v.charges), totalPaidPaise: n(v.paid), outstandingPaise: n(v.outstanding), creditPaise: n(v.credit) };
}

/** Counts every comparison per area so the run can report them. */
export const tally: Record<string, number> = {};
export function count(area: string, by = 1): void {
  tally[area] = (tally[area] ?? 0) + by;
}
