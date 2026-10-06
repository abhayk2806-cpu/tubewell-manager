import { useCallback, useEffect, useRef, useState } from 'react';
import { DataError, toDataError } from '@/lib/data';

export type LoadStatus = 'loading' | 'error' | 'ready';

export type RowResult<R> = { readonly ok: true; readonly row: R } | { readonly ok: false; readonly error: DataError };

export interface Pending<K extends string> {
  readonly kind: K;
  /** The row being changed; null for create. */
  readonly id: string | null;
}

export interface RowStore<R, K extends string> {
  readonly rows: readonly R[];
  readonly status: LoadStatus;
  /** The error of a failed (initial or retried) load. */
  readonly error: DataError | null;
  /** A change was saved but the reload after it failed: the previous rows are still shown. */
  readonly refreshFailed: boolean;
  readonly pending: Pending<K> | null;
  /** Full reload: shows the loading state, and the error state if it fails. */
  reload(): Promise<void>;
  /** Quiet reload after a failed refresh: keeps the rows on screen whatever happens. */
  retryRefresh(): Promise<void>;
  /** Runs one mutation at a time, then reloads quietly. A second call while one runs is refused. */
  run(kind: K, id: string | null, action: () => Promise<R>): Promise<RowResult<R>>;
}

const BUSY = new DataError('unknown', 'busy', 'another change is still being saved');

/** Shared core of useFarmers and useUsage: load once, mutate one at a time, reload quietly. */
export function useRowStore<R, K extends string>(load: () => Promise<R[]>): RowStore<R, K> {
  const [rows, setRows] = useState<R[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<DataError | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [pending, setPending] = useState<Pending<K> | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // State changes only in promise callbacks, so the mount effect sets no state synchronously.
  const applyRows = useCallback((all: R[]) => {
    if (!mounted.current) return;
    setRows(all);
    setError(null);
    setRefreshFailed(false);
    setStatus('ready');
  }, []);

  const fullLoad = useCallback(
    () =>
      load().then(applyRows, (caught: unknown) => {
        if (!mounted.current) return;
        setError(toDataError(caught));
        setStatus('error');
      }),
    [load, applyRows],
  );

  const quietLoad = useCallback(
    () =>
      load().then(applyRows, () => {
        if (mounted.current) setRefreshFailed(true);
      }),
    [load, applyRows],
  );

  useEffect(() => {
    void fullLoad();
  }, [fullLoad]);

  const reload = useCallback(async () => {
    setStatus('loading');
    await fullLoad();
  }, [fullLoad]);

  const run = useCallback(
    async (kind: K, id: string | null, action: () => Promise<R>): Promise<RowResult<R>> => {
      if (inFlight.current) return { ok: false, error: BUSY };
      inFlight.current = true;
      setPending({ kind, id });
      try {
        const row = await action();
        // The change is saved: a failing reload only sets refreshFailed, it never hides the list.
        await quietLoad();
        return { ok: true, row };
      } catch (caught) {
        return { ok: false, error: toDataError(caught) };
      } finally {
        inFlight.current = false;
        if (mounted.current) setPending(null);
      }
    },
    [quietLoad],
  );

  return { rows, status, error, refreshFailed, pending, reload, retryRefresh: quietLoad, run };
}
