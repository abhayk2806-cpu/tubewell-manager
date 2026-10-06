// Backup modules (Phase 8, D31): pure, no I/O and no Supabase. The data layer does the reads and
// the restore call; pages use this barrel for validation, preview, CSV text, reminder and names.
export {
  BACKUP_COLUMNS,
  BACKUP_FORMAT,
  BACKUP_TABLES,
  BACKUP_VERSION,
  backupSummary,
  buildBackupFile,
  pickBackupRows,
  sameSummary,
} from './format';
export type {
  BackupAudit,
  BackupCounts,
  BackupFarmer,
  BackupFile,
  BackupPayment,
  BackupRows,
  BackupSummary,
  BackupTable,
  BackupUsage,
} from './format';
export { MAX_PROBLEMS, MAX_RESTORE_BYTES, parseBackupText, validateBackup } from './validate';
export type { BackupProblem, BackupProblemCode, BackupValidation } from './validate';
export { diffBackup } from './diff';
export type { BackupDiff, TableDiff } from './diff';
export { csvCell, farmersCsv, monthsCsv, paymentsCsv, toCsv, usageCsv } from './csv';
export type { CsvInput, CsvLabels, CsvResult } from './csv';
export { BACKUP_REMINDER_DAYS, backupFileName, backupReminder, csvFileName } from './reminder';
export type { BackupMoment, BackupReminder } from './reminder';
