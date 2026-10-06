// Pure Dashboard rules (Phase 7A, D29): no I/O and no second algorithm. Every money figure is a
// field of the engine's buildDashboard / buildAllFarmersMonths (L11, D1); this module only joins
// names, orders, filters, counts and scales bars. Outstanding and credit stay separate (L8, E18).
import {
  LedgerInputError,
  buildAllFarmersMonths,
  buildDashboard,
  intDiv,
  isActiveFarmer,
  parseInstantMs,
} from '@/lib/ledger';
import type { Dashboard, DashboardFarmerRow, DashboardView, MonthRow } from '@/lib/ledger';
import { classifyPayments } from './paymentRules';
import type { PaymentRowLike } from './paymentRules';
import { monthOf } from './timeline';
import { classifyUsage, usageAmountPaise } from './usageRules';
import type { IstMoment, UsageRowLike } from './usageRules';

/** The chart shows at most this many months (the newest ones with usage or payments). */
export const CHART_MONTHS = 6;
/** A bar with an amount above zero is at least this high (percent), so it stays visible. */
export const CHART_MIN_PERCENT = 4;
/** Recent activity shows this many entries and payments. */
export const RECENT_LIMIT = 8;

/** The farmer columns the dashboard reads. DB rows are assignable to it. */
export interface DashboardFarmerLike {
  readonly id: string;
  readonly name: string;
  readonly is_disabled: boolean;
  readonly deleted_at: string | null;
}

/** One active farmer's engine row plus the name. */
export interface DashboardRow extends DashboardFarmerRow {
  readonly name: string;
}

export interface DashboardSummary {
  /** Farmers with outstanding (baaki) above zero. */
  readonly baakiCount: number;
  /** Farmers with Advance / Credit above zero. */
  readonly creditCount: number;
  /** The farmer with the highest baaki (ties by name), or null when nobody has baaki. */
  readonly top: { readonly farmerId: string; readonly name: string; readonly outstandingPaise: number } | null;
}

/** Band (disabled) farmers with a balance: shown apart, never in the totals (L12). */
export interface BandNote {
  readonly farmerCount: number;
  readonly outstandingPaise: number;
  readonly creditPaise: number;
}

export interface ChartMonth {
  readonly monthKey: string;
  /** The month's charge bucket (engine `chargePaise`). */
  readonly chargePaise: number;
  /** Payments dated in the month (engine `cashPaise`, L10). */
  readonly cashPaise: number;
  /** Bar heights: integer percent of the largest bar shown; 0 means no bar. */
  readonly chargePercent: number;
  readonly cashPercent: number;
}

export interface RecentItem {
  readonly kind: 'usage' | 'payment';
  readonly id: string;
  readonly farmerId: string;
  readonly farmerName: string;
  /** The row's instant (used_at or paid_at) in epoch ms. */
  readonly atMs: number;
  readonly amountPaise: number;
}

export interface PeriodOptions {
  /** IST months with usage or payments plus the current month (and the selected one), newest first. */
  readonly months: readonly string[];
  /** Years of those months plus the current year (and the selected one), newest first. */
  readonly years: readonly string[];
}

export interface DashboardScreen {
  /** The engine dashboard for the view; outstanding and credit are separate sums. */
  readonly dashboard: Dashboard;
  /** True when the view has at least one live entry or payment of an active farmer. */
  readonly periodHasActivity: boolean;
  readonly summary: DashboardSummary;
  /** Active farmers, highest baaki first, then name. */
  readonly rows: readonly DashboardRow[];
  /** Null when no Band farmer has a balance. */
  readonly band: BandNote | null;
  readonly chart: readonly ChartMonth[];
  readonly recent: readonly RecentItem[];
  readonly periodOptions: PeriodOptions;
}

export type DashboardScreenResult = { readonly ok: true; readonly screen: DashboardScreen } | { readonly ok: false };

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function compareNames(a: { readonly name: string; readonly farmerId: string }, b: { readonly name: string; readonly farmerId: string }): number {
  return compareText(a.name.toLowerCase(), b.name.toLowerCase()) || compareText(a.farmerId, b.farmerId);
}

/** Highest baaki first; ties (including every zero) by name ignoring case, then id. */
export function sortDashboardRows(rows: readonly DashboardRow[]): DashboardRow[] {
  return [...rows].sort((a, b) => b.outstandingPaise - a.outstandingPaise || compareNames(a, b));
}

/** Name contains the query, ignoring case and surrounding spaces. A blank query keeps every row. */
export function filterDashboardRows<T extends { readonly name: string }>(rows: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...rows];
  return rows.filter((row) => row.name.toLowerCase().includes(q));
}

/** Counts and the top-baaki farmer from rows already sorted by sortDashboardRows. */
export function summarizeDashboard(sortedRows: readonly DashboardRow[]): DashboardSummary {
  const first = sortedRows[0];
  return {
    baakiCount: sortedRows.filter((r) => r.outstandingPaise > 0).length,
    creditCount: sortedRows.filter((r) => r.creditPaise > 0).length,
    top:
      first !== undefined && first.outstandingPaise > 0
        ? { farmerId: first.farmerId, name: first.name, outstandingPaise: first.outstandingPaise }
        : null,
  };
}

function percentOf(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(CHART_MIN_PERCENT, intDiv(value * 100, max));
}

/**
 * The newest CHART_MONTHS months that have usage or payments, oldest to newest, with bar heights in
 * integer percent of the largest charge or cash among them.
 */
export function chartBars(months: readonly MonthRow[]): ChartMonth[] {
  const shown = months.filter((m) => m.entryCount > 0 || m.paymentCount > 0).slice(-CHART_MONTHS);
  const max = Math.max(0, ...shown.map((m) => Math.max(m.chargePaise, m.cashPaise)));
  return shown.map((m) => ({
    monthKey: m.monthKey,
    chargePaise: m.chargePaise,
    cashPaise: m.cashPaise,
    chargePercent: percentOf(m.chargePaise, max),
    cashPercent: percentOf(m.cashPaise, max),
  }));
}

/** Month and year choices for the selector, newest first; the current and the selected ones are always there. */
export function buildPeriodOptions(monthKeys: readonly string[], now: IstMoment, view: DashboardView): PeriodOptions {
  const months = new Set([now.monthKey, ...monthKeys]);
  if (view.kind === 'month') months.add(view.monthKey);
  const years = new Set([...months].map((m) => m.slice(0, 4)));
  if (view.kind === 'year') years.add(view.yearKey);
  return {
    months: [...months].sort((a, b) => compareText(b, a)),
    years: [...years].sort((a, b) => compareText(b, a)),
  };
}

/**
 * The newest `limit` live entries and payments of ACTIVE farmers, mixed, newest first (ties:
 * payment before usage, then id). Amounts come from the engine rounding (usageAmountPaise).
 */
export function buildRecentActivity(request: {
  readonly farmers: readonly DashboardFarmerLike[];
  readonly usageRows: readonly UsageRowLike[];
  readonly paymentRows: readonly PaymentRowLike[];
  readonly limit?: number;
}): RecentItem[] {
  const names = new Map(request.farmers.filter(isActiveFarmer).map((f) => [f.id, f.name]));
  const items: RecentItem[] = [];
  for (const row of classifyUsage(request.usageRows).live) {
    const name = names.get(row.farmer_id);
    if (name === undefined) continue;
    items.push({ kind: 'usage', id: row.id, farmerId: row.farmer_id, farmerName: name, atMs: parseInstantMs(row.used_at), amountPaise: usageAmountPaise(row) });
  }
  for (const row of classifyPayments(request.paymentRows).live) {
    const name = names.get(row.farmer_id);
    if (name === undefined) continue;
    items.push({ kind: 'payment', id: row.id, farmerId: row.farmer_id, farmerName: name, atMs: parseInstantMs(row.paid_at), amountPaise: row.amount_paise });
  }
  items.sort((a, b) => b.atMs - a.atMs || compareText(a.kind, b.kind) || compareText(a.id, b.id));
  return items.slice(0, request.limit ?? RECENT_LIMIT);
}

/** Whether the view has at least one live entry or payment of an active farmer (IST month / year). */
function hasActivity(
  view: DashboardView,
  activeIds: ReadonlySet<string>,
  usageRows: readonly UsageRowLike[],
  paymentRows: readonly PaymentRowLike[],
): boolean {
  const instants = [
    ...classifyUsage(usageRows).live.filter((r) => activeIds.has(r.farmer_id)).map((r) => r.used_at),
    ...classifyPayments(paymentRows).live.filter((r) => activeIds.has(r.farmer_id)).map((r) => r.paid_at),
  ];
  if (view.kind === 'all') return instants.length > 0;
  if (view.kind === 'month') return instants.some((iso) => monthOf(iso) === view.monthKey);
  return instants.some((iso) => monthOf(iso).slice(0, 4) === view.yearKey);
}

/**
 * Everything the Dashboard shows for one view. Bad data anywhere the engine looks (it throws
 * LedgerInputError) gives { ok: false }: nothing is fixed silently. Other errors are re-thrown.
 */
export function buildDashboardScreen(request: {
  readonly farmers: readonly DashboardFarmerLike[];
  readonly usageRows: readonly UsageRowLike[];
  readonly paymentRows: readonly PaymentRowLike[];
  readonly view: DashboardView;
  readonly now: IstMoment;
}): DashboardScreenResult {
  const { farmers, usageRows, paymentRows, view, now } = request;
  try {
    const dashboard = buildDashboard({ farmers, usage: usageRows, payments: paymentRows }, view);
    const names = new Map(farmers.map((f) => [f.id, f.name]));
    const rows = sortDashboardRows(dashboard.farmers.map((r) => ({ ...r, name: names.get(r.farmerId) ?? '' })));

    // Band farmers through the same engine function and the same view: a copy of each Band farmer
    // marked not disabled, so buildDashboard computes its as-of balances. Never added to the totals.
    const bandFarmers = farmers.filter((f) => f.deleted_at === null && f.is_disabled).map((f) => ({ ...f, is_disabled: false }));
    const bandDashboard = buildDashboard({ farmers: bandFarmers, usage: usageRows, payments: paymentRows }, view);
    const bandCount = bandDashboard.farmers.filter((r) => r.outstandingPaise > 0 || r.creditPaise > 0).length;
    const band = bandCount === 0 ? null : { farmerCount: bandCount, outstandingPaise: bandDashboard.outstandingPaise, creditPaise: bandDashboard.creditPaise };

    const months = buildAllFarmersMonths({ farmers, usage: usageRows, payments: paymentRows });
    const activeIds = new Set(farmers.filter(isActiveFarmer).map((f) => f.id));
    return {
      ok: true,
      screen: {
        dashboard,
        periodHasActivity: hasActivity(view, activeIds, usageRows, paymentRows),
        summary: summarizeDashboard(rows),
        rows,
        band,
        chart: chartBars(months),
        recent: buildRecentActivity({ farmers, usageRows, paymentRows }),
        periodOptions: buildPeriodOptions(
          months.filter((m) => m.entryCount > 0 || m.paymentCount > 0).map((m) => m.monthKey),
          now,
          view,
        ),
      },
    };
  } catch (error) {
    if (error instanceof LedgerInputError) return { ok: false };
    throw error;
  }
}
