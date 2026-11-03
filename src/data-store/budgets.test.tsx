// FIX-1 (I-001) budgets, enforced on the real app tree (App + DataStoreProvider + the real data
// layer) against a counting fake of the Supabase client. Fictional rows only; no network. Each read
// or write is one call that reaches `then` on a query (one HTTP request in the real client).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

type Table = 'farmers' | 'usage_entries' | 'payments';
type Call = { readonly table: Table; readonly op: 'read' | 'insert'; readonly count: boolean; readonly from: number; readonly to: number };

const server = vi.hoisted(() => ({
  tables: { farmers: [], usage_entries: [], payments: [] } as Record<Table, Record<string, unknown>[]>,
  calls: [] as Call[],
  /** While true, reads wait until release() (to see what is asked before anything answers). */
  hold: false,
  waiting: [] as (() => void)[],
  /** Reads that fail like a lost connection, counted down (FIX-1b). */
  failReads: 0,
}));

vi.mock('@/lib/supabase', () => {
  const answer = (table: Table, call: Call, insert: Record<string, unknown> | null) => {
    if (insert !== null) {
      const row = { ...insert, id: `00000000-0000-4000-8000-${String(900 + server.tables[table].length).padStart(12, '0')}`, created_at: '2026-10-06T08:35:00+00:00', created_by: null, updated_at: '2026-10-06T08:35:00+00:00', updated_by: null, deleted_at: null, deleted_by: null, total_minutes: Number(insert.hours) * 60 + Number(insert.minutes) };
      server.tables[table].push(row);
      return { data: row, error: null, status: 201 };
    }
    const rows = [...server.tables[table]].sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
    return { data: rows.slice(call.from, call.to + 1), error: null, status: 200, count: call.count ? rows.length : null };
  };
  const from = (table: Table) => {
    const state = { count: false, from: 0, to: 999, insert: null as Record<string, unknown> | null };
    const query = {
      select: (_columns?: string, options?: { count?: string }) => {
        if (options?.count === 'exact') state.count = true;
        return query;
      },
      order: () => query,
      range: (lo: number, hi: number) => {
        state.from = lo;
        state.to = hi;
        return query;
      },
      insert: (row: Record<string, unknown>) => {
        state.insert = row;
        return query;
      },
      single: () => query,
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        const call: Call = { table, op: state.insert === null ? 'read' : 'insert', count: state.count, from: state.from, to: state.to };
        server.calls.push(call);
        const ready = server.hold && call.op === 'read' ? new Promise<void>((r) => server.waiting.push(r)) : Promise.resolve();
        const failed = call.op === 'read' && server.failReads > 0;
        if (failed) server.failReads -= 1;
        const result = () => (failed ? { data: null, error: { message: 'Failed to fetch' }, status: 0 } : answer(table, call, state.insert));
        return ready.then(result).then(onFulfilled, onRejected);
      },
    };
    return query;
  };
  return { supabase: { from } };
});
const browser = vi.hoisted(() => ({ downloads: [] as string[] }));
vi.mock('@/pages/backup/browser', () => ({
  downloadText: (_name: string, text: string) => browser.downloads.push(text),
  readLastBackup: () => '2026-10-06T08:00:00.000Z',
  storeLastBackup: () => {},
}));

import { AuthContext } from '@/auth/auth-context';
import { App } from '@/App';
import { exportBackup, verifyRestore } from '@/lib/data';
import { farmerRow, paymentRow, usageRow } from '@/lib/data/test-support/fakeSupabase';
import { MAX_AGE_MS } from './tableStore';
import { DataStoreProvider } from './DataStoreProvider';

const owner = { access_token: 'test', user: { id: 'owner-1' } } as unknown as Session;
const FARMER_A = '00000000-0000-4000-8000-000000000001';
const FARMER_B = '00000000-0000-4000-8000-000000000002';

function seed() {
  server.tables.farmers = [farmerRow({ id: FARMER_A, name: 'Asha Test' }), farmerRow({ id: FARMER_B, name: 'Bholu Test' })];
  server.tables.usage_entries = [
    usageRow({ id: '00000000-0000-4000-8000-000000000101', farmer_id: FARMER_A, used_at: '2026-10-02T04:30:00+00:00', hours: 2, minutes: 0 }),
    usageRow({ id: '00000000-0000-4000-8000-000000000102', farmer_id: FARMER_B, used_at: '2026-10-03T04:30:00+00:00', hours: 1, minutes: 30 }),
  ];
  server.tables.payments = [paymentRow({ id: '00000000-0000-4000-8000-000000000201', farmer_id: FARMER_A, paid_at: '2026-10-04T04:30:00+00:00', amount_paise: 5000 })];
}

/** Lets the test sign the owner out and in again, like onAuthStateChange would. */
const auth: { setSession: (session: Session | null) => void } = { setSession: () => {} };
function FakeAuth({ children }: { children: ReactNode }) {
  const [session, set] = useState<Session | null>(owner);
  useEffect(() => {
    auth.setSession = set;
  }, []);
  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading: false, signIn: async () => ({ ok: true }), signOut: async () => set(null) }}>
      {children}
    </AuthContext.Provider>
  );
}

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FakeAuth>
        <DataStoreProvider>
          <App />
        </DataStoreProvider>
      </FakeAuth>
    </MemoryRouter>,
  );
}

const reads = () => server.calls.filter((c) => c.op === 'read');
const release = () => server.waiting.splice(0).forEach((go) => go());
const nav = (label: string) => fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByText(label));

// The store's freshness clock is performance.now(): tests move it forward without touching timers.
let offset = 0;
beforeEach(async () => {
  seed();
  server.calls = [];
  server.hold = false;
  server.waiting = [];
  server.failReads = 0;
  browser.downloads = [];
  offset = 0;
  const real = performance.now.bind(performance);
  vi.spyOn(performance, 'now').mockImplementation(() => real() + offset);
  // Load every screen's code first, so the checks are about data, not about chunk downloads.
  await Promise.all([
    import('@/pages/dashboard/DashboardPage'),
    import('@/pages/usage/UsagePage'),
    import('@/pages/payments/PaymentsPage'),
    import('@/pages/farmers/FarmersPage'),
    import('@/pages/months/MonthsPage'),
    import('@/pages/backup/BackupPage'),
    import('@/pages/farmers/FarmerProfilePage'),
  ]);
});

afterEach(() => {
  release();
});

async function coldOpen() {
  renderApp('/');
  await screen.findByTestId('dash-charges', {}, { timeout: 5000 });
}

describe('budget: cold open after login', () => {
  it('exactly 3 data requests, one per table, all asked before any answers (one parallel stage)', async () => {
    server.hold = true;
    renderApp('/');
    await waitFor(() => expect(reads()).toHaveLength(3));
    // Nothing has answered yet, and all three tables are already asked: one sequential data stage.
    expect(reads().map((c) => c.table).sort()).toEqual(['farmers', 'payments', 'usage_entries']);
    expect(reads().every((c) => c.count && c.from === 0)).toBe(true);
    expect(screen.queryByTestId('dash-charges')).not.toBeInTheDocument();
    act(release);
    await screen.findByTestId('dash-charges', {}, { timeout: 5000 });
    expect(reads()).toHaveLength(3);
  });
});

describe('budget: tab switch with a warm cache', () => {
  const TABS = [
    ['Pani', 'Pani Entry', 'Entries load ho rahi hain...'],
    ['Paisa', 'Paisa', 'Payments load ho rahe hain...'],
    ['Kisan', 'Kisan', 'Kisan load ho rahe hain...'],
    ['Mahine', 'Mahine', 'Mahine load ho rahe hain...'],
    ['Dashboard', 'Dashboard', 'Dashboard load ho raha hai...'],
  ] as const;

  it('0 requests and no loading state on any tab while the cache is fresh', async () => {
    await coldOpen();
    const before = server.calls.length;
    for (const [label, title, loading] of TABS) {
      nav(label);
      await screen.findByRole('heading', { level: 1, name: title });
      expect(screen.queryByText(loading)).not.toBeInTheDocument();
    }
    expect(server.calls.length - before).toBe(0);
  });

  it('older than 30 s: the cached rows show at once, and only a quiet background revalidation runs', async () => {
    await coldOpen();
    const before = reads().length;
    offset = MAX_AGE_MS + 1000;
    server.hold = true;
    nav('Pani');
    await screen.findByRole('heading', { level: 1, name: 'Pani Entry' });
    expect(screen.queryByText('Entries load ho rahi hain...')).not.toBeInTheDocument();
    await waitFor(() => expect(reads().length - before).toBe(3));
    // Still waiting for the server: the cached page stays, no loading line.
    expect(screen.queryByText('Entries load ho rahi hain...')).not.toBeInTheDocument();
    act(release);
    await waitFor(() => expect(server.waiting).toHaveLength(0));
    // Fresh again: the next switch asks nothing.
    const after = reads().length;
    nav('Paisa');
    await screen.findByRole('heading', { level: 1, name: 'Paisa' });
    expect(reads().length).toBe(after);
  });
});

describe('budget: one save', () => {
  it('1 write + at most 1 reload of the affected table, nothing else', async () => {
    await coldOpen();
    nav('Pani');
    await screen.findByRole('heading', { level: 1, name: 'Pani Entry' });
    const before = server.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Naya Pani Entry' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: FARMER_A } });
    fireEvent.change(within(dialog).getByLabelText('Ghante'), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(server.calls.length - before).toBe(2));
    const made = server.calls.slice(before);
    expect(made.map((c) => [c.op, c.table])).toEqual([
      ['insert', 'usage_entries'],
      ['read', 'usage_entries'],
    ]);
  });
});

describe('budget: backup reads the server, never the cache', () => {
  it('export with a warm cache reads all three tables again and contains a row the cache never saw', async () => {
    await coldOpen();
    // A row written elsewhere (another device) after this session cached its rows.
    server.tables.payments.push(paymentRow({ id: '00000000-0000-4000-8000-000000000299', farmer_id: FARMER_B, paid_at: '2026-10-05T04:30:00+00:00', amount_paise: 777 }));
    nav('Backup');
    await screen.findByRole('heading', { level: 1, name: 'Backup' });
    const before = reads().length;
    fireEvent.click(screen.getByRole('button', { name: 'Backup download karo' }));
    await waitFor(() => expect(browser.downloads).toHaveLength(1));
    expect(reads().slice(before).map((c) => c.table).sort()).toEqual(['farmers', 'payments', 'usage_entries']);
    expect(browser.downloads[0]).toContain('00000000-0000-4000-8000-000000000299');
  });

  it('export and restore verification each read every table from the server', async () => {
    await coldOpen();
    const before = reads().length;
    const exported = await exportBackup();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(reads().length - before).toBe(3);
    const verified = await verifyRestore(exported.file, 'replace');
    expect(verified.ok && verified.verification.verified).toBe(true);
    expect(reads().length - before).toBe(6);
  });
});

describe('budget: sign-out clears the store', () => {
  it('signing in again as the same user shows the loading state, never the old rows', async () => {
    await coldOpen();
    expect(screen.getAllByText('Asha Test').length).toBeGreaterThan(0);
    act(() => auth.setSession(null));
    await waitFor(() => expect(screen.queryByText('Asha Test')).not.toBeInTheDocument());
    server.hold = true;
    const before = reads().length;
    act(() => auth.setSession(owner));
    // Same user, new session: the old rows are gone, the first load starts again.
    await waitFor(() => expect(reads().length - before).toBe(3));
    expect(await screen.findByText('Dashboard load ho raha hai...')).toBeInTheDocument();
    expect(screen.queryByText('Asha Test')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dash-charges')).not.toBeInTheDocument();
    act(release);
    await screen.findByTestId('dash-charges', {}, { timeout: 5000 });
  });
});

// FIX-1b: a failed BACKGROUND refresh tells the owner the figures may be old; it never says "Save ho gaya".
describe('notice: a failed background refresh is not a failed save', () => {
  const LIST = 'Naya data abhi nahi aa paya. Jo list dikh rahi hai wo purani ho sakti hai.';
  const PROFILE = 'Naya data abhi nahi aa paya. Jo hisaab dikh raha hai wo purana ho sakta hai.';
  const DASHBOARD = 'Naya data abhi nahi aa paya. Dashboard par jo dikh raha hai wo purana ho sakta hai.';

  /** The stale-cache revalidation on the next screen mount fails like a weak network. */
  function goStaleAndOffline() {
    offset += MAX_AGE_MS + 1000;
    server.failReads = Number.POSITIVE_INFINITY;
  }

  async function expectBackgroundNotice(text: string) {
    const notice = await screen.findByText(text);
    expect(screen.queryByText(/Save ho gaya/)).not.toBeInTheDocument();
    // Retry: the connection is back, the quiet reload clears the notice.
    server.failReads = 0;
    fireEvent.click(within(notice.parentElement as HTMLElement).getByRole('button', { name: 'Dobara try karo' }));
    await waitFor(() => expect(screen.queryByText(text)).not.toBeInTheDocument());
  }

  it.each([
    ['Pani', 'Pani Entry'],
    ['Paisa', 'Paisa'],
    ['Kisan', 'Kisan'],
  ] as const)('%s: the cached list stays, with the "may be old" line and a working retry', async (label, title) => {
    await coldOpen();
    goStaleAndOffline();
    nav(label);
    await screen.findByRole('heading', { level: 1, name: title });
    await screen.findByText(LIST);
    // The cached rows are still on screen (a farmer name from the cache).
    expect(screen.getAllByText(/Asha Test/).length).toBeGreaterThan(0);
    await expectBackgroundNotice(LIST);
  });

  it('Dashboard: the cached figures stay, with the dashboard "may be old" line', async () => {
    await coldOpen();
    nav('Pani');
    await screen.findByRole('heading', { level: 1, name: 'Pani Entry' });
    goStaleAndOffline();
    nav('Dashboard');
    await screen.findByText(DASHBOARD);
    expect(screen.getByTestId('dash-charges')).toBeInTheDocument();
    await expectBackgroundNotice(DASHBOARD);
  });

  it('Kisan ka Hisaab: the cached hisaab stays, with the hisaab "may be old" line', async () => {
    await coldOpen();
    nav('Kisan');
    await screen.findByRole('heading', { level: 1, name: 'Kisan' });
    goStaleAndOffline();
    fireEvent.click(screen.getByRole('link', { name: 'Asha Test ka hisaab kholo' }));
    await screen.findByText(PROFILE);
    expect(screen.getByTestId('total-charges')).toBeInTheDocument();
    await expectBackgroundNotice(PROFILE);
  });

  it('the tab becoming visible again with a stale cache: same notice when the refresh fails', async () => {
    await coldOpen();
    goStaleAndOffline();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await screen.findByText(DASHBOARD);
    expect(screen.queryByText(/Save ho gaya/)).not.toBeInTheDocument();
  });

  it('a failed reload after a save keeps the save message, also when a background refresh fails after it', async () => {
    await coldOpen();
    nav('Pani');
    await screen.findByRole('heading', { level: 1, name: 'Pani Entry' });
    fireEvent.click(screen.getByRole('button', { name: 'Naya Pani Entry' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: FARMER_A } });
    fireEvent.change(within(dialog).getByLabelText('Ghante'), { target: { value: '1' } });
    server.failReads = 1;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await screen.findByText('Save ho gaya, par list refresh nahi ho payi.');
    // Away and back with a stale cache while still offline: the save message stays, it is not replaced.
    nav('Paisa');
    await screen.findByRole('heading', { level: 1, name: 'Paisa' });
    goStaleAndOffline();
    nav('Pani');
    await screen.findByRole('heading', { level: 1, name: 'Pani Entry' });
    await waitFor(() => expect(server.calls.filter((c) => c.table === 'usage_entries' && c.op === 'read').length).toBeGreaterThanOrEqual(3));
    expect(screen.getByText('Save ho gaya, par list refresh nahi ho payi.')).toBeInTheDocument();
    expect(screen.queryByText(LIST)).not.toBeInTheDocument();
  });
});
