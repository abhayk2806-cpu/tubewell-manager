// Phase 9 independent oracle, written from docs/LEDGER_AND_ALLOCATION.md only. It imports nothing
// but TYPES from the engine. Deliberate differences from the engine:
// - BigInt money everywhere; the D7 floor form for each entry.
// - Date.parse for instants and its own civil-calendar arithmetic (days <-> year/month/day) for IST.
// - An explicit FIFO queue: each payment, in order, eats the oldest unpaid month (no pooled formula).
// Test-only code.
import type { DashboardView, LedgerFarmer, LedgerPayment, LedgerUsage } from '@/lib/ledger';

export const IST_SHIFT_MS = 19_800_000; // +05:30
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- time

/** ISO text with a zone to epoch ms (sub-millisecond digits dropped). */
export function vMs(iso: string): number {
  const ms = Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'));
  if (Number.isNaN(ms)) throw new Error(`oracle cannot read ${iso}`);
  return ms;
}

/** Days since 1970-01-01 -> civil date (proleptic Gregorian). */
function civilFromDays(days: number): { y: number; m: number; d: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/** Civil date -> days since 1970-01-01. */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const two = (n: number) => (n < 10 ? `0${n}` : String(n));

/** IST "YYYY-MM" of an instant: shift by +05:30, then read the civil date. */
export function vMonth(ms: number): string {
  const { y, m } = civilFromDays(Math.floor((ms + IST_SHIFT_MS) / DAY_MS));
  return `${y}-${two(m)}`;
}

/** First ms of an IST month and the last ms (inclusive). */
export function vMonthRange(monthKey: string): { start: number; end: number } {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  const start = daysFromCivil(y, m, 1) * DAY_MS - IST_SHIFT_MS;
  const next = m === 12 ? daysFromCivil(y + 1, 1, 1) : daysFromCivil(y, m + 1, 1);
  return { start, end: next * DAY_MS - IST_SHIFT_MS - 1 };
}

export function vYearRange(yearKey: string): { start: number; end: number } {
  const y = Number(yearKey);
  return { start: daysFromCivil(y, 1, 1) * DAY_MS - IST_SHIFT_MS, end: daysFromCivil(y + 1, 1, 1) * DAY_MS - IST_SHIFT_MS - 1 };
}

// ---------------------------------------------------------------- money

/** D7: floor((2 * total_minutes * rate_paise + 60) / 120), in BigInt. */
export function vEntry(totalMinutes: number, ratePaise: number): bigint {
  return (2n * BigInt(totalMinutes) * BigInt(ratePaise) + 60n) / 120n;
}

// ---------------------------------------------------------------- one farmer

export type VStatus = 'settled' | 'partial' | 'unpaid' | 'payment_only';

export interface VMonth {
  monthKey: string;
  minutes: number;
  charge: bigint;
  paid: bigint;
  remaining: bigint;
  cash: bigint;
  status: VStatus;
  entries: number;
  payments: number;
}

export interface VTrail {
  paymentId: string;
  pieces: { monthKey: string; amount: bigint }[];
  unapplied: bigint;
}

export interface VFarmerResult {
  months: VMonth[]; // oldest first
  trail: VTrail[]; // payment order
  charges: bigint;
  paid: bigint; // all live payments
  outstanding: bigint;
  credit: bigint;
  minutes: number;
  balances: { kind: 'usage' | 'payment'; id: string; balance: bigint }[]; // running ledger, chronological
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Spec status words (L17, D3): Settled / Partial / Unpaid, "Sirf Payment" for cash with no charge. */
export function vStatus(charge: bigint, paid: bigint, cash: bigint): VStatus {
  if (charge === 0n) return cash > 0n ? 'payment_only' : 'settled';
  if (paid === charge) return 'settled';
  return paid === 0n ? 'unpaid' : 'partial';
}

/**
 * One farmer's ledger from its rows (rows of other farmers must already be removed). Soft-deleted
 * rows are ignored; with a cutoff only rows at or before it count (D1, L9).
 */
export function vFarmer(usage: readonly LedgerUsage[], payments: readonly LedgerPayment[], cutoffMs?: number): VFarmerResult {
  const inTime = (ms: number) => cutoffMs === undefined || ms <= cutoffMs;
  const u = usage.filter((r) => r.deleted_at === null && inTime(vMs(r.used_at)));
  const p = payments
    .filter((r) => r.deleted_at === null && inTime(vMs(r.paid_at)))
    .map((r) => ({ id: r.id, ms: vMs(r.paid_at), created: vMs(r.created_at), amount: BigInt(r.amount_paise) }))
    .sort((a, b) => a.ms - b.ms || a.created - b.created || compareText(a.id, b.id));

  const byMonth = new Map<string, VMonth>();
  const monthOf = (key: string): VMonth => {
    let row = byMonth.get(key);
    if (row === undefined) {
      row = { monthKey: key, minutes: 0, charge: 0n, paid: 0n, remaining: 0n, cash: 0n, status: 'settled', entries: 0, payments: 0 };
      byMonth.set(key, row);
    }
    return row;
  };
  for (const r of u) {
    const row = monthOf(vMonth(vMs(r.used_at)));
    row.minutes += r.hours * 60 + r.minutes;
    row.charge += vEntry(r.hours * 60 + r.minutes, r.rate_paise);
    row.entries += 1;
  }
  for (const r of p) {
    const row = monthOf(vMonth(r.ms));
    row.cash += r.amount;
    row.payments += 1;
  }
  const months = [...byMonth.values()].sort((a, b) => compareText(a.monthKey, b.monthKey));
  for (const row of months) row.remaining = row.charge;

  // The queue: payments in order, each filling the oldest month that still has something left.
  const trail: VTrail[] = [];
  for (const pay of p) {
    let left = pay.amount;
    const pieces: VTrail['pieces'] = [];
    for (const row of months) {
      if (left === 0n) break;
      if (row.remaining === 0n) continue;
      const take = left < row.remaining ? left : row.remaining;
      row.remaining -= take;
      row.paid += take;
      left -= take;
      pieces.push({ monthKey: row.monthKey, amount: take });
    }
    trail.push({ paymentId: pay.id, pieces, unapplied: left });
  }
  for (const row of months) row.status = vStatus(row.charge, row.paid, row.cash);

  // Running ledger: by time, a usage before a payment at the same instant, then created_at, then id.
  const events = [
    ...u.map((r) => ({ kind: 'usage' as const, id: r.id, ms: vMs(r.used_at), created: vMs(r.created_at), delta: vEntry(r.hours * 60 + r.minutes, r.rate_paise) })),
    ...p.map((r) => ({ kind: 'payment' as const, id: r.id, ms: r.ms, created: r.created, delta: -r.amount })),
  ].sort((a, b) => a.ms - b.ms || (a.kind === b.kind ? 0 : a.kind === 'usage' ? -1 : 1) || a.created - b.created || compareText(a.id, b.id));
  let running = 0n;
  const balances = events.map((e) => {
    running += e.delta;
    return { kind: e.kind, id: e.id, balance: running };
  });

  const sum = (pick: (m: VMonth) => bigint) => months.reduce((s, m) => s + pick(m), 0n);
  return {
    months,
    trail,
    charges: sum((m) => m.charge),
    paid: p.reduce((s, r) => s + r.amount, 0n),
    outstanding: sum((m) => m.remaining),
    credit: trail.reduce((s, t) => s + t.unapplied, 0n),
    minutes: months.reduce((s, m) => s + m.minutes, 0),
    balances,
  };
}

// ---------------------------------------------------------------- many farmers

export interface VFarmerRow extends LedgerFarmer {
  readonly name: string;
}

export interface VInput {
  readonly farmers: readonly VFarmerRow[];
  readonly usage: readonly LedgerUsage[];
  readonly payments: readonly LedgerPayment[];
}

const active = (f: LedgerFarmer) => f.deleted_at === null && !f.is_disabled;

function rowsOf(input: VInput, farmerId: string) {
  return { usage: input.usage.filter((r) => r.farmer_id === farmerId), payments: input.payments.filter((r) => r.farmer_id === farmerId) };
}

export interface VDashRow {
  farmerId: string;
  name: string;
  charges: bigint;
  cash: bigint;
  outstanding: bigint;
  credit: bigint;
}

export interface VDashboard {
  charges: bigint;
  cash: bigint;
  outstanding: bigint;
  credit: bigint;
  minutes: number;
  activeCount: number;
  /** D29 order: highest outstanding first, then name ignoring case, then id. */
  rows: VDashRow[];
}

/** D1 / L11: charges and cash IST-stamped in the period; outstanding and credit as of its end; All Time = now. */
export function vDashboard(input: VInput, view: DashboardView): VDashboard {
  const range = view.kind === 'all' ? null : view.kind === 'month' ? vMonthRange(view.monthKey) : vYearRange(view.yearKey);
  const inPeriod = (ms: number) => range === null || (ms >= range.start && ms <= range.end);
  const rows: VDashRow[] = [];
  let minutes = 0;
  for (const f of input.farmers.filter(active)) {
    const own = rowsOf(input, f.id);
    const asOf = vFarmer(own.usage, own.payments, range?.end);
    const liveU = own.usage.filter((r) => r.deleted_at === null && inPeriod(vMs(r.used_at)));
    const liveP = own.payments.filter((r) => r.deleted_at === null && inPeriod(vMs(r.paid_at)));
    minutes += liveU.reduce((s, r) => s + r.hours * 60 + r.minutes, 0);
    rows.push({
      farmerId: f.id,
      name: f.name,
      charges: liveU.reduce((s, r) => s + vEntry(r.hours * 60 + r.minutes, r.rate_paise), 0n),
      cash: liveP.reduce((s, r) => s + BigInt(r.amount_paise), 0n),
      outstanding: asOf.outstanding,
      credit: asOf.credit,
    });
  }
  rows.sort(
    (a, b) =>
      (a.outstanding === b.outstanding ? 0 : a.outstanding > b.outstanding ? -1 : 1) ||
      compareText(a.name.toLowerCase(), b.name.toLowerCase()) ||
      compareText(a.farmerId, b.farmerId),
  );
  const total = (pick: (r: VDashRow) => bigint) => rows.reduce((s, r) => s + pick(r), 0n);
  return {
    charges: total((r) => r.charges),
    cash: total((r) => r.cash),
    outstanding: total((r) => r.outstanding),
    credit: total((r) => r.credit),
    minutes,
    activeCount: rows.length,
    rows,
  };
}

/** C9: current month rows summed over ACTIVE farmers, oldest first; status from the sums. */
export function vAllMonths(input: VInput): VMonth[] {
  const sums = new Map<string, VMonth>();
  for (const f of input.farmers.filter(active)) {
    const own = rowsOf(input, f.id);
    for (const m of vFarmer(own.usage, own.payments).months) {
      const s = sums.get(m.monthKey) ?? { ...m, minutes: 0, charge: 0n, paid: 0n, remaining: 0n, cash: 0n, entries: 0, payments: 0 };
      s.minutes += m.minutes;
      s.charge += m.charge;
      s.paid += m.paid;
      s.remaining += m.remaining;
      s.cash += m.cash;
      s.entries += m.entries;
      s.payments += m.payments;
      sums.set(m.monthKey, s);
    }
  }
  const out = [...sums.values()].sort((a, b) => compareText(a.monthKey, b.monthKey));
  for (const s of out) s.status = vStatus(s.charge, s.paid, s.cash);
  return out;
}

/** Current outstanding and credit of every NON-deleted farmer (Chalu and Band). */
export function vBalances(input: VInput): Map<string, { outstanding: bigint; credit: bigint }> {
  const out = new Map<string, { outstanding: bigint; credit: bigint }>();
  for (const f of input.farmers.filter((x) => x.deleted_at === null)) {
    const own = rowsOf(input, f.id);
    const l = vFarmer(own.usage, own.payments);
    out.set(f.id, { outstanding: l.outstanding, credit: l.credit });
  }
  return out;
}

/** The trail of every live payment of any farmer. */
export function vTrails(input: VInput): Map<string, VTrail> {
  const out = new Map<string, VTrail>();
  const ids = new Set(input.payments.filter((p) => p.deleted_at === null).map((p) => p.farmer_id));
  for (const id of ids) {
    const own = rowsOf(input, id);
    for (const t of vFarmer(own.usage, own.payments).trail) out.set(t.paymentId, t);
  }
  return out;
}

/** Every IST month and year that has a live row of an active farmer (the views the Dashboard can show). */
export function vPeriods(input: VInput): { months: string[]; years: string[] } {
  const keep = new Set(input.farmers.filter(active).map((f) => f.id));
  const months = new Set<string>();
  for (const r of input.usage) if (r.deleted_at === null && keep.has(r.farmer_id)) months.add(vMonth(vMs(r.used_at)));
  for (const r of input.payments) if (r.deleted_at === null && keep.has(r.farmer_id)) months.add(vMonth(vMs(r.paid_at)));
  const sorted = [...months].sort(compareText);
  return { months: sorted, years: [...new Set(sorted.map((m) => m.slice(0, 4)))] };
}
