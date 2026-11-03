// The app-level data store (FIX-1, I-001): farmers, usage and payments, loaded once per signed-in
// session and shared by every screen, plus the memoized screen derivations. Created by
// DataStoreProvider for a session and cleared on sign-out. Reads go through the data layer's list
// functions; backup export and restore verification never read from here (they read the server).
import { listFarmers, listPayments, listUsage } from '@/lib/data';
import type { FarmerRow, PaymentRow, UsageRow } from '@/lib/data';
import { createDerive, type Derive } from './derive';
import { createTableStore, type TableStore } from './tableStore';

export interface DataStore {
  readonly farmers: TableStore<FarmerRow>;
  readonly usage: TableStore<UsageRow>;
  readonly payments: TableStore<PaymentRow>;
  readonly derive: Derive;
  /** Starts every table's first load at once, in parallel (start-up), or revalidates stale ones. */
  prefetch(): void;
  /** Quiet revalidation of every loaded table whose rows are older than MAX_AGE_MS (tab visible again). */
  revalidateStale(): void;
  /** Forgets every row and every remembered derivation (sign-out). */
  clear(): void;
}

export interface TableRows {
  readonly farmers: FarmerRow;
  readonly usage: UsageRow;
  readonly payments: PaymentRow;
}

export type TableName = keyof TableRows;

/** Each table's list function: the same paged, id-ordered, count-checked reads as everywhere else. */
export const TABLE_LOADERS = {
  farmers: () => listFarmers(),
  usage: () => listUsage(),
  payments: () => listPayments(),
} as const satisfies { readonly [N in TableName]: () => Promise<TableRows[N][]> };

export function createDataStore(clock?: () => number): DataStore {
  const farmers = createTableStore<FarmerRow>(TABLE_LOADERS.farmers, clock);
  const usage = createTableStore<UsageRow>(TABLE_LOADERS.usage, clock);
  const payments = createTableStore<PaymentRow>(TABLE_LOADERS.payments, clock);
  const tables = [farmers, usage, payments];
  const derive = createDerive();
  return {
    farmers,
    usage,
    payments,
    derive,
    prefetch: () => tables.forEach((t) => t.ensureFresh()),
    revalidateStale: () => tables.forEach((t) => t.revalidateIfStale()),
    clear() {
      tables.forEach((t) => t.clear());
      derive.clear();
    },
  };
}
