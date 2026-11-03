import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/App';
import { AuthProvider } from '@/auth/AuthProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DataStoreProvider } from '@/data-store/DataStoreProvider';
import { prefetchAllPages } from './pagePreload';

/** Runs `task` once the browser is idle after the next paint (a timer where idle callbacks are missing). */
function whenIdleAfterPaint(task: () => void): void {
  requestAnimationFrame(() => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(task, { timeout: 3000 });
    else window.setTimeout(task, 1000);
  });
}

/** The normal start, loaded by main.tsx only when the config is fine. */
export function startApp(rootElement: HTMLElement): void {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <DataStoreProvider>
              <App />
            </DataStoreProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  );
  // The other screens' code, while the browser has nothing else to do (FIX-1).
  whenIdleAfterPaint(prefetchAllPages);
}
