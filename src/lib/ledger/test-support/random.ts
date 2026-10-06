// Test-only seeded randomness and scenario generation. Floats are fine here: they only pick
// test inputs, never compute money.
import type { LedgerPayment, LedgerUsage } from '../index';

export type Rng = () => number;

/** mulberry32: small deterministic PRNG, so every failing scenario can be replayed by seed. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[randInt(rng, 0, items.length - 1)];
  if (item === undefined) throw new Error('pick from empty list');
  return item;
}

export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, 0, i);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

const IST_OFFSET_MS_TEST = 19_800_000;

/** IST wall clock fields to an ISO string, in one of several equivalent formats. */
export function isoFromIst(
  rng: Rng,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  ms: number,
): string {
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, s, ms) - IST_OFFSET_MS_TEST;
  const style = randInt(rng, 0, 3);
  const zulu = new Date(utcMs).toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
  if (style === 0) return zulu;
  if (style === 1) return `${zulu.slice(0, 23)}${String(randInt(rng, 0, 999)).padStart(3, '0')}+00:00`; // microseconds
  const p2 = (n: number) => String(n).padStart(2, '0');
  const local = `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}:${p2(s)}.${String(ms).padStart(3, '0')}`;
  if (style === 2) return `${local}+05:30`;
  // Same instant written in a US Pacific standard offset (-08:00).
  const pacific = new Date(utcMs - 8 * 3_600_000).toISOString().slice(0, 23);
  return `${pacific}-08:00`;
}

export interface Scenario {
  readonly usage: LedgerUsage[];
  readonly payments: LedgerPayment[];
}

const MONTHS: readonly (readonly [number, number])[] = [
  [2025, 11],
  [2025, 12],
  [2026, 1],
  [2026, 2],
  [2026, 3],
  [2026, 4],
  [2026, 5],
  [2026, 6],
];

function daysIn(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function randomInstant(rng: Rng): string {
  const [y, mo] = pick(rng, MONTHS);
  const edge = randInt(rng, 0, 9);
  if (edge === 0) return isoFromIst(rng, y, mo, 1, 0, 0, 0, 0); // first instant of the IST month
  if (edge === 1) return isoFromIst(rng, y, mo, daysIn(y, mo), 23, 59, 59, 999); // last ms of the IST month
  return isoFromIst(
    rng,
    y,
    mo,
    randInt(rng, 1, daysIn(y, mo)),
    randInt(rng, 0, 23),
    randInt(rng, 0, 59),
    randInt(rng, 0, 59),
    randInt(rng, 0, 999),
  );
}

const CREATED_AT_POOL: readonly string[] = [
  '2026-07-01T00:00:00Z',
  '2026-07-01T00:00:00.000001Z',
  '2026-07-02T09:15:00+05:30',
  '2026-08-15T12:00:00Z',
];

/** One farmer's random rows: ties, deletions, edge instants, odd rates and zero-rounding entries. */
export function randomScenario(rng: Rng, farmerId: string, seedTag: string): Scenario {
  const usage: LedgerUsage[] = [];
  const payments: LedgerPayment[] = [];
  const instants: string[] = [];
  const nextInstant = (): string => {
    if (instants.length > 0 && rng() < 0.2) return pick(rng, instants);
    const at = randomInstant(rng);
    instants.push(at);
    return at;
  };

  const usageCount = randInt(rng, 0, 8);
  for (let i = 0; i < usageCount; i += 1) {
    const kind = randInt(rng, 0, 9);
    let hours = randInt(rng, 0, 6);
    let minutes = randInt(rng, 0, 59);
    if (hours === 0 && minutes === 0) minutes = 1;
    let rate = 10000;
    if (kind === 0) rate = randInt(rng, 1, 30000);
    if (kind === 1) {
      // rounds to 0 paise: 1 minute at 1 paisa per hour
      hours = 0;
      minutes = 1;
      rate = 1;
    }
    if (kind === 2) rate = pick(rng, [10050, 10010, 10030, 9999, 10001]);
    usage.push({
      id: `u-${seedTag}-${i}-${randInt(rng, 0, 99999)}`,
      farmer_id: farmerId,
      used_at: nextInstant(),
      hours,
      minutes,
      total_minutes: hours * 60 + minutes,
      rate_paise: rate,
      created_at: pick(rng, CREATED_AT_POOL),
      deleted_at: rng() < 0.12 ? '2026-10-02T00:00:00Z' : null,
    });
  }

  const paymentCount = randInt(rng, 0, 6);
  for (let i = 0; i < paymentCount; i += 1) {
    const kind = randInt(rng, 0, 9);
    let amount = randInt(rng, 1, 80000);
    if (kind === 0) amount = randInt(rng, 1, 99);
    if (kind === 1) amount = pick(rng, [10000, 20000, 35833, 44167, 50000]);
    if (kind === 2) amount = randInt(rng, 100000, 400000);
    payments.push({
      id: `p-${seedTag}-${i}-${randInt(rng, 0, 99999)}`,
      farmer_id: farmerId,
      paid_at: nextInstant(),
      amount_paise: amount,
      note: null,
      created_at: pick(rng, CREATED_AT_POOL),
      deleted_at: rng() < 0.12 ? '2026-10-02T00:00:00Z' : null,
    });
  }
  return { usage, payments };
}

/** A random inclusive cutoff instant (ms) inside or around the scenario months. */
export function randomCutoffMs(rng: Rng): number {
  return Date.parse(randomInstant(rng).replace(/(\.\d{3})\d+/, '$1'));
}
