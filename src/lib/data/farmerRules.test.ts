import { describe, expect, it } from 'vitest';
import {
  findDuplicateFarmerNames,
  matchesFarmerSearch,
  normalizeFarmerInput,
  sortFarmersByName,
  validateFarmerInput,
} from './farmerRules';

// Built at runtime so this file stays ASCII.
const NBSP = String.fromCharCode(0xa0);
const DEVANAGARI_RA = String.fromCharCode(0x0930);

function f(id: string, name: string, extra: { mobile?: string | null; deleted_at?: string | null } = {}) {
  return { id, name, mobile: extra.mobile ?? null, deleted_at: extra.deleted_at ?? null };
}

describe('normalizeFarmerInput', () => {
  it('trims all whitespace at both ends and collapses inner runs in the name', () => {
    expect(normalizeFarmerInput({ name: `\t ${NBSP}Ramu \t  Lal${NBSP}\n` }).name).toBe('Ramu Lal');
    expect(normalizeFarmerInput({ name: `Ramu${NBSP}${NBSP}Lal` }).name).toBe('Ramu Lal');
  });

  it('turns empty or blank mobile and notes into null, and trims them otherwise', () => {
    expect(normalizeFarmerInput({ name: 'A', mobile: '', notes: `  ${NBSP}\r\n` })).toEqual({ name: 'A', mobile: null, notes: null });
    expect(normalizeFarmerInput({ name: 'A' })).toEqual({ name: 'A', mobile: null, notes: null });
    expect(normalizeFarmerInput({ name: 'A', mobile: ' 98765 43210 ', notes: ' line 1\nline 2 ' })).toEqual({
      name: 'A',
      mobile: '98765 43210',
      notes: 'line 1\nline 2',
    });
  });

  it('a whitespace-only name becomes empty', () => {
    expect(normalizeFarmerInput({ name: `\t${NBSP}\n ` }).name).toBe('');
  });
});

describe('validateFarmerInput (same limits as migration 005)', () => {
  const ok = { name: 'Ramu', mobile: null, notes: null };

  it('accepts a valid input, a Devanagari name and boundary lengths', () => {
    expect(validateFarmerInput(ok)).toEqual([]);
    expect(validateFarmerInput({ ...ok, name: DEVANAGARI_RA.repeat(100) })).toEqual([]);
    expect(validateFarmerInput({ ...ok, name: 'a'.repeat(100), mobile: '9'.repeat(20), notes: 'n'.repeat(500) })).toEqual([]);
    expect(validateFarmerInput({ ...ok, mobile: '+91 98765-43210' })).toEqual([]);
  });

  it.each([
    [{ name: '' }, ['name_required']],
    [{ name: 'a'.repeat(101) }, ['name_too_long']],
    [{ name: DEVANAGARI_RA.repeat(101) }, ['name_too_long']],
    [{ mobile: '9'.repeat(21) }, ['mobile_invalid']],
    [{ mobile: '98765abc' }, ['mobile_invalid']],
    [{ mobile: '98765/43210' }, ['mobile_invalid']],
    [{ notes: 'n'.repeat(501) }, ['notes_too_long']],
    [{ mobile: '-' }, ['mobile_invalid']],
    [{ mobile: '+' }, ['mobile_invalid']],
    [{ mobile: '+ -' }, ['mobile_invalid']],
    [{ mobile: ' 9' }, []],
    [{ mobile: '98765 43210' }, []],
    [{ mobile: '9' }, []],
    [{ name: '', mobile: 'x', notes: 'n'.repeat(501) }, ['name_required', 'mobile_invalid', 'notes_too_long']],
  ])('%j -> %j', (patch, codes) => {
    expect(validateFarmerInput({ ...ok, ...patch })).toEqual(codes);
  });
});

describe('findDuplicateFarmerNames (warning only)', () => {
  const list = [
    f('1', 'Ramu Lal'),
    f('2', 'ramu  lal', { mobile: '111' }),
    f('3', 'Ramu Lal', { deleted_at: '2026-10-01T00:00:00Z' }),
    f('4', 'Shyam'),
  ];

  it('matches case-insensitively on the normalized name, ignoring deleted farmers', () => {
    expect(findDuplicateFarmerNames(`  RAMU${NBSP}LAL `, list).map((x) => x.id)).toEqual(['1', '2']);
  });

  it('excludes the farmer being edited', () => {
    expect(findDuplicateFarmerNames('Ramu Lal', list, { excludeId: '1' }).map((x) => x.id)).toEqual(['2']);
  });

  it('returns nothing for a new or blank name, and never throws', () => {
    expect(findDuplicateFarmerNames('Mohan', list)).toEqual([]);
    expect(findDuplicateFarmerNames('   ', list)).toEqual([]);
    expect(findDuplicateFarmerNames('Ramu', [])).toEqual([]);
  });
});

describe('sortFarmersByName', () => {
  it('sorts ignoring case, then by id for ties, without mutating the input', () => {
    const input = [f('b', 'ramu'), f('c', 'Amar'), f('a', 'Ramu'), f('d', 'mohan')];
    expect(sortFarmersByName(input).map((x) => x.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(input.map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('matchesFarmerSearch', () => {
  const farmer = f('1', 'Ramu Lal', { mobile: '98765 43210' });

  it('matches name or mobile, case-insensitive, after trimming the search text', () => {
    expect(matchesFarmerSearch(farmer, '  ramu ')).toBe(true);
    expect(matchesFarmerSearch(farmer, 'LAL')).toBe(true);
    expect(matchesFarmerSearch(farmer, '43210')).toBe(true);
    expect(matchesFarmerSearch(farmer, 'shyam')).toBe(false);
  });

  it('empty or blank text matches everyone; a farmer without mobile matches by name only', () => {
    expect(matchesFarmerSearch(farmer, '')).toBe(true);
    expect(matchesFarmerSearch(farmer, '   ')).toBe(true);
    expect(matchesFarmerSearch(f('2', 'Shyam'), '987')).toBe(false);
  });
});
