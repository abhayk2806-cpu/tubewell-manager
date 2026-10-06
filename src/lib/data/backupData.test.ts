import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocked Supabase client (no live database) and a stubbed clock.
const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/data/clock', () => ({ nowIso: () => '2026-10-06T08:35:00.000Z' }));

import { buildBackupFile } from '@/lib/backup';
import { EXPORTED_AT, WORKED_SUMMARY, workedRows } from '@/lib/backup/test-support/fixture';
import { exportBackup, restoreBackup, verifyRestore } from './backupData';
import { fakeQuery } from './test-support/fakeSupabase';
import type { FakeResult } from './test-support/fakeSupabase';

type Table = 'farmers' | 'usage_entries' | 'payments';

/** Each table answers its pages in order; a missing page is an unexpected extra call. */
function serve(pages: Record<Table, FakeResult[]>) {
  const left = { farmers: [...pages.farmers], usage_entries: [...pages.usage_entries], payments: [...pages.payments] };
  supabaseMock.from.mockImplementation((table: Table) => {
    const next = left[table].shift();
    if (next === undefined) throw new Error(`unexpected extra read of ${table}`);
    return fakeQuery(next).query;
  });
}

const ok = (data: unknown[]): FakeResult => ({ data, error: null });
const EMPTY = ok([]);

function dbRows() {
  const rows = workedRows();
  // The database also returns the generated total_minutes.
  return { ...rows, usage_entries: rows.usage_entries.map((u) => ({ ...u, total_minutes: u.hours * 60 + u.minutes })) };
}

function serveWorked() {
  const rows = dbRows();
  serve({ farmers: [ok(rows.farmers), EMPTY], usage_entries: [ok(rows.usage_entries), EMPTY], payments: [ok(rows.payments), EMPTY] });
}

const workedFile = () => buildBackupFile(workedRows(), EXPORTED_AT);

beforeEach(() => {
  supabaseMock.from.mockReset();
  supabaseMock.rpc.mockReset();
});

describe('exportBackup', () => {
  it('reads every table until an empty page and builds the file (counts, summary, deleted rows)', async () => {
    serveWorked();
    const result = await exportBackup();
    expect(result).toEqual({ ok: true, file: { ...workedFile(), exported_at: '2026-10-06T08:35:00.000Z' } });
    if (result.ok) expect(result.file.summary).toEqual(WORKED_SUMMARY);
  });

  it('more than 1,000 rows per table: 2,500 usage rows are all exported', async () => {
    const rows = dbRows();
    const asha = rows.farmers[0]!;
    const many = Array.from({ length: 2500 }, (_, i) => ({
      ...rows.usage_entries[0]!,
      id: `c3000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      farmer_id: asha.id,
    }));
    serve({
      farmers: [ok(rows.farmers), EMPTY],
      usage_entries: [ok(many.slice(0, 1000)), ok(many.slice(1000, 2000)), ok(many.slice(2000)), EMPTY],
      payments: [ok(rows.payments), EMPTY],
    });
    const result = await exportBackup();
    expect(result.ok && result.file.counts.usage_entries).toBe(2500);
    expect(result.ok && result.file.usage_entries).toHaveLength(2500);
  });

  it('an error on page 2 aborts with no file', async () => {
    const rows = dbRows();
    serve({
      farmers: [ok(rows.farmers), EMPTY],
      usage_entries: [ok(rows.usage_entries), { data: null, error: { message: 'Failed to fetch' }, status: 0 }],
      payments: [],
    });
    expect(await exportBackup()).toEqual({ ok: false, kind: 'network' });
  });

  it('rows the engine rejects give bad_data, never a file', async () => {
    const rows = dbRows();
    serve({
      farmers: [ok(rows.farmers), EMPTY],
      usage_entries: [ok([{ ...rows.usage_entries[0], rate_paise: 1.5 }]), EMPTY],
      payments: [ok(rows.payments), EMPTY],
    });
    expect(await exportBackup()).toEqual({ ok: false, kind: 'bad_data' });
  });
});

describe('restoreBackup', () => {
  const report = {
    mode: 'replace',
    deleted: { payments: 9, usage_entries: 6, farmers: 7 },
    inserted: { farmers: 5, usage_entries: 4, payments: 4 },
    updated: { farmers: 0, usage_entries: 0, payments: 0 },
  };

  it('sends the whole file in ONE call and returns the function report', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: report, error: null, status: 200 });
    const file = workedFile();
    expect(await restoreBackup(file, 'replace')).toEqual({ ok: true, report });
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('restore_backup', { p_payload: file, p_mode: 'replace' });
  });

  it.each([
    [{ code: '42501', message: 'only the owner may restore' }, 403, 'not_owner'],
    [{ code: '22023', message: 'payload' }, 400, 'invalid_payload'],
    [{ code: '21000', message: 'twice' }, 400, 'invalid_payload'],
    [{ code: '23503', message: 'fk' }, 409, 'constraint'],
    [{ message: 'Failed to fetch' }, 0, 'network'],
    [{ code: 'XX000', message: 'boom' }, 500, 'unknown'],
  ])('error %o gives a typed error and never success', async (error, status, kind) => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error, status });
    expect(await restoreBackup(workedFile(), 'merge')).toEqual({ ok: false, kind });
  });

  it('a report of the wrong shape or mode is not treated as success', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { ...report, mode: 'merge', inserted: null }, error: null, status: 200 });
    expect(await restoreBackup(workedFile(), 'merge')).toEqual({ ok: false, kind: 'unknown' });
    supabaseMock.rpc.mockResolvedValue({ data: report, error: null, status: 200 });
    expect(await restoreBackup(workedFile(), 'merge')).toEqual({ ok: false, kind: 'unknown' });
  });

  it('a thrown fetch error is a network error', async () => {
    supabaseMock.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await restoreBackup(workedFile(), 'merge')).toEqual({ ok: false, kind: 'network' });
  });
});

describe('verifyRestore', () => {
  it('replace: the database equals the file -> verified', async () => {
    serveWorked();
    const result = await verifyRestore(workedFile(), 'replace');
    expect(result.ok && result.verification.verified).toBe(true);
    expect(result.ok && result.verification.summary).toEqual(WORKED_SUMMARY);
    expect(result.ok && result.verification.counts).toEqual({ farmers: 5, usage_entries: 4, payments: 4 });
  });

  it('replace: an extra row in the database is a mismatch (counts and totals reported)', async () => {
    const rows = dbRows();
    const extra = { ...rows.payments[2]!, id: 'b2000000-0000-4000-8000-000000000099', amount_paise: 1000 };
    serve({ farmers: [ok(rows.farmers), EMPTY], usage_entries: [ok(rows.usage_entries), EMPTY], payments: [ok([...rows.payments, extra]), EMPTY] });
    const result = await verifyRestore(workedFile(), 'replace');
    expect(result.ok && result.verification.verified).toBe(false);
    expect(result.ok && result.verification.counts.payments).toBe(5);
    expect(result.ok && result.verification.summary.credit_paise).toBe(6000);
    expect(result.ok && result.verification.diff.payments.onlyCurrent).toBe(1);
  });

  it('merge: database-only rows are fine; a file row that differs is a mismatch', async () => {
    const rows = dbRows();
    const extra = { ...rows.payments[2]!, id: 'b2000000-0000-4000-8000-000000000099' };
    serve({ farmers: [ok(rows.farmers), EMPTY], usage_entries: [ok(rows.usage_entries), EMPTY], payments: [ok([...rows.payments, extra]), EMPTY] });
    expect((await verifyRestore(workedFile(), 'merge')).ok).toBe(true);
    serve({ farmers: [ok(rows.farmers), EMPTY], usage_entries: [ok(rows.usage_entries), EMPTY], payments: [ok([...rows.payments, extra]), EMPTY] });
    const merged = await verifyRestore(workedFile(), 'merge');
    expect(merged.ok && merged.verification.verified).toBe(true);
    const changed = rows.payments.map((p, i) => (i === 0 ? { ...p, amount_paise: 1 } : p));
    serve({ farmers: [ok(rows.farmers), EMPTY], usage_entries: [ok(rows.usage_entries), EMPTY], payments: [ok(changed), EMPTY] });
    const mismatch = await verifyRestore(workedFile(), 'merge');
    expect(mismatch.ok && mismatch.verification.verified).toBe(false);
  });

  it('a read error is reported, never "verified"', async () => {
    serve({ farmers: [{ data: null, error: { code: '42501', message: 'rls' }, status: 403 }], usage_entries: [], payments: [] });
    expect(await verifyRestore(workedFile(), 'replace')).toEqual({ ok: false, kind: 'permission' });
  });
});
