import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { AuthContext, type AuthContextValue } from '@/auth/auth-context';
import { ProtectedRoute, PublicRoute } from '@/routes/RouteGuards';

const fakeSession = { access_token: 'test', user: { id: 'user-1' } } as unknown as Session;

function authValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    session: null,
    user: null,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
}

function renderAt(path: string, value: AuthContextValue) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<PublicRoute><p>LOGIN SCREEN</p></PublicRoute>} />
          <Route path="/" element={<ProtectedRoute><p>HOME SCREEN</p></ProtectedRoute>} />
          <Route path="/farmers" element={<ProtectedRoute><p>FARMERS SCREEN</p></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ProtectedRoute', () => {
  it('shows the loading state (not the page, not a redirect) while the session is being restored', () => {
    renderAt('/farmers', authValue({ loading: true }));
    expect(screen.getByRole('status')).toHaveTextContent('Load ho raha hai...');
    expect(screen.queryByText('FARMERS SCREEN')).not.toBeInTheDocument();
    expect(screen.queryByText('LOGIN SCREEN')).not.toBeInTheDocument();
  });

  it('redirects a logged-out user to /login', () => {
    renderAt('/farmers', authValue({ session: null }));
    expect(screen.getByText('LOGIN SCREEN')).toBeInTheDocument();
    expect(screen.queryByText('FARMERS SCREEN')).not.toBeInTheDocument();
  });

  it('renders the page for a logged-in user', () => {
    renderAt('/farmers', authValue({ session: fakeSession, user: fakeSession.user }));
    expect(screen.getByText('FARMERS SCREEN')).toBeInTheDocument();
  });
});

describe('PublicRoute', () => {
  it('sends a logged-in user from /login to the dashboard', () => {
    renderAt('/login', authValue({ session: fakeSession, user: fakeSession.user }));
    expect(screen.getByText('HOME SCREEN')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN SCREEN')).not.toBeInTheDocument();
  });

  it('shows the login page to a logged-out user', () => {
    renderAt('/login', authValue({ session: null }));
    expect(screen.getByText('LOGIN SCREEN')).toBeInTheDocument();
  });
});
