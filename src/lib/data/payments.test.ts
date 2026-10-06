import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocked Supabase client (no live database) and a stubbed clock.
const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/data/clock', () => ({ nowIso: () => '2026-10-06T10:00:00.000Z' }));

import { DataError } from './errors';
import { createPayment, listPayments, restorePayment, softDeletePayment, updatePayment } from './payments';
import { fakeQuery, paymentRow } from './test-support/fakeSupabase';
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

const input = { farmer_id: 'f-1', paid_at: '2026-10-06T11:00:00+05:30', amount_paise: 10000, note: null };
const stored = paymentRow({ id: 'p-1', farmer_id: 'f-1', paid_at: '2026-10-06T05:30:00+00:00', amount_paise: 10000 });

beforeEach(() => {
  supabaseMock.from.mockReset();
});

describe('listPayments', () => {
  it('reads every page of payments in id order until an empty page, rows unchanged', async () => {
    const [q1, q2] = queue({ data: [stored], error: null }, { data: [], error: null });
    expect(await listPayments()).toEqual([stored]);
    expect(supabaseMock.from).toHaveBeenCalledWith('payments');
    expect(methods(q1)).toEqual([['select', '*'], ['order', 'id'], ['range', 0, 999]]);
    expect(methods(q2)).toEqual([['select', '*'], ['order', 'id'], ['range', 1, 1000]]);
  });

  it('maps an error', async () => {
    queue({ data: null, error: { code: '42501', message: 'denied' }, status: 403 });
    await expect(listPayments()).rejects.toMatchObject({ kind: 'permission' });
  });
});

describe('createPayment', () => {
  it('inserts exactly farmer_id, paid_at, amount_paise and note', async () => {
    const [q] = queue({ data: stored, error: null });
    expect(await createPayment(input)).toEqual(stored);
    expect(methods(q)).toEqual([['insert', input], ['select'], ['single']]);
    expect(sentColumns(q)).toEqual(['amount_paise', 'farmer_id', 'note', 'paid_at']);
  });

  it('validates first and never calls the database with bad input', async () => {
    await expect(createPayment({ ...input, amount_paise: 0 })).rejects.toMatchObject({
      kind: 'constraint',
      code: 'client_validation',
      message: 'amount_not_positive',
    });
    await expect(createPayment({ ...input, note: 'n'.repeat(201) })).rejects.toMatchObject({ message: 'note_too_long' });
    await expect(createPayment({ ...input, paid_at: '2026-10-06' })).rejects.toBeInstanceOf(DataError);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('maps a foreign-key violation to constraint, and a check violation too', async () => {
    queue(
      { data: null, error: { code: '23503', message: 'violates foreign key constraint' }, status: 409 },
      { data: null, error: { code: '23514', message: 'payments_note_max_length' }, status: 400 },
    );
    await expect(createPayment(input)).rejects.toMatchObject({ kind: 'constraint', code: '23503' });
    await expect(createPayment(input)).rejects.toMatchObject({ kind: 'constraint', code: '23514' });
  });
});

describe('updatePayment', () => {
  it('sends only the changed columns, filtered to a live row; the farmer is never sent', async () => {
    const [q] = queue({ data: { ...stored, amount_paise: 20000, note: 'aadha' }, error: null });
    await updatePayment(stored, { ...input, amount_paise: 20000, note: 'aadha' });
    expect(methods(q)).toEqual([
      ['update', { amount_paise: 20000, note: 'aadha' }],
      ['eq', 'id', 'p-1'],
      ['is', 'deleted_at', null],
      ['select'],
      ['maybeSingle'],
    ]);
  });

  it('compares paid_at as an instant (no request when nothing really changed)', async () => {
    expect(await updatePayment(stored, input)).toBe(stored);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('sends paid_at when it changes', async () => {
    const [q] = queue({ data: stored, error: null });
    await updatePayment(stored, { ...input, paid_at: '2026-10-07T11:00:00+05:30' });
    expect(sentColumns(q)).toEqual(['paid_at']);
  });

  it('refuses a different farmer before any request', async () => {
    await expect(updatePayment(stored, { ...input, farmer_id: 'f-2' })).rejects.toMatchObject({ kind: 'constraint', code: 'farmer_locked' });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('0 rows is not_found; errors are mapped', async () => {
    queue({ data: null, error: null }, { data: null, error: { code: '', message: 'Failed to fetch' }, status: 0 });
    await expect(updatePayment(stored, { ...input, amount_paise: 1 })).rejects.toMatchObject({ kind: 'not_found' });
    await expect(updatePayment(stored, { ...input, amount_paise: 1 })).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('softDeletePayment and restorePayment', () => {
  it('soft delete sends deleted_at from the one clock, only for a live row', async () => {
    const [q] = queue({ data: { ...stored, deleted_at: '2026-10-06T10:00:00+00:00' }, error: null });
    await softDeletePayment('p-1');
    expect(methods(q)).toEqual([
      ['update', { deleted_at: '2026-10-06T10:00:00.000Z' }],
      ['eq', 'id', 'p-1'],
      ['is', 'deleted_at', null],
      ['select'],
      ['maybeSingle'],
    ]);
  });

  it('restore sets deleted_at to null, only for a deleted row', async () => {
    const [q] = queue({ data: stored, error: null });
    await restorePayment('p-1');
    expect(methods(q)).toEqual([
      ['update', { deleted_at: null }],
      ['eq', 'id', 'p-1'],
      ['not', 'deleted_at', 'is', null],
      ['select'],
      ['maybeSingle'],
    ]);
  });

  it('0 rows is not_found and errors are mapped', async () => {
    queue({ data: null, error: null }, { data: null, error: null }, { data: null, error: { code: '42501', message: 'rls' }, status: 403 });
    await expect(softDeletePayment('p-1')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(restorePayment('p-1')).rejects.toMatchObject({ kind: 'not_found' });
    await expect(restorePayment('p-1')).rejects.toMatchObject({ kind: 'permission' });
  });
});
