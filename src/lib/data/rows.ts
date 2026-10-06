import { DataError, toDataError } from './errors';

export interface SingleResult<T> {
  readonly data: T | null;
  readonly error: unknown;
  readonly status?: number;
}

/**
 * The row of an insert or update that selected itself back. An update that matches 0 rows is not an
 * error in supabase-js; here it becomes `not_found`.
 */
export function oneRow<T>({ data, error, status }: SingleResult<T>): T {
  if (error) throw toDataError(error, status);
  if (data === null) throw new DataError('not_found', 'no_rows', 'no row matched');
  return data;
}
