// Data layer: every Supabase read and write goes through here (docs/ARCHITECTURE.md, "Data layer").
// Pages and hooks import this barrel only, never the Supabase client.
export { DataError, toDataError } from './errors';
export type { DataErrorKind } from './errors';
export { PAGE_SIZE, fetchAllRows } from './paging';
export type { PageResult } from './paging';
export {
  FARMER_MOBILE_MAX,
  FARMER_NAME_MAX,
  FARMER_NOTES_MAX,
  findDuplicateFarmerNames,
  matchesFarmerSearch,
  normalizeFarmerInput,
  sortFarmersByName,
  validateFarmerInput,
} from './farmerRules';
export type { FarmerFormValues, FarmerInput, FarmerLike, FarmerValidationCode } from './farmerRules';
export {
  classifyFarmers,
  createFarmer,
  listFarmers,
  restoreFarmer,
  setFarmerDisabled,
  softDeleteFarmer,
  updateFarmer,
} from './farmers';
export type { FarmerLists, FarmerRow } from './farmers';
export { currentIstMoment } from './clock';
export {
  DEFAULT_RATE_TEXT,
  LONG_DURATION_HOURS,
  buildUsageInput,
  classifyUsage,
  describeUsageWarnings,
  filterUsage,
  listUsageMonths,
  newUsageForm,
  usageAmountPaise,
  usageFormFromRow,
  usageInputAmountPaise,
} from './usageRules';
export type {
  BuildUsageResult,
  IstMoment,
  UsageFilter,
  UsageForm,
  UsageFormCode,
  UsageInput,
  UsageLists,
  UsageRowLike,
  UsageValidationCode,
  UsageWarning,
} from './usageRules';
export { createUsage, listUsage, restoreUsage, softDeleteUsage, updateUsage } from './usage';
export type { UsageRow } from './usage';
export {
  PAYMENT_NOTE_MAX,
  buildPaymentInput,
  buildPaymentPreview,
  classifyPayments,
  describePaymentWarnings,
  filterPayments,
  listPaymentMonths,
  newPaymentForm,
  normalizePaymentNote,
  paymentFormFromRow,
  paymentInputCodes,
} from './paymentRules';
export type {
  BuildPaymentResult,
  PaymentFilter,
  PaymentForm,
  PaymentFormCode,
  PaymentInput,
  PaymentLists,
  PaymentPreviewRequest,
  PaymentPreviewResult,
  PaymentRowLike,
  PaymentValidationCode,
  PaymentWarning,
} from './paymentRules';
export { createPayment, listPayments, restorePayment, softDeletePayment, updatePayment } from './payments';
export type { PaymentRow } from './payments';
export {
  PROFILE_PAGE_SIZE,
  buildFarmerProfile,
  findProfileFarmer,
  nextShownCount,
  toProfileBalance,
  visiblePart,
} from './profileRules';
export type {
  FarmerProfile,
  FarmerProfileResult,
  ProfileBalance,
  ProfileFarmerLookup,
  ProfileLedgerLine,
  ProfileMonth,
  ProfilePayment,
  ProfileUsage,
  VisiblePart,
} from './profileRules';
export {
  CHART_MIN_PERCENT,
  CHART_MONTHS,
  RECENT_LIMIT,
  buildDashboardScreen,
  buildPeriodOptions,
  buildRecentActivity,
  chartBars,
  filterDashboardRows,
  sortDashboardRows,
  summarizeDashboard,
} from './dashboardRules';
export type {
  BandNote,
  ChartMonth,
  DashboardFarmerLike,
  DashboardRow,
  DashboardScreen,
  DashboardScreenResult,
  DashboardSummary,
  PeriodOptions,
  RecentItem,
} from './dashboardRules';
