// Farmers data access. Rows are returned exactly as the database sends them (no renaming), so they
// stay assignable to the ledger engine's LedgerFarmer input type.
import { isActiveFarmer } from '@/lib/ledger';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { nowIso } from './clock';
import { DataError } from './errors';
import { normalizeFarmerInput, sortFarmersByName, validateFarmerInput } from './farmerRules';
import type { FarmerFormValues, FarmerInput } from './farmerRules';
import { fetchAllRows } from './paging';
import { oneRow } from './rows';

export type FarmerRow = Database['public']['Tables']['farmers']['Row'];
type FarmerUpdate = Database['public']['Tables']['farmers']['Update'];

export interface FarmerLists {
  /** Chalu: not deleted and not disabled (the engine's isActiveFarmer). */
  readonly active: FarmerRow[];
  /** Band: not deleted but disabled. */
  readonly disabled: FarmerRow[];
  /** Deleted (Recently Deleted): deleted_at is set, whether or not the farmer is also disabled. */
  readonly deleted: FarmerRow[];
}

/**
 * The ONE place that splits farmers into Chalu / Band / Deleted. "Active" is the engine's
 * definition (isActiveFarmer); this function adds only the soft-delete split. Each list is sorted by name.
 */
export function classifyFarmers(rows: readonly FarmerRow[]): FarmerLists {
  const active: FarmerRow[] = [];
  const disabled: FarmerRow[] = [];
  const deleted: FarmerRow[] = [];
  for (const row of rows) {
    if (isActiveFarmer(row)) active.push(row);
    else if (row.deleted_at !== null) deleted.push(row);
    else disabled.push(row);
  }
  return { active: sortFarmersByName(active), disabled: sortFarmersByName(disabled), deleted: sortFarmersByName(deleted) };
}

/** Every farmer row (active, disabled and deleted), read page by page in id order. */
export function listFarmers(): Promise<FarmerRow[]> {
  return fetchAllRows<FarmerRow>((from, to) => supabase.from('farmers').select('*').order('id').range(from, to));
}

function checkedInput(values: FarmerFormValues): FarmerInput {
  const input = normalizeFarmerInput(values);
  const codes = validateFarmerInput(input);
  if (codes.length > 0) throw new DataError('constraint', 'client_validation', codes.join(','));
  return input;
}

export async function createFarmer(values: FarmerFormValues): Promise<FarmerRow> {
  const input = checkedInput(values);
  return oneRow(
    await supabase.from('farmers').insert({ name: input.name, mobile: input.mobile, notes: input.notes }).select().single(),
  );
}

async function updateLiveFarmer(id: string, patch: FarmerUpdate): Promise<FarmerRow> {
  return oneRow(await supabase.from('farmers').update(patch).eq('id', id).is('deleted_at', null).select().maybeSingle());
}

/**
 * Saves the edited form for a non-deleted farmer, sending only the columns that changed.
 * With nothing changed it makes no request and returns `current`.
 */
export async function updateFarmer(current: FarmerRow, values: FarmerFormValues): Promise<FarmerRow> {
  const input = checkedInput(values);
  const patch: { name?: string; mobile?: string | null; notes?: string | null } = {};
  if (input.name !== current.name) patch.name = input.name;
  if (input.mobile !== current.mobile) patch.mobile = input.mobile;
  if (input.notes !== current.notes) patch.notes = input.notes;
  if (Object.keys(patch).length === 0) return current;
  return updateLiveFarmer(current.id, patch);
}

/** Band karo (true) / Chalu karo (false). Only for a non-deleted farmer. */
export function setFarmerDisabled(id: string, disabled: boolean): Promise<FarmerRow> {
  return updateLiveFarmer(id, { is_disabled: disabled });
}

/** Soft delete: sets deleted_at (the trigger sets deleted_by). A farmer that is already deleted gives not_found. */
export function softDeleteFarmer(id: string): Promise<FarmerRow> {
  return updateLiveFarmer(id, { deleted_at: nowIso() });
}

/** Restore: deleted_at back to null (the trigger clears deleted_by). A farmer that is not deleted gives not_found. */
export async function restoreFarmer(id: string): Promise<FarmerRow> {
  return oneRow(
    await supabase.from('farmers').update({ deleted_at: null }).eq('id', id).not('deleted_at', 'is', null).select().maybeSingle(),
  );
}
