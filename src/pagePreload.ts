// Start-up (FIX-1 Part 3): each screen's code by route, so it can be downloaded before React asks
// for it. These are the same modules as the lazy routes in src/routes/routes.ts; the browser loads
// each module once, so a preload is simply an earlier start. A failed preload is ignored: the lazy
// route itself still loads (and reports a failure) as before.
const PAGES: readonly (readonly [RegExp, () => Promise<unknown>])[] = [
  [/^\/$/, () => import('@/pages/dashboard/DashboardPage')],
  [/^\/farmers\/?$/, () => import('@/pages/farmers/FarmersPage')],
  [/^\/farmers\/[^/]+\/?$/, () => import('@/pages/farmers/FarmerProfilePage')],
  [/^\/usage\/?$/, () => import('@/pages/usage/UsagePage')],
  [/^\/payments\/?$/, () => import('@/pages/payments/PaymentsPage')],
  [/^\/months\/?$/, () => import('@/pages/months/MonthsPage')],
  [/^\/backup\/?$/, () => import('@/pages/backup/BackupPage')],
];

/** Starts downloading the screen of `pathname` (if it is one), in parallel with the app shell. */
export function preloadPage(pathname: string): void {
  const page = PAGES.find(([route]) => route.test(pathname));
  if (page !== undefined) void page[1]().catch(() => {});
}

/** Downloads every screen's code, so the first visit of a tab does not wait for it. */
export function prefetchAllPages(): void {
  for (const [, load] of PAGES) void load().catch(() => {});
}
