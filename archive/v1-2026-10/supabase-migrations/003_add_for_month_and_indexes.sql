-- Migration 003 — Add for_month column on payments + performance indexes
-- Original applied to Supabase: 2026-04-22 (version 20260422234709)
-- This file is a BACKFILL — production already has these objects.

-- Add for_month column to payments — "which month is this payment FOR"
-- Critical: all monthly calculations MUST filter by for_month, NEVER by date.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS for_month TEXT;

-- Performance indexes — added to address Supabase advisor warnings about
-- missing FK indexes and frequently-filtered columns.

-- usage_entries: lookups by farmer and by month are extremely common
CREATE INDEX IF NOT EXISTS idx_usage_entries_farmer_id
  ON usage_entries (farmer_id);

CREATE INDEX IF NOT EXISTS idx_usage_entries_month
  ON usage_entries (month);

-- payments: lookups by farmer and by for_month are the core calculation queries
CREATE INDEX IF NOT EXISTS idx_payments_farmer_id
  ON payments (farmer_id);

CREATE INDEX IF NOT EXISTS idx_payments_for_month
  ON payments (for_month);

-- month_closings: lookups by farmer+month (covered by UNIQUE constraint but explicit
-- index helps planner) and by closed_by for audit queries
CREATE INDEX IF NOT EXISTS idx_month_closings_farmer_month
  ON month_closings (farmer_id, month);

CREATE INDEX IF NOT EXISTS idx_month_closings_closed_by
  ON month_closings (closed_by);

-- NOTE: original migration also included an UPDATE statement to backfill for_month
-- for the 4 existing payments at time of migration, using IST timezone conversion:
--   UPDATE payments SET for_month = to_char(date AT TIME ZONE 'Asia/Kolkata', 'FMMonth YYYY');
-- That UPDATE is intentionally NOT replicated here — it was a one-time data backfill,
-- and re-running it could overwrite manually-corrected for_month values.
