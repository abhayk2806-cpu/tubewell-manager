// Pure Kisan ka Hisaab (farmer profile) rules: no I/O and no second algorithm. Every figure is a
// field of ONE buildFarmerLedger call on the farmer's own rows (L17); this module only selects,
// joins, orders and splits a signed balance into a kind plus an absolute amount for display.
import { LedgerInputError, buildFarmerLedger, isActiveFarmer, sumPaise } from '@/lib/ledger';
import type { FarmerTotals, MonthRow, TrailPiece } from '@/lib/ledger';
import type { PaymentRowLike } from './paymentRules';
import { classifyPayments } from './paymentRules';
import { classifyUsage, usageAmountPaise } from './usageRules';
import type { UsageRowLike } from './usageRules';
import { splitMinutes } from './timeline';

/** Long histories show this many rows at first, then this many more per "Aur dikhao". */
export const PROFILE_PAGE_SIZE = 30;

export interface ProfileMonth extends MonthRow {
  /** Whole hours and the remaining minutes of `totalMinutes` (integer division), for display. */
  readonly hours: number;
  readonly minutes: number;
}

export interface ProfilePayment<P> {
  readonly row: P;
  /** The engine trail of this payment: plain months, oldest first, possibly later months (D5). */
  readonly pieces: readonly TrailPiece[];
  /** Shown as "Advance / Credit" when above zero (D5). */
  readonly unappliedPaise: number;
}

export interface ProfileUsage<U> {
  readonly row: U;
  /** The entry amount from the engine's one rounding (usageAmountPaise -> entryAmountPaise). */
  readonly amountPaise: number;
}

/** A running balance as a kind plus a NON-negative amount, so the UI never handles a sign. */
export interface ProfileBalance {
  readonly kind: 'baaki' | 'advance' | 'zero';
  readonly amountPaise: number;
}

export interface ProfileLedgerLine {
  readonly kind: 'usage' | 'payment';
  readonly id: string;
  readonly atMs: number;
  readonly monthKey: string;
  readonly amountPaise: number;
  readonly totalMinutes: number | null;
  /** The running balance AFTER this line (L17): charges so far minus payments so far. */
  readonly balance: ProfileBalance;
}

/** Pani time: the sum of the engine's month minutes, split for display. */
export interface ProfileTime {
  readonly totalMinutes: number;
  readonly hours: number;
  readonly minutes: number;
}

export interface FarmerProfile<U, P> {
  /** The engine totals; outstanding and credit stay two separate figures (E18). */
  readonly totals: FarmerTotals;
  /** Total Pani time of all months (Phase PR1, D32). */
  readonly time: ProfileTime;
  /** Every month with usage or payments, newest first (L11). */
  readonly months: readonly ProfileMonth[];
  /** Live payments, newest first, each with its allocation trail. */
  readonly payments: readonly ProfilePayment<P>[];
  /** Live usage entries, newest first, each with its amount. */
  readonly usage: readonly ProfileUsage<U>[];
  /** The chronological ledger, newest first, each line with its running balance. */
  readonly ledger: readonly ProfileLedgerLine[];
}

export type FarmerProfileResult<U, P> = { readonly ok: true; readonly profile: FarmerProfile<U, P> } | { readonly ok: false };

/** Splits a signed running balance (paise) into a display kind and an absolute amount. */
export function toProfileBalance(balancePaise: number): ProfileBalance {
  if (balancePaise > 0) return { kind: 'baaki', amountPaise: balancePaise };
  if (balancePaise < 0) return { kind: 'advance', amountPaise: -balancePaise };
  return { kind: 'zero', amountPaise: 0 };
}

/**
 * The profile of one farmer from rows of ANY farmer and any state. Bad data (the engine throws
 * LedgerInputError) gives { ok: false }: nothing is fixed silently. Other errors are re-thrown.
 */
export function buildFarmerProfile<U extends UsageRowLike, P extends PaymentRowLike>(request: {
  readonly farmerId: string;
  readonly usageRows: readonly U[];
  readonly paymentRows: readonly P[];
}): FarmerProfileResult<U, P> {
  const usageRows = request.usageRows.filter((r) => r.farmer_id === request.farmerId);
  const paymentRows = request.paymentRows.filter((r) => r.farmer_id === request.farmerId);
  try {
    const ledger = buildFarmerLedger({ usage: usageRows, payments: paymentRows });
    const trailById = new Map(ledger.trail.map((t) => [t.paymentId, t]));

    const payments = classifyPayments(paymentRows).live.map((row) => {
      const trail = trailById.get(row.id);
      if (trail === undefined) throw new Error(`engine trail missing for payment ${row.id}`);
      return { row, pieces: trail.pieces, unappliedPaise: trail.unappliedPaise };
    });
    const usage = classifyUsage(usageRows).live.map((row) => ({ row, amountPaise: usageAmountPaise(row) }));
    const months = [...ledger.months].reverse().map((m) => ({ ...m, ...splitMinutes(m.totalMinutes) }));
    const totalMinutes = sumPaise(ledger.months.map((m) => m.totalMinutes));
    const lines = [...ledger.rows].reverse().map((r) => ({
      kind: r.kind,
      id: r.id,
      atMs: r.atMs,
      monthKey: r.monthKey,
      amountPaise: r.amountPaise,
      totalMinutes: r.totalMinutes,
      balance: toProfileBalance(r.balancePaise),
    }));
    return { ok: true, profile: { totals: ledger.totals, time: { totalMinutes, ...splitMinutes(totalMinutes) }, months, payments, usage, ledger: lines } };
  } catch (error) {
    if (error instanceof LedgerInputError) return { ok: false };
    throw error;
  }
}

export type ProfileFarmerLookup<F> =
  | { readonly kind: 'active'; readonly farmer: F }
  | { readonly kind: 'disabled'; readonly farmer: F }
  | { readonly kind: 'not_found' };

/** The farmer a profile is for: active, disabled (Band), or not found (unknown or soft-deleted). */
export function findProfileFarmer<F extends { readonly id: string; readonly is_disabled: boolean; readonly deleted_at: string | null }>(
  farmers: readonly F[],
  farmerId: string,
): ProfileFarmerLookup<F> {
  const farmer = farmers.find((f) => f.id === farmerId);
  if (farmer === undefined || farmer.deleted_at !== null) return { kind: 'not_found' };
  return isActiveFarmer(farmer) ? { kind: 'active', farmer } : { kind: 'disabled', farmer };
}

export interface VisiblePart<T> {
  readonly visible: T[];
  /** How many rows are still hidden behind "Aur dikhao". */
  readonly hidden: number;
}

/** The first `shown` rows and how many are still hidden. */
export function visiblePart<T>(rows: readonly T[], shown: number): VisiblePart<T> {
  const visible = rows.slice(0, shown);
  return { visible, hidden: rows.length - visible.length };
}

/** The next "shown" count after one "Aur dikhao": PROFILE_PAGE_SIZE more, at most `total`. */
export function nextShownCount(total: number, shown: number): number {
  return Math.min(total, shown + PROFILE_PAGE_SIZE);
}
