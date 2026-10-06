// Private helpers shared by usageRules and paymentRules (not exported from the barrel):
// newest-first ordering, IST month filter and month lists. IST math comes from the engine.
import { istDateKey, istMonthKey, parseInstantMs } from '@/lib/ledger';

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** A new array, newest first by the instant `at(row)`, then id. */
export function sortNewestFirst<T extends { readonly id: string }>(rows: readonly T[], at: (row: T) => string): T[] {
  return [...rows].sort((a, b) => parseInstantMs(at(b)) - parseInstantMs(at(a)) || compareText(a.id, b.id));
}

/** IST month "YYYY-MM" of an ISO instant. */
export function monthOf(iso: string): string {
  return istMonthKey(parseInstantMs(iso));
}

/** IST day "YYYY-MM-DD" of an ISO instant, or null when the text is not a valid instant (never throws). */
export function dayOrNull(iso: string): string | null {
  try {
    return istDateKey(parseInstantMs(iso));
  } catch {
    return null;
  }
}

/** Distinct months plus the current month, newest first. */
export function monthsNewestFirst(monthKeys: readonly string[], currentMonthKey: string): string[] {
  return [...new Set([currentMonthKey, ...monthKeys])].sort((a, b) => compareText(b, a));
}
