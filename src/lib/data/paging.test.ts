import { describe, expect, it } from 'vitest';
import { DataError } from './errors';
import { PAGE_SIZE, fetchAllRows } from './paging';
import type { PageResult } from './paging';

/** A fake table of `total` rows; `serverCap` imitates a server that returns fewer rows than asked. */
function fakeTable(total: number, serverCap = Number.POSITIVE_INFINITY) {
  const ranges: [number, number][] = [];
  const fetchPage = (from: number, to: number): Promise<PageResult<number>> => {
    ranges.push([from, to]);
    const end = Math.min(to + 1, total, from + serverCap);
    const data: number[] = [];
    for (let i = from; i < end; i += 1) data.push(i);
    return Promise.resolve({ data, error: null, status: 200 });
  };
  return { fetchPage, ranges };
}

describe('fetchAllRows', () => {
  it('uses 1,000-row pages by default', () => {
    expect(PAGE_SIZE).toBe(1000);
  });

  it.each([
    ['empty table', 0, [[0, 2]]],
    ['below the page size', 2, [[0, 2], [2, 4]]],
    ['exactly the page size', 3, [[0, 2], [3, 5]]],
    ['above the page size', 7, [[0, 2], [3, 5], [6, 8], [7, 9]]],
  ] as const)('%s: reads every row and stops only at an empty page', async (_label, total, ranges) => {
    const table = fakeTable(total);
    const rows = await fetchAllRows(table.fetchPage, 3);
    expect(rows).toEqual(Array.from({ length: total }, (_, i) => i));
    expect(table.ranges).toEqual(ranges);
  });

  it('does not rely on the server cap: a server returning fewer rows than asked still gives every row', async () => {
    const table = fakeTable(2500, 1000);
    const rows = await fetchAllRows(table.fetchPage, 1500);
    expect(rows).toHaveLength(2500);
    expect(new Set(rows).size).toBe(2500);
  });

  it('reads 2,500 rows with the default page size in 4 requests', async () => {
    const table = fakeTable(2500);
    expect(await fetchAllRows(table.fetchPage)).toHaveLength(2500);
    expect(table.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]]);
  });

  it('turns an error on any page into a DataError', async () => {
    let calls = 0;
    const fetchPage = (): Promise<PageResult<number>> => {
      calls += 1;
      return Promise.resolve(
        calls === 1 ? { data: [1, 2, 3], error: null } : { data: null, error: { code: '42501', message: 'denied' }, status: 403 },
      );
    };
    await expect(fetchAllRows(fetchPage, 3)).rejects.toMatchObject({ kind: 'permission', code: '42501' });
  });

  it('treats null data as an empty page and rejects a page larger than asked', async () => {
    expect(await fetchAllRows(() => Promise.resolve({ data: null, error: null }), 3)).toEqual([]);
    const tooBig = () => Promise.resolve({ data: [1, 2, 3, 4], error: null });
    await expect(fetchAllRows(tooBig, 3)).rejects.toBeInstanceOf(DataError);
  });
});
