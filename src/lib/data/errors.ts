// One error type for every data-layer failure. supabase-js RETURNS errors instead of throwing,
// so every call checks `error` and converts it here.

export type DataErrorKind = 'network' | 'permission' | 'constraint' | 'not_found' | 'unknown';

export class DataError extends Error {
  readonly kind: DataErrorKind;
  /** Postgres SQLSTATE, PostgREST code (PGRST...) or a data-layer code; null when there is none. */
  readonly code: string | null;

  constructor(kind: DataErrorKind, code: string | null, message: string) {
    super(message);
    this.name = 'DataError';
    this.kind = kind;
    this.code = code;
  }
}

// Postgres integrity / data errors: check, not null, unique, foreign key, string too long.
const CONSTRAINT_CODES = new Set(['23514', '23502', '23505', '23503', '22001']);
// RLS / privilege, invalid authorization, PostgREST JWT errors.
const PERMISSION_CODES = new Set(['42501', '28000', '28P01', 'PGRST301', 'PGRST302', 'PGRST303']);
const NETWORK_MESSAGE = /failed to fetch|fetch failed|networkerror|network request failed|load failed/i;

interface ErrorLike {
  readonly code?: unknown;
  readonly message?: unknown;
}

function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === 'object' && value !== null;
}

/**
 * Converts whatever supabase-js returned (PostgrestError, AuthError, a thrown fetch error) into a
 * DataError. `status` is the HTTP status from the response when known (0 = no response).
 */
export function toDataError(error: unknown, status?: number): DataError {
  if (error instanceof DataError) return error;
  const code = isErrorLike(error) && typeof error.code === 'string' && error.code !== '' ? error.code : null;
  const message = isErrorLike(error) && typeof error.message === 'string' ? error.message : String(error);

  if (code !== null && CONSTRAINT_CODES.has(code)) return new DataError('constraint', code, message);
  if (code !== null && PERMISSION_CODES.has(code)) return new DataError('permission', code, message);
  if (code === 'PGRST116') return new DataError('not_found', code, message);
  if (status === 401 || status === 403) return new DataError('permission', code, message);
  if (status === 0 || NETWORK_MESSAGE.test(message)) return new DataError('network', code, message);
  return new DataError('unknown', code, message);
}
