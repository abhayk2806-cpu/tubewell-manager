// CSV exports for reading and printing in Excel (D31 d): pure. NOT restorable. Every figure comes
// from the engine / data-layer functions and is written with paiseToDecimalString ("358.33", no
// thousands separators). UTF-8 with a BOM (Excel then reads Hindi names), RFC 4180 quoting, CRLF
// line ends, and spreadsheet formula injection neutralised: a cell that starts with = + - @, a tab
// or a carriage return gets a leading apostrophe. Headers and words come from the page copy.
import { istDateKey, istTimeKey, paiseToDecimalString, parseInstantMs } from '@/lib/ledger';
import type { MonthStatus } from '@/lib/ledger';
import { buildDashboardScreen } from '@/lib/data/dashboardRules';
import type { DashboardFarmerLike } from '@/lib/data/dashboardRules';
import { buildMonthsScreen } from '@/lib/data/monthsRules';
import { classifyPayments } from '@/lib/data/paymentRules';
import type { PaymentRowLike } from '@/lib/data/paymentRules';
import { classifyUsage, usageAmountPaise } from '@/lib/data/usageRules';
import type { IstMoment, UsageRowLike } from '@/lib/data/usageRules';

const BOM = '\ufeff';
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** One cell: formula start neutralised, then quoted when it holds a comma, a quote or a line break. */
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A whole CSV text: BOM, one line per row, CRLF line ends. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return BOM + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export interface CsvLabels {
  /** Name, Mobile, Charge, Cash Mila, Baaki, Advance / Credit. */
  readonly farmers: readonly string[];
  /** Date, Time, Farmer, Hours, Minutes, Rate per hour, Amount. */
  readonly usage: readonly string[];
  /** Date, Time, Farmer, Amount, Note. */
  readonly payments: readonly string[];
  /** Month, Hours, Minutes, Charge, Charge Clear, Baaki, Cash Mila, Status. */
  readonly months: readonly string[];
  readonly status: Readonly<Record<MonthStatus, string>>;
  readonly unknownFarmer: string;
}

export interface CsvInput {
  readonly farmers: readonly (DashboardFarmerLike & { readonly mobile: string | null })[];
  readonly usageRows: readonly UsageRowLike[];
  readonly paymentRows: readonly PaymentRowLike[];
}

export type CsvResult = { readonly ok: true; readonly text: string } | { readonly ok: false };

const money = paiseToDecimalString;

function when(iso: string): [string, string] {
  const ms = parseInstantMs(iso);
  return [istDateKey(ms), istTimeKey(ms)];
}

/** Kisan-wise hisaab, All Time (active farmers, highest Baaki first): the Dashboard's figures. */
export function farmersCsv(input: CsvInput, labels: CsvLabels, now: IstMoment): CsvResult {
  const result = buildDashboardScreen({ farmers: input.farmers, usageRows: input.usageRows, paymentRows: input.paymentRows, view: { kind: 'all' }, now });
  if (!result.ok) return { ok: false };
  const mobiles = new Map(input.farmers.map((f) => [f.id, f.mobile]));
  const rows = result.screen.rows.map((r) => [
    r.name,
    mobiles.get(r.farmerId) ?? '',
    money(r.chargesCreatedPaise),
    money(r.cashReceivedPaise),
    money(r.outstandingPaise),
    money(r.creditPaise),
  ]);
  return { ok: true, text: toCsv([labels.farmers, ...rows]) };
}

/** Live Pani entries, newest first, with the engine's amount. */
export function usageCsv(input: CsvInput, labels: CsvLabels): CsvResult {
  const names = new Map(input.farmers.map((f) => [f.id, f.name]));
  try {
    const rows = classifyUsage(input.usageRows).live.map((u) => [
      ...when(u.used_at),
      names.get(u.farmer_id) ?? labels.unknownFarmer,
      String(u.hours),
      String(u.minutes),
      money(u.rate_paise),
      money(usageAmountPaise(u)),
    ]);
    return { ok: true, text: toCsv([labels.usage, ...rows]) };
  } catch {
    return { ok: false };
  }
}

/** Live payments, newest first. */
export function paymentsCsv(input: CsvInput, labels: CsvLabels): CsvResult {
  const names = new Map(input.farmers.map((f) => [f.id, f.name]));
  try {
    const rows = classifyPayments(input.paymentRows).live.map((p) => [
      ...when(p.paid_at),
      names.get(p.farmer_id) ?? labels.unknownFarmer,
      money(p.amount_paise),
      p.note ?? '',
    ]);
    return { ok: true, text: toCsv([labels.payments, ...rows]) };
  } catch {
    return { ok: false };
  }
}

/** All-farmers months, newest first: the Months screen's figures and status words. */
export function monthsCsv(input: CsvInput, labels: CsvLabels): CsvResult {
  const result = buildMonthsScreen(input);
  if (!result.ok) return { ok: false };
  const rows = result.screen.months.map((m) => [
    m.monthKey,
    String(m.hours),
    String(m.minutes),
    money(m.chargePaise),
    money(m.paidPaise),
    money(m.remainingPaise),
    money(m.cashPaise),
    labels.status[m.status],
  ]);
  return { ok: true, text: toCsv([labels.months, ...rows]) };
}
