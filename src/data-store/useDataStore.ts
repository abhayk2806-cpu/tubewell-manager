import { useContext, useState } from 'react';
import { DataStoreContext } from './context';
import { TABLE_LOADERS, type TableName, type TableRows } from './dataStore';
import { PLAIN_DERIVE, type Derive } from './derive';
import { createTableStore, type TableStore } from './tableStore';

/** Signed out: never loads, never holds a row. */
const SIGNED_OUT = createTableStore<{ readonly id: string }>(() => new Promise<never>(() => {}));

/**
 * The shared store of one table. Outside a DataStoreProvider (isolated component tests) each caller
 * gets its own private store with the same behaviour, loaded on mount.
 */
export function useTableStore<N extends TableName>(name: N): TableStore<TableRows[N]> {
  const shared = useContext(DataStoreContext);
  const [own] = useState(() => (shared === undefined ? createTableStore<TableRows[N]>(TABLE_LOADERS[name] as () => Promise<TableRows[N][]>) : null));
  if (shared === undefined) return own as TableStore<TableRows[N]>;
  if (shared === null) return SIGNED_OUT as unknown as TableStore<TableRows[N]>;
  return shared[name] as unknown as TableStore<TableRows[N]>;
}

/** The session's memoized derivations; outside a provider (or signed out), the plain builders. */
export function useDerive(): Derive {
  return useContext(DataStoreContext)?.derive ?? PLAIN_DERIVE;
}
