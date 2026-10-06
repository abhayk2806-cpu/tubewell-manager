import { describe, expect, it } from 'vitest';
import { LedgerInputError, formatRupees, paiseToDecimalString } from './index';
import { randInt, seeded } from './test-support/random';

// Built at runtime so this file stays ASCII.
const R = String.fromCharCode(0x20b9);

describe('formatRupees', () => {
  it.each([
    [0, `${R}0.00`],
    [5, `${R}0.05`],
    [99999, `${R}999.99`],
    [100000, `${R}1,000.00`],
    [177500, `${R}1,775.00`],
    [10000000, `${R}1,00,000.00`],
    [1234567890, `${R}1,23,45,678.90`],
    [-50, `-${R}0.50`],
    [-0, `${R}0.00`],
    [12345, `${R}123.45`],
    [Number.MAX_SAFE_INTEGER, `${R}9,00,71,99,25,47,409.91`],
  ])('%i -> %s', (paise, text) => {
    expect(formatRupees(paise)).toBe(text);
  });

  it('round-trips with paiseToDecimalString over 1,000 samples', () => {
    const rng = seeded(4242);
    for (let i = 0; i < 1000; i += 1) {
      const magnitude = randInt(rng, 0, 10 ** randInt(rng, 1, 15));
      const paise = rng() < 0.2 ? -magnitude : magnitude;
      const plain = formatRupees(paise).replace('-', '').replace(R, '').replace(/,/g, '');
      expect(paise < 0 ? `-${plain}` : plain).toBe(paiseToDecimalString(paise));
    }
  });

  it('asserts a safe integer', () => {
    for (const bad of [0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => formatRupees(bad)).toThrow(LedgerInputError);
    }
  });
});
