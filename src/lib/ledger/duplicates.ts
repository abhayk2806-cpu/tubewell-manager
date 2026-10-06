// Duplicate WARNINGS (L14). Never a block, never a throw: bad timestamps simply do not match.
import { compareIds } from './records';
import { istDateKey, parseInstantMs } from './time';
import type { LedgerPayment, LedgerUsage } from './types';

export interface PaymentDuplicateCandidate {
  /** Set when editing, so the row is not reported as its own duplicate. */
  readonly id?: string;
  readonly farmer_id: string;
  readonly paid_at: string;
  readonly amount_paise: number;
}

export interface UsageDuplicateCandidate {
  readonly id?: string;
  readonly farmer_id: string;
  readonly used_at: string;
  readonly hours: number;
  readonly minutes: number;
}

function instantOrNull(text: string): number | null {
  try {
    return parseInstantMs(text);
  } catch {
    return null;
  }
}

function dayKeyOrNull(text: string): string | null {
  const ms = instantOrNull(text);
  return ms === null ? null : istDateKey(ms);
}

function byInstantThenId<T extends { readonly id: string }>(at: (row: T) => string) {
  return (a: T, b: T): number => {
    const am = instantOrNull(at(a)) ?? 0;
    const bm = instantOrNull(at(b)) ?? 0;
    return am !== bm ? am - bm : compareIds(a.id, b.id);
  };
}

/** Non-deleted payments with the same farmer, amount and IST day as the candidate, oldest first. */
export function findDuplicatePayments<T extends LedgerPayment>(
  candidate: PaymentDuplicateCandidate,
  existing: readonly T[],
): T[] {
  const day = dayKeyOrNull(candidate.paid_at);
  if (day === null) return [];
  return existing
    .filter(
      (row) =>
        row.deleted_at === null &&
        row.id !== candidate.id &&
        row.farmer_id === candidate.farmer_id &&
        row.amount_paise === candidate.amount_paise &&
        dayKeyOrNull(row.paid_at) === day,
    )
    .sort(byInstantThenId((row) => row.paid_at));
}

/** Non-deleted usage entries with the same farmer, IST day, hours and minutes, oldest first. */
export function findDuplicateUsage<T extends LedgerUsage>(candidate: UsageDuplicateCandidate, existing: readonly T[]): T[] {
  const day = dayKeyOrNull(candidate.used_at);
  if (day === null) return [];
  return existing
    .filter(
      (row) =>
        row.deleted_at === null &&
        row.id !== candidate.id &&
        row.farmer_id === candidate.farmer_id &&
        row.hours === candidate.hours &&
        row.minutes === candidate.minutes &&
        dayKeyOrNull(row.used_at) === day,
    )
    .sort(byInstantThenId((row) => row.used_at));
}
