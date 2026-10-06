// Restore preview (D31 f): pure. Compares a validated file with the CURRENT rows, per table:
// new (only in the file), changed (a business column or deleted_at differs), same, and only in the
// current data (kept by Merge, LOST by Replace). Timestamps compare as instants, so "+00:00" and
// "+05:30" spellings of the same moment are the same.
import { parseInstantMs } from '@/lib/ledger';
import { BACKUP_TABLES } from './format';
import type { BackupRows, BackupTable } from './format';

export interface TableDiff {
  readonly fileRows: number;
  readonly currentRows: number;
  readonly new: number;
  readonly changed: number;
  readonly same: number;
  readonly onlyCurrent: number;
}

export type BackupDiff = Readonly<Record<BackupTable, TableDiff>>;

/** Business columns per table (audit columns other than deleted_at are not shown as a change). */
const COMPARED: Readonly<Record<BackupTable, readonly string[]>> = {
  farmers: ['name', 'mobile', 'notes', 'is_disabled', 'deleted_at'],
  usage_entries: ['farmer_id', 'used_at', 'hours', 'minutes', 'rate_paise', 'deleted_at'],
  payments: ['farmer_id', 'paid_at', 'amount_paise', 'note', 'deleted_at'],
};
const TIMESTAMPS = new Set(['deleted_at', 'used_at', 'paid_at']);

type AnyRow = { readonly id: string };

function fieldOf(row: AnyRow, field: string): unknown {
  return (row as unknown as Readonly<Record<string, unknown>>)[field];
}

function sameValue(field: string, a: unknown, b: unknown): boolean {
  if (TIMESTAMPS.has(field) && typeof a === 'string' && typeof b === 'string') {
    try {
      return parseInstantMs(a) === parseInstantMs(b);
    } catch {
      return a === b;
    }
  }
  return (a ?? null) === (b ?? null);
}

function diffTable(table: BackupTable, fileRows: readonly AnyRow[], currentRows: readonly AnyRow[]): TableDiff {
  const current = new Map(currentRows.map((r) => [r.id.toLowerCase(), r]));
  let added = 0;
  let changed = 0;
  let same = 0;
  for (const row of fileRows) {
    const existing = current.get(row.id.toLowerCase());
    if (existing === undefined) added += 1;
    else if (COMPARED[table].every((field) => sameValue(field, fieldOf(row, field), fieldOf(existing, field)))) same += 1;
    else changed += 1;
  }
  const fileIds = new Set(fileRows.map((r) => r.id.toLowerCase()));
  return {
    fileRows: fileRows.length,
    currentRows: currentRows.length,
    new: added,
    changed,
    same,
    onlyCurrent: currentRows.filter((r) => !fileIds.has(r.id.toLowerCase())).length,
  };
}

/** Per-table differences between the file and the current rows (any farmer, deleted rows included). */
export function diffBackup(file: BackupRows, current: BackupRows): BackupDiff {
  const result = {} as Record<BackupTable, TableDiff>;
  for (const table of BACKUP_TABLES) {
    result[table] = diffTable(table, file[table], current[table]);
  }
  return result;
}
