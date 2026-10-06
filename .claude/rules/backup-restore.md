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

**Format (v1, Phase 8, D31).**
- `{ format: "tubewell-hisab-backup", version: 1, exported_at, counts, summary, farmers, usage_entries, payments }`. Built by `src/lib/backup/format.ts`.
- Every row of every table, soft-deleted rows included, with every stored column except the generated `total_minutes`.
- `summary` = the engine's All Time totals at export (charges, cash, outstanding, credit; never netted). The importer recomputes them from the rows; any difference means a damaged or edited file and stops the restore.
- The importer validates `format` and `version` FIRST, then the shape, ranges, ids, references and counts (first 10 problems, with table and row). Unknown row fields are dropped; unknown top-level keys are rejected.
- Old app files (versions 1.0–2.2: a string `version`, no `format`) are rejected with a plain message: there is no data migration.
- Limit: 10 MB (`MAX_RESTORE_BYTES`), because one request must carry the whole file.

**Restore runs ONLY through `public.restore_backup(p_payload, p_mode)`** (migration 007): one call = one transaction, owner-only (42501), keeps every column of the file (`deleted_at` and the audit columns). The app has no client DELETE; never add a DELETE policy or grant.

**Replace mode** (wipes current data, then imports):
- red warning (destructive style + words) showing how many current rows are not in the file;
- the app FIRST downloads a safety backup of the current data; if that fails, Replace is aborted and nothing changes;
- then the owner types `REPLACE` (case-sensitive) before the final button enables;
- the function deletes in an explicit child-before-parent order (payments, usage_entries, then farmers) and reports exactly what was deleted and inserted.

Merge mode upserts by `id` and never deletes (one confirmation).

**After a restore:** show the function's report, re-read every table with paging and verify (Replace: exact rows, counts and engine totals; Merge: every file row present and equal), then reload the lists.

**CSV exports** (Excel, NOT restorable): UTF-8 with a BOM, RFC 4180 quoting, CRLF, plain decimals via `paiseToDecimalString`, and every cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading apostrophe (formula injection).

**Reminder:** the last JSON backup time lives in this browser only (localStorage, wrapped in try/catch); 7 IST days = old.

Exported files contain all business data. Treat them as sensitive and never commit them.
