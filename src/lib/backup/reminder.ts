// Backup reminder and file names (D31 c, i): pure. Days are counted between IST calendar dates with
// the engine's IST helpers, so a backup at 23:50 IST is "1 din pehle" ten minutes later.
import { intDiv, parseInstantMs, istDateKey } from '@/lib/ledger';

/** A backup older than this many IST days is "old". */
export const BACKUP_REMINDER_DAYS = 7;

/** The current IST moment as the data layer gives it (currentIstMoment). */
export interface BackupMoment {
  readonly dateKey: string;
  readonly timeKey: string;
}

export type BackupReminder =
  | { readonly kind: 'never'; readonly days: null }
  | { readonly kind: 'ok' | 'old'; readonly days: number };

const DAY_MS = 86_400_000;

function dayStartMs(dateKey: string): number {
  return parseInstantMs(`${dateKey}T00:00:00+05:30`);
}

/**
 * The reminder for the stored last-backup instant (or null). An unreadable value counts as never;
 * a value in the future counts as today (0 days).
 */
export function backupReminder(lastBackupIso: string | null, now: BackupMoment): BackupReminder {
  if (lastBackupIso === null) return { kind: 'never', days: null };
  let lastDay: string;
  try {
    lastDay = istDateKey(parseInstantMs(lastBackupIso));
  } catch {
    return { kind: 'never', days: null };
  }
  const diff = dayStartMs(now.dateKey) - dayStartMs(lastDay);
  const days = diff <= 0 ? 0 : intDiv(diff, DAY_MS);
  return { kind: days >= BACKUP_REMINDER_DAYS ? 'old' : 'ok', days };
}

function stamp(now: BackupMoment): string {
  return `${now.dateKey}-${now.timeKey.replace(':', '')}`;
}

/** "tubewell-backup-YYYY-MM-DD-HHMM.json" from the IST date and time. */
export function backupFileName(now: BackupMoment): string {
  return `tubewell-backup-${stamp(now)}.json`;
}

/** "tubewell-<kind>-YYYY-MM-DD-HHMM.csv" for a CSV export. */
export function csvFileName(kind: string, now: BackupMoment): string {
  return `tubewell-${kind}-${stamp(now)}.csv`;
}
