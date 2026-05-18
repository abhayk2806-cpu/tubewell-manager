// WhatsApp helper library — Track A (wa.me click-to-send)
//
// This file holds ALL WhatsApp-related pure logic plus the few DB ops for templates
// and the audit log. Page components import from here so the message format stays
// consistent across UsagePage, PaymentsPage, and any future re-send buttons.
//
// IMPORTANT RULES (also documented in CLAUDE.md):
// - Numbers are stored normalized as "91XXXXXXXXXX" (12 digits, no '+', no spaces).
// - Templates are stored in DB (whatsapp_message_templates). Defaults below are the
//   FALLBACK only — used when the DB row is missing or when "Reset to default" is hit.
//   They MUST match the seed text in supabase/migrations/005_whatsapp_support.sql.
// - All totals/dues used in messages must be calculated AT SEND-TIME from Supabase,
//   never from React state — protects against concurrent entries by other users.
// - Log status is always 'initiated'. wa.me click-to-send cannot confirm delivery.
//   Do NOT add 'delivered'/'read' values unless we migrate to WhatsApp Business API.

import { supabase } from '@/lib/supabase';
import type {
  WhatsAppLogEntry,
  WhatsAppLogStatus,
  WhatsAppMessageTemplate,
  WhatsAppMessageType,
  WhatsAppTemplateType,
} from '@/types';

// ============================================================================
// Default templates (fallback / reset target)
// Keep these IDENTICAL to the seed text in 005_whatsapp_support.sql.
// ============================================================================

export const DEFAULT_USAGE_TEMPLATE =
  'Namaste {farmer_name} ji 🙏\n\n' +
  'Aaj ka pani entry:\n' +
  '⏱️ Aaj chala: {today_hours} ghante {today_minutes} minute\n' +
  '⏱️ Iss mahine pehle: {previous_total_hours} ghante {previous_total_minutes} minute\n' +
  '⏱️ Iss mahine kul: {new_total_hours} ghante {new_total_minutes} minute\n\n' +
  'Date: {date}\n\n' +
  '— Tubewell Manager';

export const DEFAULT_PAYMENT_TEMPLATE =
  'Namaste {farmer_name} ji 🙏\n\n' +
  'Payment receive ho gaya:\n' +
  '💰 Pichla baki: ₹{previous_due}\n' +
  '💰 Abhi diya: ₹{amount_paid}\n' +
  '💰 Ab baki: ₹{new_due}\n\n' +
  'Kis mahine ke liye: {for_month}\n' +
  'Date: {date}\n\n' +
  '— Tubewell Manager';

export const DEFAULT_TEMPLATES: Record<WhatsAppTemplateType, string> = {
  usage_entry: DEFAULT_USAGE_TEMPLATE,
  payment_received: DEFAULT_PAYMENT_TEMPLATE,
};

// Allowed placeholders per template type — used by the SettingsPage reference card
// and by the preview renderer. Keep in sync with DEFAULT_* templates above.
export const TEMPLATE_PLACEHOLDERS: Record<WhatsAppTemplateType, readonly string[]> = {
  usage_entry: [
    'farmer_name',
    'today_hours',
    'today_minutes',
    'previous_total_hours',
    'previous_total_minutes',
    'new_total_hours',
    'new_total_minutes',
    'date',
  ],
  payment_received: [
    'farmer_name',
    'previous_due',
    'amount_paid',
    'new_due',
    'for_month',
    'date',
  ],
};

// ============================================================================
// Phone number normalization & display
// ============================================================================

/**
 * Normalize a user-entered WhatsApp number to the canonical "91XXXXXXXXXX" form
 * (12 digits, India only). Returns null if the input doesn't look like a valid
 * 10-digit Indian mobile.
 *
 * Accepts: "9876543210", "+91 9876543210", "91-9876543210", "09876543210",
 *          "+919876543210", " 98765 43210 ", etc.
 * Rejects: anything that doesn't reduce to exactly 10 digits after stripping
 *          known prefixes; numbers not starting with 6/7/8/9 (Indian mobile range).
 */
export function normalizeWhatsAppNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  // Strip everything that isn't a digit
  let digits = input.replace(/\D/g, '');
  if (!digits) return null;

  // Strip leading country code 91 if present (handles both "919876..." and "9876...")
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    // Strip leading 0 (some users write "09876...")
    digits = digits.slice(1);
  }

  // After normalization we expect exactly 10 digits, starting with 6/7/8/9
  if (digits.length !== 10) return null;
  if (!/^[6789]/.test(digits)) return null;

  return '91' + digits;
}

/**
 * Format a normalized number for human display: "919876543210" → "+91 98765 43210".
 * Returns the input as-is if it doesn't look normalized.
 */
export function formatWhatsAppDisplay(normalized: string | null | undefined): string {
  if (!normalized) return '';
  if (!/^91\d{10}$/.test(normalized)) return normalized;
  const local = normalized.slice(2);
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}

// ============================================================================
// Date & hours formatting
// ============================================================================

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "2026-05-17T..." → "17 May 2026" (no timezone parsing needed for display) */
export function formatDateForMessage(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return String(iso);
  const day = d.getDate();
  const month = MONTH_NAMES_SHORT[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/** Split total minutes into { hours, minutes } */
export function splitHoursMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.round(totalMinutes));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

/** Format a rupee amount for display: 1234.5 → "1,234.50" (Indian grouping) */
export function formatRupees(amount: number): string {
  const n = Number(amount) || 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// Template rendering
// ============================================================================

/**
 * Replace every {key} in the template with the corresponding value.
 * Missing keys are left literal (e.g. "{foo}") so the sender can see typos.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return String(vars[key]);
    }
    return match; // leave literal so typos are visible
  });
}

export interface UsageMessageVars {
  farmer_name: string;
  today_hours: number;
  today_minutes: number;
  previous_total_hours: number;
  previous_total_minutes: number;
  new_total_hours: number;
  new_total_minutes: number;
  date: string;
}

export interface PaymentMessageVars {
  farmer_name: string;
  previous_due: string;       // pre-formatted (e.g. "1,500.00")
  amount_paid: string;
  new_due: string;
  for_month: string;
  date: string;
}

export function buildUsageMessage(template: string, vars: UsageMessageVars): string {
  return renderTemplate(template, vars as unknown as Record<string, string | number>);
}

export function buildPaymentMessage(template: string, vars: PaymentMessageVars): string {
  return renderTemplate(template, vars as unknown as Record<string, string | number>);
}

// ============================================================================
// Sample data for the "Preview" button on SettingsPage
// ============================================================================

export function sampleUsageVars(): UsageMessageVars {
  return {
    farmer_name: 'Ram Kumar',
    today_hours: 2,
    today_minutes: 30,
    previous_total_hours: 5,
    previous_total_minutes: 45,
    new_total_hours: 8,
    new_total_minutes: 15,
    date: formatDateForMessage(new Date()),
  };
}

export function samplePaymentVars(): PaymentMessageVars {
  const now = new Date();
  const monthName = now.toLocaleString('en-US', { month: 'long' });
  return {
    farmer_name: 'Ram Kumar',
    previous_due: formatRupees(1500),
    amount_paid: formatRupees(500),
    new_due: formatRupees(1000),
    for_month: `${monthName} ${now.getFullYear()}`,
    date: formatDateForMessage(now),
  };
}

// ============================================================================
// wa.me link builder
// ============================================================================

/**
 * Build the wa.me URL with URL-encoded message.
 * Number must be in normalized "91XXXXXXXXXX" form.
 */
export function buildWaMeUrl(normalizedNumber: string, message: string): string {
  return `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(message)}`;
}

// ============================================================================
// Template fetch / save / reset (DB ops)
// ============================================================================

export async function fetchTemplate(
  type: WhatsAppTemplateType,
): Promise<WhatsAppMessageTemplate | null> {
  const { data, error } = await supabase
    .from('whatsapp_message_templates')
    .select('*')
    .eq('template_type', type)
    .maybeSingle();
  if (error) {
    console.error('fetchTemplate error:', error);
    return null;
  }
  return data as WhatsAppMessageTemplate | null;
}

export async function fetchAllTemplates(): Promise<WhatsAppMessageTemplate[]> {
  const { data, error } = await supabase
    .from('whatsapp_message_templates')
    .select('*')
    .order('template_type');
  if (error) {
    console.error('fetchAllTemplates error:', error);
    return [];
  }
  return (data || []) as WhatsAppMessageTemplate[];
}

export interface SaveTemplateArgs {
  type: WhatsAppTemplateType;
  text: string;
  userId: string | null;
  userEmail: string | null;
}

export async function saveTemplate({
  type, text, userId, userEmail,
}: SaveTemplateArgs): Promise<{ error: Error | null }> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { error: new Error('Template text khali nahi ho sakta') };
  }
  // Use upsert on template_type — row should always exist (seeded by migration),
  // but upsert protects against the case where it was deleted manually.
  const { error } = await supabase
    .from('whatsapp_message_templates')
    .upsert(
      {
        template_type: type,
        template_text: trimmed,
        updated_at: new Date().toISOString(),
        updated_by: userId,
        updated_by_email: userEmail,
      },
      { onConflict: 'template_type' },
    );
  return { error: error as Error | null };
}

export async function resetTemplateToDefault(
  type: WhatsAppTemplateType,
  userId: string | null,
  userEmail: string | null,
): Promise<{ error: Error | null }> {
  return saveTemplate({
    type,
    text: DEFAULT_TEMPLATES[type],
    userId,
    userEmail,
  });
}

// ============================================================================
// Audit log insert
// ============================================================================

export interface LogWhatsAppSendArgs {
  farmerId: string;
  messageType: WhatsAppMessageType;
  relatedEntryId: string | null;
  messageText: string;
  whatsappNumber: string;     // already normalized
  userId: string | null;
  userEmail: string | null;
  status?: WhatsAppLogStatus; // defaults to 'initiated'
}

export async function logWhatsAppSend(
  args: LogWhatsAppSendArgs,
): Promise<{ error: Error | null; row: WhatsAppLogEntry | null }> {
  const { data, error } = await supabase
    .from('whatsapp_log')
    .insert({
      farmer_id: args.farmerId,
      message_type: args.messageType,
      related_entry_id: args.relatedEntryId,
      message_text: args.messageText,
      whatsapp_number: args.whatsappNumber,
      status: args.status ?? 'initiated',
      sent_by: args.userId,
      sent_by_email: args.userEmail,
    })
    .select()
    .maybeSingle();
  return {
    error: error as Error | null,
    row: (data as WhatsAppLogEntry | null) ?? null,
  };
}
