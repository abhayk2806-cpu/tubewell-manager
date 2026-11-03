import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { DataError } from '@/lib/data';
import { MAX_AGE_MS, createTableStore } from './tableStore';

type Row = { readonly id: string; readonly v: number };

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A store over a scripted loader and a hand-moved clock. */
function setup(first: Row[] = [{ id: 'a', v: 1 }]) {
  let now = 0;
  const load = vi.fn<() => Promise<Row[]>>().mockResolvedValue(first);
  const store = createTableStore<Row>(load, () => now);
  return { store, load, tick: (ms: number) => (now += ms) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createTableStore', () => {
  it('first load: loading, then ready; a second mount while fresh asks nothing', async () => {
    const { store, load } = setup();
    expect(store.getSnapshot().status).toBe('loading');
    store.ensureFresh();
    store.ensureFresh();
    expect(load).toHaveBeenCalledTimes(1);
    await flush();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', rows: [{ id: 'a', v: 1 }] });
    store.ensureFresh();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('older than MAX_AGE_MS: the rows stay on screen while one quiet revalidation runs', async () => {
    const { store, load, tick } = setup();
    store.ensureFresh();
    await flush();
    tick(MAX_AGE_MS);
    store.ensureFresh();
    expect(load).toHaveBeenCalledTimes(1);
    tick(1);
    const next = deferred<Row[]>();
    load.mockReturnValueOnce(next.promise);
    store.ensureFresh();
    store.revalidateIfStale();
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().status).toBe('ready');
    next.resolve([{ id: 'a', v: 2 }]);
    await flush();
    expect(store.getSnapshot().rows).toEqual([{ id: 'a', v: 2 }]);
  });

  it('a failed background revalidation keeps the cached rows and sets backgroundRefreshFailed, never refreshFailed (FIX-1b)', async () => {
    const { store, load, tick } = setup();
    store.ensureFresh();
    await flush();
    const rows = store.getSnapshot().rows;
    tick(MAX_AGE_MS + 1);
    load.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    store.revalidateIfStale();
    await flush();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', refreshFailed: false, backgroundRefreshFailed: true, error: null });
    expect(store.getSnapshot().rows).toBe(rows);
    // A failed retry keeps the flag (the rows stay); a successful one clears it.
    load.mockRejectedValueOnce(new DataError('network', null, 'still offline'));
    await store.retryRefresh();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', refreshFailed: false, backgroundRefreshFailed: true });
    await store.retryRefresh();
    expect(store.getSnapshot()).toMatchObject({ refreshFailed: false, backgroundRefreshFailed: false });
  });

  it('a failed reload after a save sets refreshFailed only (FIX-1b)', async () => {
    const { store, load } = setup();
    store.ensureFresh();
    await flush();
    load.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    await store.run('create', null, () => Promise.resolve({ id: 'b', v: 2 }));
    await flush();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', refreshFailed: true, backgroundRefreshFailed: false });
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('both failures: both flags stay set, a background failure never clears the save flag; one success clears both (FIX-1b)', async () => {
    const { store, load, tick } = setup();
    store.ensureFresh();
    await flush();
    load.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    await store.run('create', null, () => Promise.resolve({ id: 'b', v: 2 }));
    await flush();
    tick(MAX_AGE_MS + 1);
    load.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    store.revalidateIfStale();
    await flush();
    expect(store.getSnapshot()).toMatchObject({ refreshFailed: true, backgroundRefreshFailed: true });
    load.mockResolvedValueOnce([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
    ]);
    await store.retryRefresh();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', refreshFailed: false, backgroundRefreshFailed: false });
  });

  it('a successful background revalidation clears an earlier save flag too (FIX-1b)', async () => {
    const { store, load, tick } = setup();
    store.ensureFresh();
    await flush();
    load.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    await store.run('create', null, () => Promise.resolve({ id: 'b', v: 2 }));
    await flush();
    expect(store.getSnapshot().refreshFailed).toBe(true);
    tick(MAX_AGE_MS + 1);
    store.revalidateIfStale();
    await flush();
    expect(store.getSnapshot()).toMatchObject({ refreshFailed: false, backgroundRefreshFailed: false });
  });

  it('a failed first load shows the error state; the next mount retries it', async () => {
    const { store, load } = setup();
    load.mockRejectedValueOnce(new DataError('permission', '42501', 'denied'));
    store.ensureFresh();
    await flush();
    expect(store.getSnapshot()).toMatchObject({ status: 'error', error: { kind: 'permission' } });
    store.ensureFresh();
    expect(store.getSnapshot().status).toBe('loading');
    await flush();
    expect(store.getSnapshot().status).toBe('ready');
  });

  it('a revalidation that finds the same rows keeps the same array (no recomputation downstream)', async () => {
    const { store, load, tick } = setup();
    store.ensureFresh();
    await flush();
    const rows = store.getSnapshot().rows;
    load.mockResolvedValueOnce([{ id: 'a', v: 1 }]);
    tick(MAX_AGE_MS + 1);
    store.revalidateIfStale();
    await flush();
    expect(store.getSnapshot().rows).toBe(rows);
  });

  it('only the newest load may change the rows: an older answer arriving late is ignored', async () => {
    const { store, load } = setup();
    const older = deferred<Row[]>();
    const newer = deferred<Row[]>();
    load.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    void store.reload();
    void store.reload();
    newer.resolve([{ id: 'n', v: 2 }]);
    await flush();
    older.resolve([{ id: 'o', v: 1 }]);
    await flush();
    expect(store.getSnapshot().rows).toEqual([{ id: 'n', v: 2 }]);
  });

  it('a save shows the returned row at once (in id order), then reloads quietly once', async () => {
    const { store, load } = setup([
      { id: 'a', v: 1 },
      { id: 'c', v: 3 },
    ]);
    store.ensureFresh();
    await flush();
    const reload = deferred<Row[]>();
    load.mockReturnValueOnce(reload.promise);
    const result = await store.run('create', null, () => Promise.resolve({ id: 'b', v: 2 }));
    expect(result).toEqual({ ok: true, row: { id: 'b', v: 2 } });
    expect(store.getSnapshot().rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(store.getSnapshot().pending).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    reload.resolve([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 3 },
    ]);
    await flush();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', refreshFailed: false });
  });

  it('one write at a time: a second write while one runs is refused as busy', async () => {
    const { store } = setup();
    store.ensureFresh();
    await flush();
    const save = deferred<Row>();
    const first = store.run('update', 'a', () => save.promise);
    expect(store.getSnapshot().pending).toEqual({ kind: 'update', id: 'a' });
    expect(await store.run('update', 'a', () => Promise.resolve({ id: 'a', v: 9 }))).toMatchObject({ ok: false, error: { code: 'busy' } });
    save.resolve({ id: 'a', v: 5 });
    expect(await first).toMatchObject({ ok: true });
  });

  it('a failed write changes nothing and reloads nothing', async () => {
    const { store, load } = setup();
    store.ensureFresh();
    await flush();
    const rows = store.getSnapshot().rows;
    const result = await store.run('delete', 'a', () => Promise.reject(new DataError('not_found', 'no_rows', 'gone')));
    expect(result).toMatchObject({ ok: false, error: { kind: 'not_found' } });
    expect(store.getSnapshot().rows).toBe(rows);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('clear() forgets the rows and drops a load in flight; the next mount loads from scratch', async () => {
    const { store, load } = setup();
    store.ensureFresh();
    await flush();
    const late = deferred<Row[]>();
    load.mockReturnValueOnce(late.promise);
    void store.retryRefresh();
    store.clear();
    expect(store.getSnapshot()).toMatchObject({ status: 'loading', rows: [] });
    late.resolve([{ id: 'old', v: 0 }]);
    await flush();
    expect(store.getSnapshot()).toMatchObject({ status: 'loading', rows: [] });
    store.ensureFresh();
    await flush();
    expect(store.getSnapshot().rows).toEqual([{ id: 'a', v: 1 }]);
  });

  it('notifies subscribers on every change and stops after unsubscribe', async () => {
    const { store } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.ensureFresh();
    await flush();
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    unsubscribe();
    void store.reload();
    await flush();
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});
