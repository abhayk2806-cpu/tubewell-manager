// Pure Months screen rules (Phase 7B, D30): no I/O and no second algorithm. The all-farmers month
// rows are the engine's buildAllFarmersMonths (status of the sums included); the farmer-wise rows
// are each ACTIVE farmer's buildFarmerProfile months (one engine call per farmer). This module only
// joins names, orders, filters by year and, for the year strip, adds engine month figures with
// sumPaise. Months have no credit column, so nothing is ever netted (L8, L10, L11).
import { LedgerInputError, buildAllFarmersMonths, isActiveFarmer, isMonthKey, sumPaise } from '@/lib/ledger';
import type { MonthRow } from '@/lib/ledger';
import type { DashboardFarmerLike } from './dashboardRules';
import type { PaymentRowLike } from './paymentRules';
import { buildFarmerProfile } from './profileRules';
import type { ProfileMonth } from './profileRules';
import { splitMinutes } from './timeline';
import type { UsageRowLike } from './usageRules';

/** One farmer's month (the profile month card) plus who it is. */
export interface MonthsFarmerRow extends ProfileMonth {
  readonly farmerId: string;
  readonly name: string;
}

/** One all-farmers month (engine row) with hours / minutes and its farmer-wise breakdown. */
export interface MonthsMonth extends MonthRow {
  readonly hours: number;
  readonly minutes: number;
  /** Active farmers with usage or payments in this month, highest Baaki first, then name. */
  readonly farmers: readonly MonthsFarmerRow[];
}

/** Sums of the shown months: time, Charge and Cash Mila only (no Baaki, no credit). */
export interface MonthsStrip {
  readonly totalMinutes: number;
  readonly hours: number;
  readonly minutes: number;
  readonly chargePaise: number;
  readonly cashPaise: number;
}

export interface MonthsScreen {
  /** Every month with usage or payments of an active farmer, newest first. */
  readonly months: readonly MonthsMonth[];
  /** Years that have months, newest first. */
  readonly years: readonly string[];
  /** At least one active farmer exists. */
  readonly hasFarmers: boolean;
}

export type MonthsScreenResult = { readonly ok: true; readonly screen: MonthsScreen } | { readonly ok: false };

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function yearOf(monthKey: string): string {
  return monthKey.slice(0, 4);
}

/** Highest Baaki first; ties by name ignoring case, then farmer id. */
export function sortMonthFarmers<T extends { readonly remainingPaise: number; readonly name: string; readonly farmerId: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      b.remainingPaise - a.remainingPaise ||
      compareText(a.name.toLowerCase(), b.name.toLowerCase()) ||
      compareText(a.farmerId, b.farmerId),
  );
}

/** Distinct years of the month keys, newest first. */
export function monthsYearOptions(monthKeys: readonly string[]): string[] {
  return [...new Set(monthKeys.map(yearOf))].sort((a, b) => compareText(b, a));
}

/** The months of one year (or all when `year` is null), in the given order. */
export function filterMonthsByYear<T extends { readonly monthKey: string }>(months: readonly T[], year: string | null): T[] {
  return year === null ? [...months] : months.filter((m) => yearOf(m.monthKey) === year);
}

/** Time, Charge and Cash Mila of the given months, added with the engine's sumPaise. */
export function monthsStrip(months: readonly MonthRow[]): MonthsStrip {
  const totalMinutes = sumPaise(months.map((m) => m.totalMinutes));
  return {
    totalMinutes,
    ...splitMinutes(totalMinutes),
    chargePaise: sumPaise(months.map((m) => m.chargePaise)),
    cashPaise: sumPaise(months.map((m) => m.cashPaise)),
  };
}

/** A `?month=` value that is a valid month key AND one of the listed months, with its year; else null. */
export function deepLinkMonth(value: string | null, monthKeys: readonly string[]): { readonly monthKey: string; readonly yearKey: string } | null {
  if (value === null || !isMonthKey(value) || !monthKeys.includes(value)) return null;
  return { monthKey: value, yearKey: yearOf(value) };
}

/**
 * Everything the Months screen shows. Bad data (the engine throws LedgerInputError, or a farmer's
 * profile is not ok) gives { ok: false }: nothing is fixed silently. Other errors are re-thrown.
 */
export function buildMonthsScreen(request: {
  readonly farmers: readonly DashboardFarmerLike[];
  readonly usageRows: readonly UsageRowLike[];
  readonly paymentRows: readonly PaymentRowLike[];
}): MonthsScreenResult {
  const { farmers, usageRows, paymentRows } = request;
  try {
    const all = buildAllFarmersMonths({ farmers, usage: usageRows, payments: paymentRows });
    const byMonth = new Map<string, MonthsFarmerRow[]>();
    const active = farmers.filter(isActiveFarmer);
    for (const farmer of active) {
      const profile = buildFarmerProfile({ farmerId: farmer.id, usageRows, paymentRows });
      if (!profile.ok) return { ok: false };
      for (const month of profile.profile.months) {
        const row = { ...month, farmerId: farmer.id, name: farmer.name };
        const list = byMonth.get(month.monthKey);
        if (list === undefined) byMonth.set(month.monthKey, [row]);
        else list.push(row);
      }
    }
    const months = all
      .filter((m) => m.entryCount > 0 || m.paymentCount > 0)
      .reverse()
      .map((m) => ({ ...m, ...splitMinutes(m.totalMinutes), farmers: sortMonthFarmers(byMonth.get(m.monthKey) ?? []) }));
    return {
      ok: true,
      screen: { months, years: monthsYearOptions(months.map((m) => m.monthKey)), hasFarmers: active.length > 0 },
    };
  } catch (error) {
    if (error instanceof LedgerInputError) return { ok: false };
    throw error;
  }
}
