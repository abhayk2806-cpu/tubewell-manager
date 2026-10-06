// The backup file format (D31 a): pure, no I/O. A file holds EVERY row of the three tables
// (soft-deleted rows included) with every stored column except the generated total_minutes, plus
// row counts and the engine's All Time totals at export, so a damaged or edited file is detected.
import { buildDashboard } from '@/lib/ledger';

export const BACKUP_FORMAT = 'tubewell-hisab-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_TABLES = ['farmers', 'usage_entries', 'payments'] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Audit columns every table carries (kept exactly by the restore function, migration 007). */
export interface BackupAudit {
  readonly created_at: string;
  readonly created_by: string | null;
  readonly updated_at: string;
  readonly updated_by: string | null;
  readonly deleted_at: string | null;
  readonly deleted_by: string | null;
}

export interface BackupFarmer extends BackupAudit {
  readonly id: string;
  readonly name: string;
  readonly mobile: string | null;
  readonly notes: string | null;
  readonly is_disabled: boolean;
}

export interface BackupUsage extends BackupAudit {
  readonly id: string;
  readonly farmer_id: string;
  readonly used_at: string;
  readonly hours: number;
  readonly minutes: number;
  readonly rate_paise: number;
}

export interface BackupPayment extends BackupAudit {
  readonly id: string;
  readonly farmer_id: string;
  readonly paid_at: string;
  readonly amount_paise: number;
  readonly note: string | null;
}

export type BackupCounts = Readonly<Record<BackupTable, number>>;

/** The engine's All Time totals (L11): outstanding and credit are separate, never netted (L8). */
export interface BackupSummary {
  readonly charges_paise: number;
  readonly cash_paise: number;
  readonly outstanding_paise: number;
  readonly credit_paise: number;
}

export interface BackupFile {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: typeof BACKUP_VERSION;
  /** ISO-8601 instant with a zone. */
  readonly exported_at: string;
  readonly counts: BackupCounts;
  readonly summary: BackupSummary;
  readonly farmers: readonly BackupFarmer[];
  readonly usage_entries: readonly BackupUsage[];
  readonly payments: readonly BackupPayment[];
}

/** The stored columns of each table, in file order (total_minutes is generated and never stored). */
export const BACKUP_COLUMNS: Readonly<Record<BackupTable, readonly string[]>> = {
  farmers: ['id', 'name', 'mobile', 'notes', 'is_disabled', 'created_at', 'created_by', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by'],
  usage_entries: ['id', 'farmer_id', 'used_at', 'hours', 'minutes', 'rate_paise', 'created_at', 'created_by', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by'],
  payments: ['id', 'farmer_id', 'paid_at', 'amount_paise', 'note', 'created_at', 'created_by', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by'],
};

export interface BackupRows {
  readonly farmers: readonly BackupFarmer[];
  readonly usage_entries: readonly BackupUsage[];
  readonly payments: readonly BackupPayment[];
}

function audit(row: BackupAudit): BackupAudit {
  return {
    created_at: row.created_at,
    created_by: row.created_by,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    deleted_at: row.deleted_at,
    deleted_by: row.deleted_by,
  };
}

/** Only the stored columns, in file order (database rows may carry total_minutes or later columns). */
export function pickBackupRows(rows: BackupRows): BackupRows {
  return {
    farmers: rows.farmers.map((f) => ({ id: f.id, name: f.name, mobile: f.mobile, notes: f.notes, is_disabled: f.is_disabled, ...audit(f) })),
    usage_entries: rows.usage_entries.map((u) => ({
      id: u.id,
      farmer_id: u.farmer_id,
      used_at: u.used_at,
      hours: u.hours,
      minutes: u.minutes,
      rate_paise: u.rate_paise,
      ...audit(u),
    })),
    payments: rows.payments.map((p) => ({ id: p.id, farmer_id: p.farmer_id, paid_at: p.paid_at, amount_paise: p.amount_paise, note: p.note, ...audit(p) })),
  };
}

/**
 * The engine's All Time totals of these rows (buildDashboard, view all): active farmers only, live
 * rows only (L12). total_minutes is the generated value hours * 60 + minutes. Throws the engine's
 * LedgerInputError on bad data.
 */
export function backupSummary(rows: BackupRows): BackupSummary {
  const d = buildDashboard(
    {
      farmers: rows.farmers,
      usage: rows.usage_entries.map((u) => ({ ...u, total_minutes: u.hours * 60 + u.minutes })),
      payments: rows.payments,
    },
    { kind: 'all' },
  );
  return { charges_paise: d.chargesCreatedPaise, cash_paise: d.cashReceivedPaise, outstanding_paise: d.outstandingPaise, credit_paise: d.creditPaise };
}

/** A complete backup file of these rows. Throws LedgerInputError when the engine finds bad data. */
export function buildBackupFile(rows: BackupRows, exportedAt: string): BackupFile {
  const picked = pickBackupRows(rows);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: exportedAt,
    counts: { farmers: picked.farmers.length, usage_entries: picked.usage_entries.length, payments: picked.payments.length },
    summary: backupSummary(picked),
    farmers: picked.farmers,
    usage_entries: picked.usage_entries,
    payments: picked.payments,
  };
}

/** Same totals, field by field (never a netted comparison). */
export function sameSummary(a: BackupSummary, b: BackupSummary): boolean {
  return (
    a.charges_paise === b.charges_paise &&
    a.cash_paise === b.cash_paise &&
    a.outstanding_paise === b.outstanding_paise &&
    a.credit_paise === b.credit_paise
  );
}
