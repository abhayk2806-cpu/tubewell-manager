import { useMemo } from 'react';
import { classifyUsage, createUsage, listUsage, restoreUsage, softDeleteUsage, updateUsage } from '@/lib/data';
import type { DataError, UsageInput, UsageRow } from '@/lib/data';
import { useRowStore, type LoadStatus } from './useRowStore';

export type UsageMutation = 'create' | 'update' | 'delete' | 'restore';

export type UsageMutationResult = { readonly ok: true; readonly entry: UsageRow } | { readonly ok: false; readonly error: DataError };

export interface PendingUsageMutation {
  readonly kind: UsageMutation;
  /** The entry being changed; null for create. */
  readonly entryId: string | null;
}

export interface UseUsage {
  readonly status: LoadStatus;
  readonly error: DataError | null;
  /** A change was saved, but the list could not be reloaded afterwards; the old list is still shown. */
  readonly refreshFailed: boolean;
  /** Every row (live and deleted), for duplicate warnings and the month list. */
  readonly all: readonly UsageRow[];
  /** Not deleted, newest first. */
  readonly live: readonly UsageRow[];
  /** Soft-deleted (Recently Deleted), newest first. */
  readonly deleted: readonly UsageRow[];
  readonly pending: PendingUsageMutation | null;
  reload(): Promise<void>;
  retryRefresh(): Promise<void>;
  create(input: UsageInput): Promise<UsageMutationResult>;
  update(current: UsageRow, input: UsageInput): Promise<UsageMutationResult>;
  remove(id: string): Promise<UsageMutationResult>;
  restore(id: string): Promise<UsageMutationResult>;
}

/** Loads all usage entries once, splits them into live and deleted, and reloads after every change. */
export function useUsage(): UseUsage {
  const store = useRowStore<UsageRow, UsageMutation>(listUsage);
  const lists = useMemo(() => classifyUsage(store.rows), [store.rows]);

  const run = async (kind: UsageMutation, id: string | null, action: () => Promise<UsageRow>): Promise<UsageMutationResult> => {
    const result = await store.run(kind, id, action);
    return result.ok ? { ok: true, entry: result.row } : result;
  };

  return {
    status: store.status,
    error: store.error,
    refreshFailed: store.refreshFailed,
    all: store.rows,
    live: lists.live,
    deleted: lists.deleted,
    pending: store.pending === null ? null : { kind: store.pending.kind, entryId: store.pending.id },
    reload: store.reload,
    retryRefresh: store.retryRefresh,
    create: (input) => run('create', null, () => createUsage(input)),
    update: (current, input) => run('update', current.id, () => updateUsage(current, input)),
    remove: (id) => run('delete', id, () => softDeleteUsage(id)),
    restore: (id) => run('restore', id, () => restoreUsage(id)),
  };
}
