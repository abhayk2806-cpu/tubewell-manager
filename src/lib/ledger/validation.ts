// Form validation (L18, D6). Returns error codes in a fixed field order; never throws.
// The Hinglish messages for these codes belong to the UI (Phase 4/5).
import { entryAmountPaise } from './entry';
import { parseInstantMs } from './time';

export type ValidationCode =
  | 'farmer_required'
  | 'time_required'
  | 'time_invalid'
  | 'hours_required'
  | 'hours_not_integer'
  | 'hours_negative'
  | 'minutes_required'
  | 'minutes_not_integer'
  | 'minutes_negative'
  | 'minutes_out_of_range'
  | 'duration_zero'
  | 'rate_required'
  | 'rate_not_integer'
  | 'rate_negative'
  | 'rate_not_positive'
  | 'amount_too_large'
  | 'amount_required'
  | 'amount_not_integer'
  | 'amount_negative'
  | 'amount_not_positive';

type Maybe<T> = T | null | undefined;

export interface UsageFormInput {
  readonly farmer_id: Maybe<string>;
  /** ISO-8601 with a zone (C1); the form converts its IST wall clock before validating. */
  readonly used_at: Maybe<string>;
  readonly hours: Maybe<number>;
  readonly minutes: Maybe<number>;
  readonly rate_paise: Maybe<number>;
}

export interface PaymentFormInput {
  readonly farmer_id: Maybe<string>;
  readonly paid_at: Maybe<string>;
  readonly amount_paise: Maybe<number>;
}

interface NumberCodes {
  readonly required: ValidationCode;
  readonly notInteger: ValidationCode;
  readonly negative: ValidationCode;
}

/** The first problem with a whole-number field, or null when it is a non-negative safe integer. */
function wholeNumberProblem(value: Maybe<number>, codes: NumberCodes): ValidationCode | null {
  if (value === null || value === undefined) return codes.required;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return codes.notInteger;
  return value < 0 ? codes.negative : null;
}

function farmerProblem(farmerId: Maybe<string>): ValidationCode | null {
  return typeof farmerId !== 'string' || farmerId.trim() === '' ? 'farmer_required' : null;
}

function timeProblem(text: Maybe<string>): ValidationCode | null {
  if (text === null || text === undefined || text === '') return 'time_required';
  try {
    parseInstantMs(text);
    return null;
  } catch {
    return 'time_invalid';
  }
}

export function validateUsageInput(input: UsageFormInput): ValidationCode[] {
  const hours = wholeNumberProblem(input.hours, {
    required: 'hours_required',
    notInteger: 'hours_not_integer',
    negative: 'hours_negative',
  });
  let minutes = wholeNumberProblem(input.minutes, {
    required: 'minutes_required',
    notInteger: 'minutes_not_integer',
    negative: 'minutes_negative',
  });
  if (minutes === null && (input.minutes ?? 0) > 59) minutes = 'minutes_out_of_range';
  let rate = wholeNumberProblem(input.rate_paise, {
    required: 'rate_required',
    notInteger: 'rate_not_integer',
    negative: 'rate_negative',
  });
  if (rate === null && input.rate_paise === 0) rate = 'rate_not_positive';

  let duration: ValidationCode | null = null;
  if (hours === null && minutes === null) {
    const totalMinutes = (input.hours ?? 0) * 60 + (input.minutes ?? 0);
    if (totalMinutes === 0) duration = 'duration_zero';
    else if (rate === null) {
      try {
        entryAmountPaise(totalMinutes, input.rate_paise ?? 0);
      } catch {
        duration = 'amount_too_large';
      }
    }
  }

  const codes = [farmerProblem(input.farmer_id), timeProblem(input.used_at), hours, minutes, duration, rate];
  return codes.filter((code): code is ValidationCode => code !== null);
}

export function validatePaymentInput(input: PaymentFormInput): ValidationCode[] {
  let amount = wholeNumberProblem(input.amount_paise, {
    required: 'amount_required',
    notInteger: 'amount_not_integer',
    negative: 'amount_negative',
  });
  if (amount === null && input.amount_paise === 0) amount = 'amount_not_positive';
  const codes = [farmerProblem(input.farmer_id), timeProblem(input.paid_at), amount];
  return codes.filter((code): code is ValidationCode => code !== null);
}
