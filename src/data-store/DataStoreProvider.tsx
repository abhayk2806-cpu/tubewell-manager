import { useEffect, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/auth/useAuth';
import { DataStoreContext } from './context';
import { createDataStore } from './dataStore';

/**
 * One data store per signed-in session (inside AuthProvider). As soon as a session exists the three
 * tables start loading in parallel, without waiting for the page's code; when the tab becomes visible
 * again, stale tables are revalidated quietly. Signing out (the user becomes null) clears the store,
 * and the next sign-in, even as the same user, gets a new empty one: no old rows stay in memory.
 */
export function DataStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const store = useMemo(() => (userId === null ? null : createDataStore()), [userId]);

  useEffect(() => {
    if (store === null) return;
    store.prefetch();
    const onVisible = () => {
      if (document.visibilityState === 'visible') store.revalidateStale();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      store.clear();
    };
  }, [store]);

  return <DataStoreContext.Provider value={store}>{children}</DataStoreContext.Provider>;
}
