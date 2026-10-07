// Phase 10A fix 1: a missing or wrong Supabase variable shows a Hinglish screen with the variable
// NAMES (never a value) instead of a blank page; with a good config the app starts as before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

import { configProblem } from './configProblem';

// Made-up values: none of them may ever reach the page or the console.
const GOOD_URL = 'https://dummy-ref-for-tests.supabase.co';
const GOOD_KEY = 'sb_publishable_dummy_value_for_tests_123';
const HTTP_URL = 'http://dummy-insecure-host-for-tests.example';
const VALUES = [GOOD_URL, 'dummy-ref-for-tests', GOOD_KEY, 'dummy_value_for_tests', HTTP_URL, 'dummy-insecure-host'];

let consoleCalls: unknown[][] = [];

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  consoleCalls = [];
  for (const level of ['error', 'warn', 'log', 'info'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  document.body.innerHTML = '';
});

async function boot(url: string, key: string) {
  vi.stubEnv('VITE_SUPABASE_URL', url);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', key);
  await import('./main');
}

function expectNoValueShown() {
  const page = document.body.textContent ?? '';
  const logged = JSON.stringify(consoleCalls.map((args) => args.map(String)));
  for (const value of VALUES) {
    expect(page).not.toContain(value);
    expect(logged).not.toContain(value);
  }
}

describe('config-error screen at start-up', () => {
  it('a missing key: the Hinglish message names VITE_SUPABASE_PUBLISHABLE_KEY, not a blank page', async () => {
    await boot(GOOD_URL, '');
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent('App shuru nahi ho paya.');
    expect(alert).toHaveTextContent('Yeh variable nahi mila:');
    expect(within(alert).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['VITE_SUPABASE_PUBLISHABLE_KEY']);
    expect(alert).toHaveTextContent('Netlify mein Environment variables check karo, phir dobara deploy karo.');
    expect(within(alert).getByRole('button', { name: 'Dobara try karo' })).toHaveClass('h-11');
    expect(screen.queryByRole('button', { name: 'Login karo' })).not.toBeInTheDocument();
    expectNoValueShown();
  });

  it('a missing URL names VITE_SUPABASE_URL', async () => {
    await boot('', GOOD_KEY);
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(within(alert).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['VITE_SUPABASE_URL']);
    expectNoValueShown();
  });

  it('both missing: both names', async () => {
    await boot('  ', '');
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(within(alert).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']);
  });

  it('a URL that is not https:// is named as wrong, without its value', async () => {
    await boot(HTTP_URL, GOOD_KEY);
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent('Yeh variable galat hai (https:// se shuru hona chahiye):');
    expect(alert).not.toHaveTextContent('Yeh variable nahi mila:');
    expect(within(alert).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['VITE_SUPABASE_URL']);
    expectNoValueShown();
  });

  it('both fine: the app starts normally (login screen), no config message', async () => {
    await boot(GOOD_URL, GOOD_KEY);
    expect(await screen.findByRole('button', { name: 'Login karo' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText('App shuru nahi ho paya.')).not.toBeInTheDocument();
    expectNoValueShown();
  });
});

describe('configProblem', () => {
  it('null for a valid config; names only otherwise', () => {
    expect(configProblem({ VITE_SUPABASE_URL: GOOD_URL, VITE_SUPABASE_PUBLISHABLE_KEY: GOOD_KEY })).toBeNull();
    expect(configProblem({})).toEqual({ missing: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'], invalid: [] });
    expect(configProblem({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_PUBLISHABLE_KEY: GOOD_KEY })).toEqual({ missing: [], invalid: ['VITE_SUPABASE_URL'] });
    expect(configProblem({ VITE_SUPABASE_URL: HTTP_URL, VITE_SUPABASE_PUBLISHABLE_KEY: '   ' })).toEqual({ missing: ['VITE_SUPABASE_PUBLISHABLE_KEY'], invalid: [] });
  });
});
