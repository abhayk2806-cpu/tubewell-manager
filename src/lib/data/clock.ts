// The ONLY place in the app that reads the clock. It exists because the audit trigger
// (migration 002) does not set deleted_at: the client sends it on soft delete. Tests stub it.
export function nowIso(): string {
  return new Date().toISOString();
}
