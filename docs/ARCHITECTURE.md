# Architecture — Tubewell Manager (rebuild)

> **Status (2026-10-05):**
> - The **database schema is live** (Phase 2A, migrations 001–003; 004 from Phase 2B locks RLS to the owner).
> - The **app foundation exists** (Phase 2B): auth, routing, layout shell, Supabase client, generated types, tests.
> - The ledger, data and hooks layers are still planned (Phase 3 onwards).
> - The code and the live database beat this file. Update this file when they differ.
>
> Calculation rules are **not** restated here. They live only in [LEDGER_AND_ALLOCATION.md](LEDGER_AND_ALLOCATION.md).

## Stack

- React 19 + TypeScript + Vite + Tailwind 3 + shadcn/ui; UI in Hinglish.
- Supabase: Postgres + Auth + RLS.
  - NEW project `tubewell-hisab`, ID `ciszgagzhfubuqhpmyeh`, region ap-south-1, org `digital-store`, Postgres 17.
  - Schema applied on 2026-10-05; no data yet.
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

## Actual `src/` layout (Phase 2B, 2026-10-05)

| Path | What it is |
|---|---|
| `main.tsx` | Entry: `ErrorBoundary` → `BrowserRouter` → `AuthProvider` → `App` |
| `App.tsx` | Routes: `/login` (`PublicRoute`), and `ProtectedRoute` + `AppLayout` around `/`, `/farmers`, `/farmers/:id`, `/usage`, `/payments`, `/months`, `/backup`, plus `*` (NotFound). No Settings page. |
| `routes/routes.ts` | Feature routes (Hinglish title + build phase) and the 6 bottom-nav tabs |
| `routes/RouteGuards.tsx` | `ProtectedRoute` (loading → spinner, logged out → `/login`) and `PublicRoute` (logged in → `/`) |
| `auth/` | `auth-context.ts` (types + context), `AuthProvider.tsx`, `useAuth.ts` |
| `lib/config.ts` | Pure `parseConfig(env)`: validates `VITE_SUPABASE_URL` (https) and `VITE_SUPABASE_PUBLISHABLE_KEY` (D14) |
| `lib/supabase.ts` | `createClient<Database>` with `persistSession` and `autoRefreshToken` |
| `lib/utils.ts` | `cn()` class helper |
| `types/database.ts` | GENERATED Supabase types (see Type generation) |
| `components/layout/AppLayout.tsx` | Header (app name + Logout) and mobile-first bottom nav; centred `max-w-2xl` |
| `components/ErrorBoundary.tsx`, `components/FullScreenMessage.tsx` | Top-level error screen; loading/status screen |
| `components/ui/` | shadcn/ui: `button`, `card`, `input`, `label` only. Add more with the shadcn CLI. |
| `pages/` | `LoginPage`, `PlaceholderPage` ("Yeh screen Phase N mein banegi"), `NotFoundPage` |
| `test/setup.ts`, `**/*.test.ts(x)` | Vitest + React Testing Library (D16) |
| `index.css` + `tailwind.config.js` | Design tokens as CSS variables (no hex colours or inline styles in components) |

## Auth flow

1. On startup `AuthProvider` calls `supabase.auth.getSession()`, which restores the persisted session (localStorage). `loading` stays true until it resolves.
2. `onAuthStateChange` keeps the session current (sign-in, sign-out, token refresh). The callback only stores state; it makes no awaited Supabase calls.
3. `LoginPage` calls `signIn(email, password)`, which is `signInWithPassword`. The error is mapped to Hinglish text: "Email ya password galat hai." for invalid credentials, or the network text. On success, `PublicRoute` redirects to `/`.
4. **Logout** calls `supabase.auth.signOut()`; the session clears and `ProtectedRoute` redirects to `/login`.
5. There is no sign-up and no forgot-password flow. The single owner account is created in the Supabase dashboard.

## Type generation

- `src/types/database.ts` is generated: never edit it by hand.
- After every migration, regenerate it with the Supabase MCP `generate_typescript_types` (project_id `ciszgagzhfubuqhpmyeh`). Paste the output under the existing "GENERATED - do not edit" header.
- Then run `pnpm run typecheck`.
- CLI alternative: `npx supabase gen types typescript --project-id ciszgagzhfubuqhpmyeh > src/types/database.ts`, then re-add the header.

## Database schema (live, migrations 001–004, 2026-10-05)

Sources:
- SQL: `supabase/migrations/001_core_tables.sql`, `002_audit_triggers.sql`, `003_rls_policies.sql`, `004_lock_rls_to_owner.sql`.
- Checks: `supabase/tests/001_schema_checks.sql` (80 checks, all rolled back) plus a residue check.

All tables are in `public`. IDs are `uuid` with default `gen_random_uuid()`. Timestamps are `timestamptz`. Money is integer paise in `bigint`.

**Common audit and soft-delete columns** (on all three tables):

| Column | Type | Rules |
|---|---|---|
| `created_at` | timestamptz NOT NULL | Set to `now()` on insert by trigger; immutable |
| `created_by` | uuid NULL | `auth.uid()` on insert by trigger; immutable |
| `updated_at` | timestamptz NOT NULL | `now()` on every insert and update (trigger) |
| `updated_by` | uuid NULL | `auth.uid()` on every insert and update (trigger) |
| `deleted_at` | timestamptz NULL | Soft delete: NULL = live. Forced NULL on insert |
| `deleted_by` | uuid NULL | Trigger-only: `auth.uid()` when `deleted_at` goes NULL→set, cleared on restore, never client-editable |

The `*_by` columns are plain uuids **with no foreign key**, so the audit trail survives user deletion (D9). `auth.uid()` is NULL for SQL run without a JWT.

**`farmers`**

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `name` | text NOT NULL | `farmers_name_not_blank`: `length(btrim(name)) > 0` |
| `mobile`, `notes` | text NULL | — |
| `is_disabled` | boolean NOT NULL | default `false` (temporary pause, separate from soft delete) |

**`usage_entries`** (no stored money amount)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `farmer_id` | uuid NOT NULL | FK → `farmers(id)` ON DELETE RESTRICT |
| `used_at` | timestamptz NOT NULL | no default; the app always sends it |
| `hours` | integer NOT NULL | `hours >= 0` |
| `minutes` | integer NOT NULL | `minutes between 0 and 59` |
| `total_minutes` | integer | GENERATED ALWAYS AS `hours * 60 + minutes` STORED; `hours * 60 + minutes > 0` |
| `rate_paise` | bigint NOT NULL | default `10000`; `rate_paise > 0` |

**`payments`** (no month column)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `farmer_id` | uuid NOT NULL | FK → `farmers(id)` ON DELETE RESTRICT |
| `paid_at` | timestamptz NOT NULL | no default; the app always sends it |
| `amount_paise` | bigint NOT NULL | `amount_paise > 0` |
| `note` | text NULL | — |

**Indexes** (partial, for reads of live rows), in addition to the 3 primary keys:
- `usage_entries (farmer_id, used_at) WHERE deleted_at IS NULL`
- `usage_entries (used_at) WHERE deleted_at IS NULL`
- `payments (farmer_id, paid_at) WHERE deleted_at IS NULL`
- `payments (paid_at) WHERE deleted_at IS NULL`

**Triggers (D12):** one function, `public.set_audit_columns()`.
- `SECURITY INVOKER`, `search_path = ''`, with EXECUTE revoked from `public`, `anon` and `authenticated`.
- Attached BEFORE INSERT OR UPDATE to all three tables as `farmers_set_audit`, `usage_entries_set_audit` and `payments_set_audit`.

**RLS and privileges (D11):**
- RLS is enabled on all three tables.
- 9 policies named `*_owner`: SELECT, INSERT and UPDATE per table, for role `authenticated` only.
- **D13 (migration 004):** the condition is `(select auth.uid()) = '<owner uid>'`.
  - 004 reads the owner id from `auth.users` at apply time and refuses to run unless there is exactly 1 user.
  - The repo never contains the uid.
  - Any other signed-in uid sees 0 rows and cannot insert or update.
  - If the owner's Auth user is re-created, a new migration must re-point the policies.
  - (003's `*_authenticated` policies used `(select auth.uid()) is not null`.)
- **No DELETE policy.**
- Extra hardening beyond the policies: `anon` has no table privileges at all, and `authenticated` has no DELETE or TRUNCATE privilege.

**Consequences of D10/D11:**
- The app can never hard-delete; soft delete is an UPDATE of `deleted_at`.
- The Phase 8 "Replace" restore must be designed without client-side DELETE (for example soft-delete everything then insert, or a controlled database function).
- The Phase 10 test-data wipe is done with SQL by Claude Code, only on explicit owner approval.

**Money storage (D7):**
- The usage amount is computed only by the ledger engine (L2 integer formula), so the rounding exists in exactly one implementation.
- The Phase 9 script recomputes it independently.
- See [LEDGER_AND_ALLOCATION.md](LEDGER_AND_ALLOCATION.md).

**What is NOT stored:**
- No month text and no totals, balances, entry amounts or allocations.
- No `for_month`, `payment_group_id`, month closings or WhatsApp tables.

## Data-access rules

- **Active-farmer filter is applied in ONE place** (the data layer). A farmer is active when `deleted_at IS NULL` and not disabled. Pages never re-implement it.
- **Soft-delete filter:** normal reads exclude rows with `deleted_at`. The Recently Deleted view reads them explicitly.
- **Pagination:** Supabase/PostgREST returns at most 1,000 rows per request by default. Every list read (including backup) must page until exhausted, or be provably bounded.
- **Every Supabase call checks `error`.** supabase-js returns errors and does not throw them.

## Auth and security

- Single user (the owner): email + password. The Auth user exists (1 confirmed user, checked 2026-10-05).
- Public sign-ups must stay disabled in the Supabase dashboard (owner setting).
- RLS is enabled on every table, and policies match only the owner's uid (D13, see Database schema).
- The publishable key is public by design: it ships in the browser bundle. The service-role key never goes in `VITE_*` vars or in the repo.
- Env vars (D14): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. They live in a local `.env` (gitignored; template `.env.example`) and go into the Netlify env in Phase 10.

## Testing approach

- **Runner (D16):** Vitest + jsdom + React Testing Library + jest-dom.
  - `pnpm run test` runs `src/**/*.test.{ts,tsx}`.
  - Phase 2B tests cover config parsing, the route guards and login error handling (with a mocked Supabase client).
- **Phase 3:** unit-test the engine before any UI exists. Fixtures are the worked examples E1–E24 in [LEDGER_AND_ALLOCATION.md](LEDGER_AND_ALLOCATION.md).
- **Phase 9:**
  - an independent verification script that recomputes figures from raw rows and compares them with the app;
  - an edge-case matrix (timezone boundaries, rounding, soft-delete/restore, duplicates, disabled farmers, more than 1,000 rows).
- `pnpm run typecheck`, `lint`, `test` and `build` must all pass before any commit that touches code.

## Backup and restore (Phase 8)

Rules: [.claude/rules/backup-restore.md](../.claude/rules/backup-restore.md). The format is new and versioned; v1 backup files are not imported (no data migration).
