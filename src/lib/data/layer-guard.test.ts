// Static guard over the UI layers' own source text (pages, components, hooks) and the data layer.
// Sources are read through Vite's import.meta.glob raw query, like the ledger engine's guard.
import { describe, expect, it } from 'vitest';

const uiSources = import.meta.glob<string>(
  [
    '/src/pages/**/*.{ts,tsx}',
    '/src/components/**/*.{ts,tsx}',
    '/src/hooks/**/*.{ts,tsx}',
    '!/src/**/*.test.{ts,tsx}',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const dataSources = import.meta.glob<string>(
  ['/src/lib/data/**/*.ts', '!/src/lib/data/**/*.test.ts', '!/src/lib/data/test-support/**'],
  { query: '?raw', import: 'default', eager: true },
);

const allSources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** UI layers may not read the clock, do local date math, format money with floats, or touch Supabase. */
const UI_FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ['new Date', /\bnew\s+Date\b/],
  ['Date.now', /\bDate\.now\b/],
  ['getHours', /\bgetHours\b/],
  ['getDate', /\bgetDate\b/],
  ['getMonth', /\bgetMonth\b/],
  ['getFullYear', /\bgetFullYear\b/],
  ['toFixed', /\btoFixed\b/],
  ['parseFloat', /\bparseFloat\b/],
  ['toLocale*', /\btoLocale\w*/],
  ['Intl.', /\bIntl\./],
  ['Supabase import', /['"](?:@supabase\/[^'"]*|@\/lib\/supabase)['"]/],
];

/** Files allowed to import the Supabase client or library: the client itself, the data layer, and auth (Phase 2B). */
const SUPABASE_IMPORTERS = /^\/src\/(?:lib\/supabase\.ts|lib\/data\/[^/]+\.ts|auth\/[^/]+\.tsx?)$/;

describe('layer guard', () => {
  const uiFiles = Object.keys(uiSources).sort();

  it('scans a non-empty set of UI files, including the Farmers screen and the hook', () => {
    expect(uiFiles).toEqual(
      expect.arrayContaining([
        '/src/pages/farmers/FarmersPage.tsx',
        '/src/pages/farmers/copy.ts',
        '/src/hooks/useFarmers.ts',
        '/src/hooks/useUsage.ts',
        '/src/hooks/useRowStore.ts',
        '/src/pages/usage/UsagePage.tsx',
        '/src/pages/usage/UsageFormDialog.tsx',
        '/src/pages/usage/UsageListItem.tsx',
        '/src/pages/usage/copy.ts',
        '/src/hooks/usePayments.ts',
        '/src/pages/payments/PaymentsPage.tsx',
        '/src/pages/payments/PaymentFormDialog.tsx',
        '/src/pages/payments/PaymentListItem.tsx',
        '/src/pages/payments/PaymentPreviewPanel.tsx',
        '/src/pages/payments/copy.ts',
        '/src/pages/shared/monthLabel.ts',
        '/src/pages/farmers/FarmerProfilePage.tsx',
        '/src/pages/farmers/ProfileSections.tsx',
        '/src/pages/farmers/profileCopy.ts',
        '/src/pages/dashboard/DashboardPage.tsx',
        '/src/pages/dashboard/DashboardSections.tsx',
        '/src/pages/dashboard/copy.ts',
        '/src/pages/months/MonthsPage.tsx',
        '/src/pages/months/MonthsSections.tsx',
        '/src/pages/months/copy.ts',
        '/src/components/ui/dialog.tsx',
      ]),
    );
    expect(uiFiles.some((f) => f.includes('.test.'))).toBe(false);
  });

  it.each(Object.keys(uiSources).sort())('%s has no clock, date math, float money or Supabase import', (file) => {
    const source = uiSources[file] ?? '';
    expect(UI_FORBIDDEN.filter(([, re]) => re.test(source)).map(([name]) => name)).toEqual([]);
  });

  it('only the client, the data layer and auth import Supabase', () => {
    const importers = Object.entries(allSources)
      .filter(([, source]) => /from\s*['"](?:@supabase\/[^'"]*|@\/lib\/supabase)['"]/.test(source))
      .map(([file]) => file)
      .sort();
    expect(importers.filter((file) => !SUPABASE_IMPORTERS.test(file))).toEqual([]);
    expect(importers).toContain('/src/lib/data/farmers.ts');
  });

  it('in the data layer, new Date appears only once, inside nowIso in clock.ts', () => {
    const hits = Object.entries(dataSources).flatMap(([file, source]) =>
      [...source.matchAll(/\bnew\s+Date\b/g)].map(() => file),
    );
    expect(hits).toEqual(['/src/lib/data/clock.ts']);
    expect(dataSources['/src/lib/data/clock.ts']).toMatch(/export function nowIso\(\): string \{\s*return new Date\(\)\.toISOString\(\);\s*\}/);
    expect(Object.values(dataSources).some((source) => /\bDate\.now\b/.test(source))).toBe(false);
  });
});
