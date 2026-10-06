import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const api = vi.hoisted(() => ({
  listFarmers: vi.fn(),
  createFarmer: vi.fn(),
  updateFarmer: vi.fn(),
  setFarmerDisabled: vi.fn(),
  softDeleteFarmer: vi.fn(),
  restoreFarmer: vi.fn(),
}));
vi.mock('@/lib/data/farmers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/farmers')>()),
  ...api,
}));

import { DataError } from '@/lib/data';
import { farmerRow } from '@/lib/data/test-support/fakeSupabase';
import { useFarmers } from './useFarmers';

const amar = farmerRow({ id: 'a', name: 'Amar' });
const band = farmerRow({ id: 'b', name: 'Band Kisan', is_disabled: true });
const gone = farmerRow({ id: 'c', name: 'Gone', deleted_at: '2026-10-05T00:00:00+00:00' });

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listFarmers.mockResolvedValue([amar, band, gone]);
});

describe('useFarmers', () => {
  it('starts loading, then exposes the three lists', async () => {
    const { result } = renderHook(() => useFarmers());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.lists.active.map((f) => f.id)).toEqual(['a']);
    expect(result.current.lists.disabled.map((f) => f.id)).toEqual(['b']);
    expect(result.current.lists.deleted.map((f) => f.id)).toEqual(['c']);
    expect(result.current.all).toHaveLength(3);
    expect(result.current.pending).toBeNull();
  });

  it('reports a load error as a DataError and recovers on reload', async () => {
    api.listFarmers.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    const { result } = renderHook(() => useFarmers());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.kind).toBe('network');
    await act(() => result.current.reload());
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
  });

  it('reloads after a successful mutation and shows the pending state meanwhile', async () => {
    const { result } = renderHook(() => useFarmers());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const save = deferred<typeof amar>();
    api.createFarmer.mockReturnValue(save.promise);
    const shyam = farmerRow({ id: 's', name: 'Shyam' });
    api.listFarmers.mockResolvedValue([amar, band, gone, shyam]);

    let outcome: unknown;
    act(() => {
      void result.current.create({ name: 'Shyam' }).then((r) => {
        outcome = r;
      });
    });
    await waitFor(() => expect(result.current.pending).toEqual({ kind: 'create', farmerId: null }));
    await act(async () => {
      save.resolve(shyam);
      await save.promise;
    });
    await waitFor(() => expect(result.current.pending).toBeNull());
    expect(outcome).toEqual({ ok: true, farmer: shyam });
    expect(api.listFarmers).toHaveBeenCalledTimes(2);
    expect(result.current.lists.active.map((f) => f.id)).toEqual(['a', 's']);
    expect(result.current.status).toBe('ready');
  });

  it('refuses a second mutation while one is in flight (no double submit)', async () => {
    const { result } = renderHook(() => useFarmers());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const save = deferred<typeof amar>();
    api.setFarmerDisabled.mockReturnValue(save.promise);

    let first: Promise<unknown> = Promise.resolve();
    let second: unknown;
    await act(async () => {
      first = result.current.setDisabled('a', true);
      second = await result.current.setDisabled('a', true);
    });
    expect(second).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(api.setFarmerDisabled).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toEqual({ kind: 'disable', farmerId: 'a' });
    await act(async () => {
      save.resolve({ ...amar, is_disabled: true });
      await first;
    });
    expect(result.current.pending).toBeNull();
  });

  it('returns a failed mutation as a DataError without reloading', async () => {
    const { result } = renderHook(() => useFarmers());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    api.softDeleteFarmer.mockRejectedValue(new DataError('not_found', 'no_rows', 'gone'));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.remove('a');
    });
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'not_found' } });
    expect(api.listFarmers).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBeNull();
  });

  it('saved but the reload failed: keeps the rows, reports ok and sets refreshFailed', async () => {
    const { result } = renderHook(() => useFarmers());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    api.setFarmerDisabled.mockResolvedValue({ ...amar, is_disabled: true });
    api.listFarmers.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.setDisabled('a', true);
    });
    expect(outcome).toMatchObject({ ok: true });
    expect(result.current.status).toBe('ready');
    expect(result.current.refreshFailed).toBe(true);
    expect(result.current.lists.active.map((f) => f.id)).toEqual(['a']);

    api.listFarmers.mockRejectedValueOnce(new DataError('network', null, 'still offline'));
    await act(() => result.current.retryRefresh());
    expect([result.current.status, result.current.refreshFailed]).toEqual(['ready', true]);

    api.listFarmers.mockResolvedValue([{ ...amar, is_disabled: true }, band, gone]);
    await act(() => result.current.retryRefresh());
    expect(result.current.refreshFailed).toBe(false);
    expect(result.current.lists.disabled.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('a failed initial load still shows the error state', async () => {
    api.listFarmers.mockRejectedValueOnce(new DataError('permission', '42501', 'denied'));
    const { result } = renderHook(() => useFarmers());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.refreshFailed).toBe(false);
  });

  it('maps each mutation to its data-layer call', async () => {
    const { result } = renderHook(() => useFarmers());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    api.updateFarmer.mockResolvedValue(amar);
    api.setFarmerDisabled.mockResolvedValue(amar);
    api.restoreFarmer.mockResolvedValue(gone);
    await act(async () => {
      await result.current.update(amar, { name: 'Amar Singh' });
      await result.current.setDisabled('b', false);
      await result.current.restore('c');
    });
    expect(api.updateFarmer).toHaveBeenCalledWith(amar, { name: 'Amar Singh' });
    expect(api.setFarmerDisabled).toHaveBeenCalledWith('b', false);
    expect(api.restoreFarmer).toHaveBeenCalledWith('c');
  });
});
