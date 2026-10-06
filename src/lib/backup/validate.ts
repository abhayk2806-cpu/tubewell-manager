// Backup file validation (D31 b): pure, no I/O. Runs BEFORE anything touches the database and
// reports at most MAX_PROBLEMS problems with the table and the row number (1-based). After the
// structure passes, the engine's All Time totals are recomputed from the file's rows and must
// equal the file's summary; any difference means the file is damaged or was edited.
import { LedgerInputError, parseInstantMs } from '@/lib/ledger';
import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  BACKUP_VERSION,
  backupSummary,
  pickBackupRows,
  sameSummary,
} from './format';
import type { BackupFile, BackupFarmer, BackupPayment, BackupSummary, BackupTable, BackupUsage } from './format';

/** One request carries the whole file so the restore function stays one atomic transaction. */
export const MAX_RESTORE_BYTES = 10 * 1024 * 1024;
export const MAX_PROBLEMS = 10;

export type BackupProblemCode =
  | 'too_large'
  | 'not_json'
  | 'not_object'
  | 'old_app_file'
  | 'wrong_format'
  | 'wrong_version'
  | 'bad_exported_at'
  | 'unknown_table'
  | 'missing_table'
  | 'bad_counts'
  | 'count_mismatch'
  | 'bad_row'
  | 'bad_id'
  | 'duplicate_id'
  | 'orphan_farmer'
  | 'bad_timestamp'
  | 'bad_number'
  | 'out_of_range'
  | 'bad_text'
  | 'bad_boolean'
  | 'total_minutes_mismatch'
  | 'bad_summary'
  | 'bad_data'
  | 'summary_mismatch';

export interface BackupProblem {
  readonly code: BackupProblemCode;
  readonly table?: BackupTable;
  /** 1-based row number inside the table. */
  readonly row?: number;
  readonly field?: string;
}

export type BackupValidation =
  | { readonly ok: true; readonly file: BackupFile }
  | { readonly ok: false; readonly problems: readonly BackupProblem[] };

const TOP_LEVEL_KEYS = new Set(['format', 'version', 'exported_at', 'counts', 'summary', ...BACKUP_TABLES]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUMMARY_KEYS = ['charges_paise', 'cash_paise', 'outstanding_paise', 'credit_paise'] as const;
// Whitespace the database's farmers_name_not_blank check trims (migration 005).
const BLANK = /^[ \t\n\v\f\r\u00a0]*$/;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function charLength(text: string): number {
  return [...text].length;
}

function isInstant(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    parseInstantMs(value);
    return true;
  } catch {
    return false;
  }
}

class Problems {
  readonly list: BackupProblem[] = [];
  add(problem: BackupProblem): void {
    if (this.list.length < MAX_PROBLEMS) this.list.push(problem);
  }
  get full(): boolean {
    return this.list.length >= MAX_PROBLEMS;
  }
}

/** Checks one row's columns; `add` records a problem for a field. */
function checkRow(table: BackupTable, row: Json, add: (code: BackupProblemCode, field: string) => void): void {
  const text = (field: string, max: number, nullable: boolean) => {
    const v = row[field];
    if (v === null && nullable) return;
    if (typeof v !== 'string') add('bad_text', field);
    else if (charLength(v) > max) add('out_of_range', field);
  };
  const integer = (field: string, min: number, max = Number.MAX_SAFE_INTEGER) => {
    const v = row[field];
    if (typeof v !== 'number' || !Number.isSafeInteger(v)) add('bad_number', field);
    else if (v < min || v > max) add('out_of_range', field);
  };
  const instant = (field: string, nullable: boolean) => {
    const v = row[field];
    if (v === null && nullable) return;
    if (!isInstant(v)) add('bad_timestamp', field);
  };
  const uuidOrNull = (field: string) => {
    const v = row[field];
    if (v !== null && (typeof v !== 'string' || !UUID.test(v))) add('bad_id', field);
  };

  if (table === 'farmers') {
    if (typeof row.name !== 'string') add('bad_text', 'name');
    else if (BLANK.test(row.name) || charLength(row.name) > 100) add('out_of_range', 'name');
    text('mobile', 20, true);
    text('notes', 500, true);
    if (typeof row.is_disabled !== 'boolean') add('bad_boolean', 'is_disabled');
  } else if (table === 'usage_entries') {
    instant('used_at', false);
    integer('hours', 0);
    integer('minutes', 0, 59);
    if (typeof row.hours === 'number' && typeof row.minutes === 'number' && row.hours === 0 && row.minutes === 0) add('out_of_range', 'minutes');
    integer('rate_paise', 1);
    if ('total_minutes' in row && row.total_minutes !== null) {
      if (typeof row.hours !== 'number' || typeof row.minutes !== 'number' || row.total_minutes !== row.hours * 60 + row.minutes) {
        add('total_minutes_mismatch', 'total_minutes');
      }
    }
  } else {
    instant('paid_at', false);
    integer('amount_paise', 1);
    text('note', 200, true);
  }
  instant('created_at', false);
  instant('updated_at', false);
  instant('deleted_at', true);
  uuidOrNull('created_by');
  uuidOrNull('updated_by');
  uuidOrNull('deleted_by');
}

function checkSummary(value: unknown): value is BackupSummary {
  return isObject(value) && SUMMARY_KEYS.every((k) => typeof value[k] === 'number' && Number.isSafeInteger(value[k]));
}

/** Validates a parsed backup object. On success the file holds only the known columns. */
export function validateBackup(value: unknown): BackupValidation {
  if (!isObject(value)) return { ok: false, problems: [{ code: 'not_object' }] };
  // Old app files (v1.0 - v2.2) have a string version and no format field: no data migration.
  if (value.format === undefined && typeof value.version === 'string') return { ok: false, problems: [{ code: 'old_app_file' }] };
  if (value.format !== BACKUP_FORMAT) return { ok: false, problems: [{ code: 'wrong_format' }] };
  if (value.version !== BACKUP_VERSION) return { ok: false, problems: [{ code: 'wrong_version' }] };

  const p = new Problems();
  if (!isInstant(value.exported_at)) p.add({ code: 'bad_exported_at', field: 'exported_at' });
  for (const key of Object.keys(value)) if (!TOP_LEVEL_KEYS.has(key)) p.add({ code: 'unknown_table', field: key });
  for (const table of BACKUP_TABLES) if (!Array.isArray(value[table])) p.add({ code: 'missing_table', table });
  if (!isObject(value.counts)) p.add({ code: 'bad_counts', field: 'counts' });
  if (!checkSummary(value.summary)) p.add({ code: 'bad_summary', field: 'summary' });
  if (p.list.length > 0) return { ok: false, problems: p.list };

  const counts = value.counts as Json;
  const farmerIds = new Set<string>();
  for (const table of BACKUP_TABLES) {
    const rows = value[table] as unknown[];
    if (counts[table] !== rows.length) p.add({ code: 'count_mismatch', table });
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      if (p.full) return;
      const at = { table, row: index + 1 };
      if (!isObject(row)) {
        p.add({ code: 'bad_row', ...at });
        return;
      }
      if (typeof row.id !== 'string' || !UUID.test(row.id)) p.add({ code: 'bad_id', ...at, field: 'id' });
      else if (seen.has(row.id.toLowerCase())) p.add({ code: 'duplicate_id', ...at, field: 'id' });
      else seen.add(row.id.toLowerCase());
      if (table === 'farmers' && typeof row.id === 'string') farmerIds.add(row.id.toLowerCase());
      if (table !== 'farmers' && (typeof row.farmer_id !== 'string' || !farmerIds.has(row.farmer_id.toLowerCase()))) {
        p.add({ code: 'orphan_farmer', ...at, field: 'farmer_id' });
      }
      checkRow(table, row, (code, field) => p.add({ code, ...at, field }));
    });
  }
  if (p.list.length > 0) return { ok: false, problems: p.list };

  const rows = pickBackupRows({
    farmers: value.farmers as BackupFarmer[],
    usage_entries: value.usage_entries as BackupUsage[],
    payments: value.payments as BackupPayment[],
  });
  const summary = value.summary as BackupSummary;
  let computed: BackupSummary;
  try {
    computed = backupSummary(rows);
  } catch (error) {
    if (error instanceof LedgerInputError) return { ok: false, problems: [{ code: 'bad_data' }] };
    throw error;
  }
  if (!sameSummary(computed, summary)) return { ok: false, problems: [{ code: 'summary_mismatch' }] };

  return {
    ok: true,
    file: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: value.exported_at as string,
      counts: { farmers: rows.farmers.length, usage_entries: rows.usage_entries.length, payments: rows.payments.length },
      summary: { ...computed },
      ...rows,
    },
  };
}

/** Size check, JSON parse, then validateBackup. `byteLength` is the file's size in bytes. */
export function parseBackupText(text: string, byteLength: number): BackupValidation {
  if (byteLength > MAX_RESTORE_BYTES) return { ok: false, problems: [{ code: 'too_large' }] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, problems: [{ code: 'not_json' }] };
  }
  return validateBackup(value);
}
