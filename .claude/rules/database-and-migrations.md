---
paths:
  - "supabase/**"
---

# Database and migration rules

**Project.**
- Only the NEW Supabase project may be changed: `tubewell-hisab`, ID `ciszgagzhfubuqhpmyeh` (org `digital-store`, ap-south-1).
- **Never** touch the OLD project `vsgptyuvnistwjjmrfby` (paused fallback).
- **Never** touch StreakForge `xiyayueijkgyxrqrykqx` (a different app in the same org).
- Before any MCP call, confirm the project ID.

**Migrations.**
- Number them from `001` in `supabase/migrations/NNN_name.sql`. The v1 files are in `archive/v1-2026-10/supabase-migrations/` and must not be reused.
- Commit every SQL change to the repo **immediately** after applying it (MCP `apply_migration`, dashboard or CLI). The live DB and the repo must never drift.
- State the plan and get owner confirmation before any schema change. For a bulk update or delete, show the affected row count first.

**Time.**
- Timestamps are `timestamptz`. Business dates and months are computed in Asia/Kolkata.
- In SQL, use `ts AT TIME ZONE 'Asia/Kolkata'` exactly once. Never double-convert (see `tasks/lessons.md`).
- Do not store month text.

**Rows.**
- Business tables (`farmers`, `usage_entries`, `payments`) carry audit columns: `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `deleted_by`.
- Soft delete only. No `DELETE` from app code.
- No stored totals, balances or allocations. See `docs/LEDGER_AND_ALLOCATION.md` (L1).

**Constraints.**
- Enforce validation in the DB too, with CHECK constraints: hours ≥ 0, minutes 0–59, total minutes > 0, rate > 0, payment amount > 0.
- Use NOT NULL where required.

**Security.**
- RLS is enabled on every table, with policies for the `authenticated` role only. There is no anon access to data.
- Sign-ups are disabled (owner action).
- Never put the service-role key in code or in `VITE_*` vars.

**Money type.** Integer paise vs `numeric(12,2)` is **PENDING OWNER DECISION**. See `docs/ARCHITECTURE.md`.
