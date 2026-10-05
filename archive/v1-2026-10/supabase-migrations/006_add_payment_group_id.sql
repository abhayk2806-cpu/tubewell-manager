-- Migration 006: add payment_group_id to payments
-- Applied to prod on 2026-05-23.
--
-- Purpose: when a single user action creates multiple payment rows
-- (one per month — e.g. ₹800 split into April ₹500 + May ₹300), all those
-- rows share the same payment_group_id (a UUID generated client-side).
-- NULL for legacy single-row payments and any new single-month payment.
--
-- IMPORTANT: payment_group_id is a UI grouping hint only.
-- All due/balance calculations remain row-wise on `for_month` — the existing
-- payment allocation logic is unchanged. Do NOT use payment_group_id in any
-- monthly-due math.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_group_id uuid NULL;

-- Partial index — most payments will be single-month (payment_group_id IS NULL)
-- and we don't need to index those.
CREATE INDEX IF NOT EXISTS idx_payments_payment_group_id
  ON payments (payment_group_id)
  WHERE payment_group_id IS NOT NULL;

COMMENT ON COLUMN payments.payment_group_id IS
  'Optional UUID grouping multiple payment rows created from a single user action (multi-month payment). NULL for single-month payments.';
