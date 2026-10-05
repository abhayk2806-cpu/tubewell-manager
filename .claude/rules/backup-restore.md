---
paths:
  - "src/**/*backup*"
  - "src/**/*Backup*"
  - "src/**/*restore*"
  - "src/**/*Restore*"
  - "src/lib/backup/**"
---

# Backup and restore rules

**Reads.**
- Supabase returns at most 1,000 rows per request by default. **Paginate every table read until exhausted.** A silently truncated backup is the worst failure mode.
- Include soft-deleted rows. A backup is the full truth, not the active view.

**Errors.** supabase-js returns `{ error }` and does not throw. Check `error` on **every** call, and abort with a clear message on the first failure. Never show "complete" unless every step succeeded.

**Format.**
- The JSON carries a version header (`format`, `version`, `exported_at`, row counts per table).
- The importer validates the version first, and treats fields added in later versions as optional.
- v1 backup files (versions 1.0–2.2) are not imported: there is no data migration.

**Replace mode** (wipes current data, then imports):
- requires a red warning **and** a typed or second confirmation (double confirm);
- deletes in an explicit child-before-parent order (payments, usage_entries, then farmers), even if foreign keys cascade;
- must report exactly what was deleted and inserted.

Merge mode upserts by `id` and never deletes.

Exported files contain all business data. Treat them as sensitive and never commit them.
