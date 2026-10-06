// Backup I/O (Phase 8, D31): export reads every table with the existing paged list functions (every
// error checked, soft-deleted rows included); restore calls the migration-007 database function in
// ONE request (one transaction); verification re-reads with the same paging. The file itself is
// built and checked by the pure modules in src/lib/backup.
import { LedgerInputError } from '@/lib/ledger';
import { BACKUP_TABLES, backupSummary, buildBackupFile, diffBackup, pickBackupRows, sameSummary } from '@/lib/backup';
import type { BackupCounts, BackupDiff, BackupFile, BackupRows, BackupSummary } from '@/lib/backup';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';
import { nowIso } from './clock';
import { toDataError } from './errors';
import type { DataErrorKind } from './errors';
import { listFarmers } from './farmers';
import { listPayments } from './payments';
import { listUsage } from './usage';

export type RestoreMode = 'merge' | 'replace';

/** Why an export or a verification could not finish: a data error, or rows the engine rejects. */
export type BackupReadErrorKind = DataErrorKind | 'bad_data';

export type ExportResult = { readonly ok: true; readonly file: BackupFile } | { readonly ok: false; readonly kind: BackupReadErrorKind };

export type RestoreErrorKind = 'not_owner' | 'invalid_payload' | 'network' | 'constraint' | 'unknown';

export interface RestoreReport {
  readonly mode: RestoreMode;
  readonly deleted: BackupCounts;
  readonly inserted: BackupCounts;
  readonly updated: BackupCounts;
}

export type RestoreResult = { readonly ok: true; readonly report: RestoreReport } | { readonly ok: false; readonly kind: RestoreErrorKind };

export interface Verification {
  /** True only when the database now holds the file (see verifyRestore). */
  readonly verified: boolean;
  readonly counts: BackupCounts;
  readonly summary: BackupSummary;
  readonly diff: BackupDiff;
}

export type VerifyResult = { readonly ok: true; readonly verification: Verification } | { readonly ok: false; readonly kind: BackupReadErrorKind };

/** Every row of the three tables, read one table after the other with full paging. */
async function readAll(): Promise<BackupRows> {
  const farmers = await listFarmers();
  const usage = await listUsage();
  const payments = await listPayments();
  return pickBackupRows({ farmers, usage_entries: usage, payments });
}

function readFailure(error: unknown): BackupReadErrorKind {
  return error instanceof LedgerInputError ? 'bad_data' : toDataError(error).kind;
}

/** A complete backup file of the current data, or why there is none (never a partial file). */
export async function exportBackup(): Promise<ExportResult> {
  try {
    const rows = await readAll();
    return { ok: true, file: buildBackupFile(rows, nowIso()) };
  } catch (error) {
    return { ok: false, kind: readFailure(error) };
  }
}

function restoreErrorKind(error: unknown, status?: number): RestoreErrorKind {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  if (code === '42501') return 'not_owner';
  if (code === '22023' || code === '21000' || code === '22P02') return 'invalid_payload';
  const kind = toDataError(error, status).kind;
  if (kind === 'constraint') return 'constraint';
  if (kind === 'network') return 'network';
  if (kind === 'permission') return 'not_owner';
  return 'unknown';
}

function isCounts(value: unknown): value is BackupCounts {
  return (
    typeof value === 'object' &&
    value !== null &&
    BACKUP_TABLES.every((t) => Number.isSafeInteger((value as Record<string, unknown>)[t]) && ((value as Record<string, number>)[t] ?? -1) >= 0)
  );
}

function toReport(data: unknown, mode: RestoreMode): RestoreReport | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.mode !== mode || !isCounts(d.deleted) || !isCounts(d.inserted) || !isCounts(d.updated)) return null;
  return { mode, deleted: d.deleted, inserted: d.inserted, updated: d.updated };
}

/** Restores a VALIDATED file through public.restore_backup in one request (one transaction). */
export async function restoreBackup(file: BackupFile, mode: RestoreMode): Promise<RestoreResult> {
  try {
    const { data, error, status } = await supabase.rpc('restore_backup', { p_payload: file as unknown as Json, p_mode: mode });
    if (error) return { ok: false, kind: restoreErrorKind(error, status) };
    const report = toReport(data, mode);
    return report === null ? { ok: false, kind: 'unknown' } : { ok: true, report };
  } catch (error) {
    return { ok: false, kind: restoreErrorKind(error) };
  }
}

/**
 * Re-reads every table with paging and compares it with the file. Replace: verified when the
 * database holds exactly the file's rows (same counts, nothing new / changed / extra) and the engine
 * All Time totals equal the file's. Merge: verified when every row of the file is present and equal
 * (rows that exist only in the database stay, so counts and totals may differ).
 */
export async function verifyRestore(file: BackupFile, mode: RestoreMode): Promise<VerifyResult> {
  try {
    const rows = await readAll();
    const diff = diffBackup(file, rows);
    const counts = { farmers: rows.farmers.length, usage_entries: rows.usage_entries.length, payments: rows.payments.length };
    const summary = backupSummary(rows);
    const fileRowsPresent = BACKUP_TABLES.every((t) => diff[t].new === 0 && diff[t].changed === 0);
    const exact =
      fileRowsPresent &&
      BACKUP_TABLES.every((t) => diff[t].onlyCurrent === 0 && counts[t] === file.counts[t]) &&
      sameSummary(summary, file.summary);
    return { ok: true, verification: { verified: mode === 'replace' ? exact : fileRowsPresent, counts, summary, diff } };
  } catch (error) {
    return { ok: false, kind: readFailure(error) };
  }
}
