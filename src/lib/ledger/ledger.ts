// One farmer's ledger: monthly buckets, FIFO waterfall, credit, trail and running balance
// (L4, L6, L7, L8, L9, L10, L17). All amounts are integer paise.
import { LedgerInputError } from './errors';
import { sumPaise } from './money';
import { compareRecords, liveUsageRecords, livePaymentRecords } from './records';
import type { PaymentRecord, UsageRecord } from './records';
import { compareMonthKeys } from './time';
import type {
  FarmerLedger,
  FarmerLedgerInput,
  LedgerOptions,
  LedgerRow,
  MonthRow,
  MonthStatus,
  PaymentTrail,
  TrailPiece,
} from './types';

/** C7. Status of a month from its charge, settled amount and cash received. */
export function monthStatus(chargePaise: number, paidPaise: number, cashPaise: number): MonthStatus {
  if (chargePaise > 0) {
    if (paidPaise === chargePaise) return 'settled';
    return paidPaise === 0 ? 'unpaid' : 'partial';
  }
  // Charge 0: either cash only ("Sirf Payment", D3) or entries that all rounded to 0 paise.
  return cashPaise > 0 ? 'payment_only' : 'settled';
}

export function assertCutoff(cutoffMs: number | undefined): void {
  if (cutoffMs !== undefined && (!Number.isSafeInteger(cutoffMs) || cutoffMs < 0)) {
    throw new LedgerInputError('cutoffMs must be a non-negative integer number of ms');
  }
}

function assertSingleFarmer(records: readonly (UsageRecord | PaymentRecord)[]): void {
  const first = records[0];
  if (first !== undefined && records.some((r) => r.farmerId !== first.farmerId)) {
    throw new LedgerInputError('one ledger must contain the rows of exactly one farmer');
  }
}

function assertUniqueIds(records: readonly (UsageRecord | PaymentRecord)[], what: string): void {
  const seen = new Set<string>();
  for (const r of records) {
    if (seen.has(r.id)) throw new LedgerInputError(`duplicate ${what} id among non-deleted rows`);
    seen.add(r.id);
  }
}

interface MonthAccumulator {
  readonly minutes: number[];
  readonly charges: number[];
  readonly cash: number[];
}

/**
 * The single ledger algorithm, on validated records. buildFarmerLedger and previewPayment both
 * call this, so a preview is exactly the ledger of the modified inputs.
 */
export function ledgerFromRecords(
  usageRecords: readonly UsageRecord[],
  paymentRecords: readonly PaymentRecord[],
  cutoffMs: number | undefined,
): FarmerLedger {
  assertCutoff(cutoffMs);
  assertSingleFarmer([...usageRecords, ...paymentRecords]);
  assertUniqueIds(usageRecords, 'usage');
  assertUniqueIds(paymentRecords, 'payment');

  // L9: as-of keeps rows stamped at or before the cutoff, in their current state.
  const inScope = (r: UsageRecord | PaymentRecord) => cutoffMs === undefined || r.atMs <= cutoffMs;
  const usage = usageRecords.filter(inScope).sort(compareRecords);
  const payments = paymentRecords.filter(inScope).sort(compareRecords);

  // L4 buckets and L10 cash, per IST month (L3). A month exists if it has usage or a payment (L11).
  const byMonth = new Map<string, MonthAccumulator>();
  const bucket = (monthKey: string): MonthAccumulator => {
    let acc = byMonth.get(monthKey);
    if (acc === undefined) {
      acc = { minutes: [], charges: [], cash: [] };
      byMonth.set(monthKey, acc);
    }
    return acc;
  };
  for (const u of usage) {
    const acc = bucket(u.monthKey);
    acc.minutes.push(u.totalMinutes);
    acc.charges.push(u.amountPaise);
  }
  for (const p of payments) bucket(p.monthKey).cash.push(p.amountPaise);
  const monthKeys = [...byMonth.keys()].sort(compareMonthKeys);

  const totalPaidPaise = sumPaise(payments.map((p) => p.amountPaise));
  const charges = monthKeys.map((key) => sumPaise(byMonth.get(key)?.charges ?? []));
  const chargesPaise = sumPaise(charges);
  // Bounds every later partial sum and difference (C5): |balance| <= charges + payments.
  sumPaise([chargesPaise, totalPaidPaise]);

  // L6 waterfall: paid_i = min(charge_i, max(0, P - sum of earlier charges)).
  let earlierCharges = 0;
  const months: MonthRow[] = monthKeys.map((monthKey, i) => {
    const acc = byMonth.get(monthKey) ?? { minutes: [], charges: [], cash: [] };
    const chargePaise = charges[i] ?? 0;
    const paidPaise = Math.min(chargePaise, Math.max(0, totalPaidPaise - earlierCharges));
    earlierCharges += chargePaise;
    const cashPaise = sumPaise(acc.cash);
    return {
      monthKey,
      totalMinutes: sumPaise(acc.minutes),
      chargePaise,
      paidPaise,
      remainingPaise: chargePaise - paidPaise,
      cashPaise,
      status: monthStatus(chargePaise, paidPaise, cashPaise),
      entryCount: acc.minutes.length,
      paymentCount: acc.cash.length,
    };
  });
  const outstandingPaise = sumPaise(months.map((row) => row.remainingPaise));
  const creditPaise = Math.max(0, totalPaidPaise - chargesPaise);

  // L7 trail: walk payments in order through the same waterfall over the CURRENT buckets.
  const chargeable = months.filter((row) => row.chargePaise > 0);
  let monthIndex = 0;
  let roomInMonth = chargeable[0]?.chargePaise ?? 0;
  const trail: PaymentTrail[] = payments.map((p) => {
    const pieces: TrailPiece[] = [];
    let left = p.amountPaise;
    while (left > 0 && monthIndex < chargeable.length) {
      const take = Math.min(left, roomInMonth);
      pieces.push({ monthKey: chargeable[monthIndex]?.monthKey ?? '', amountPaise: take });
      left -= take;
      roomInMonth -= take;
      if (roomInMonth === 0) {
        monthIndex += 1;
        roomInMonth = chargeable[monthIndex]?.chargePaise ?? 0;
      }
    }
    return { paymentId: p.id, paidAtMs: p.atMs, amountPaise: p.amountPaise, pieces, unappliedPaise: left };
  });

  // L17 running ledger: by instant, usage before payment on a tie, then created_at, then id (C4).
  const events = [...usage, ...payments].sort((a, b) => {
    if (a.atMs !== b.atMs) return a.atMs - b.atMs;
    if (a.kind !== b.kind) return a.kind === 'usage' ? -1 : 1;
    return compareRecords(a, b);
  });
  let balancePaise = 0;
  const rows: LedgerRow[] = events.map((e) => {
    balancePaise += e.kind === 'usage' ? e.amountPaise : -e.amountPaise;
    return {
      kind: e.kind,
      id: e.id,
      atMs: e.atMs,
      monthKey: e.monthKey,
      amountPaise: e.amountPaise,
      totalMinutes: e.kind === 'usage' ? e.totalMinutes : null,
      balancePaise,
    };
  });

  return {
    months,
    totals: {
      chargesPaise,
      totalPaidPaise,
      outstandingPaise,
      creditPaise,
      usageCount: usage.length,
      paymentCount: payments.length,
    },
    trail,
    rows,
  };
}

/** One farmer's ledger from raw rows (soft-deleted rows ignored). `cutoffMs` gives an as-of view (L9). */
export function buildFarmerLedger(input: FarmerLedgerInput, options: LedgerOptions = {}): FarmerLedger {
  return ledgerFromRecords(liveUsageRecords(input.usage), livePaymentRecords(input.payments), options.cutoffMs);
}
