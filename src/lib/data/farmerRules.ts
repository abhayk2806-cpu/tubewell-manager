// Pure farmer form rules (no I/O). The limits match migration 005's CHECK constraints.

export const FARMER_NAME_MAX = 100;
export const FARMER_MOBILE_MAX = 20;
export const FARMER_NOTES_MAX = 500;

/** What the form collects, before normalization. */
export interface FarmerFormValues {
  readonly name: string;
  readonly mobile?: string | null;
  readonly notes?: string | null;
}

/** Normalized values, as they are written to the database. */
export interface FarmerInput {
  readonly name: string;
  readonly mobile: string | null;
  readonly notes: string | null;
}

export type FarmerValidationCode = 'name_required' | 'name_too_long' | 'mobile_invalid' | 'notes_too_long';

/** The farmer fields the list rules read. DB rows are assignable to it. */
export interface FarmerLike {
  readonly id: string;
  readonly name: string;
  readonly mobile: string | null;
  readonly deleted_at: string | null;
}

// String#trim removes all Unicode whitespace at both ends, including NBSP, tab, CR and LF.
function trimToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** Name: trimmed, inner whitespace runs collapsed to one space. Mobile and notes: trimmed, empty becomes null. */
export function normalizeFarmerInput(values: FarmerFormValues): FarmerInput {
  return {
    name: values.name.trim().replace(/\s+/g, ' '),
    mobile: trimToNull(values.mobile),
    notes: trimToNull(values.notes),
  };
}

/** Length in characters (code points), the way Postgres char_length counts. */
function charLength(value: string): number {
  return [...value].length;
}

const MOBILE_PATTERN = /^[0-9 +-]+$/;

/** Error codes for a NORMALIZED input, in field order. Empty means valid. */
export function validateFarmerInput(input: FarmerInput): FarmerValidationCode[] {
  const codes: FarmerValidationCode[] = [];
  if (input.name === '') codes.push('name_required');
  else if (charLength(input.name) > FARMER_NAME_MAX) codes.push('name_too_long');
  if (input.mobile !== null && (!MOBILE_PATTERN.test(input.mobile) || charLength(input.mobile) > FARMER_MOBILE_MAX)) {
    codes.push('mobile_invalid');
  }
  if (input.notes !== null && charLength(input.notes) > FARMER_NOTES_MAX) codes.push('notes_too_long');
  return codes;
}

function nameKey(name: string): string {
  return normalizeFarmerInput({ name }).name.toLowerCase();
}

/**
 * Farmers that are NOT deleted (active or disabled) whose normalized name equals the candidate's,
 * ignoring case. Two farmers may share a name (owner decision 2026-10-06): this only feeds a warning.
 */
export function findDuplicateFarmerNames<T extends FarmerLike>(
  candidateName: string,
  existing: readonly T[],
  options: { readonly excludeId?: string } = {},
): T[] {
  const key = nameKey(candidateName);
  if (key === '') return [];
  return existing.filter((f) => f.deleted_at === null && f.id !== options.excludeId && nameKey(f.name) === key);
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** A new array sorted by name ignoring case, then by id so ties are stable. */
export function sortFarmersByName<T extends FarmerLike>(farmers: readonly T[]): T[] {
  return [...farmers].sort((a, b) => compareText(a.name.toLowerCase(), b.name.toLowerCase()) || compareText(a.id, b.id));
}

/** Case-insensitive substring match on name and mobile. Empty (or blank) search text matches every farmer. */
export function matchesFarmerSearch(farmer: FarmerLike, text: string): boolean {
  const query = text.trim().toLowerCase();
  if (query === '') return true;
  return farmer.name.toLowerCase().includes(query) || (farmer.mobile ?? '').toLowerCase().includes(query);
}
