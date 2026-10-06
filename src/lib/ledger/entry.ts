// The ONE implementation of the per-entry amount (L2, D7).
import { LedgerInputError } from './errors';
import { intDiv } from './money';

/** Entry amount in paise: floor((2 * total_minutes * rate_paise + 60) / 120), i.e. half-up to the paisa. */
export function entryAmountPaise(totalMinutes: number, ratePaise: number): number {
  if (!Number.isSafeInteger(totalMinutes) || totalMinutes <= 0) {
    throw new LedgerInputError('total_minutes must be a positive integer');
  }
  if (!Number.isSafeInteger(ratePaise) || ratePaise <= 0) {
    throw new LedgerInputError('rate_paise must be a positive integer');
  }
  const product = totalMinutes * ratePaise;
  const numerator = 2 * product + 60;
  if (!Number.isSafeInteger(product) || !Number.isSafeInteger(numerator)) {
    throw new LedgerInputError('entry amount is outside the safe integer range');
  }
  return intDiv(numerator, 120);
}
