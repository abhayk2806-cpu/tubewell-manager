import { describe, expect, it } from 'vitest';
import { LedgerInputError, entryAmountPaise } from './index';

/** Reference from the spec's Clarifications: q, r of total_minutes x rate_paise / 60; if 2r >= 60 then q + 1. */
function reference(totalMinutes: number, ratePaise: number): bigint {
  const exact = BigInt(totalMinutes) * BigInt(ratePaise);
  const q = exact / 60n;
  const r = exact % 60n;
  return 2n * r >= 60n ? q + 1n : q;
}

describe('entryAmountPaise (L2, D7)', () => {
  it('E22 table', () => {
    expect(entryAmountPaise(215, 10000)).toBe(35833);
    expect(entryAmountPaise(265, 10000)).toBe(44167);
    expect(entryAmountPaise(10, 10000)).toBe(1667);
    expect(entryAmountPaise(1, 10050)).toBe(168);
    expect(entryAmountPaise(3, 10010)).toBe(501);
    expect(entryAmountPaise(1, 10030)).toBe(167);
  });

  it('D7 sweep: 1,484,640 combinations match the BigInt reference', () => {
    const rates: number[] = [];
    for (let r = 1; r <= 1000; r += 1) rates.push(r);
    for (let r = 9990; r <= 10020; r += 1) rates.push(r);
    let checked = 0;
    let mismatches = 0;
    for (let tm = 1; tm <= 1440; tm += 1) {
      for (const rate of rates) {
        checked += 1;
        if (BigInt(entryAmountPaise(tm, rate)) !== reference(tm, rate)) mismatches += 1;
      }
    }
    expect(checked).toBe(1_484_640);
    expect(mismatches).toBe(0);
  });

  it('large values near the safe-integer limit', () => {
    const cases: [number, number][] = [
      // the largest rate for which 2 * total_minutes * rate + 60 is still a safe integer
      [1, 4503599627370465],
      [60, 75059993789507],
      [1440, 3127499741229],
      [9999, 450405003237],
    ];
    for (const [tm, rate] of cases) {
      expect(BigInt(entryAmountPaise(tm, rate))).toBe(reference(tm, rate));
    }
    expect(() => entryAmountPaise(1, 4503599627370466)).toThrow(LedgerInputError);
    expect(() => entryAmountPaise(60, 75059993789508)).toThrow(LedgerInputError);
    expect(() => entryAmountPaise(2, Number.MAX_SAFE_INTEGER)).toThrow(LedgerInputError);
  });

  it('can round to zero paise', () => {
    expect(entryAmountPaise(1, 1)).toBe(0);
    expect(entryAmountPaise(1, 30)).toBe(1); // 0.5 paise rounds up
    expect(entryAmountPaise(1, 29)).toBe(0);
  });

  it.each([
    [0, 10000],
    [-1, 10000],
    [1.5, 10000],
    [10, 0],
    [10, -100],
    [10, 100.5],
    [Number.NaN, 10000],
  ])('rejects total_minutes=%d rate_paise=%d', (tm, rate) => {
    expect(() => entryAmountPaise(tm, rate)).toThrow(LedgerInputError);
  });
});
