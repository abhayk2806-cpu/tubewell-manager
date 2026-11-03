// The screens' ledger derivations, computed once per data change (FIX-1 Part 4). Each function is
// the data layer's own builder; the memo only remembers its result while the row arrays it was given
// are the same objects (the shared store keeps them unchanged until the data changes), so a screen
// that mounts again gets the figures without recomputing them. No arithmetic here.
import { buildDashboardScreen, buildFarmerBalances, buildFarmerProfile, buildMonthsScreen, buildPaymentTrails } from '@/lib/data';

export interface Derive {
  readonly dashboardScreen: typeof buildDashboardScreen;
  readonly monthsScreen: typeof buildMonthsScreen;
  readonly farmerProfile: typeof buildFarmerProfile;
  readonly farmerBalances: typeof buildFarmerBalances;
  readonly paymentTrails: typeof buildPaymentTrails;
  /** Forgets every remembered result (sign-out). */
  clear(): void;
}

/** The builders themselves, without memory: for a hook used outside the DataStoreProvider. */
export const PLAIN_DERIVE: Derive = {
  dashboardScreen: buildDashboardScreen,
  monthsScreen: buildMonthsScreen,
  farmerProfile: buildFarmerProfile,
  farmerBalances: buildFarmerBalances,
  paymentTrails: buildPaymentTrails,
  clear() {},
};

/**
 * Remembers results per `keyOf` for the current row arrays (compared by identity). Any new array
 * forgets everything, so a result is never reused for different data.
 */
function memoByRows<A, Res>(compute: (request: A) => Res, rowsOf: (request: A) => readonly unknown[], keyOf: (request: A) => string) {
  let rows: readonly unknown[] = [];
  let cache = new Map<string, Res>();
  const run = (request: A): Res => {
    const next = rowsOf(request);
    if (next.length !== rows.length || next.some((r, i) => r !== rows[i])) {
      rows = next;
      cache = new Map();
    }
    const key = keyOf(request);
    if (cache.has(key)) return cache.get(key) as Res;
    const value = compute(request);
    cache.set(key, value);
    return value;
  };
  const clear = () => {
    rows = [];
    cache = new Map();
  };
  return { run, clear };
}

export function createDerive(): Derive {
  // buildDashboardScreen reads only the month of `now` (period options); the date is in the key as
  // well, so a remembered screen is never older than the day it was built on.
  const dashboard = memoByRows(
    buildDashboardScreen,
    (r) => [r.farmers, r.usageRows, r.paymentRows],
    (r) => `${r.view.kind}|${r.view.kind === 'month' ? r.view.monthKey : r.view.kind === 'year' ? r.view.yearKey : ''}|${r.now.monthKey}|${r.now.dateKey}`,
  );
  const months = memoByRows(buildMonthsScreen, (r) => [r.farmers, r.usageRows, r.paymentRows], () => '');
  const profile = memoByRows(
    (r: Parameters<typeof buildFarmerProfile>[0]) => buildFarmerProfile(r),
    (r) => [r.usageRows, r.paymentRows],
    (r) => r.farmerId,
  );
  const balances = memoByRows(buildFarmerBalances, (r) => [r.farmers, r.usageRows, r.paymentRows], () => '');
  const trails = memoByRows(buildPaymentTrails, (r) => [r.usageRows, r.paymentRows], () => '');
  return {
    dashboardScreen: dashboard.run,
    monthsScreen: months.run,
    farmerProfile: profile.run as typeof buildFarmerProfile,
    farmerBalances: balances.run,
    paymentTrails: trails.run,
    clear() {
      [dashboard, months, profile, balances, trails].forEach((m) => m.clear());
    },
  };
}
