import { DataError, toDataError } from './errors';

/** Rows asked for per request. Paging never relies on the server's row cap (PostgREST default 1,000). */
export const PAGE_SIZE = 1000;

export interface PageResult<T> {
  readonly data: T[] | null;
  readonly error: unknown;
  readonly status?: number;
  /** The exact row count of the whole query; asked for on the first page only. */
  readonly count?: number | null;
}

/**
 * Reads every row in ONE request for a table of up to `pageSize` rows (FIX-1): the first page is
 * asked with an exact count (`withCount`), and any remaining pages are then fetched in parallel by
 * inclusive range [from, to]. The caller must give the query a stable, unique order (for example by
 * id). Nothing is truncated silently: when the server returns fewer rows than asked (a server cap
 * smaller than `pageSize`), the remaining pages use the size the server returned; and the rows
 * received must equal the count, with no row twice (`keyOf`), otherwise a DataError is thrown.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
  keyOf: (row: T) => unknown = (row) => row,
): Promise<T[]> {
  const checked = ({ data, error, status }: PageResult<T>, asked: number): T[] => {
    if (error) throw toDataError(error, status);
    const page = data ?? [];
    if (page.length > asked) throw new DataError('unknown', 'page_overflow', `asked for ${asked} rows, got ${page.length}`);
    return page;
  };

  const first = await fetchPage(0, pageSize - 1, true);
  const firstRows = checked(first, pageSize);
  const total = first.count;
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
    throw new DataError('unknown', 'no_count', 'the first page came back without an exact row count');
  }
  if (total > 0 && firstRows.length === 0) throw new DataError('unknown', 'count_mismatch', `count ${total}, but the first page was empty`);

  // The server may cap a page below pageSize: continue with the size it actually returned.
  const step = firstRows.length < Math.min(total, pageSize) ? firstRows.length : pageSize;
  const ranges: [number, number][] = [];
  for (let from = firstRows.length; from < total; from += step) ranges.push([from, Math.min(from + step, total) - 1]);
  const pages = await Promise.all(ranges.map(([from, to]) => fetchPage(from, to, false).then((page) => checked(page, to - from + 1))));

  const rows = [...firstRows, ...pages.flat()];
  if (rows.length !== total) throw new DataError('unknown', 'count_mismatch', `count ${total}, received ${rows.length} rows`);
  if (new Set(rows.map(keyOf)).size !== rows.length) throw new DataError('unknown', 'duplicate_row', 'a row came back twice while paging');
  return rows;
}
