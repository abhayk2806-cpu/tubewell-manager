// Pure Paisa (payment) rules: no I/O. Money, FIFO and IST math come from the ledger engine.
import {
  LedgerInputError,
  buildFarmerLedger,
  findDuplicatePayments,
  istTimeKey,
  istWallClockToIso,
  paiseToDecimalString,
  parseInstantMs,
  parseRupeesToPaise,
  previewPayment,
  validatePaymentInput,
  istDateKey,
} from '@/lib/ledger';
import type { FarmerTotals, LedgerPayment, LedgerUsage, PaymentPreview, ValidationCode } from '@/lib/ledger';
import { dayOrNull, monthOf, monthsNewestFirst, sortNewestFirst } from './timeline';
import type { IstMoment } from './usageRules';

/** A payment note is NULL or at most this many characters (migration 006). */
export const PAYMENT_NOTE_MAX = 200;

/** The engine codes that a payment can produce. */
export type PaymentValidationCode = Extract<
  ValidationCode,
  | 'farmer_required'
  | 'time_required'
  | 'time_invalid'
  | 'amount_required'
  | 'amount_not_integer'
  | 'amount_negative'
  | 'amount_not_positive'
>;

/** Every code the payment form can show: the engine payment codes plus the two local ones. */
export type PaymentFormCode = PaymentValidationCode | 'amount_invalid' | 'note_too_long';

/** The form exactly as typed (strings). The amount is rupees. There is no month field (L5). */
export interface PaymentForm {
  readonly farmerId: string;
  /** IST date "YYYY-MM-DD". */
  readonly date: string;
  /** IST time "HH:mm". */
  readonly time: string;
  readonly amount: string;
  readonly note: string;
}

/** Values as written to the database. */
export interface PaymentInput {
  readonly farmer_id: string;
  readonly paid_at: string;
  readonly amount_paise: number;
  readonly note: string | null;
}

/** The payment columns these rules read. DB rows are assignable to it. */
export interface PaymentRowLike {
  readonly id: string;
  readonly farmer_id: string;
  readonly paid_at: string;
  readonly amount_paise: number;
  readonly note: string | null;
  readonly created_at: string;
  readonly deleted_at: string | null;
}

/** A blank form for a new payment, dated at `now` (IST); the amount starts EMPTY (never 0). */
export function newPaymentForm(now: IstMoment, farmerId = ''): PaymentForm {
  return { farmerId, date: now.dateKey, time: now.timeKey, amount: '', note: '' };
}

/** The form prefilled from a stored payment (IST date and time, amount in rupees). */
export function paymentFormFromRow(row: PaymentRowLike): PaymentForm {
  const ms = parseInstantMs(row.paid_at);
  return {
    farmerId: row.farmer_id,
    date: istDateKey(ms),
    time: istTimeKey(ms),
    amount: paiseToDecimalString(row.amount_paise),
    note: row.note ?? '',
  };
}

/** Length in characters (code points), the way Postgres char_length counts. */
function charLength(value: string): number {
  return [...value].length;
}

/** Note: trimmed of all whitespace at both ends; empty becomes null. */
export function normalizePaymentNote(note: string | null | undefined): string | null {
  const trimmed = (note ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** Codes for already-built values (used by the data layer before every write). */
export function paymentInputCodes(input: PaymentInput): PaymentFormCode[] {
  const codes: PaymentFormCode[] = validatePaymentInput(input) as PaymentValidationCode[];
  if (input.note !== null && charLength(input.note) > PAYMENT_NOTE_MAX) codes.push('note_too_long');
  return codes;
}

export type BuildPaymentResult =
  | { readonly ok: true; readonly input: PaymentInput }
  | { readonly ok: false; readonly codes: PaymentFormCode[] };

/**
 * Turns the typed form into database values, or the list of problems. The amount goes through
 * parseRupeesToPaise (empty -> amount_required, unreadable -> amount_invalid), date and time through
 * istWallClockToIso, then the engine's validatePaymentInput decides. Never throws.
 */
export function buildPaymentInput(form: PaymentForm): BuildPaymentResult {
  const farmerId = form.farmerId.trim();
  const date = form.date.trim();
  const time = form.time.trim();
  const amountText = form.amount.trim();
  const note = normalizePaymentNote(form.note);

  let paidAt = '';
  if (date !== '' && time !== '') paidAt = istWallClockToIso(date, time) ?? 'invalid';

  let amountPaise: number | null = null;
  let amountInvalid = false;
  if (amountText !== '') {
    try {
      amountPaise = parseRupeesToPaise(amountText);
    } catch {
      amountInvalid = true;
      amountPaise = 1; // placeholder so the other checks still run; amount_invalid is reported instead
    }
  }

  const codes: PaymentFormCode[] = validatePaymentInput({ farmer_id: farmerId, paid_at: paidAt, amount_paise: amountPaise }) as PaymentValidationCode[];
  if (amountInvalid) codes.push('amount_invalid');
  if (note !== null && charLength(note) > PAYMENT_NOTE_MAX) codes.push('note_too_long');
  if (codes.length > 0) return { ok: false, codes };
  return { ok: true, input: { farmer_id: farmerId, paid_at: paidAt, amount_paise: amountPaise ?? 0, note } };
}

export type PaymentWarning<T> = { readonly kind: 'duplicate'; readonly matches: T[] } | { readonly kind: 'future_date' };

/**
 * Non-blocking warnings for a valid input: same farmer + amount + IST day (L14), or an IST date
 * after today. When editing, pass the payment as `original` (and its id as `excludeId`): a warning
 * whose fields did not change is not raised again. Never throws.
 */
export function describePaymentWarnings<T extends PaymentRowLike>(
  input: PaymentInput,
  existing: readonly T[],
  now: Pick<IstMoment, 'dateKey'>,
  options: { readonly excludeId?: string; readonly original?: PaymentRowLike } = {},
): PaymentWarning<T>[] {
  const warnings: PaymentWarning<T>[] = [];
  const original = options.original;
  const day = dayOrNull(input.paid_at);
  const sameDay = original !== undefined && day !== null && dayOrNull(original.paid_at) === day;

  const duplicateFieldsUnchanged =
    original !== undefined && sameDay && original.farmer_id === input.farmer_id && original.amount_paise === input.amount_paise;
  if (!duplicateFieldsUnchanged) {
    const matches = findDuplicatePayments({ id: options.excludeId, ...input }, existing);
    if (matches.length > 0) warnings.push({ kind: 'duplicate', matches });
  }
  if (day !== null && day > now.dateKey && !sameDay) warnings.push({ kind: 'future_date' });
  return warnings;
}

export interface PaymentPreviewRequest {
  readonly farmerId: string;
  /** A valid input (from buildPaymentInput); without it only the farmer's current totals are returned. */
  readonly input?: PaymentInput;
  /** Every usage row (any farmer, any state): this function picks the farmer's own rows. */
  readonly usageRows: readonly LedgerUsage[];
  /** Every payment row (any farmer, any state). */
  readonly paymentRows: readonly LedgerPayment[];
  /** When editing: the id of the payment being replaced. */
  readonly replacesPaymentId?: string;
}

export type PaymentPreviewResult =
  | { readonly ok: true; readonly kind: 'current'; readonly current: FarmerTotals }
  | { readonly ok: true; readonly kind: 'preview'; readonly preview: PaymentPreview }
  | { readonly ok: false };

/**
 * The live FIFO preview of the payment form (L16), straight from the engine: the farmer's current
 * totals (buildFarmerLedger) or the full previewPayment result. Bad data (LedgerInputError) gives
 * { ok: false }; nothing is fixed silently and nothing is computed here.
 */
export function buildPaymentPreview(request: PaymentPreviewRequest): PaymentPreviewResult {
  const usage = request.usageRows.filter((r) => r.farmer_id === request.farmerId);
  const payments = request.paymentRows.filter((r) => r.farmer_id === request.farmerId);
  try {
    if (request.input === undefined) {
      return { ok: true, kind: 'current', current: buildFarmerLedger({ usage, payments }).totals };
    }
    const preview = previewPayment(
      { usage, payments },
      { farmer_id: request.input.farmer_id, paid_at: request.input.paid_at, amount_paise: request.input.amount_paise },
      request.replacesPaymentId === undefined ? {} : { replacesPaymentId: request.replacesPaymentId },
    );
    return { ok: true, kind: 'preview', preview };
  } catch (error) {
    if (error instanceof LedgerInputError) return { ok: false };
    throw error;
  }
}

export interface PaymentLists<T> {
  readonly live: T[];
  readonly deleted: T[];
}

/** The ONE soft-delete split for payments: deleted = deleted_at set. Each list newest first (paid_at, then id). */
export function classifyPayments<T extends PaymentRowLike>(rows: readonly T[]): PaymentLists<T> {
  return {
    live: sortNewestFirst(rows.filter((r) => r.deleted_at === null), (r) => r.paid_at),
    deleted: sortNewestFirst(rows.filter((r) => r.deleted_at !== null), (r) => r.paid_at),
  };
}

export interface PaymentFilter {
  /** Only this farmer's payments; undefined = every farmer. */
  readonly farmerId?: string;
  /** Only this IST month ("YYYY-MM"); undefined = every month. */
  readonly monthKey?: string;
}

export function filterPayments<T extends PaymentRowLike>(rows: readonly T[], filter: PaymentFilter): T[] {
  return rows.filter(
    (r) =>
      (filter.farmerId === undefined || r.farmer_id === filter.farmerId) &&
      (filter.monthKey === undefined || monthOf(r.paid_at) === filter.monthKey),
  );
}

/** Distinct IST months of the payments plus the current month, newest first. */
export function listPaymentMonths(rows: readonly PaymentRowLike[], currentMonthKey: string): string[] {
  return monthsNewestFirst(rows.map((r) => monthOf(r.paid_at)), currentMonthKey);
}
