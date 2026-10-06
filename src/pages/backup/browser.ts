// Browser-only helpers for the Backup screen: save a text file through a Blob link, and remember the
// last backup time in this browser only (D31 i). Storage may be missing or blocked (private mode),
// so every access is wrapped and the screen works without it.

const LAST_BACKUP_KEY = 'tubewell-hisab:last-backup-at';

/** Starts a download of `text` as `fileName`. */
export function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The stored instant of the last successful JSON backup, or null. */
export function readLastBackup(): string | null {
  try {
    return window.localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

/** Remembers the instant of a successful JSON backup (ignored when storage is unavailable). */
export function storeLastBackup(iso: string): void {
  try {
    window.localStorage.setItem(LAST_BACKUP_KEY, iso);
  } catch {
    // The reminder simply stays as it was.
  }
}
