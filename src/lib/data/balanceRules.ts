// Per-farmer balances and payment trails for the list screens (Phase PR1, D32): pure, no I/O and no
// second algorithm. Rows are grouped by farmer ONCE and each farmer's figures are the engine's
// buildFarmerLedger on that farmer's own rows, exactly what the Farmer Profile shows. Outstanding and
// credit stay two separate figures (L8, E18). Bad data for a farmer gives that farmer { ok: false }.
import { LedgerInputError, buildFarmerLedger } from '@/lib/ledger';
import type { FarmerLedger, LedgerPayment, LedgerUsage, TrailPiece } from '@/lib/ledger';

export type FarmerBalance =
  | { readonly ok: true; readonly outstandingPaise: number; readonly creditPaise: number }
  | { readonly ok: false };

export type PaymentTrailView =
  | { readonly ok: true; readonly pieces: readonly TrailPiece[]; readonly unappliedPaise: number }
  | { readonly ok: false };

type LedgerResult = { readonly ok: true; readonly ledger: FarmerLedger } | { readonly ok: false };

interface FarmerIdLike {
  readonly id: string;
  readonly deleted_at: string | null;
}

/** Each farmer's engine ledger, rows grouped by farmer_id once. LedgerInputError -> { ok: false }. */
function ledgersByFarmer(
  farmerIds: readonly string[],
  usageRows: readonly LedgerUsage[],
  paymentRows: readonly LedgerPayment[],
): Map<string, LedgerResult> {
  const usage = new Map<string, LedgerUsage[]>();
  const payments = new Map<string, LedgerPayment[]>();
  for (const row of usageRows) {
    const list = usage.get(row.farmer_id);
    if (list === undefined) usage.set(row.farmer_id, [row]);
    else list.push(row);
  }
  for (const row of paymentRows) {
    const list = payments.get(row.farmer_id);
    if (list === undefined) payments.set(row.farmer_id, [row]);
    else list.push(row);
  }
  const result = new Map<string, LedgerResult>();
  for (const id of farmerIds) {
    try {
      result.set(id, { ok: true, ledger: buildFarmerLedger({ usage: usage.get(id) ?? [], payments: payments.get(id) ?? [] }) });
    } catch (error) {
      if (!(error instanceof LedgerInputError)) throw error;
      result.set(id, { ok: false });
    }
  }
  return result;
}

/**
 * Current Abhi baaki and Advance / Credit of every NON-deleted farmer (Chalu and Band), from the
 * engine totals of the farmer's own rows: the same figures as the profile and the Dashboard's All
 * Time row.
 */
export function buildFarmerBalances(request: {
  readonly farmers: readonly FarmerIdLike[];
  readonly usageRows: readonly LedgerUsage[];
  readonly paymentRows: readonly LedgerPayment[];
}): ReadonlyMap<string, FarmerBalance> {
  const ids = request.farmers.filter((f) => f.deleted_at === null).map((f) => f.id);
  const ledgers = ledgersByFarmer(ids, request.usageRows, request.paymentRows);
  const balances = new Map<string, FarmerBalance>();
  for (const [id, result] of ledgers) {
    balances.set(
      id,
      result.ok ? { ok: true, outstandingPaise: result.ledger.totals.outstandingPaise, creditPaise: result.ledger.totals.creditPaise } : { ok: false },
    );
  }
  return balances;
}

/**
 * The engine allocation trail of every LIVE payment (any farmer, also Band or deleted farmers), built
 * per farmer from that farmer's rows: the same pieces and remainder as the profile's payment history.
 */
export function buildPaymentTrails(request: {
  readonly usageRows: readonly LedgerUsage[];
  readonly paymentRows: readonly LedgerPayment[];
}): ReadonlyMap<string, PaymentTrailView> {
  const live = request.paymentRows.filter((p) => p.deleted_at === null);
  const farmerIds = [...new Set(live.map((p) => p.farmer_id))];
  const ledgers = ledgersByFarmer(farmerIds, request.usageRows, request.paymentRows);
  const trails = new Map<string, PaymentTrailView>();
  for (const payment of live) {
    const result = ledgers.get(payment.farmer_id);
    const trail = result?.ok ? result.ledger.trail.find((t) => t.paymentId === payment.id) : undefined;
    trails.set(payment.id, trail === undefined ? { ok: false } : { ok: true, pieces: trail.pieces, unappliedPaise: trail.unappliedPaise });
  }
  return trails;
}
