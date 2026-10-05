# Architecture — Tubewell Manager (rebuild)

> **DRAFT until Phases 2 and 3 implement it** (written 2026-10-05). Once code exists, the code and the live database beat this file. Update this file when they differ.
> Calculation rules are **not** restated here. They live only in [LEDGER_AND_ALLOCATION.md](LEDGER_AND_ALLOCATION.md).

## Stack

- React 19 + TypeScript + Vite + Tailwind 3 + shadcn/ui; UI in Hinglish.
- Supabase: Postgres + Auth + RLS.
  - NEW project `tubewell-hisab`, ID `ciszgagzhfubuqhpmyeh`, region ap-south-1, org `digital-store`.
  - Empty as of 2026-10-05.
- Netlify static hosting (site `tubewellhisab.netlify.app`, currently disabled by the owner).
- pnpm package manager. Repo: `abhayk2806-cpu/tubewell-manager`; rebuild branch `rebuild/fresh-system`.

## Layers (dependency direction: pages → hooks → data → engine)

| Layer | Planned location | Responsibility | May NOT |
|---|---|---|---|
| Ledger engine | `src/lib/ledger/` | Pure functions: amount rounding, IST month, buckets, FIFO waterfall, trail, as-of, months list, duplicate checks, totals | Do I/O, read React state, or use floats for money |
| Time | `src/lib/ledger/time.ts` (or `src/lib/time/`) | The ONE IST month/day function used everywhere | Use browser-local time or UTC for business dates |
| Data access | `src/lib/data/` | All Supabase queries: active-farmer filter, soft-delete filter, pagination, error checks, mapping DB rows to engine types | Contain business math |
| Hooks | `src/hooks/` | Load data → call the engine → expose results to pages | Contain their own formulas |
| Pages/components | `src/pages/`, `src/components/` | Render engine output; forms; Hinglish copy | Calculate due, paid, credit or months |

Rules that follow from this:
- **No calculation inside a component or page.**
- Every figure on every screen comes from the same engine call, so totals always reconcile.

## Data model sketch (Phase 2 will finalise it as SQL migrations from 001)

Common audit columns on every business table:
- `created_at`, `created_by`, `updated_at`, `updated_by`
- `deleted_at`, `deleted_by` (soft delete; NULL = live)

The `*_by` columns reference `auth.users`. There is only one user, so no "entry by" UI.

| Table | Key columns | Notes |
|---|---|---|
| `farmers` | `id`, `name`, `mobile`, `notes`, `is_disabled`, audit columns | Delete is soft (`deleted_at`); disable is separate and restorable |
| `usage_entries` | `id`, `farmer_id`, `started_at timestamptz`, `hours`, `minutes`, `rate_per_hour`, audit columns | CHECKs: hours ≥ 0, minutes 0–59, total > 0, rate > 0 |
| `payments` | `id`, `farmer_id`, `paid_at timestamptz`, `amount`, `note`, audit columns | CHECK amount > 0. **No month column** |

What is NOT stored:
- No month text and no totals, balances or allocations.
- No `for_month`, `payment_group_id`, month closings or WhatsApp tables.

**PENDING OWNER DECISION (Phase 2):**
1. Money column type: integer paise (`bigint`) vs `numeric(12,2)` converted to paise at the data layer.
2. Whether the per-entry `amount` and `total_minutes` are stored (e.g. Postgres generated columns) or computed only in the engine.

Either choice must follow the rounding rule in [LEDGER_AND_ALLOCATION.md](LEDGER_AND_ALLOCATION.md) (L2).

## Data-access rules

- **Active-farmer filter is applied in ONE place** (the data layer). A farmer is active when `deleted_at IS NULL` and not disabled. Pages never re-implement it.
- **Soft-delete filter:** normal reads exclude rows with `deleted_at`. The Recently Deleted view reads them explicitly.
- **Pagination:** Supabase/PostgREST returns at most 1,000 rows per request by default. Every list read (including backup) must page until exhausted, or be provably bounded.
- **Every Supabase call checks `error`.** supabase-js returns errors and does not throw them.

## Auth and security

- Single user (the owner): email + password.
- Public sign-ups are disabled in the Supabase dashboard (owner action, Phase 2).
- RLS is enabled on every table. Policies allow only the `authenticated` role.
- The anon key is public by design. The service-role key never goes in `VITE_*` vars or in the repo.
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (local `.env`, gitignored; Netlify env in Phase 10).

## Testing approach

- **Phase 3:** unit-test the engine before any UI exists. Fixtures are the worked examples E1–E22 in [LEDGER_AND_ALLOCATION.md](LEDGER_AND_ALLOCATION.md). The test framework is chosen in Phase 3 (Vitest is the natural fit for Vite).
- **Phase 9:**
  - an independent verification script that recomputes figures from raw rows and compares them with the app;
  - an edge-case matrix (timezone boundaries, rounding, soft-delete/restore, duplicates, disabled farmers, more than 1,000 rows).
- `pnpm run build` (type-check + build) must pass before any commit that touches code.

## Backup and restore (Phase 8)

Rules: [.claude/rules/backup-restore.md](../.claude/rules/backup-restore.md). The format is new and versioned; v1 backup files are not imported (no data migration).
