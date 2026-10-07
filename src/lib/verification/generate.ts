// Phase 9 seeded scenario generator (test-only). Deterministic: the same seed always gives the same
// rows, so any mismatch is reproduced with its seed. Made-up farmers only. Rows come in DB shape
// (every column), so the data-layer functions can read them too.
import type { FarmerRow, PaymentRow, UsageRow } from '@/lib/data';
import { vEntry, vFarmer } from './oracle';

export type Rng = () => number;

/** mulberry32: a small, well-known 32-bit PRNG. */
export function rngFor(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[int(rng, 0, items.length - 1)] as T;
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = int(rng, 0, i);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** IST-boundary instants written with +05:30, and their UTC twins written with Z. */
const BOUNDARY_INSTANTS = [
  '2025-12-31T23:59:59+05:30',
  '2026-01-01T00:00:00+05:30',
  '2025-12-31T18:30:00Z', // = 2026-01-01 00:00 IST
  '2025-12-31T18:29:59.999Z', // = 2025-12-31 23:59:59.999 IST
  '2026-02-28T23:59:59+05:30',
  '2026-03-01T00:00:00+05:30',
  '2026-04-30T23:59:59+05:30',
  '2026-05-01T00:00:00+05:30',
  '2026-09-30T23:59:59+05:30',
  '2026-10-01T00:00:00+05:30',
  '2026-12-31T23:59:59+05:30',
  '2027-01-01T00:00:00+05:30',
  '2028-02-29T10:00:00+05:30', // leap day
  '2028-02-29T23:59:59+05:30',
  '2028-03-01T00:00:00+05:30',
  '2026-06-15T10:00:00.123456+05:30', // microseconds
];

const RATES = [10000, 10000, 10000, 9999, 12345, 15050, 7, 1, 100000, 33333];
const START_MS = Date.parse('2025-11-01T00:00:00Z');
const SPAN_MS = Date.parse('2028-04-01T00:00:00Z') - START_MS;

function instant(rng: Rng): string {
  if (rng() < 0.3) return pick(rng, BOUNDARY_INSTANTS);
  // Whole seconds, written in UTC; sometimes with a +05:30 rewrite of the same moment is not needed.
  return new Date(START_MS + Math.floor(rng() * (SPAN_MS / 1000)) * 1000).toISOString();
}

export interface Scenario {
  readonly seed: number;
  readonly farmers: FarmerRow[];
  readonly usage: UsageRow[];
  readonly payments: PaymentRow[];
}

const AUDIT = { created_by: null, updated_by: null, deleted_by: null } as const;
const DELETED = '2028-05-01T00:00:00Z';

function farmerRowOf(id: string, name: string, state: 'active' | 'disabled' | 'deleted'): FarmerRow {
  return {
    id,
    name,
    mobile: null,
    notes: null,
    is_disabled: state === 'disabled',
    created_at: '2025-10-01T00:00:00Z',
    updated_at: '2025-10-01T00:00:00Z',
    deleted_at: state === 'deleted' ? DELETED : null,
    ...AUDIT,
  };
}

/**
 * One scenario: 1-6 farmers (active, Band or deleted), usage of 1 minute to many hours at odd rates,
 * payments before any charge, exact settles, over-payments, 1-paisa payments, equal timestamps,
 * soft-deleted rows, all in shuffled order.
 */
export function scenario(seed: number): Scenario {
  const rng = rngFor(seed);
  const farmers: FarmerRow[] = [];
  const usage: UsageRow[] = [];
  const payments: PaymentRow[] = [];
  const nFarmers = int(rng, 1, 6);
  for (let f = 0; f < nFarmers; f += 1) {
    const state = rng() < 0.7 ? 'active' : rng() < 0.5 ? 'disabled' : 'deleted';
    const id = `f-${seed}-${f}`;
    // Mixed case names so the case-insensitive name order is exercised.
    farmers.push(farmerRowOf(id, `${pick(rng, ['Kisan', 'kisan', 'KISAN', 'Ram', 'ram'])} ${String.fromCharCode(65 + int(rng, 0, 5))}`, state));

    const nUsage = int(rng, 0, 10);
    for (let i = 0; i < nUsage; i += 1) {
      const kind = rng();
      const hours = kind < 0.2 ? 0 : kind < 0.9 ? int(rng, 0, 9) : int(rng, 10, 72);
      const minutes = hours === 0 ? int(rng, 1, 59) : int(rng, 0, 59);
      const used = instant(rng);
      usage.push({
        id: `u-${seed}-${f}-${i}`,
        farmer_id: id,
        used_at: used,
        hours,
        minutes,
        total_minutes: hours * 60 + minutes,
        rate_paise: pick(rng, RATES),
        created_at: rng() < 0.2 ? used : '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: rng() < 0.15 ? DELETED : null,
        ...AUDIT,
      });
    }

    const nPay = int(rng, 0, 7);
    let lastPaidAt: string | null = null;
    for (let i = 0; i < nPay; i += 1) {
      const style = rng();
      // Equal timestamps (same paid_at as the previous payment) are common on purpose.
      const paidAt: string = lastPaidAt !== null && rng() < 0.25 ? lastPaidAt : style < 0.15 ? '2025-11-02T10:00:00+05:30' : instant(rng);
      lastPaidAt = paidAt;
      let amount: number;
      if (style < 0.1) amount = 1;
      else if (style < 0.3) {
        // Exact settle of everything this farmer owes so far (by the oracle, current view).
        const owed = vFarmer(usage.filter((u) => u.farmer_id === id), payments.filter((p) => p.farmer_id === id)).outstanding;
        amount = owed > 0n ? Number(owed) : int(rng, 100, 50000);
      } else if (style < 0.45) amount = int(rng, 100_000, 5_000_000); // over-payment
      else amount = int(rng, 100, 60_000);
      payments.push({
        id: `p-${seed}-${f}-${i}`,
        farmer_id: id,
        paid_at: paidAt,
        amount_paise: amount,
        note: null,
        created_at: pick(rng, ['2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', paidAt]),
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: rng() < 0.12 ? DELETED : null,
        ...AUDIT,
      });
    }
  }
  return { seed, farmers: shuffle(rng, farmers), usage: shuffle(rng, usage), payments: shuffle(rng, payments) };
}

/** The entry amount, re-exported for tests that build expectations by hand. */
export const entryPaise = (totalMinutes: number, ratePaise: number): number => Number(vEntry(totalMinutes, ratePaise));
