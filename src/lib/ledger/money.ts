// Integer paise helpers (L15, C5, C10). No floats anywhere: amounts are safe integers.
import { LedgerInputError } from './errors';

/** Throws unless `value` is a safe integer (negative allowed: balances can be negative). */
export function assertPaise(value: unknown, what: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new LedgerInputError(`${what} must be a safe integer number of paise`);
  }
}

/** Floor division of a non-negative safe integer by a positive safe integer, exactly. */
export function intDiv(a: number, d: number): number {
  if (!Number.isSafeInteger(a) || a < 0) throw new LedgerInputError('intDiv: dividend must be a non-negative safe integer');
  if (!Number.isSafeInteger(d) || d <= 0) throw new LedgerInputError('intDiv: divisor must be a positive safe integer');
  return (a - (a % d)) / d;
}

/** Sum of paise values; every element and every partial sum must stay a safe integer. */
export function sumPaise(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    assertPaise(value, 'amount');
    total += value;
    if (!Number.isSafeInteger(total)) throw new LedgerInputError('sum of paise is outside the safe integer range');
  }
  return total;
}

const RUPEES_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Rupee text from a form ("358.33", "100.5", "007.5") to integer paise, without floats.
 * Accepts only ASCII digits with at most 2 decimals; no sign, spaces, grouping or exponent.
 */
export function parseRupeesToPaise(text: string): number {
  if (typeof text !== 'string') throw new LedgerInputError('rupee amount must be text');
  const match = RUPEES_PATTERN.exec(text);
  if (match === null) throw new LedgerInputError('rupee amount must look like 123 or 123.45');
  const rupees = match[1] ?? '';
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const digits = `${rupees}${fraction}`.replace(/^0+(?=\d)/, '');
  if (digits.length > 16 || BigInt(digits) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new LedgerInputError('rupee amount is too large');
  }
  return Number(digits);
}

/** The rupee sign U+20B9, built at runtime so engine sources stay ASCII. */
const RUPEE_SIGN = String.fromCharCode(0x20b9);

/** Indian digit grouping of a whole-number digit string: last 3 digits, then pairs ("12345678" -> "1,23,45,678"). */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const groups = [digits.slice(-3)];
  let rest = digits.slice(0, -3);
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  groups.unshift(rest);
  return groups.join(',');
}

/**
 * Display text for paise: rupee sign, Indian grouping, exactly 2 decimals, "-" before the sign for
 * negatives (e.g. 177500 -> "<rupee>1,775.00", -50 -> "-<rupee>0.50"). Built on paiseToDecimalString.
 */
export function formatRupees(paise: number): string {
  assertPaise(paise, 'paise');
  const plain = paiseToDecimalString(paise);
  const negative = plain.startsWith('-');
  const unsigned = negative ? plain.slice(1) : plain;
  const dot = unsigned.indexOf('.');
  return `${negative ? '-' : ''}${RUPEE_SIGN}${groupIndian(unsigned.slice(0, dot))}${unsigned.slice(dot)}`;
}

/** Paise to plain decimal rupees: exactly 2 decimals, "-" for negatives, no symbol or grouping. */
export function paiseToDecimalString(paise: number): string {
  assertPaise(paise, 'paise');
  const negative = paise < 0;
  const abs = negative ? -paise : paise;
  const rupees = intDiv(abs, 100);
  const rest = abs - rupees * 100;
  return `${negative ? '-' : ''}${rupees}.${rest < 10 ? '0' : ''}${rest}`;
}
