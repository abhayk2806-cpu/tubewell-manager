import { useEffect, useSyncExternalStore } from 'react';
import type { DataError } from '@/lib/data';
import type { LoadStatus, RowResult, TableStore } from '@/data-store/tableStore';

export type { LoadStatus, RowResult };

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
  /** A quiet reload (after a save, or in the background) failed: the previous rows are still shown. */
  readonly refreshFailed: boolean;
  readonly pending: Pending<K> | null;
  /** Full reload: shows the loading state, and the error state if it fails. */
  reload(): Promise<void>;
  /** Quiet reload after a failed refresh: keeps the rows on screen whatever happens. */
  retryRefresh(): Promise<void>;
  /** Runs one mutation at a time, shows the saved row, then reloads quietly. A second call while one runs is refused. */
  run(kind: K, id: string | null, action: () => Promise<R>): Promise<RowResult<R>>;
}

/**
 * Shared core of useFarmers, useUsage and usePayments: one table of the shared data store (FIX-1).
 * Cached rows render at once; mounting only starts the first load, or a quiet revalidation when stale.
 */
export function useRowStore<R, K extends string>(store: TableStore<R>): RowStore<R, K> {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    store.ensureFresh();
  }, [store]);

  return {
    rows: snapshot.rows,
    status: snapshot.status,
    error: snapshot.error,
    refreshFailed: snapshot.refreshFailed,
    pending: snapshot.pending as Pending<K> | null,
    reload: store.reload,
    retryRefresh: store.retryRefresh,
    run: store.run,
  };
}
