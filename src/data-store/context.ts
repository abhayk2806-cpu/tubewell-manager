import { createContext } from 'react';
import type { DataStore } from './dataStore';

/**
 * undefined: no DataStoreProvider above (an isolated component test); null: the provider is there
 * but nobody is signed in; otherwise the signed-in session's store.
 */
export const DataStoreContext = createContext<DataStore | null | undefined>(undefined);
