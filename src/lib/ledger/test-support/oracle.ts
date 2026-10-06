// Test-only independent oracle for one farmer's ledger. It shares no code with the engine:
// BigInt money, the quotient/remainder rounding form (spec, Clarifications), Date.parse plus
// toISOString for IST months, and a "fill the oldest unpaid month, payment by payment" loop
// instead of the L6 formula.
import type { LedgerPayment, LedgerUsage } from '../index';

export interface OracleMonth {
  readonly monthKey: string;
  readonly totalMinutes: bigint;
  readonly charge: bigint;
  readonly paid: bigint;
  readonly remaining: bigint;
  readonly cash: bigint;
  readonly status: string;
  readonly entryCount: number;
  readonly paymentCount: number;
}

export interface OracleTrail {
  readonly paymentId: string;
  readonly pieces: readonly { readonly monthKey: string; readonly amount: bigint }[];
  readonly unapplied: bigint;
}

export interface OracleResult {
  readonly months: readonly OracleMonth[];
  readonly trail: readonly OracleTrail[];
  readonly charges: bigint;
  readonly totalPaid: bigint;
  readonly outstanding: bigint;
  readonly credit: bigint;
  readonly rows: readonly { readonly kind: string; readonly id: string; readonly balance: bigint }[];
}

export function oracleMs(iso: string): number {
  // Date.parse is only guaranteed for up to 3 fraction digits; truncate microseconds first.
  const ms = Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'));
  if (Number.isNaN(ms)) throw new Error(`oracle cannot parse ${iso}`);
  return ms;
}

export function oracleMonth(ms: number): string {
  return new Date(ms + 5.5 * 3_600_000).toISOString().slice(0, 7);
}

export function oracleAmount(totalMinutes: number, ratePaise: number): bigint {
  const exact = BigInt(totalMinutes) * BigInt(ratePaise);
  const q = exact / 60n;
  const r = exact % 60n;
  return 2n * r >= 60n ? q + 1n : q;
}

function cmp(a: string | number, b: string | number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function oracleLedger(
  usage: readonly LedgerUsage[],
  payments: readonly LedgerPayment[],
  cutoffMs?: number,
): OracleResult {
  const keep = (ms: number) => cutoffMs === undefined || ms <= cutoffMs;
  const u = usage
    .filter((row) => row.deleted_at === null)
    .map((row) => ({
      id: row.id,
      ms: oracleMs(row.used_at),
      created: oracleMs(row.created_at),
      minutes: BigInt(row.hours * 60 + row.minutes),
      amount: oracleAmount(row.hours * 60 + row.minutes, row.rate_paise),
    }))
    .filter((row) => keep(row.ms));
  const p = payments
    .filter((row) => row.deleted_at === null)
    .map((row) => ({
      id: row.id,
      ms: oracleMs(row.paid_at),
      created: oracleMs(row.created_at),
      amount: BigInt(row.amount_paise),
    }))
    .filter((row) => keep(row.ms))
    .sort((a, b) => cmp(a.ms, b.ms) || cmp(a.created, b.created) || cmp(a.id, b.id));

  const monthKeys = [...new Set([...u.map((r) => oracleMonth(r.ms)), ...p.map((r) => oracleMonth(r.ms))])].sort();
  const charge = new Map<string, bigint>();
  const paid = new Map<string, bigint>();
  for (const key of monthKeys) {
    charge.set(key, u.filter((r) => oracleMonth(r.ms) === key).reduce((s, r) => s + r.amount, 0n));
    paid.set(key, 0n);
  }

  const trail: OracleTrail[] = [];
  for (const pay of p) {
    let left = pay.amount;
    const pieces: { monthKey: string; amount: bigint }[] = [];
    for (const key of monthKeys) {
      if (left === 0n) break;
      const room = (charge.get(key) ?? 0n) - (paid.get(key) ?? 0n);
      if (room <= 0n) continue;
      const take = room < left ? room : left;
      paid.set(key, (paid.get(key) ?? 0n) + take);
      pieces.push({ monthKey: key, amount: take });
      left -= take;
    }
    trail.push({ paymentId: pay.id, pieces, unapplied: left });
  }

  const months: OracleMonth[] = monthKeys.map((key) => {
    const c = charge.get(key) ?? 0n;
    const pd = paid.get(key) ?? 0n;
    const inMonthU = u.filter((r) => oracleMonth(r.ms) === key);
    const inMonthP = p.filter((r) => oracleMonth(r.ms) === key);
    const cash = inMonthP.reduce((s, r) => s + r.amount, 0n);
    let status: string;
    if (c > 0n) status = pd === c ? 'settled' : pd === 0n ? 'unpaid' : 'partial';
    else status = cash > 0n ? 'payment_only' : 'settled';
    return {
      monthKey: key,
      totalMinutes: inMonthU.reduce((s, r) => s + r.minutes, 0n),
      charge: c,
      paid: pd,
      remaining: c - pd,
      cash,
      status,
      entryCount: inMonthU.length,
      paymentCount: inMonthP.length,
    };
  });

  const charges = months.reduce((s, x) => s + x.charge, 0n);
  const totalPaid = p.reduce((s, r) => s + r.amount, 0n);
  const outstanding = months.reduce((s, x) => s + x.remaining, 0n);
  const credit = trail.reduce((s, t) => s + t.unapplied, 0n);

  const events = [
    ...u.map((r) => ({ kind: 'usage', rank: 0, id: r.id, ms: r.ms, created: r.created, delta: r.amount })),
    ...p.map((r) => ({ kind: 'payment', rank: 1, id: r.id, ms: r.ms, created: r.created, delta: -r.amount })),
  ].sort((a, b) => cmp(a.ms, b.ms) || cmp(a.rank, b.rank) || cmp(a.created, b.created) || cmp(a.id, b.id));
  let balance = 0n;
  const rows = events.map((e) => {
    balance += e.delta;
    return { kind: e.kind, id: e.id, balance };
  });

  return { months, trail, charges, totalPaid, outstanding, credit, rows };
}
