-- Migration 006: payment note length (Phase 5)
--
-- payments_note_max_length: a payment note is NULL or at most 200 characters (char_length counts
-- characters, not bytes). The same limit as the app's payment form rules
-- (src/lib/data/paymentRules.ts). The table had 0 rows when this was applied (2026-10-06), so no
-- existing row could conflict.

alter table public.payments
  add constraint payments_note_max_length
    check (note is null or char_length(note) <= 200);
