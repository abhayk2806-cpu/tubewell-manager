// Polish PL1: the lazy-page fallback, and a page whose code cannot be downloaded (offline, or a new
// deploy replaced the files) shows a clear Hinglish message with a reload button, never a blank screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { lazy, Suspense, type ComponentType } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { PageLoading } from './PageLoading';
import { isChunkLoadError } from './chunkError';

function failingPage(error: Error) {
  return lazy<ComponentType>(() => Promise.reject(error));
}

function renderLazy(Page: ComponentType) {
  return render(
    <ErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        <Page />
      </Suspense>
    </ErrorBoundary>,
  );
}

const reload = vi.fn();
let restoreLocation: () => void = () => {};

beforeEach(() => {
  // React logs caught errors; keep the output quiet. jsdom's location.reload cannot be spied on directly.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const original = window.location;
  Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
  restoreLocation = () => Object.defineProperty(window, 'location', { configurable: true, value: original });
  reload.mockReset();
});

afterEach(() => restoreLocation());

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x.test/assets/UsagePage-abc.js',
    'error loading dynamically imported module: https://x.test/assets/a.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/a.css',
  ])('recognises %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('a ChunkLoadError by name counts; other errors and non-errors do not', () => {
    const named = new Error('x');
    named.name = 'ChunkLoadError';
    expect(isChunkLoadError(named)).toBe(true);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
  });
});

describe('lazy page loading and chunk errors', () => {
  it('shows the shared fallback while a page chunk is still loading', () => {
    const Pending = lazy<ComponentType>(() => new Promise(() => {}));
    renderLazy(Pending);
    const line = screen.getByTestId('page-loading');
    expect(line).toHaveTextContent('Load ho raha hai...');
    expect(line).toHaveAttribute('role', 'status');
    expect(line).toHaveClass('text-muted-foreground');
  });

  it('a failed chunk download shows the Hinglish message and "Dobara try karo" reloads the page', async () => {
    renderLazy(failingPage(new TypeError('Failed to fetch dynamically imported module: https://x.test/assets/MonthsPage-abc.js')));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Yeh screen load nahi ho payi.');
    expect(alert).toHaveTextContent('Internet check karo');
    fireEvent.click(screen.getByRole('button', { name: 'Dobara try karo' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('any other error keeps the existing message', async () => {
    renderLazy(failingPage(new Error('boom')));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kuch gadbad ho gayi.');
    expect(screen.getByRole('button', { name: 'Reload karo' })).toBeInTheDocument();
  });
});
