// Public API of the ledger engine. Callers use this barrel (the @/lib/ledger path) only.
// Rules: docs/LEDGER_AND_ALLOCATION.md. Conventions: docs/ARCHITECTURE.md, "Ledger engine".
export { LedgerInputError } from './errors';
export {
  compareMonthKeys,
  endOfIstDayMs,
  isDateKey,
  isMonthKey,
  isYearKey,
  istDateKey,
  istMonthKey,
  istMonthRangeMs,
  istYearKey,
  istYearRangeMs,
  parseInstantMs,
} from './time';
export type { InstantRange } from './time';
export { assertPaise, intDiv, paiseToDecimalString, parseRupeesToPaise, sumPaise } from './money';
export { entryAmountPaise } from './entry';
export { buildFarmerLedger } from './ledger';
export { previewPayment } from './preview';
export { filterActiveFarmers, isActiveFarmer } from './farmers';
export { buildAllFarmersMonths, buildDashboard } from './dashboard';
export { findDuplicatePayments, findDuplicateUsage } from './duplicates';
export type { PaymentDuplicateCandidate, UsageDuplicateCandidate } from './duplicates';
export { validatePaymentInput, validateUsageInput } from './validation';
export type { PaymentFormInput, UsageFormInput, ValidationCode } from './validation';
export type {
  Dashboard,
  DashboardFarmerRow,
  DashboardView,
  FarmerLedger,
  FarmerLedgerInput,
  FarmerTotals,
  FarmersInput,
  LedgerFarmer,
  LedgerOptions,
  LedgerPayment,
  LedgerRow,
  LedgerSummary,
  LedgerUsage,
  MonthRow,
  MonthStatus,
  PaymentCandidate,
  PaymentPreview,
  PaymentTrail,
  PreviewOptions,
  TrailPiece,
} from './types';
