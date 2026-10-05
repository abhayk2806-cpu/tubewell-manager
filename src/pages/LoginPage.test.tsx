import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mocked Supabase client: the real AuthProvider runs against these fakes.
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));

import { AuthProvider } from '@/auth/AuthProvider';
import { LoginPage } from '@/pages/LoginPage';

function renderLogin() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Login karo' }));
}

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe('LoginPage', () => {
  it('has labelled email and password fields and no sign-up or forgot-password link', () => {
    renderLogin();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('asks for both fields and does not call Supabase when they are empty', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Login karo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email aur password dono bharo.');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('shows the Hinglish wrong-password error and disables the button while submitting', async () => {
    let resolveSignIn: (value: unknown) => void = () => {};
    auth.signInWithPassword.mockReturnValue(new Promise((resolve) => { resolveSignIn = resolve; }));
    renderLogin();

    fillAndSubmit('  owner@example.com ', 'wrong-password');

    const busyButton = await screen.findByRole('button', { name: 'Login ho raha hai...' });
    expect(busyButton).toBeDisabled();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'wrong-password' });

    resolveSignIn({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Email ya password galat hai.');
    expect(screen.getByRole('button', { name: 'Login karo' })).toBeEnabled();
  });

  it('shows the network error text when the request itself fails', async () => {
    auth.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'));
    renderLogin();
    fillAndSubmit('owner@example.com', 'secret');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Login nahi ho paya. Internet check karke dobara try karo.',
    );
  });

  it('shows no error after a successful sign-in', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: {}, session: {} }, error: null });
    renderLogin();
    fillAndSubmit('owner@example.com', 'right-password');
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
