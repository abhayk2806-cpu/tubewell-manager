// Engine input and output types. Inputs are small structural views of the DB rows
// (src/types/database.ts rows are assignable to them); the engine never imports Supabase types.

/** The fields of a `farmers` row the engine reads. */
export interface LedgerFarmer {
  readonly id: string;
  readonly is_disabled: boolean;
  readonly deleted_at: string | null;
}

/** The fields of a `usage_entries` row the engine reads. */
export interface LedgerUsage {
  readonly id: string;
  readonly farmer_id: string;
  readonly used_at: string;
  readonly hours: number;
  readonly minutes: number;
  /** Generated column in the DB (typed nullable by the generator); must equal hours * 60 + minutes. */
  readonly total_minutes: number | null;
  readonly rate_paise: number;
  readonly created_at: string;
  readonly deleted_at: string | null;
}

/** The fields of a `payments` row the engine reads. */
export interface LedgerPayment {
  readonly id: string;
  readonly farmer_id: string;
  readonly paid_at: string;
  readonly amount_paise: number;
  readonly note?: string | null;
  readonly created_at: string;
  readonly deleted_at: string | null;
}

/** One farmer's raw rows. Soft-deleted rows may be included; the engine ignores them. */
export interface FarmerLedgerInput {
  readonly usage: readonly LedgerUsage[];
  readonly payments: readonly LedgerPayment[];
}

/** Several farmers' raw rows, for cross-farmer views. */
export interface FarmersInput extends FarmerLedgerInput {
  readonly farmers: readonly LedgerFarmer[];
}

export interface LedgerOptions {
  /** Inclusive as-of cutoff in epoch ms (C3). Omitted = current (no cutoff). */
  readonly cutoffMs?: number;
}

/** Month status (C7). UI labels: Settled / Partial / Unpaid / "Sirf Payment". */
export type MonthStatus = 'settled' | 'partial' | 'unpaid' | 'payment_only';

export interface MonthRow {
  /** IST month, "YYYY-MM". */
  readonly monthKey: string;
  readonly totalMinutes: number;
  /** Monthly charge bucket (L4). */
  readonly chargePaise: number;
  /** Charge settled by the FIFO waterfall (L6). Not cash received (L10). */
  readonly paidPaise: number;
  readonly remainingPaise: number;
  /** Cash received: payments dated in this IST month (L10). */
  readonly cashPaise: number;
  readonly status: MonthStatus;
  readonly entryCount: number;
  readonly paymentCount: number;
}

export interface TrailPiece {
  readonly monthKey: string;
  readonly amountPaise: number;
}

/** One payment's allocation trail (L7). `unappliedPaise` is shown as "Advance / Credit" (D5). */
export interface PaymentTrail {
  readonly paymentId: string;
  readonly paidAtMs: number;
  readonly amountPaise: number;
  readonly pieces: readonly TrailPiece[];
  readonly unappliedPaise: number;
}

/** One line of the chronological ledger (L17). Balance = charges so far - payments so far. */
export interface LedgerRow {
  readonly kind: 'usage' | 'payment';
  readonly id: string;
  readonly atMs: number;
  readonly monthKey: string;
  readonly amountPaise: number;
  /** Minutes for a usage row; null for a payment row. */
  readonly totalMinutes: number | null;
  readonly balancePaise: number;
}

export interface FarmerTotals {
  readonly chargesPaise: number;
  /** Sum of non-deleted payments (C8). */
  readonly totalPaidPaise: number;
  readonly outstandingPaise: number;
  readonly creditPaise: number;
  readonly usageCount: number;
  readonly paymentCount: number;
}

export interface FarmerLedger {
  readonly months: readonly MonthRow[];
  readonly totals: FarmerTotals;
  readonly trail: readonly PaymentTrail[];
  readonly rows: readonly LedgerRow[];
}

/** A payment being entered or edited in the payment form (L16). */
export interface PaymentCandidate {
  readonly id?: string;
  readonly farmer_id: string;
  readonly paid_at: string;
  readonly amount_paise: number;
  readonly created_at?: string;
}

export interface PreviewOptions extends LedgerOptions {
  /** Id of the existing, non-deleted payment that the candidate replaces (edit form). */
  readonly replacesPaymentId?: string;
}

export interface LedgerSummary {
  readonly totals: FarmerTotals;
  readonly months: readonly MonthRow[];
}

export interface PaymentPreview {
  readonly before: LedgerSummary;
  readonly after: LedgerSummary;
  /** Where the candidate's money goes, oldest month first. */
  readonly pieces: readonly TrailPiece[];
  readonly unappliedPaise: number;
  /** max(0, after credit - before credit). */
  readonly creditCreatedPaise: number;
}

export type DashboardView =
  | { readonly kind: 'all' }
  | { readonly kind: 'month'; readonly monthKey: string }
  | { readonly kind: 'year'; readonly yearKey: string };

export interface DashboardFarmerRow {
  readonly farmerId: string;
  readonly chargesCreatedPaise: number;
  readonly cashReceivedPaise: number;
  readonly outstandingPaise: number;
  readonly creditPaise: number;
}

/** Dashboard figures (L11, D1). Outstanding and credit are separate sums, never netted. */
export interface Dashboard {
  readonly view: DashboardView;
  /** Inclusive period bounds; null for All Time. */
  readonly periodStartMs: number | null;
  readonly periodEndMs: number | null;
  readonly activeFarmerCount: number;
  readonly chargesCreatedPaise: number;
  readonly cashReceivedPaise: number;
  readonly outstandingPaise: number;
  readonly creditPaise: number;
  /** Active farmers, sorted by id. */
  readonly farmers: readonly DashboardFarmerRow[];
}
