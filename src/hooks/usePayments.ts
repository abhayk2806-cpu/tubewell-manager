import { useMemo } from 'react';
import { classifyPayments, createPayment, listPayments, restorePayment, softDeletePayment, updatePayment } from '@/lib/data';
import type { DataError, PaymentInput, PaymentRow } from '@/lib/data';
import { useRowStore, type LoadStatus } from './useRowStore';

export type PaymentMutation = 'create' | 'update' | 'delete' | 'restore';

export type PaymentMutationResult = { readonly ok: true; readonly payment: PaymentRow } | { readonly ok: false; readonly error: DataError };

export interface PendingPaymentMutation {
  readonly kind: PaymentMutation;
  /** The payment being changed; null for create. */
  readonly paymentId: string | null;
}

export interface UsePayments {
  readonly status: LoadStatus;
  readonly error: DataError | null;
  /** A change was saved, but the list could not be reloaded afterwards; the old list is still shown. */
  readonly refreshFailed: boolean;
  /** Every row (live and deleted), for the preview, duplicate warnings and the month list. */
  readonly all: readonly PaymentRow[];
  /** Not deleted, newest first. */
  readonly live: readonly PaymentRow[];
  /** Soft-deleted (Recently Deleted), newest first. */
  readonly deleted: readonly PaymentRow[];
  readonly pending: PendingPaymentMutation | null;
  reload(): Promise<void>;
  retryRefresh(): Promise<void>;
  create(input: PaymentInput): Promise<PaymentMutationResult>;
  update(current: PaymentRow, input: PaymentInput): Promise<PaymentMutationResult>;
  remove(id: string): Promise<PaymentMutationResult>;
  restore(id: string): Promise<PaymentMutationResult>;
}

/** Loads all payments once, splits them into live and deleted, and reloads after every change. */
export function usePayments(): UsePayments {
  const store = useRowStore<PaymentRow, PaymentMutation>(listPayments);
  const lists = useMemo(() => classifyPayments(store.rows), [store.rows]);

  const run = async (kind: PaymentMutation, id: string | null, action: () => Promise<PaymentRow>): Promise<PaymentMutationResult> => {
    const result = await store.run(kind, id, action);
    return result.ok ? { ok: true, payment: result.row } : result;
  };

  return {
    status: store.status,
    error: store.error,
    refreshFailed: store.refreshFailed,
    all: store.rows,
    live: lists.live,
    deleted: lists.deleted,
    pending: store.pending === null ? null : { kind: store.pending.kind, paymentId: store.pending.id },
    reload: store.reload,
    retryRefresh: store.retryRefresh,
    create: (input) => run('create', null, () => createPayment(input)),
    update: (current, input) => run('update', current.id, () => updatePayment(current, input)),
    remove: (id) => run('delete', id, () => softDeletePayment(id)),
    restore: (id) => run('restore', id, () => restorePayment(id)),
  };
}
