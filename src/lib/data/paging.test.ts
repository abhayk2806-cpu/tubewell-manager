import { describe, expect, it } from 'vitest';
import { DataError } from './errors';
import { PAGE_SIZE, fetchAllRows } from './paging';
import type { PageResult } from './paging';

/**
 * A fake table of `total` rows. `serverCap` imitates a server that returns fewer rows than asked;
 * `count` overrides the exact count it reports. Every call is recorded as [from, to, withCount].
 */
function fakeTable(total: number, options: { serverCap?: number; count?: number | null } = {}) {
  const { serverCap = Number.POSITIVE_INFINITY } = options;
  const calls: [number, number, boolean][] = [];
  const fetchPage = (from: number, to: number, withCount: boolean): Promise<PageResult<number>> => {
    calls.push([from, to, withCount]);
    const end = Math.min(to + 1, total, from + serverCap);
    const data: number[] = [];
    for (let i = from; i < end; i += 1) data.push(i);
    const count = 'count' in options ? options.count : total;
    return Promise.resolve({ data, error: null, status: 200, count: withCount ? count : null });
  };
  return { fetchPage, calls };
}

const all = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('fetchAllRows', () => {
  it('uses 1,000-row pages by default', () => {
    expect(PAGE_SIZE).toBe(1000);
  });

  it.each([
    ['an empty table', 0],
    ['a small table', 9],
    ['exactly 1,000 rows', 1000],
  ])('%s: ONE request, asked with an exact count', async (_label, total) => {
    const table = fakeTable(total);
    expect(await fetchAllRows(table.fetchPage)).toEqual(all(total));
    expect(table.calls).toEqual([[0, 999, true]]);
  });

  it('more than 1,000 rows: the first page with the count, then the rest in parallel by range', async () => {
    const table = fakeTable(2500);
    const rows = await fetchAllRows(table.fetchPage);
    expect(rows).toEqual(all(2500));
    expect(table.calls).toEqual([
      [0, 999, true],
      [1000, 1999, false],
      [2000, 2499, false],
    ]);
  });

  it('the remaining pages are all asked before any of them answers (parallel, not sequential)', async () => {
    const asked: number[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const fetchPage = async (from: number, to: number, withCount: boolean): Promise<PageResult<number>> => {
      asked.push(from);
      if (!withCount) await gate;
      return { data: all(to + 1).slice(from), error: null, count: withCount ? 3500 : null };
    };
    const reading = fetchAllRows(fetchPage);
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toEqual([0, 1000, 2000, 3000]);
    release();
    expect(await reading).toHaveLength(3500);
  });

  it('a server cap smaller than the page size: the rest is read with the size the server returned', async () => {
    const table = fakeTable(2500, { serverCap: 1000 });
    const rows = await fetchAllRows(table.fetchPage, 1500);
    expect(rows).toEqual(all(2500));
    expect(table.calls).toEqual([
      [0, 1499, true],
      [1000, 1999, false],
      [2000, 2499, false],
    ]);
  });

  it('a server cap smaller than the page size on a small table still gives every row', async () => {
    const table = fakeTable(7, { serverCap: 3 });
    expect(await fetchAllRows(table.fetchPage)).toEqual(all(7));
    expect(table.calls).toEqual([
      [0, 999, true],
      [3, 5, false],
      [6, 6, false],
    ]);
  });

  it('count mismatch: more rows counted than received throws instead of truncating', async () => {
    await expect(fetchAllRows(fakeTable(5, { count: 8 }).fetchPage)).rejects.toMatchObject({ code: 'count_mismatch' });
    await expect(fetchAllRows(fakeTable(0, { count: 3 }).fetchPage)).rejects.toMatchObject({ code: 'count_mismatch' });
  });

  it('count mismatch: fewer rows counted than received throws', async () => {
    await expect(fetchAllRows(fakeTable(5, { count: 4 }).fetchPage, 10)).rejects.toMatchObject({ code: 'count_mismatch' });
  });

  it('count mismatch: a later page that comes back short throws', async () => {
    const fetchPage = (from: number, to: number, withCount: boolean): Promise<PageResult<number>> =>
      Promise.resolve({ data: withCount ? all(to + 1) : all(to + 1).slice(from, to), error: null, count: withCount ? 2500 : null });
    await expect(fetchAllRows(fetchPage)).rejects.toMatchObject({ kind: 'unknown', code: 'count_mismatch' });
  });

  it('a first page without an exact count throws', async () => {
    await expect(fetchAllRows(fakeTable(3, { count: null }).fetchPage)).rejects.toMatchObject({ code: 'no_count' });
  });

  it('a row that comes back twice (rows shifted while paging) throws', async () => {
    const fetchPage = (from: number, to: number, withCount: boolean): Promise<PageResult<number>> =>
      Promise.resolve({ data: all(to + 1).slice(Math.max(0, from - 1), to), error: null, count: withCount ? 4 : null });
    await expect(fetchAllRows(fetchPage, 2)).rejects.toMatchObject({ code: 'duplicate_row' });
  });

  it('turns an error on any page into a DataError', async () => {
    const fetchPage = (_from: number, _to: number, withCount: boolean): Promise<PageResult<number>> =>
      Promise.resolve(
        withCount ? { data: [1, 2, 3], error: null, count: 6 } : { data: null, error: { code: '42501', message: 'denied' }, status: 403 },
      );
    await expect(fetchAllRows(fetchPage, 3)).rejects.toMatchObject({ kind: 'permission', code: '42501' });
    const failsFirst = () => Promise.resolve({ data: null, error: { code: '42501', message: 'denied' }, status: 403 });
    await expect(fetchAllRows(failsFirst)).rejects.toMatchObject({ kind: 'permission' });
  });

  it('treats null data with a zero count as an empty table and rejects a page larger than asked', async () => {
    expect(await fetchAllRows(() => Promise.resolve({ data: null, error: null, count: 0 }), 3)).toEqual([]);
    const tooBig = () => Promise.resolve({ data: [1, 2, 3, 4], error: null, count: 4 });
    await expect(fetchAllRows(tooBig, 3)).rejects.toBeInstanceOf(DataError);
  });
});
