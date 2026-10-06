// Test-only builders for the worked examples in docs/LEDGER_AND_ALLOCATION.md.
// Fictional names and generic ids only (public repo).
import type { LedgerFarmer, LedgerPayment, LedgerUsage } from '../index';

export const RAMU = 'farmer-ramu';
export const FARMER_A = 'farmer-a';
export const FARMER_B = 'farmer-b';
export const FARMER_C = 'farmer-c';

const DEFAULT_CREATED_AT = '2026-10-01T00:00:00Z';
export const DELETED_AT = '2026-10-02T00:00:00Z';

/**
 * IST wall clock to an ISO string with the +05:30 offset.
 * 'YYYY-MM-DD' means 10:00 IST (the spec's default); 'YYYY-MM-DDTHH:mm' is taken as given.
 * Anything longer is assumed to be a full ISO string already and is passed through.
 */
export function ist(when: string): string {
  if (when.length === 10) return `${when}T10:00:00+05:30`;
  if (when.length === 16) return `${when}:00+05:30`;
  return when;
}

export interface UsageOpts {
  readonly rate?: number;
  readonly deletedAt?: string | null;
  readonly createdAt?: string;
}

export function usage(
  id: string,
  farmerId: string,
  when: string,
  hours: number,
  minutes: number,
  opts: UsageOpts = {},
): LedgerUsage {
  return {
    id,
    farmer_id: farmerId,
    used_at: ist(when),
    hours,
    minutes,
    total_minutes: hours * 60 + minutes,
    rate_paise: opts.rate ?? 10000,
    created_at: opts.createdAt ?? DEFAULT_CREATED_AT,
    deleted_at: opts.deletedAt ?? null,
  };
}

export interface PaymentOpts {
  readonly deletedAt?: string | null;
  readonly createdAt?: string;
}

export function payment(
  id: string,
  farmerId: string,
  when: string,
  amountPaise: number,
  opts: PaymentOpts = {},
): LedgerPayment {
  return {
    id,
    farmer_id: farmerId,
    paid_at: ist(when),
    amount_paise: amountPaise,
    note: null,
    created_at: opts.createdAt ?? DEFAULT_CREATED_AT,
    deleted_at: opts.deletedAt ?? null,
  };
}

export function farmer(
  id: string,
  opts: { readonly disabled?: boolean; readonly deletedAt?: string | null } = {},
): LedgerFarmer {
  return { id, is_disabled: opts.disabled ?? false, deleted_at: opts.deletedAt ?? null };
}

/** E1 usage: 3h35, 4h25, 5h15, 4h30 on the 10th of May to August 2026. */
export function e1Usage(farmerId: string = RAMU): LedgerUsage[] {
  return [
    usage('u-may', farmerId, '2026-05-10', 3, 35),
    usage('u-jun', farmerId, '2026-06-10', 4, 25),
    usage('u-jul', farmerId, '2026-07-10', 5, 15),
    usage('u-aug', farmerId, '2026-08-10', 4, 30),
  ];
}

/** E1 payment P1 on 2026-09-10 (500.00 unless stated). */
export function e1Payments(amountPaise = 50000, farmerId: string = RAMU): LedgerPayment[] {
  return [payment('p1', farmerId, '2026-09-10', amountPaise)];
}

/** A stable projection of a month row for table-style assertions. */
export interface MonthView {
  readonly monthKey: string;
  readonly totalMinutes: number;
  readonly chargePaise: number;
  readonly paidPaise: number;
  readonly remainingPaise: number;
  readonly cashPaise: number;
  readonly status: string;
}

export function monthView(row: MonthView): MonthView {
  return {
    monthKey: row.monthKey,
    totalMinutes: row.totalMinutes,
    chargePaise: row.chargePaise,
    paidPaise: row.paidPaise,
    remainingPaise: row.remainingPaise,
    cashPaise: row.cashPaise,
    status: row.status,
  };
}

/** [monthKey, totalMinutes, charge, paid, remaining, cash, status] */
export type MonthTuple = readonly [string, number, number, number, number, number, string];

export function m(tuple: MonthTuple): MonthView {
  const [monthKey, totalMinutes, chargePaise, paidPaise, remainingPaise, cashPaise, status] = tuple;
  return { monthKey, totalMinutes, chargePaise, paidPaise, remainingPaise, cashPaise, status };
}
