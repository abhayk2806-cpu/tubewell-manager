-- Migration 002 — Add month_closings table
-- Original applied to Supabase: 2026-04-21 (version 20260421050634)
-- This file is a BACKFILL — production already has these objects.
-- Use IF NOT EXISTS so the file is safe to re-apply against a fresh DB without breaking.

-- Month closings table — tracks when a farmer's month was marked as "settled"
CREATE TABLE IF NOT EXISTS month_closings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  closed_at TIMESTAMPTZ DEFAULT NOW(),
  closed_by UUID REFERENCES auth.users(id),
  closed_by_email TEXT,
  UNIQUE(farmer_id, month)
);

-- Enable RLS
ALTER TABLE month_closings ENABLE ROW LEVEL SECURITY;

-- Policy: any authenticated user can read/write (single-family tool, intentional)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'month_closings'
      AND policyname = 'Authenticated users can manage month_closings'
  ) THEN
    CREATE POLICY "Authenticated users can manage month_closings"
      ON month_closings FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
