import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const api = vi.hoisted(() => ({
  listUsage: vi.fn(),
  createUsage: vi.fn(),
  updateUsage: vi.fn(),
  softDeleteUsage: vi.fn(),
  restoreUsage: vi.fn(),
}));
vi.mock('@/lib/data/usage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/usage')>()),
  ...api,
}));

import { DataError } from '@/lib/data';
import { usageRow } from '@/lib/data/test-support/fakeSupabase';
import { useUsage } from './useUsage';

const older = usageRow({ id: 'u-1', farmer_id: 'f-1', used_at: '2026-10-01T04:00:00+00:00', hours: 1, minutes: 0 });
const newer = usageRow({ id: 'u-2', farmer_id: 'f-1', used_at: '2026-10-05T04:00:00+00:00', hours: 2, minutes: 0 });
const gone = usageRow({ id: 'u-3', farmer_id: 'f-1', used_at: '2026-10-03T04:00:00+00:00', hours: 1, minutes: 0, deleted_at: '2026-10-06T00:00:00+00:00' });
const input = { farmer_id: 'f-1', used_at: '2026-10-06T09:30:00+05:30', hours: 1, minutes: 30, rate_paise: 10000 };

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listUsage.mockResolvedValue([older, gone, newer]);
});

describe('useUsage', () => {
  it('loads, then splits live (newest first) and deleted', async () => {
    const { result } = renderHook(() => useUsage());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.live.map((r) => r.id)).toEqual(['u-2', 'u-1']);
    expect(result.current.deleted.map((r) => r.id)).toEqual(['u-3']);
    expect(result.current.all).toHaveLength(3);
  });

  it('initial load error, then reload recovers', async () => {
    api.listUsage.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    const { result } = renderHook(() => useUsage());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.kind).toBe('network');
    await act(() => result.current.reload());
    expect(result.current.status).toBe('ready');
  });

  it('pending while saving, one mutation at a time, reload after success', async () => {
    const { result } = renderHook(() => useUsage());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const save = deferred<typeof older>();
    api.createUsage.mockReturnValue(save.promise);
    let first: Promise<unknown> = Promise.resolve();
    let second: unknown;
    await act(async () => {
      first = result.current.create(input);
      second = await result.current.create(input);
    });
    expect(second).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(result.current.pending).toEqual({ kind: 'create', entryId: null });
    const created = usageRow({ id: 'u-4', ...input, used_at: '2026-10-06T04:00:00+00:00' });
    api.listUsage.mockResolvedValue([older, gone, newer, created]);
    let outcome: unknown;
    await act(async () => {
      save.resolve(created);
      outcome = await first;
    });
    expect(outcome).toEqual({ ok: true, entry: created });
    expect(api.createUsage).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBeNull();
    expect(result.current.live.map((r) => r.id)).toEqual(['u-4', 'u-2', 'u-1']);
  });

  it('saved but the reload failed: keeps rows, ok result, refreshFailed', async () => {
    const { result } = renderHook(() => useUsage());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    api.softDeleteUsage.mockResolvedValue({ ...newer, deleted_at: '2026-10-06T10:00:00+00:00' });
    api.listUsage.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.remove('u-2');
    });
    expect(outcome).toMatchObject({ ok: true });
    expect([result.current.status, result.current.refreshFailed]).toEqual(['ready', true]);
    expect(result.current.live.map((r) => r.id)).toEqual(['u-2', 'u-1']);
    await act(() => result.current.retryRefresh());
    expect(result.current.refreshFailed).toBe(false);
  });

  it('a failed mutation returns the DataError; update and restore call the data layer', async () => {
    const { result } = renderHook(() => useUsage());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    api.updateUsage.mockRejectedValue(new DataError('not_found', 'no_rows', 'gone'));
    api.restoreUsage.mockResolvedValue({ ...gone, deleted_at: null });
    let failed: unknown;
    await act(async () => {
      failed = await result.current.update(older, input);
      await result.current.restore('u-3');
    });
    expect(failed).toMatchObject({ ok: false, error: { kind: 'not_found' } });
    expect(api.updateUsage).toHaveBeenCalledWith(older, input);
    expect(api.restoreUsage).toHaveBeenCalledWith('u-3');
  });
});
