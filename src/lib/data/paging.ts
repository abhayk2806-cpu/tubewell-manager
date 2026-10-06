import { DataError, toDataError } from './errors';

/** Rows asked for per request. Paging never relies on the server's row cap (PostgREST default 1,000). */
export const PAGE_SIZE = 1000;

export interface PageResult<T> {
  readonly data: T[] | null;
  readonly error: unknown;
  readonly status?: number;
}

/**
 * Reads every row by asking for inclusive ranges [from, to] until a page comes back EMPTY.
 * The caller must give the query a stable, unique order (for example by id). A short page is not
 * treated as the end, so a server cap smaller than `pageSize` cannot silently truncate the list.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const from = rows.length;
    const { data, error, status } = await fetchPage(from, from + pageSize - 1);
    if (error) throw toDataError(error, status);
    const page = data ?? [];
    if (page.length > pageSize) {
      throw new DataError('unknown', 'page_overflow', `asked for ${pageSize} rows, got ${page.length}`);
    }
    if (page.length === 0) return rows;
    rows.push(...page);
  }
}
