export interface Farmer {
  id: string;
  name: string;
  mobile: string;
  notes: string;
  is_deleted: boolean;
  is_disabled: boolean;
  created_at: string;
  // WhatsApp fields (added in migration 005)
  whatsapp_number: string | null;        // normalized to "91XXXXXXXXXX" (12 digits), nullable
  whatsapp_enabled: boolean;             // default false; toggle to enable WhatsApp messaging
  whatsapp_consent_at: string | null;    // ISO timestamp when farmer consented; nullable
}

export interface UsageEntry {
  id: string;
  farmer_id: string;
  date: string;
  hours: number;
  minutes: number;
  total_minutes: number;
  amount: number;
  rate_per_hour: number;
  month: string;
  created_by: string;
  created_by_email: string;
  created_at: string;
}

export interface Payment {
  id: string;
  farmer_id: string;
  amount: number;
  date: string;
  for_month: string;
  created_by: string;
  created_by_email: string;
  created_at: string;
}

export interface FarmerSummary extends Farmer {
  total_usage_amount: number;
  total_paid: number;
  total_due: number;
}

export interface MonthSummary {
  month: string;
  total_hours: number;
  total_minutes: number;
  total_amount: number;
  paid: number;
  remaining: number;
  entries: UsageEntry[];
}

export interface MonthClosing {
  id: string;
  farmer_id: string;
  month: string;
  closed_at: string;
  closed_by: string;
  closed_by_email: string;
}

// ============================================================================
// WhatsApp types (added in migration 005)
// ============================================================================

export type WhatsAppTemplateType = 'usage_entry' | 'payment_received';

export interface WhatsAppMessageTemplate {
  id: string;
  template_type: WhatsAppTemplateType;
  template_text: string;
  updated_at: string;
  updated_by: string | null;
  updated_by_email: string | null;
}

export type WhatsAppMessageType = 'usage_entry' | 'payment_received' | 'manual_resend';
export type WhatsAppLogStatus = 'initiated';
// Note: only 'initiated' is currently used. wa.me click-to-send cannot confirm delivery —
// the link merely opens WhatsApp pre-filled. Don't add 'delivered'/'read' statuses unless
// we migrate to a real WhatsApp Business API.

export interface WhatsAppLogEntry {
  id: string;
  farmer_id: string;
  message_type: WhatsAppMessageType;
  related_entry_id: string | null;       // usage_entries.id or payments.id, depending on message_type
  message_text: string;                  // exact text that was put into the wa.me link
  whatsapp_number: string;               // number it was sent to (snapshot — survives farmer number changes)
  status: WhatsAppLogStatus;
  sent_by: string | null;
  sent_by_email: string | null;
  sent_at: string;
}

// ============================================================================
// Backup
// ============================================================================

export interface BackupData {
  version: string;                       // "2.0" or "2.1" (current)
  exported_at: string;
  farmers: Farmer[];
  usage_entries: UsageEntry[];
  payments: Payment[];
  month_closings: MonthClosing[];
  // Added in backup v2.1 (Track A — WhatsApp). v2.0 imports default to empty arrays.
  whatsapp_message_templates?: WhatsAppMessageTemplate[];
  whatsapp_log?: WhatsAppLogEntry[];
}
