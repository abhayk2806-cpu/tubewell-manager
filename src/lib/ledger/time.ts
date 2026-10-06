// The ONE place for instants, IST keys and IST period boundaries (L3, C1-C3).
// IST is UTC+05:30 with no DST, so an IST wall clock is "epoch ms + offset" read with UTC getters.
import { LedgerInputError } from './errors';

export const IST_OFFSET_MS = 19_800_000;

/** Earliest accepted instant: the Unix epoch. */
const MIN_INSTANT_MS = 0;
/** Latest accepted instant: 9999-12-31 23:59:59.999 IST, so every IST key has a 4-digit year. */
const MAX_INSTANT_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999) - IST_OFFSET_MS;
const MIN_YEAR = 1970;
const MAX_YEAR = 9999;

// YYYY-MM-DDTHH:mm[:ss[.f{1,9}]] followed by Z or +hh:mm / -hh:mm (C1).
const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:(Z)|([+-])(\d{2}):(\d{2}))$/;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
const YEAR_KEY_PATTERN = /^(\d{4})$/;

export interface InstantRange {
  /** First millisecond of the period (inclusive). */
  readonly startMs: number;
  /** Last millisecond of the period (inclusive). */
  readonly endMs: number;
}

/** Epoch ms of a calendar date-time read as UTC, or null when the fields are not a real date. */
function utcFields(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number): number | null {
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return null;
  const value = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  const check = new Date(value);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return value;
}

function assertInstantMs(ms: number): void {
  if (!Number.isSafeInteger(ms) || ms < MIN_INSTANT_MS || ms > MAX_INSTANT_MS) {
    throw new LedgerInputError('instant must be an integer number of ms between 1970 and 9999');
  }
}

/**
 * ISO-8601 text with an explicit zone (Z or +hh:mm) to epoch ms. Naive and date-only text throws.
 * Fractions up to 9 digits are accepted; digits below the millisecond are truncated.
 */
export function parseInstantMs(text: string): number {
  if (typeof text !== 'string') throw new LedgerInputError('timestamp must be ISO-8601 text');
  const match = INSTANT_PATTERN.exec(text);
  if (match === null) {
    throw new LedgerInputError('timestamp must be ISO-8601 with a zone, e.g. 2026-05-10T10:00:00+05:30');
  }
  const [, y, mo, d, h, mi, s, fraction, zulu, sign, offH, offM] = match;
  const local = utcFields(
    Number(y),
    Number(mo),
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? '0'),
    Number((fraction ?? '').padEnd(3, '0').slice(0, 3)),
  );
  if (local === null) throw new LedgerInputError('timestamp is not a real calendar date-time');
  let offsetMs = 0;
  if (zulu === undefined) {
    const hours = Number(offH);
    const minutes = Number(offM);
    if (hours > 23 || minutes > 59) throw new LedgerInputError('timestamp zone offset is out of range');
    offsetMs = (hours * 60 + minutes) * 60_000 * (sign === '-' ? -1 : 1);
  }
  const instant = local - offsetMs;
  assertInstantMs(instant);
  return instant;
}

function istWallClock(ms: number): Date {
  assertInstantMs(ms);
  return new Date(ms + IST_OFFSET_MS);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** IST calendar year of an instant, "YYYY". */
export function istYearKey(ms: number): string {
  return String(istWallClock(ms).getUTCFullYear());
}

/** IST calendar month of an instant, "YYYY-MM" (L3). */
export function istMonthKey(ms: number): string {
  const wall = istWallClock(ms);
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}`;
}

/** IST calendar date of an instant, "YYYY-MM-DD". */
export function istDateKey(ms: number): string {
  const wall = istWallClock(ms);
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`;
}

/** IST clock time of an instant, "HH:mm" (24 hour; IST has no DST). */
export function istTimeKey(ms: number): string {
  const wall = istWallClock(ms);
  return `${pad2(wall.getUTCHours())}:${pad2(wall.getUTCMinutes())}`;
}

const TIME_TEXT_PATTERN = /^(\d{2}):(\d{2})$/;

/**
 * ISO text with the fixed IST offset for an IST date "YYYY-MM-DD" and clock time "HH:mm" typed by
 * the owner, e.g. "2026-10-06T14:05:00+05:30". Returns null (never throws) when the text is
 * malformed, the date does not exist or the time is outside 00:00-23:59. The result is verified by
 * a round trip through parseInstantMs, istDateKey and istTimeKey.
 */
export function istWallClockToIso(dateKey: string, timeText: string): string | null {
  if (typeof dateKey !== 'string' || typeof timeText !== 'string') return null;
  if (!isDateKey(dateKey)) return null;
  const match = TIME_TEXT_PATTERN.exec(timeText);
  if (match === null || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  const iso = `${dateKey}T${timeText}:00+05:30`;
  try {
    const ms = parseInstantMs(iso);
    return istDateKey(ms) === dateKey && istTimeKey(ms) === timeText ? iso : null;
  } catch {
    return null;
  }
}

export function isDateKey(key: string): boolean {
  const match = typeof key === 'string' ? DATE_KEY_PATTERN.exec(key) : null;
  return match !== null && utcFields(Number(match[1]), Number(match[2]), Number(match[3]), 0, 0, 0, 0) !== null;
}

export function isMonthKey(key: string): boolean {
  const match = typeof key === 'string' ? MONTH_KEY_PATTERN.exec(key) : null;
  return match !== null && utcFields(Number(match[1]), Number(match[2]), 1, 0, 0, 0, 0) !== null;
}

export function isYearKey(key: string): boolean {
  const match = typeof key === 'string' ? YEAR_KEY_PATTERN.exec(key) : null;
  return match !== null && Number(match[1]) >= MIN_YEAR && Number(match[1]) <= MAX_YEAR;
}

/** Last millisecond of IST day "YYYY-MM-DD" (23:59:59.999 IST): the as-of cutoff for that day (L9, C3). */
export function endOfIstDayMs(dateKey: string): number {
  if (!isDateKey(dateKey)) throw new LedgerInputError('day must be a real date written YYYY-MM-DD');
  const [y, mo, d] = dateKey.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, mo - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS;
}

/** Inclusive instant range of IST month "YYYY-MM". */
export function istMonthRangeMs(monthKey: string): InstantRange {
  if (!isMonthKey(monthKey)) throw new LedgerInputError('month must be written YYYY-MM');
  const [y, mo] = monthKey.split('-').map(Number) as [number, number];
  return {
    startMs: Date.UTC(y, mo - 1, 1) - IST_OFFSET_MS,
    endMs: Date.UTC(y, mo, 1) - IST_OFFSET_MS - 1,
  };
}

/** Inclusive instant range of IST year "YYYY". */
export function istYearRangeMs(yearKey: string): InstantRange {
  if (!isYearKey(yearKey)) throw new LedgerInputError('year must be written YYYY');
  const y = Number(yearKey);
  return {
    startMs: Date.UTC(y, 0, 1) - IST_OFFSET_MS,
    endMs: Date.UTC(y + 1, 0, 1) - IST_OFFSET_MS - 1,
  };
}

/** Ascending order of "YYYY-MM" keys, usable as an Array#sort comparator. */
export function compareMonthKeys(a: string, b: string): number {
  if (!isMonthKey(a) || !isMonthKey(b)) throw new LedgerInputError('month must be written YYYY-MM');
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
