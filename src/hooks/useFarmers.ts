import { useMemo } from 'react';
import {
  classifyFarmers,
  createFarmer,
  listFarmers,
  restoreFarmer,
  setFarmerDisabled,
  softDeleteFarmer,
  updateFarmer,
} from '@/lib/data';
import type { DataError, FarmerFormValues, FarmerLists, FarmerRow } from '@/lib/data';
import { useRowStore, type LoadStatus } from './useRowStore';

export type FarmersStatus = LoadStatus;
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
  /** A change was saved, but the list could not be reloaded afterwards; the old list is still shown. */
  readonly refreshFailed: boolean;
  /** Every row (all three lists), for duplicate-name checks and names. */
  readonly all: readonly FarmerRow[];
  readonly lists: FarmerLists;
  /** The mutation in flight, or null. Only one runs at a time (no double submit). */
  readonly pending: PendingMutation | null;
  reload(): Promise<void>;
  retryRefresh(): Promise<void>;
  create(values: FarmerFormValues): Promise<MutationResult>;
  update(current: FarmerRow, values: FarmerFormValues): Promise<MutationResult>;
  setDisabled(id: string, disabled: boolean): Promise<MutationResult>;
  remove(id: string): Promise<MutationResult>;
  restore(id: string): Promise<MutationResult>;
}

/** Loads all farmers once, exposes them split into Chalu / Band / Deleted, and reloads after every change. */
export function useFarmers(): UseFarmers {
  const store = useRowStore<FarmerRow, FarmerMutation>(listFarmers);
  const lists = useMemo(() => classifyFarmers(store.rows), [store.rows]);

  const run = async (kind: FarmerMutation, id: string | null, action: () => Promise<FarmerRow>): Promise<MutationResult> => {
    const result = await store.run(kind, id, action);
    return result.ok ? { ok: true, farmer: result.row } : result;
  };

  return {
    status: store.status,
    error: store.error,
    refreshFailed: store.refreshFailed,
    all: store.rows,
    lists,
    pending: store.pending === null ? null : { kind: store.pending.kind, farmerId: store.pending.id },
    reload: store.reload,
    retryRefresh: store.retryRefresh,
    create: (values) => run('create', null, () => createFarmer(values)),
    update: (current, values) => run('update', current.id, () => updateFarmer(current, values)),
    setDisabled: (id, disabled) => run(disabled ? 'disable' : 'enable', id, () => setFarmerDisabled(id, disabled)),
    remove: (id) => run('delete', id, () => softDeleteFarmer(id)),
    restore: (id) => run('restore', id, () => restoreFarmer(id)),
  };
}
