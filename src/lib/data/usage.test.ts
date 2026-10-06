import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocked Supabase client (no live database) and a stubbed clock.
const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/data/clock', () => ({ nowIso: () => '2026-10-06T10:00:00.000Z' }));

import { DataError } from './errors';
import { createUsage, listUsage, restoreUsage, softDeleteUsage, updateUsage } from './usage';
import { fakeQuery, usageRow } from './test-support/fakeSupabase';
import type { FakeQuery, FakeResult } from './test-support/fakeSupabase';

function queue(...results: FakeResult[]): FakeQuery[] {
  const queries = results.map(fakeQuery);
  let i = 0;
  supabaseMock.from.mockImplementation(() => {
    const next = queries[i];
    i += 1;
    if (next === undefined) throw new Error('unexpected extra supabase call');
    return next.query;
  });
  return queries;
}

function methods(q: FakeQuery | undefined) {
  return (q?.calls ?? []).map((c) => [c.method, ...c.args]);
}

function sentColumns(q: FakeQuery | undefined): string[] {
  const write = q?.calls.find((c) => c.method === 'insert' || c.method === 'update');
  return Object.keys((write?.args[0] ?? {}) as object).sort();
}

const input = { farmer_id: 'f-1', used_at: '2026-10-06T09:30:00+05:30', hours: 3, minutes: 35, rate_paise: 10000 };
const stored = usageRow({ id: 'u-1', farmer_id: 'f-1', used_at: '2026-10-06T04:00:00+00:00', hours: 3, minutes: 35 });

beforeEach(() => {
  supabaseMock.from.mockReset();
});

describe('listUsage', () => {
  it('reads every page of usage_entries in id order until an empty page, rows unchanged', async () => {
    const [q1, q2] = queue({ data: [stored], error: null }, { data: [], error: null });
    expect(await listUsage()).toEqual([stored]);
    expect(supabaseMock.from).toHaveBeenCalledWith('usage_entries');
    expect(methods(q1)).toEqual([['select', '*'], ['order', 'id'], ['range', 0, 999]]);
    expect(methods(q2)).toEqual([['select', '*'], ['order', 'id'], ['range', 1, 1000]]);
  });

  it('more than 1,000 rows: 2,500 rows come back over 3 full pages and an empty one (audit gap)', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ ...stored, id: `u-${String(i).padStart(5, '0')}` }));
    const queries = queue(
      { data: rows.slice(0, 1000), error: null },
      { data: rows.slice(1000, 2000), error: null },
      { data: rows.slice(2000), error: null },
      { data: [], error: null },
    );
    const all = await listUsage();
    expect(all).toHaveLength(2500);
    expect(all[2499]).toEqual(rows[2499]);
    expect(queries.map((q) => methods(q).find((m) => m[0] === 'range'))).toEqual([
      ['range', 0, 999],
      ['range', 1000, 1999],
      ['range', 2000, 2999],
      ['range', 2500, 3499],
    ]);
    expect(supabaseMock.from).toHaveBeenCalledWith('usage_entries');
  });

  it('maps an error', async () => {
    queue({ data: null, error: { code: '42501', message: 'denied' }, status: 403 });
    await expect(listUsage()).rejects.toMatchObject({ kind: 'permission' });
  });
});

describe('createUsage', () => {
  it('inserts exactly farmer_id, used_at, hours, minutes and rate_paise (never total_minutes)', async () => {
    const [q] = queue({ data: stored, error: null });
    expect(await createUsage(input)).toEqual(stored);
    expect(methods(q)).toEqual([['insert', input], ['select'], ['single']]);
    expect(sentColumns(q)).toEqual(['farmer_id', 'hours', 'minutes', 'rate_paise', 'used_at']);
  });

  it('validates first and never calls the database with bad input', async () => {
    await expect(createUsage({ ...input, hours: 0, minutes: 0 })).rejects.toMatchObject({
      kind: 'constraint',
      code: 'client_validation',
      message: 'duration_zero',
    });
    await expect(createUsage({ ...input, used_at: '2026-10-06T09:30' })).rejects.toBeInstanceOf(DataError);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('maps a foreign-key violation (unknown farmer) to constraint', async () => {
    queue({ data: null, error: { code: '23503', message: 'violates foreign key constraint' }, status: 409 });
    await expect(createUsage(input)).rejects.toMatchObject({ kind: 'constraint', code: '23503' });
  });
});

describe('updateUsage', () => {
  it('sends only the changed columns, filtered to a live row', async () => {
    const [q] = queue({ data: { ...stored, minutes: 40, rate_paise: 12000 }, error: null });
    await updateUsage(stored, { ...input, minutes: 40, rate_paise: 12000 });
    expect(methods(q)).toEqual([
      ['update', { minutes: 40, rate_paise: 12000 }],
      ['eq', 'id', 'u-1'],
      ['is', 'deleted_at', null],
      ['select'],
      ['maybeSingle'],
    ]);
  });

  it('compares used_at as an instant: the same moment in another offset is no change', async () => {
    // stored 04:00Z == 09:30+05:30
    expect(await updateUsage(stored, input)).toBe(stored);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('sends used_at and farmer_id when they change, never total_minutes', async () => {
    const [q] = queue({ data: stored, error: null });
    await updateUsage(stored, { ...input, farmer_id: 'f-2', used_at: '2026-10-07T09:30:00+05:30', hours: 4 });
    expect(sentColumns(q)).toEqual(['farmer_id', 'hours', 'used_at']);
  });

  it('0 rows is not_found; errors are mapped', async () => {
    queue({ data: null, error: null }, { data: null, error: { code: '', message: 'Failed to fetch' }, status: 0 });
    await expect(updateUsage(stored, { ...input, hours: 5 })).rejects.toMatchObject({ kind: 'not_found' });
    await expect(updateUsage(stored, { ...input, hours: 5 })).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('softDeleteUsage and restoreUsage', () => {
  it('soft delete sends deleted_at from the one clock, only for a live row', async () => {
    const [q] = queue({ data: { ...stored, deleted_at: '2026-10-06T10:00:00+00:00' }, error: null });
    await softDeleteUsage('u-1');
    expect(methods(q)).toEqual([
      ['update', { deleted_at: '2026-10-06T10:00:00.000Z' }],
      ['eq', 'id', 'u-1'],
      ['is', 'deleted_at', null],
      ['select'],
      ['maybeSingle'],
    ]);
  });

  it('restore sets deleted_at to null, only for a deleted row', async () => {
    const [q] = queue({ data: stored, error: null });
    await restoreUsage('u-1');
    expect(methods(q)).toEqual([
      ['update', { deleted_at: null }],
      ['eq', 'id', 'u-1'],
      ['not', 'deleted_at', 'is', null],
      ['select'],
      ['maybeSingle'],
    ]);
  });

  it('0 rows is not_found and errors are mapped', async () => {
    queue({ data: null, error: null }, { data: null, error: null }, { data: null, error: { code: '42501', message: 'rls' }, status: 403 });
    await expect(softDeleteUsage('u-1')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(restoreUsage('u-1')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(restoreUsage('u-1')).rejects.toMatchObject({ kind: 'permission' });
  });
});
