-- Migration 005 — WhatsApp notification support (Track A)
-- Applied: 2026-05-17
-- Purpose: enable wa.me click-to-send WhatsApp messages on usage entries and payments.
--
-- SAFETY: This migration is PURELY ADDITIVE.
--   - No DELETE statements
--   - No DROP statements
--   - No modification of any existing row
--   - 3 new nullable columns on farmers (existing rows get NULL / false defaults — no breakage)
--   - 2 new tables (whatsapp_message_templates, whatsapp_log)
--   - 2 seed rows in whatsapp_message_templates (default Hindi templates)
--   - 2 indexes on whatsapp_log
--   - RLS enabled on both new tables with same policy pattern as existing tables

-- ============================================================================
-- 1. Add WhatsApp fields to farmers
-- ============================================================================

ALTER TABLE farmers
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,                -- normalized to "91XXXXXXXXXX" (12 digits)
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_at TIMESTAMPTZ;

-- ============================================================================
-- 2. Templates table — editable Hindi message templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_message_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  template_type TEXT NOT NULL UNIQUE,                -- 'usage_entry' or 'payment_received'
  template_text TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  updated_by_email TEXT
);

ALTER TABLE whatsapp_message_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_message_templates'
      AND policyname = 'Authenticated users can manage whatsapp_message_templates'
  ) THEN
    CREATE POLICY "Authenticated users can manage whatsapp_message_templates"
      ON whatsapp_message_templates FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Seed default Hindi templates (only inserted if rows don't already exist)
INSERT INTO whatsapp_message_templates (template_type, template_text)
VALUES (
  'usage_entry',
  E'Namaste {farmer_name} ji 🙏\n\nAaj ka pani entry:\n⏱️ Aaj chala: {today_hours} ghante {today_minutes} minute\n⏱️ Iss mahine pehle: {previous_total_hours} ghante {previous_total_minutes} minute\n⏱️ Iss mahine kul: {new_total_hours} ghante {new_total_minutes} minute\n\nDate: {date}\n\n— Tubewell Manager'
)
ON CONFLICT (template_type) DO NOTHING;

INSERT INTO whatsapp_message_templates (template_type, template_text)
VALUES (
  'payment_received',
  E'Namaste {farmer_name} ji 🙏\n\nPayment receive ho gaya:\n💰 Pichla baki: ₹{previous_due}\n💰 Abhi diya: ₹{amount_paid}\n💰 Ab baki: ₹{new_due}\n\nKis mahine ke liye: {for_month}\nDate: {date}\n\n— Tubewell Manager'
)
ON CONFLICT (template_type) DO NOTHING;

-- ============================================================================
-- 3. Log table — audit record of every wa.me link the app generated
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL,            -- 'usage_entry' | 'payment_received' | 'manual_resend'
  related_entry_id UUID,                 -- usage_entries.id or payments.id (nullable)
  message_text TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  status TEXT DEFAULT 'initiated',       -- 'initiated' = wa.me link opened; delivery NOT confirmable
  sent_by UUID REFERENCES auth.users(id),
  sent_by_email TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_log'
      AND policyname = 'Authenticated users can manage whatsapp_log'
  ) THEN
    CREATE POLICY "Authenticated users can manage whatsapp_log"
      ON whatsapp_log FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_farmer_id
  ON whatsapp_log (farmer_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_sent_at
  ON whatsapp_log (sent_at DESC);
