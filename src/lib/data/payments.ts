// Payments (Paisa) data access. Rows are returned exactly as the database sends them, so they stay
// assignable to the ledger engine's LedgerPayment input type.
import { parseInstantMs } from '@/lib/ledger';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { nowIso } from './clock';
import { DataError } from './errors';
import { fetchAllRows } from './paging';
import { paymentInputCodes } from './paymentRules';
import type { PaymentInput } from './paymentRules';
import { oneRow } from './rows';

export type PaymentRow = Database['public']['Tables']['payments']['Row'];
type PaymentUpdate = Database['public']['Tables']['payments']['Update'];

function checked(input: PaymentInput): PaymentInput {
  const codes = paymentInputCodes(input);
  if (codes.length > 0) throw new DataError('constraint', 'client_validation', codes.join(','));
  return input;
}

/** Every payment row (live and deleted), read page by page in id order. */
export function listPayments(): Promise<PaymentRow[]> {
  return fetchAllRows<PaymentRow>((from, to) => supabase.from('payments').select('*').order('id').range(from, to));
}

export async function createPayment(input: PaymentInput): Promise<PaymentRow> {
  const { farmer_id, paid_at, amount_paise, note } = checked(input);
  return oneRow(await supabase.from('payments').insert({ farmer_id, paid_at, amount_paise, note }).select().single());
}

async function updateLivePayment(id: string, patch: PaymentUpdate): Promise<PaymentRow> {
  return oneRow(await supabase.from('payments').update(patch).eq('id', id).is('deleted_at', null).select().maybeSingle());
}

/**
 * Saves an edited, non-deleted payment, sending only the changed columns among amount_paise,
 * paid_at (compared as an instant) and note. The farmer of a payment cannot change: a different
 * farmer_id is refused before any request. With nothing changed it makes no request.
 */
export async function updatePayment(current: PaymentRow, input: PaymentInput): Promise<PaymentRow> {
  const next = checked(input);
  if (next.farmer_id !== current.farmer_id) {
    throw new DataError('constraint', 'farmer_locked', "a payment's farmer cannot be changed");
  }
  const patch: { amount_paise?: number; paid_at?: string; note?: string | null } = {};
  if (next.amount_paise !== current.amount_paise) patch.amount_paise = next.amount_paise;
  if (parseInstantMs(next.paid_at) !== parseInstantMs(current.paid_at)) patch.paid_at = next.paid_at;
  if (next.note !== current.note) patch.note = next.note;
  if (Object.keys(patch).length === 0) return current;
  return updateLivePayment(current.id, patch);
}

/** Soft delete: sets deleted_at (the trigger sets deleted_by). A payment that is already deleted gives not_found. */
export function softDeletePayment(id: string): Promise<PaymentRow> {
  return updateLivePayment(id, { deleted_at: nowIso() });
}

/** Restore: deleted_at back to null (the trigger clears deleted_by). A payment that is not deleted gives not_found. */
export async function restorePayment(id: string): Promise<PaymentRow> {
  return oneRow(
    await supabase.from('payments').update({ deleted_at: null }).eq('id', id).not('deleted_at', 'is', null).select().maybeSingle(),
  );
}
