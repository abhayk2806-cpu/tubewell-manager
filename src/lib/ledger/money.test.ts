import { describe, expect, it } from 'vitest';
import { LedgerInputError, assertPaise, intDiv, paiseToDecimalString, parseRupeesToPaise, sumPaise } from './index';
import { randInt, seeded } from './test-support/random';

const MAX = Number.MAX_SAFE_INTEGER; // 9007199254740991

describe('parseRupeesToPaise', () => {
  it.each([
    ['358.33', 35833],
    ['100.5', 10050],
    ['0.1', 10],
    ['100.30', 10030],
    ['0', 0],
    ['007.5', 750],
    ['1', 100],
    ['0.01', 1],
    ['90071992547409.91', MAX],
  ])('%s -> %i paise', (text, paise) => {
    expect(parseRupeesToPaise(text)).toBe(paise);
  });

  it.each([
    '',
    ' ',
    '1e3',
    '-5',
    '+5',
    '1,000',
    '100.555',
    '1.',
    '.5',
    'abc',
    ' 5',
    '5 ',
    '90071992547409.92',
    '99999999999999999999',
    '0x10',
    'Infinity',
    'NaN',
  ])('rejects %j', (text) => {
    expect(() => parseRupeesToPaise(text)).toThrow(LedgerInputError);
  });

  it('rejects non-ASCII digits and non-strings', () => {
    // Devanagari digit five, built at runtime so this file stays ASCII.
    expect(() => parseRupeesToPaise(String.fromCharCode(0x096b))).toThrow(LedgerInputError);
    expect(() => parseRupeesToPaise(5 as unknown as string)).toThrow(LedgerInputError);
  });
});

describe('paiseToDecimalString', () => {
  it.each([
    [127500, '1275.00'],
    [5, '0.05'],
    [0, '0.00'],
    [-0, '0.00'],
    [-5, '-0.05'],
    [-127500, '-1275.00'],
    [35833, '358.33'],
    [100, '1.00'],
    [MAX, '90071992547409.91'],
    [-MAX, '-90071992547409.91'],
  ])('%i -> %s', (paise, text) => {
    expect(paiseToDecimalString(paise)).toBe(text);
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, MAX + 1, -(MAX + 1)])('rejects %d', (value) => {
    expect(() => paiseToDecimalString(value)).toThrow(LedgerInputError);
  });

  it('round-trips with parseRupeesToPaise over 1,000+ samples', () => {
    const rng = seeded(20261006);
    const samples = [0, 1, 9, 10, 99, 100, 101, 999, 1000, 35833, MAX, MAX - 1, MAX - 99, MAX - 100, MAX - 101];
    for (let i = 0; i < 1000; i += 1) {
      const digits = randInt(rng, 1, 15);
      samples.push(randInt(rng, 0, 10 ** digits - 1));
    }
    expect(samples.length).toBeGreaterThanOrEqual(1000);
    for (const paise of samples) {
      expect(parseRupeesToPaise(paiseToDecimalString(paise))).toBe(paise);
    }
  });
});

describe('integer helpers (C5)', () => {
  it('intDiv floors non-negative integers without float division', () => {
    expect(intDiv(7, 2)).toBe(3);
    expect(intDiv(0, 5)).toBe(0);
    expect(intDiv(MAX, 1)).toBe(MAX);
    expect(intDiv(MAX, 120)).toBe(75059993789508);
    expect(() => intDiv(-1, 2)).toThrow(LedgerInputError);
    expect(() => intDiv(1, 0)).toThrow(LedgerInputError);
    expect(() => intDiv(1.5, 2)).toThrow(LedgerInputError);
  });

  it('sumPaise checks every element and every partial sum', () => {
    expect(sumPaise([])).toBe(0);
    expect(sumPaise([1, 2, -3])).toBe(0);
    expect(sumPaise([MAX - 1, 1])).toBe(MAX);
    expect(() => sumPaise([MAX, 1])).toThrow(LedgerInputError);
    expect(() => sumPaise([1, 0.5])).toThrow(LedgerInputError);
  });

  it('assertPaise accepts safe integers only', () => {
    expect(() => assertPaise(0, 'x')).not.toThrow();
    expect(() => assertPaise(-5, 'x')).not.toThrow();
    expect(() => assertPaise(1.25, 'x')).toThrow(LedgerInputError);
    expect(() => assertPaise('5', 'x')).toThrow(LedgerInputError);
    expect(() => assertPaise(MAX + 1, 'x')).toThrow(LedgerInputError);
  });
});
