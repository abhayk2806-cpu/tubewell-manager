// Polish PL1: every route through the real App (lazy pages, guards, layout) with a fake session and
// mocked data reads. Pages arrive after their chunk loads, so the checks await them (findBy...).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const reads = vi.hoisted(() => ({ listFarmers: vi.fn(), listUsage: vi.fn(), listPayments: vi.fn() }));
vi.mock('@/lib/data/farmers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/data/farmers')>()), listFarmers: reads.listFarmers }));
vi.mock('@/lib/data/usage', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/data/usage')>()), listUsage: reads.listUsage }));
vi.mock('@/lib/data/payments', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/data/payments')>()), listPayments: reads.listPayments }));

import { AuthContext } from '@/auth/auth-context';
import { App } from './App';

const fakeSession = { access_token: 'test', user: { id: 'user-1' } } as unknown as Session;

/** A tiny auth provider: signIn sets the session, signOut clears it (no network). */
function FakeAuth({ children, start }: { children: ReactNode; start: Session | null }) {
  const [session, setSession] = useState<Session | null>(start);
  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading: false,
        signIn: async () => {
          setSession(fakeSession);
          return { ok: true };
        },
        signOut: async () => setSession(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function renderAt(path: string, start: Session | null = fakeSession) {
  return render(
    <FakeAuth start={start}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </FakeAuth>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(reads)) fn.mockReset().mockResolvedValue([]);
});

describe('App routes with lazy pages (PL1)', () => {
  it.each([
    ['/', 'Dashboard'],
    ['/farmers', 'Kisan'],
    ['/usage', 'Pani Entry'],
    ['/payments', 'Paisa'],
    ['/months', 'Mahine'],
    ['/backup', 'Backup'],
  ])('a direct load of %s shows its page after the chunk loads', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    // The shell (bottom navigation) is there at once, not inside the lazy chunk.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('a deep URL (a farmer profile, a month link) loads directly, as after a refresh', async () => {
    renderAt('/farmers/unknown-id');
    expect(await screen.findByText('Kisan nahi mila.')).toBeInTheDocument();
  });

  it('a month deep link loads directly', async () => {
    renderAt('/months?month=2026-10');
    expect(await screen.findByRole('heading', { level: 1, name: 'Mahine' })).toBeInTheDocument();
  });

  it('tab navigation moves between lazy pages and each page loads its data on mount', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    fireEvent.click(within(nav).getByRole('link', { name: /Pani/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Pani Entry' })).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole('link', { name: /Paisa/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Paisa' })).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole('link', { name: /Kisan/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Kisan' })).toBeInTheDocument();
    expect(reads.listFarmers.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('an unknown path shows the 404 page inside the layout', async () => {
    renderAt('/nahi-hai');
    expect(await screen.findByRole('heading', { name: 'Yeh page nahi mila' })).toBeInTheDocument();
  });

  it('logged out: any page redirects to the login screen', async () => {
    renderAt('/payments', null);
    expect(await screen.findByRole('button', { name: 'Login karo' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('login lands on the Dashboard; logout returns to the login screen', async () => {
    renderAt('/login', null);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'owner@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login karo' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Logout/ }));
    expect(await screen.findByRole('button', { name: 'Login karo' })).toBeInTheDocument();
  });
});
