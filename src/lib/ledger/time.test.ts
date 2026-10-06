import { describe, expect, it } from 'vitest';
import {
  LedgerInputError,
  compareMonthKeys,
  endOfIstDayMs,
  isMonthKey,
  istDateKey,
  istMonthKey,
  istMonthRangeMs,
  istYearKey,
  istYearRangeMs,
  parseInstantMs,
} from './index';

describe('parseInstantMs (C1)', () => {
  it('reads Z, +05:30 and -08:00 offsets as the same instant', () => {
    // 2026-05-31 18:40:00 UTC = 1780252800000 ms
    expect(parseInstantMs('2026-05-31T18:40:00Z')).toBe(1780252800000);
    expect(parseInstantMs('2026-06-01T00:10:00+05:30')).toBe(1780252800000);
    expect(parseInstantMs('2026-05-31T10:40:00-08:00')).toBe(1780252800000);
    expect(parseInstantMs('2026-05-31T18:40:00+00:00')).toBe(1780252800000);
    expect(parseInstantMs('2026-05-31T18:40:00-00:00')).toBe(1780252800000);
  });

  it('accepts fractions up to 9 digits; sub-millisecond digits are truncated', () => {
    expect(parseInstantMs('2026-05-31T18:40:00.123Z')).toBe(1780252800123);
    expect(parseInstantMs('2026-05-31T18:40:00.123456+00:00')).toBe(1780252800123);
    expect(parseInstantMs('2026-05-31T18:40:00.999999Z')).toBe(1780252800999);
    expect(parseInstantMs('2026-05-31T18:40:00.5Z')).toBe(1780252800500);
    expect(parseInstantMs('2026-05-31T18:40:00.123456789Z')).toBe(1780252800123);
  });

  it('accepts a timestamp without seconds', () => {
    expect(parseInstantMs('2026-05-31T18:40Z')).toBe(1780252800000);
  });

  it('epoch and an exact literal', () => {
    expect(parseInstantMs('1970-01-01T00:00:00Z')).toBe(0);
    expect(parseInstantMs('1970-01-01T05:30:00+05:30')).toBe(0);
  });

  it.each([
    ['naive date-time', '2026-05-31T18:40:00'],
    ['naive with fraction', '2026-05-31T18:40:00.123456'],
    ['date only', '2026-05-31'],
    ['empty', ''],
    ['space separator', '2026-05-31 18:40:00Z'],
    ['lowercase z', '2026-05-31T18:40:00z'],
    ['offset without colon', '2026-05-31T18:40:00+0530'],
    ['hour-only offset', '2026-05-31T18:40:00+05'],
    ['10 fraction digits', '2026-05-31T18:40:00.1234567890Z'],
    ['month 13', '2026-13-01T00:00:00Z'],
    ['30 February', '2026-02-30T00:00:00Z'],
    ['29 February in a common year', '2027-02-29T00:00:00Z'],
    ['hour 24', '2026-05-31T24:00:00Z'],
    ['second 60', '2026-05-31T23:59:60Z'],
    ['offset minutes 60', '2026-05-31T18:40:00+05:60'],
    ['before 1970', '1969-12-31T23:59:59Z'],
    ['leading space', ' 2026-05-31T18:40:00Z'],
    ['trailing text', '2026-05-31T18:40:00Zx'],
    ['RFC 2822 text', 'Sun, 31 May 2026 18:40:00 GMT'],
  ])('rejects %s', (_label, text) => {
    expect(() => parseInstantMs(text)).toThrow(LedgerInputError);
  });

  it('rejects non-strings', () => {
    expect(() => parseInstantMs(undefined as unknown as string)).toThrow(LedgerInputError);
    expect(() => parseInstantMs(1780252800000 as unknown as string)).toThrow(LedgerInputError);
  });
});

describe('IST keys (C2, E20, E24c)', () => {
  it('E20 boundaries', () => {
    expect(istMonthKey(parseInstantMs('2026-05-31T23:30:00+05:30'))).toBe('2026-05');
    expect(istMonthKey(parseInstantMs('2026-06-01T00:10:00+05:30'))).toBe('2026-06');
    expect(istMonthKey(parseInstantMs('2026-05-31T18:40:00Z'))).toBe('2026-06');
    expect(istMonthKey(parseInstantMs('2026-05-31T18:29:00Z'))).toBe('2026-05');
  });

  it('E24c year boundary', () => {
    const ms = parseInstantMs('2025-12-31T18:40:00Z');
    expect(istYearKey(ms)).toBe('2026');
    expect(istMonthKey(ms)).toBe('2026-01');
    expect(istDateKey(ms)).toBe('2026-01-01');
    expect(istYearKey(ms - 40 * 60_000 - 1)).toBe('2025');
  });

  it('day key flips exactly at 18:30:00.000Z', () => {
    expect(istDateKey(parseInstantMs('2026-05-31T18:29:59.999Z'))).toBe('2026-05-31');
    expect(istDateKey(parseInstantMs('2026-05-31T18:30:00.000Z'))).toBe('2026-06-01');
  });

  it('rejects non-integer or out-of-range ms', () => {
    expect(() => istMonthKey(1.5)).toThrow(LedgerInputError);
    expect(() => istMonthKey(-1)).toThrow(LedgerInputError);
    expect(() => istMonthKey(Number.NaN)).toThrow(LedgerInputError);
    expect(() => istMonthKey(Number.MAX_SAFE_INTEGER)).toThrow(LedgerInputError);
  });
});

describe('IST period boundaries (C3)', () => {
  it('end of an IST day is 23:59:59.999 IST', () => {
    expect(endOfIstDayMs('1970-01-01')).toBe(66_599_999);
    // 2026-05-31 23:59:59.999 IST = 2026-05-31 18:29:59.999 UTC
    expect(endOfIstDayMs('2026-05-31')).toBe(1780252199999);
    expect(endOfIstDayMs('2026-05-31') + 1).toBe(parseInstantMs('2026-06-01T00:00:00+05:30'));
  });

  it('month range is inclusive on both ends', () => {
    expect(istMonthRangeMs('2026-06')).toEqual({
      startMs: parseInstantMs('2026-06-01T00:00:00+05:30'),
      endMs: parseInstantMs('2026-06-30T23:59:59.999+05:30'),
    });
    expect(istMonthRangeMs('2026-12').endMs).toBe(parseInstantMs('2026-12-31T18:29:59.999Z'));
  });

  it('year range is inclusive on both ends', () => {
    expect(istYearRangeMs('2026')).toEqual({
      startMs: parseInstantMs('2025-12-31T18:30:00Z'),
      endMs: parseInstantMs('2026-12-31T18:29:59.999Z'),
    });
  });

  it('leap day 2028-02-29', () => {
    expect(endOfIstDayMs('2028-02-29')).toBe(parseInstantMs('2028-02-29T23:59:59.999+05:30'));
    expect(istMonthRangeMs('2028-02').endMs).toBe(endOfIstDayMs('2028-02-29'));
    expect(istDateKey(parseInstantMs('2028-02-29T00:00:00+05:30'))).toBe('2028-02-29');
    expect(istMonthRangeMs('2027-02').endMs).toBe(endOfIstDayMs('2027-02-28'));
    expect(() => endOfIstDayMs('2027-02-29')).toThrow(LedgerInputError);
    expect(() => endOfIstDayMs('2028-02-30')).toThrow(LedgerInputError);
  });

  it('rejects malformed keys', () => {
    for (const bad of ['2026-5-01', '2026-05-1', '20260501', '2026-05-01T00:00', '', '1969-12-31']) {
      expect(() => endOfIstDayMs(bad)).toThrow(LedgerInputError);
    }
    for (const bad of ['2026-13', '2026-00', '2026-1', '26-01', '1969-12', '2026-05-01']) {
      expect(() => istMonthRangeMs(bad)).toThrow(LedgerInputError);
      expect(isMonthKey(bad)).toBe(false);
    }
    for (const bad of ['26', '1969', '2026-01', '']) {
      expect(() => istYearRangeMs(bad)).toThrow(LedgerInputError);
    }
  });

  it('month ordering', () => {
    expect(compareMonthKeys('2025-12', '2026-01')).toBeLessThan(0);
    expect(compareMonthKeys('2026-01', '2026-01')).toBe(0);
    expect(compareMonthKeys('2026-10', '2026-09')).toBeGreaterThan(0);
    expect(['2026-10', '2025-12', '2026-02'].sort(compareMonthKeys)).toEqual(['2025-12', '2026-02', '2026-10']);
    expect(() => compareMonthKeys('2026-1', '2026-01')).toThrow(LedgerInputError);
  });
});
