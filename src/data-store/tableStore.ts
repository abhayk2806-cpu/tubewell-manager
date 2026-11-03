// One table's rows, shared by every screen (FIX-1, I-001): stale-while-revalidate. The first load
// shows the loading state; after that the cached rows are shown at once and refreshed quietly in the
// background when they are older than MAX_AGE_MS, or after one of the app's own saves.
import { DataError, toDataError } from '@/lib/data';

export type LoadStatus = 'loading' | 'error' | 'ready';

export type RowResult<R> = { readonly ok: true; readonly row: R } | { readonly ok: false; readonly error: DataError };

export interface Pending {
  readonly kind: string;
  /** The row being changed; null for create. */
  readonly id: string | null;
}

export interface TableSnapshot<R> {
  readonly rows: readonly R[];
  readonly status: LoadStatus;
  /** The error of a failed (initial or retried) full load. */
  readonly error: DataError | null;
  /** The quiet reload after one of the app's own saves failed: the saved row and the other cached rows are still shown. */
  readonly refreshFailed: boolean;
  /** A background revalidation (stale cache on mount, tab visible again) failed: the cached rows are still shown, maybe old. */
  readonly backgroundRefreshFailed: boolean;
  readonly pending: Pending | null;
}

export interface TableStore<R> {
  getSnapshot(): TableSnapshot<R>;
  subscribe(listener: () => void): () => void;
  /** When a screen mounts: the first load (or a retry after a failed load), else a quiet revalidation if stale. */
  ensureFresh(): void;
  /** A quiet revalidation, only when loaded rows are older than MAX_AGE_MS and nothing is loading. */
  revalidateIfStale(): void;
  /** Full reload: shows the loading state, and the error state if it fails. */
  reload(): Promise<void>;
  /** Quiet reload: keeps the rows on screen whatever happens. */
  retryRefresh(): Promise<void>;
  /** One write at a time: on success the returned row is shown at once, then the table reloads quietly. */
  run(kind: string, id: string | null, action: () => Promise<R>): Promise<RowResult<R>>;
  /** Forgets every row and drops loads in flight (sign-out). */
  clear(): void;
}

/** Cached rows older than this are revalidated in the background when a screen mounts or the tab shows again. */
export const MAX_AGE_MS = 30_000;

const BUSY = new DataError('unknown', 'busy', 'another change is still being saved');
const INITIAL: TableSnapshot<never> = { rows: [], status: 'loading', error: null, refreshFailed: false, backgroundRefreshFailed: false, pending: null };

/**
 * Why a load runs. full: the loading state, then the error state on failure. The others keep the rows
 * on screen; on failure save sets refreshFailed, background sets backgroundRefreshFailed, and retry
 * leaves both flags as they are. Any successful load clears both.
 */
type LoadMode = 'full' | 'save' | 'background' | 'retry';

type Row = { readonly id: string };

/** Same rows in the same order with the same field values: a revalidation that changed nothing keeps the old array. */
function sameRows(a: readonly Row[], b: readonly Row[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i] as Record<string, unknown>;
    const entries = Object.entries(row);
    return entries.length === Object.keys(other).length && entries.every(([key, value]) => other[key] === value);
  });
}

/** The rows with `row` put in by id: replaced where it is, else inserted in id order (the server's order). */
function withRow<R extends Row>(rows: readonly R[], row: R): R[] {
  const at = rows.findIndex((r) => r.id === row.id);
  if (at !== -1) return rows.map((r, i) => (i === at ? row : r));
  const next = [...rows];
  const before = next.findIndex((r) => r.id > row.id);
  next.splice(before === -1 ? next.length : before, 0, row);
  return next;
}

export function createTableStore<R extends Row>(load: () => Promise<R[]>, clock: () => number = () => performance.now()): TableStore<R> {
  let snapshot: TableSnapshot<R> = INITIAL;
  const listeners = new Set<() => void>();
  // Only the newest load may change the rows, so an older answer can never overwrite a newer one.
  let latest = 0;
  let inFlight: Promise<void> | null = null;
  let loadedAt: number | null = null;
  let writing = false;
  let generation = 0;

  const set = (patch: Partial<TableSnapshot<R>>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };

  const isStale = () => loadedAt === null || clock() - loadedAt > MAX_AGE_MS;

  const start = (mode: LoadMode): Promise<void> => {
    latest += 1;
    const mine = latest;
    if (mode === 'full') set({ status: 'loading' });
    const done = load()
      .then(
        (rows) => {
          if (mine !== latest) return;
          loadedAt = clock();
          set({ rows: sameRows(snapshot.rows, rows) ? snapshot.rows : rows, status: 'ready', error: null, refreshFailed: false, backgroundRefreshFailed: false });
        },
        (caught: unknown) => {
          if (mine !== latest) return;
          if (mode === 'full') set({ status: 'error', error: toDataError(caught) });
          else if (mode === 'save') set({ refreshFailed: true });
          else if (mode === 'background') set({ backgroundRefreshFailed: true });
        },
      )
      .finally(() => {
        if (mine === latest) inFlight = null;
      });
    inFlight = done;
    return done;
  };

  const revalidateIfStale = () => {
    if (inFlight === null && snapshot.status === 'ready' && isStale()) void start('background');
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ensureFresh() {
      if (snapshot.status === 'ready') revalidateIfStale();
      else if (inFlight === null) void start('full');
    },
    revalidateIfStale,
    reload: () => start('full'),
    retryRefresh: () => start('retry'),
    async run(kind, id, action) {
      if (writing) return { ok: false, error: BUSY };
      writing = true;
      const mine = generation;
      set({ pending: { kind, id } });
      try {
        const row = await action();
        if (mine === generation) {
          // Saved: a failing reload only sets refreshFailed, it never hides the list.
          set({ rows: withRow(snapshot.rows, row) });
          void start('save');
        }
        return { ok: true, row };
      } catch (caught) {
        return { ok: false, error: toDataError(caught) };
      } finally {
        writing = false;
        if (mine === generation) set({ pending: null });
      }
    },
    clear() {
      generation += 1;
      latest += 1;
      inFlight = null;
      loadedAt = null;
      set(INITIAL);
    },
  };
}
