/** The DOM id of a month card: the target of a `?month=` deep link scroll (Polish PL1). */
export function monthCardId(monthKey: string): string {
  return `month-card-${monthKey}`;
}
