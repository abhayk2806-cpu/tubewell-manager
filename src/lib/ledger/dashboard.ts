// Cross-farmer views: dashboard (L11, D1) and the all-farmers months list (C9).
// Sums run over ACTIVE farmers only; outstanding and credit are summed separately, never netted (L8).
import { LedgerInputError } from './errors';
import { rowsByActiveFarmer } from './farmers';
import { buildFarmerLedger, monthStatus } from './ledger';
import { sumPaise } from './money';
import { compareMonthKeys, istMonthRangeMs, istYearRangeMs } from './time';
import type { InstantRange } from './time';
import type { Dashboard, DashboardFarmerRow, DashboardView, FarmersInput, LedgerOptions, MonthRow } from './types';

function periodOf(view: DashboardView): InstantRange | null {
  switch (view.kind) {
    case 'all':
      return null;
    case 'month':
      return istMonthRangeMs(view.monthKey);
    case 'year':
      return istYearRangeMs(view.yearKey);
    default:
      throw new LedgerInputError('dashboard view must be all, month or year');
  }
}

/**
 * Dashboard for a period. Charges created and cash received = rows IST-stamped in the period;
 * outstanding and credit = each farmer's balance as of the period end (All Time = current).
 */
export function buildDashboard(input: FarmersInput, view: DashboardView): Dashboard {
  const period = periodOf(view);
  const farmers: DashboardFarmerRow[] = rowsByActiveFarmer(input).map((group) => {
    const ledger = buildFarmerLedger(group, period === null ? {} : { cutoffMs: period.endMs });
    const inPeriod = ledger.rows.filter((row) => period === null || row.atMs >= period.startMs);
    return {
      farmerId: group.farmerId,
      chargesCreatedPaise: sumPaise(inPeriod.filter((row) => row.kind === 'usage').map((row) => row.amountPaise)),
      cashReceivedPaise: sumPaise(inPeriod.filter((row) => row.kind === 'payment').map((row) => row.amountPaise)),
      outstandingPaise: ledger.totals.outstandingPaise,
      creditPaise: ledger.totals.creditPaise,
    };
  });
  return {
    view,
    periodStartMs: period === null ? null : period.startMs,
    periodEndMs: period === null ? null : period.endMs,
    activeFarmerCount: farmers.length,
    chargesCreatedPaise: sumPaise(farmers.map((f) => f.chargesCreatedPaise)),
    cashReceivedPaise: sumPaise(farmers.map((f) => f.cashReceivedPaise)),
    outstandingPaise: sumPaise(farmers.map((f) => f.outstandingPaise)),
    creditPaise: sumPaise(farmers.map((f) => f.creditPaise)),
    farmers,
  };
}

/**
 * Months list across active farmers (C9): per month, sums of each farmer's charge, paid,
 * remaining and cash. Status follows C7 on the sums. No credit column, so nothing is netted.
 */
export function buildAllFarmersMonths(input: FarmersInput, options: LedgerOptions = {}): MonthRow[] {
  const byMonth = new Map<string, MonthRow[]>();
  for (const group of rowsByActiveFarmer(input)) {
    for (const row of buildFarmerLedger(group, options).months) {
      const list = byMonth.get(row.monthKey);
      if (list === undefined) byMonth.set(row.monthKey, [row]);
      else list.push(row);
    }
  }
  return [...byMonth.keys()].sort(compareMonthKeys).map((monthKey) => {
    const rows = byMonth.get(monthKey) ?? [];
    const sum = (pick: (row: MonthRow) => number) => sumPaise(rows.map(pick));
    const chargePaise = sum((r) => r.chargePaise);
    const paidPaise = sum((r) => r.paidPaise);
    const cashPaise = sum((r) => r.cashPaise);
    return {
      monthKey,
      totalMinutes: sum((r) => r.totalMinutes),
      chargePaise,
      paidPaise,
      remainingPaise: sum((r) => r.remainingPaise),
      cashPaise,
      status: monthStatus(chargePaise, paidPaise, cashPaise),
      entryCount: sum((r) => r.entryCount),
      paymentCount: sum((r) => r.paymentCount),
    };
  });
}
