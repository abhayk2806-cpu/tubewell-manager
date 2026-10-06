/**
 * Thrown when the engine receives input it must not compute with: a malformed timestamp,
 * a non-integer or unsafe amount, a row that breaks a DB invariant, or rows of two farmers
 * mixed into one ledger. Callers (the data layer) treat it as a data bug, not a user error.
 * Form-level problems are reported by validation.ts as codes, never thrown.
 */
export class LedgerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerInputError';
  }
}
