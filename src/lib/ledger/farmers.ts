// The ONE definition of an active farmer (C6, L12) and per-farmer grouping for cross-farmer views.
import { LedgerInputError } from './errors';
import { compareIds } from './records';
import type { FarmerLedgerInput, FarmersInput, LedgerFarmer } from './types';

/** Active = not soft-deleted and not disabled. Every new status flag must be added here. */
export function isActiveFarmer(farmer: LedgerFarmer): boolean {
  return farmer.deleted_at === null && !farmer.is_disabled;
}

/** Active farmers, in input order. */
export function filterActiveFarmers<T extends LedgerFarmer>(farmers: readonly T[]): T[] {
  return farmers.filter(isActiveFarmer);
}

export interface FarmerRows extends FarmerLedgerInput {
  readonly farmerId: string;
}

/**
 * Rows grouped per ACTIVE farmer, sorted by farmer id. Rows of inactive or unknown farmers are
 * dropped here, before any validation, so they can never reach a total.
 */
export function rowsByActiveFarmer(input: FarmersInput): FarmerRows[] {
  const seen = new Set<string>();
  for (const f of input.farmers) {
    if (typeof f.id !== 'string' || f.id.length === 0) throw new LedgerInputError('farmer id must be a non-empty string');
    if (seen.has(f.id)) throw new LedgerInputError('duplicate farmer id');
    seen.add(f.id);
  }
  const active = filterActiveFarmers(input.farmers)
    .map((f) => f.id)
    .sort(compareIds);
  return active.map((farmerId) => ({
    farmerId,
    usage: input.usage.filter((row) => row.farmer_id === farmerId),
    payments: input.payments.filter((row) => row.farmer_id === farmerId),
  }));
}
