---
paths:
  - "supabase/**"
---

# Database and migration rules

**Project.**
- Only the NEW Supabase project may be changed: `tubewell-hisab`, ID `ciszgagzhfubuqhpmyeh` (org `digital-store`, ap-south-1).
- Pass `project_id: ciszgagzhfubuqhpmyeh` explicitly on EVERY MCP call.
- **Never** touch the OLD project `vsgptyuvnistwjjmrfby` (paused fallback) or StreakForge `xiyayueijkgyxrqrykqx`.

**Migrations.**
- Live: `001_core_tables`, `002_audit_triggers`, `003_rls_policies`, `004_lock_rls_to_owner`, `005_farmers_input_checks`. Next is `006_…`. v1 files in `archive/` are never reused.
- Never put the owner's uid (or any real id) in a migration file. Read it from `auth.users` at apply time, as 004 does.
- After every migration, regenerate `src/types/database.ts` (`generate_typescript_types`; see `docs/ARCHITECTURE.md`).
- Write the SQL file first, apply that exact text (MCP `apply_migration`), then verify identity: `md5(array_to_string(statements, ''))` in `supabase_migrations.schema_migrations` must equal the file's md5. Commit immediately.
- Schema change: state the plan and confirm with the owner first. Bulk update or delete: show the affected row count first.

**Tests.** `supabase/tests/001_schema_checks.sql`:
- Section A is one transaction ending in ROLLBACK, printing PASS/FAIL per check (100 checks after 005). Section B checks for residue.
- T5 simulates the owner by reading the uid from `auth.users` at run time (never written into the file or the output). Another fixed uid checks that non-owners are blocked.
- Re-run both after any schema change. Use fictional data only; never commit real farmer data (the repo is public).

**Actual columns.**
- `farmers`: `name` (not blank), `mobile`, `notes`, `is_disabled`.
  - Migration 005: `name` must not be blank after trimming space, tab, LF, VT, FF, CR and NBSP (`farmers_name_not_blank`). Length limits: name ≤100, mobile ≤20, notes ≤500 characters (NULL mobile/notes allowed).
- `usage_entries`:
  - `farmer_id`, `used_at` (no default), `hours`, `minutes`;
  - `total_minutes` (generated, never written);
  - `rate_paise` (bigint, default 10000).
- `payments`: `farmer_id`, `paid_at` (no default), `amount_paise` (bigint), `note`.
- All three tables have `id uuid` plus `created_at/by`, `updated_at/by`, `deleted_at/by`.
- Money is integer paise in `bigint`. The usage amount is **not stored**; the engine computes it (D7, ledger L2).
- No month text, totals, balances or allocations (L1).

**Time.**
- `timestamptz` only. IST months and days are computed in the app's one IST function.
- In SQL, use `ts AT TIME ZONE 'Asia/Kolkata'` exactly once.

**Decisions.**
- **D9:** `created_by`, `updated_by` and `deleted_by` are plain uuids with no foreign key.
- **D10:** foreign keys to `farmers` are ON DELETE RESTRICT. There are no hard deletes by design.
- **D11:** RLS is on for all three tables.
  - SELECT, INSERT and UPDATE policies for `authenticated` only.
  - **D13 (004):** the 9 policies are named `*_owner` and use `(select auth.uid()) = '<owner uid>'`.
  - Public sign-ups must stay disabled. If the owner's Auth user is re-created, write a new migration to re-point the policies.
  - **No DELETE policy.** `anon` has no privileges, and `authenticated` has no DELETE or TRUNCATE.
  - Consequences:
    - soft delete is an UPDATE of `deleted_at`;
    - the Phase 8 Replace restore must not rely on client DELETE;
    - the Phase 10 test-data wipe is SQL by Claude Code, on explicit owner approval only.
- **D12:** the trigger `public.set_audit_columns()` maintains the audit columns.
  - It is SECURITY INVOKER with `search_path = ''`, and EXECUTE is revoked.
  - Client values for `created_*` are ignored on insert and immutable on update.
  - `updated_*` is always set to `now()` / `auth.uid()`.
  - `deleted_by` is trigger-only.
  - `deleted_at` is forced NULL on insert.

**Security.**
- Never use or print the service-role key. Never put it in code or in `VITE_*` vars.
- Auth settings and Auth users are owner actions in the dashboard.
- Run `get_advisors` (security and performance) after every DDL change.
