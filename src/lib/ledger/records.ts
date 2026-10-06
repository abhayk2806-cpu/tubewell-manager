// Raw DB-shaped rows to validated internal records (C1, C5, C6). Internal to the engine.
import { LedgerInputError } from './errors';
import { entryAmountPaise } from './entry';
import { assertPaise } from './money';
import { istMonthKey, parseInstantMs } from './time';
import type { LedgerPayment, LedgerUsage, PaymentCandidate } from './types';

export interface UsageRecord {
  readonly kind: 'usage';
  readonly id: string;
  readonly farmerId: string;
  readonly atMs: number;
  /** Tie-breaker only (C4). */
  readonly createdMs: number;
  readonly totalMinutes: number;
  readonly amountPaise: number;
  readonly monthKey: string;
}

export interface PaymentRecord {
  readonly kind: 'payment';
  readonly id: string;
  readonly farmerId: string;
  readonly atMs: number;
  /** Tie-breaker only (C4). Infinity for a new preview candidate, so it sorts after existing rows. */
  readonly createdMs: number;
  readonly amountPaise: number;
  readonly monthKey: string;
}

function assertId(value: unknown, what: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new LedgerInputError(`${what} must be a non-empty string`);
}

function assertWholeNumber(value: unknown, what: string, min: number, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new LedgerInputError(`${what} must be an integer from ${min} to ${max}`);
  }
}

export function usageRecord(row: LedgerUsage): UsageRecord {
  assertId(row.id, 'usage id');
  assertId(row.farmer_id, 'usage farmer_id');
  assertWholeNumber(row.hours, 'hours', 0, Number.MAX_SAFE_INTEGER);
  assertWholeNumber(row.minutes, 'minutes', 0, 59);
  const totalMinutes = row.hours * 60 + row.minutes;
  if (row.total_minutes !== totalMinutes) {
    throw new LedgerInputError('total_minutes must equal hours * 60 + minutes');
  }
  const atMs = parseInstantMs(row.used_at);
  return {
    kind: 'usage',
    id: row.id,
    farmerId: row.farmer_id,
    atMs,
    createdMs: parseInstantMs(row.created_at),
    totalMinutes,
    amountPaise: entryAmountPaise(totalMinutes, row.rate_paise),
    monthKey: istMonthKey(atMs),
  };
}

function paymentFields(
  id: string,
  farmerId: string,
  paidAt: string,
  amountPaise: number,
  createdMs: number,
): PaymentRecord {
  assertId(farmerId, 'payment farmer_id');
  assertPaise(amountPaise, 'amount_paise');
  if (amountPaise <= 0) throw new LedgerInputError('amount_paise must be greater than 0');
  const atMs = parseInstantMs(paidAt);
  return { kind: 'payment', id, farmerId, atMs, createdMs, amountPaise, monthKey: istMonthKey(atMs) };
}

export function paymentRecord(row: LedgerPayment): PaymentRecord {
  assertId(row.id, 'payment id');
  return paymentFields(row.id, row.farmer_id, row.paid_at, row.amount_paise, parseInstantMs(row.created_at));
}

/**
 * A preview candidate; `fallback` supplies the id and created_at it does not carry itself.
 * The fallback id may be the engine's internal empty id for a new payment; a given id may not.
 */
export function candidateRecord(
  candidate: PaymentCandidate,
  fallback: { readonly id: string; readonly createdMs: number },
): PaymentRecord {
  if (candidate.id !== undefined) assertId(candidate.id, 'candidate id');
  return paymentFields(
    candidate.id ?? fallback.id,
    candidate.farmer_id,
    candidate.paid_at,
    candidate.amount_paise,
    candidate.created_at === undefined ? fallback.createdMs : parseInstantMs(candidate.created_at),
  );
}

/** Non-deleted usage rows as records. Soft-deleted rows are skipped without validation (C6). */
export function liveUsageRecords(rows: readonly LedgerUsage[]): UsageRecord[] {
  return rows.filter((row) => row.deleted_at === null).map(usageRecord);
}

/** Non-deleted payment rows as records. Soft-deleted rows are skipped without validation (C6). */
export function livePaymentRecords(rows: readonly LedgerPayment[]): PaymentRecord[] {
  return rows.filter((row) => row.deleted_at === null).map(paymentRecord);
}

export function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** C4: by instant, then created_at, then id as a plain string. */
export function compareRecords(a: UsageRecord | PaymentRecord, b: UsageRecord | PaymentRecord): number {
  if (a.atMs !== b.atMs) return a.atMs - b.atMs;
  if (a.createdMs !== b.createdMs) return a.createdMs < b.createdMs ? -1 : 1;
  return compareIds(a.id, b.id);
}
