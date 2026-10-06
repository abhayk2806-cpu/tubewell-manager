import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocked Supabase client (no live database) and a stubbed clock.
const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/data/clock', () => ({ nowIso: () => '2026-10-06T10:00:00.000Z' }));
// Wrap the engine's isActiveFarmer so the test can prove classification calls it.
const ledgerSpy = vi.hoisted(() => ({ isActiveFarmer: vi.fn() }));
vi.mock('@/lib/ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ledger')>();
  ledgerSpy.isActiveFarmer.mockImplementation(actual.isActiveFarmer);
  return { ...actual, isActiveFarmer: ledgerSpy.isActiveFarmer };
});

import { DataError } from './errors';
import {
  classifyFarmers,
  createFarmer,
  listFarmers,
  restoreFarmer,
  setFarmerDisabled,
  softDeleteFarmer,
  updateFarmer,
} from './farmers';
import { farmerRow, fakeQuery } from './test-support/fakeSupabase';
import type { FakeQuery, FakeResult } from './test-support/fakeSupabase';

/** Queue one fake query per expected `supabase.from(...)` call, in order. */
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

const ramu = farmerRow({ id: 'f-1', name: 'Ramu Lal', mobile: '98765' });

beforeEach(() => {
  supabaseMock.from.mockReset();
});

describe('listFarmers', () => {
  it('reads every page in id order until an empty page', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => farmerRow({ id: `f-${String(i).padStart(4, '0')}`, name: `Kisan ${i}` }));
    const page2 = [farmerRow({ id: 'f-9999', name: 'Last' })];
    const [q1, q2, q3] = queue({ data: page1, error: null }, { data: page2, error: null }, { data: [], error: null });
    const rows = await listFarmers();
    expect(rows).toHaveLength(1001);
    expect(supabaseMock.from).toHaveBeenCalledWith('farmers');
    expect(methods(q1)).toEqual([['select', '*'], ['order', 'id'], ['range', 0, 999]]);
    expect(methods(q2)).toEqual([['select', '*'], ['order', 'id'], ['range', 1000, 1999]]);
    expect(methods(q3)).toEqual([['select', '*'], ['order', 'id'], ['range', 1001, 2000]]);
  });

  it('returns rows unchanged (field names as in the database)', async () => {
    queue({ data: [ramu], error: null }, { data: [], error: null });
    expect(await listFarmers()).toEqual([ramu]);
  });

  it('maps an error to a DataError', async () => {
    queue({ data: null, error: { code: '42501', message: 'permission denied' }, status: 403 });
    await expect(listFarmers()).rejects.toMatchObject({ kind: 'permission', code: '42501' });
  });
});

describe('classifyFarmers', () => {
  it('splits into Chalu / Band / Deleted with the engine definition, sorted by name', () => {
    ledgerSpy.isActiveFarmer.mockClear();
    const rows = [
      farmerRow({ id: 'a', name: 'zorawar' }),
      farmerRow({ id: 'b', name: 'Amar' }),
      farmerRow({ id: 'c', name: 'Band Kisan', is_disabled: true }),
      farmerRow({ id: 'd', name: 'Gone', deleted_at: '2026-10-05T00:00:00+00:00' }),
      farmerRow({ id: 'e', name: 'Band and Gone', is_disabled: true, deleted_at: '2026-10-05T00:00:00+00:00' }),
    ];
    const lists = classifyFarmers(rows);
    expect(lists.active.map((r) => r.id)).toEqual(['b', 'a']);
    expect(lists.disabled.map((r) => r.id)).toEqual(['c']);
    expect(lists.deleted.map((r) => r.id)).toEqual(['e', 'd']);
    expect(ledgerSpy.isActiveFarmer).toHaveBeenCalledTimes(rows.length);
  });
});

describe('createFarmer', () => {
  it('inserts only the normalized name, mobile and notes, and returns the row', async () => {
    const [q] = queue({ data: ramu, error: null });
    const row = await createFarmer({ name: '  Ramu   Lal ', mobile: ' 98765 ', notes: '  ' });
    expect(row).toEqual(ramu);
    expect(methods(q)).toEqual([['insert', { name: 'Ramu Lal', mobile: '98765', notes: null }], ['select'], ['single']]);
  });

  it('does not call the database when the input is invalid', async () => {
    await expect(createFarmer({ name: ' \t ' })).rejects.toMatchObject({ kind: 'constraint', code: 'client_validation' });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('maps a check violation from the database to constraint', async () => {
    queue({ data: null, error: { code: '23514', message: 'violates check constraint' }, status: 400 });
    await expect(createFarmer({ name: 'Ramu' })).rejects.toMatchObject({ kind: 'constraint', code: '23514' });
  });
});

describe('updateFarmer', () => {
  it('sends only the changed columns, filtered to the non-deleted row', async () => {
    const updated = { ...ramu, mobile: null, notes: 'naya note' };
    const [q] = queue({ data: updated, error: null });
    expect(await updateFarmer(ramu, { name: ' Ramu Lal ', mobile: '', notes: 'naya note' })).toEqual(updated);
    expect(methods(q)).toEqual([
      ['update', { mobile: null, notes: 'naya note' }],
      ['eq', 'id', 'f-1'],
      ['is', 'deleted_at', null],
      ['select'],
      ['maybeSingle'],
    ]);
  });

  it('makes no request when nothing changed', async () => {
    expect(await updateFarmer(ramu, { name: 'Ramu  Lal', mobile: '98765', notes: '' })).toBe(ramu);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('turns an update that matched 0 rows into not_found', async () => {
    queue({ data: null, error: null });
    const error = await updateFarmer(ramu, { name: 'Ramu Kumar' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ kind: 'not_found' });
  });

  it('maps a network failure', async () => {
    queue({ data: null, error: { code: '', message: 'TypeError: Failed to fetch' }, status: 0 });
    await expect(updateFarmer(ramu, { name: 'Ramu Kumar' })).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('disable, soft delete and restore', () => {
  it('setFarmerDisabled sends only is_disabled', async () => {
    const [q1, q2] = queue({ data: { ...ramu, is_disabled: true }, error: null }, { data: ramu, error: null });
    await setFarmerDisabled('f-1', true);
    await setFarmerDisabled('f-1', false);
    expect(methods(q1)[0]).toEqual(['update', { is_disabled: true }]);
    expect(methods(q2)[0]).toEqual(['update', { is_disabled: false }]);
    expect(methods(q1).slice(1)).toEqual([['eq', 'id', 'f-1'], ['is', 'deleted_at', null], ['select'], ['maybeSingle']]);
  });

  it('softDeleteFarmer sends deleted_at from the one clock, only for a live row', async () => {
    const [q] = queue({ data: { ...ramu, deleted_at: '2026-10-06T10:00:00+00:00' }, error: null });
    await softDeleteFarmer('f-1');
    expect(methods(q)).toEqual([
      ['update', { deleted_at: '2026-10-06T10:00:00.000Z' }],
      ['eq', 'id', 'f-1'],
      ['is', 'deleted_at', null],
      ['select'],
      ['maybeSingle'],
    ]);
  });

  it('softDeleteFarmer of an already deleted farmer is not_found', async () => {
    queue({ data: null, error: null });
    await expect(softDeleteFarmer('f-1')).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('restoreFarmer sets deleted_at back to null, only for a deleted row', async () => {
    const [q] = queue({ data: ramu, error: null });
    await restoreFarmer('f-1');
    expect(methods(q)).toEqual([
      ['update', { deleted_at: null }],
      ['eq', 'id', 'f-1'],
      ['not', 'deleted_at', 'is', null],
      ['select'],
      ['maybeSingle'],
    ]);
  });

  it('every mutation maps errors', async () => {
    queue(
      { data: null, error: { code: '42501', message: 'rls' }, status: 403 },
      { data: null, error: { code: 'XX000', message: 'boom' }, status: 500 },
      { data: null, error: null },
    );
    await expect(setFarmerDisabled('f-1', true)).rejects.toMatchObject({ kind: 'permission' });
    await expect(softDeleteFarmer('f-1')).rejects.toMatchObject({ kind: 'unknown' });
    await expect(restoreFarmer('f-1')).rejects.toMatchObject({ kind: 'not_found' });
  });
});
