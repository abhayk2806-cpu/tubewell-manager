import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DataError,
  classifyFarmers,
  createFarmer,
  listFarmers,
  restoreFarmer,
  setFarmerDisabled,
  softDeleteFarmer,
  toDataError,
  updateFarmer,
} from '@/lib/data';
import type { FarmerFormValues, FarmerLists, FarmerRow } from '@/lib/data';

export type FarmersStatus = 'loading' | 'error' | 'ready';
export type FarmerMutation = 'create' | 'update' | 'disable' | 'enable' | 'delete' | 'restore';

export type MutationResult = { readonly ok: true; readonly farmer: FarmerRow } | { readonly ok: false; readonly error: DataError };

export interface PendingMutation {
  readonly kind: FarmerMutation;
  /** The farmer being changed; null for create. */
  readonly farmerId: string | null;
}

export interface UseFarmers {
  readonly status: FarmersStatus;
  readonly error: DataError | null;
  /** Every row (all three lists), for duplicate-name checks. */
  readonly all: readonly FarmerRow[];
  readonly lists: FarmerLists;
  /** The mutation in flight, or null. Only one runs at a time (no double submit). */
  readonly pending: PendingMutation | null;
  reload(): Promise<void>;
  create(values: FarmerFormValues): Promise<MutationResult>;
  update(current: FarmerRow, values: FarmerFormValues): Promise<MutationResult>;
  setDisabled(id: string, disabled: boolean): Promise<MutationResult>;
  remove(id: string): Promise<MutationResult>;
  restore(id: string): Promise<MutationResult>;
}

const BUSY = new DataError('unknown', 'busy', 'another change is still being saved');

/** Loads all farmers once, exposes them split into Chalu / Band / Deleted, and reloads after every change. */
export function useFarmers(): UseFarmers {
  const [rows, setRows] = useState<FarmerRow[]>([]);
  const [status, setStatus] = useState<FarmersStatus>('loading');
  const [error, setError] = useState<DataError | null>(null);
  const [pending, setPending] = useState<PendingMutation | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // State changes only in the promise callbacks, so the mount effect sets no state synchronously.
  const load = useCallback(
    () =>
      listFarmers().then(
        (all) => {
          if (!mounted.current) return;
          setRows(all);
          setError(null);
          setStatus('ready');
        },
        (caught: unknown) => {
          if (!mounted.current) return;
          setError(toDataError(caught));
          setStatus('error');
        },
      ),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /** Retry after an error: shows the loading state again, then reloads. */
  const reload = useCallback(async () => {
    setStatus('loading');
    await load();
  }, [load]);

  const run = useCallback(
    async (kind: FarmerMutation, farmerId: string | null, action: () => Promise<FarmerRow>): Promise<MutationResult> => {
      if (inFlight.current) return { ok: false, error: BUSY };
      inFlight.current = true;
      setPending({ kind, farmerId });
      try {
        const farmer = await action();
        // Refresh quietly: the list stays on screen while the new rows load.
        await load();
        return { ok: true, farmer };
      } catch (caught) {
        return { ok: false, error: toDataError(caught) };
      } finally {
        inFlight.current = false;
        if (mounted.current) setPending(null);
      }
    },
    [load],
  );

  const lists = useMemo(() => classifyFarmers(rows), [rows]);

  return {
    status,
    error,
    all: rows,
    lists,
    pending,
    reload,
    create: (values) => run('create', null, () => createFarmer(values)),
    update: (current, values) => run('update', current.id, () => updateFarmer(current, values)),
    setDisabled: (id, disabled) => run(disabled ? 'disable' : 'enable', id, () => setFarmerDisabled(id, disabled)),
    remove: (id) => run('delete', id, () => softDeleteFarmer(id)),
    restore: (id) => run('restore', id, () => restoreFarmer(id)),
  };
}
