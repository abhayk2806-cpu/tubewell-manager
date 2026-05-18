-- Migration 004 — Add is_disabled column to farmers + partial active-farmer index
-- Original applied to Supabase: 2026-04-23 (version 20260423040837)
-- This file is a BACKFILL — production already has these objects.

-- is_disabled — temporary off-switch for a farmer (vs. is_deleted which is "removed")
-- Active farmer = is_deleted=false AND is_disabled=false (both conditions required everywhere)
ALTER TABLE farmers
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT FALSE;

-- Partial index on active farmers — the most common query in the app
-- ("get list of active farmers" runs on every page load).
CREATE INDEX IF NOT EXISTS idx_farmers_active
  ON farmers (is_deleted, is_disabled)
  WHERE is_deleted = false AND is_disabled = false;
