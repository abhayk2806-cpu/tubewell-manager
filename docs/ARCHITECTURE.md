# Architecture — Tubewell Manager (rebuild)

> **Status (2026-10-06):**
> - The **database schema is live** (Phase 2A, migrations 001–003; 004 from Phase 2B locks RLS to the owner; 005 from Phase 4A adds farmer input checks).
> - The **app foundation exists** (Phase 2B): auth, routing, layout shell, Supabase client, generated types, tests.
> - The **ledger engine exists** (Phase 3): `src/lib/ledger/`, see [Ledger engine](#ledger-engine-phase-3).
> - The **data layer and the Farmers screen exist** (Phase 4A): see [Data layer](#data-layer-phase-4a) and [Farmers screen](#farmers-screen-kisan-phase-4a). Usage, payments and all money screens are still planned.
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
| Time | `src/lib/ledger/time.ts` | The ONE IST month/day function used everywhere | Use browser-local time or UTC for business dates |
| Data access | `src/lib/data/` (exists since Phase 4A) | All Supabase queries: active-farmer filter, soft-delete filter, pagination, error checks, mapping DB rows to engine types | Contain business math |
| Hooks | `src/hooks/` | Load data → call the engine → expose results to pages | Contain their own formulas |
| Pages/components | `src/pages/`, `src/components/` | Render engine output; forms; Hinglish copy | Calculate due, paid, credit or months |

Rules that follow from this:
- **No calculation inside a component or page.**
- Every figure on every screen comes from the same engine call, so totals always reconcile.

## Actual `src/` layout (updated Phase 4A, 2026-10-06)

| Path | What it is |
|---|---|
| `main.tsx` | Entry: `ErrorBoundary` → `BrowserRouter` → `AuthProvider` → `App` |
| `App.tsx` | Routes: `/login` (`PublicRoute`), and `ProtectedRoute` + `AppLayout` around `/`, `/farmers`, `/farmers/:id`, `/usage`, `/payments`, `/months`, `/backup`, plus `*` (NotFound). No Settings page. |
| `routes/routes.ts` | Feature routes (Hinglish title, build phase, optional built `page`) and the 6 bottom-nav tabs. `App.tsx` renders `page` when set, else the placeholder. |
| `routes/RouteGuards.tsx` | `ProtectedRoute` (loading → spinner, logged out → `/login`) and `PublicRoute` (logged in → `/`) |
| `auth/` | `auth-context.ts` (types + context), `AuthProvider.tsx`, `useAuth.ts` |
| `lib/config.ts` | Pure `parseConfig(env)`: validates `VITE_SUPABASE_URL` (https) and `VITE_SUPABASE_PUBLISHABLE_KEY` (D14) |
| `lib/supabase.ts` | `createClient<Database>` with `persistSession` and `autoRefreshToken` |
| `lib/utils.ts` | `cn()` class helper |
| `lib/ledger/` | Ledger engine (Phase 3), see [Ledger engine](#ledger-engine-phase-3) |
| `lib/data/` | Data layer (Phase 4A), see [Data layer](#data-layer-phase-4a) |
| `hooks/useFarmers.ts` | Loads farmers, exposes the three lists and the mutations (Phase 4A) |
| `types/database.ts` | GENERATED Supabase types (see Type generation) |
| `components/layout/AppLayout.tsx` | Header (app name + Logout) and mobile-first bottom nav; centred `max-w-2xl` |
| `components/ErrorBoundary.tsx`, `components/FullScreenMessage.tsx` | Top-level error screen; loading/status screen |
| `components/ui/` | shadcn/ui: `button`, `card`, `input`, `label`, plus `dialog` and `alert-dialog` (Phase 4A, written by hand in the shadcn Tailwind-3 style, because the current shadcn CLI targets Tailwind 4). Never hand-edit them otherwise. |
| `pages/` | `LoginPage`, `PlaceholderPage` ("Yeh screen Phase N mein banegi"), `NotFoundPage`, `farmers/` (Kisan screen) |
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

## Database schema (live, migrations 001–005, updated 2026-10-06)

Sources:
- SQL: `supabase/migrations/001_core_tables.sql`, `002_audit_triggers.sql`, `003_rls_policies.sql`, `004_lock_rls_to_owner.sql`, `005_farmers_input_checks.sql`.
- Checks: `supabase/tests/001_schema_checks.sql` (100 checks since 005, all rolled back) plus a residue check.

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
| `name` | text NOT NULL | `farmers_name_not_blank` (same name, redefined in 005): not empty after trimming space, tab, LF, VT, FF, CR and NBSP (U+00A0). `farmers_name_max_length`: at most 100 characters (005) |
| `mobile` | text NULL | `farmers_mobile_max_length`: NULL or at most 20 characters (005) |
| `notes` | text NULL | `farmers_notes_max_length`: NULL or at most 500 characters (005) |
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
  - Phase 4A tests cover the farmer rules, `DataError` mapping, paging, every farmer data function (mocked Supabase client, never the live DB), the `useFarmers` hook and the Farmers screen. `src/lib/data/layer-guard.test.ts` statically checks the UI layers (see Data layer).
- **Phase 3 (done 2026-10-06):** the engine is unit-tested before any UI exists. See [Ledger engine → Tests](#tests).
- **Phase 9:**
  - an independent verification script that recomputes figures from raw rows and compares them with the app;
  - an edge-case matrix (timezone boundaries, rounding, soft-delete/restore, duplicates, disabled farmers, more than 1,000 rows).
- `pnpm run typecheck`, `lint`, `test` and `build` must all pass before any commit that touches code.

## Ledger engine (Phase 3)

Pure TypeScript in `src/lib/ledger/`: no I/O, no React, no Supabase imports, integer paise only.
The rules it implements live in [LEDGER_AND_ALLOCATION.md](LEDGER_AND_ALLOCATION.md) and are not restated here; this section covers structure, API and conventions.

### Module map

| File | Owns |
|---|---|
| `index.ts` | The ONE barrel. Everything outside the folder imports `@/lib/ledger` only. |
| `types.ts` | Input views of the DB rows (`LedgerFarmer`, `LedgerUsage`, `LedgerPayment`) and all output types |
| `errors.ts` | `LedgerInputError` (bad data reached the engine) |
| `time.ts` | The ONLY place for instants, IST keys and IST period bounds |
| `money.ts` | Integer helpers and the two display helpers |
| `entry.ts` | The ONLY implementation of the entry amount (D7) |
| `records.ts` | Internal: validates raw rows into records (not exported from the barrel) |
| `ledger.ts` | One farmer's buckets, waterfall, credit, trail and running ledger |
| `preview.ts` | Payment-form preview (L16), the same ledger on modified inputs |
| `farmers.ts` | The ONE definition of an active farmer; per-farmer grouping |
| `dashboard.ts` | Dashboard views (D1) and the all-farmers months list |
| `duplicates.ts` | Duplicate warnings (L14) |
| `validation.ts` | Form validation codes (L18, D6) |
| `test-support/` | Test-only fixtures, seeded random scenarios, BigInt oracle |

### Public API

```ts
// time.ts
parseInstantMs(iso: string): number
istMonthKey(ms): 'YYYY-MM'      istDateKey(ms): 'YYYY-MM-DD'      istYearKey(ms): 'YYYY'
endOfIstDayMs(dateKey): number   istMonthRangeMs(monthKey) / istYearRangeMs(yearKey): { startMs, endMs } // inclusive
compareMonthKeys(a, b): number   isMonthKey / isDateKey / isYearKey(key): boolean
// money.ts
assertPaise(v, what)  intDiv(a, d)  sumPaise(values)
parseRupeesToPaise(text): number      paiseToDecimalString(paise): string
// entry.ts
entryAmountPaise(totalMinutes, ratePaise): number
// ledger.ts / preview.ts
buildFarmerLedger({ usage, payments }, { cutoffMs? }): { months, totals, trail, rows }
previewPayment({ usage, payments }, candidate, { replacesPaymentId?, cutoffMs? })
  : { before, after, pieces, unappliedPaise, creditCreatedPaise }
// farmers.ts / dashboard.ts
isActiveFarmer(farmer): boolean       filterActiveFarmers(farmers)
buildDashboard({ farmers, usage, payments }, { kind: 'all' } | { kind: 'month', monthKey } | { kind: 'year', yearKey })
buildAllFarmersMonths({ farmers, usage, payments }, { cutoffMs? }): MonthRow[]
// duplicates.ts / validation.ts
findDuplicatePayments(candidate, existing)   findDuplicateUsage(candidate, existing)
validateUsageInput(input): ValidationCode[]  validatePaymentInput(input): ValidationCode[]
```

- `MonthRow`: `monthKey, totalMinutes, chargePaise, paidPaise, remainingPaise, cashPaise, status, entryCount, paymentCount`.
  - `status` is `settled | partial | unpaid | payment_only` ("Sirf Payment").
- `FarmerTotals`: `chargesPaise, totalPaidPaise, outstandingPaise, creditPaise, usageCount, paymentCount`.
- `PaymentTrail`: `paymentId, paidAtMs, amountPaise, pieces[{ monthKey, amountPaise }], unappliedPaise`.
- `LedgerRow`: `kind, id, atMs, monthKey, amountPaise, totalMinutes | null, balancePaise`.
- `Dashboard`: `view, periodStartMs, periodEndMs, activeFarmerCount, chargesCreatedPaise, cashReceivedPaise, outstandingPaise, creditPaise, farmers[]`. Outstanding and credit are separate sums; there is no netted field.

### D18 — Engine conventions C1–C10 (given in the Phase 3 prompt, 2026-10-06)

- **C1 Instants.** ISO-8601 text WITH `Z` or `±hh:mm` only. Naive or date-only text throws `LedgerInputError`. Microseconds parse.
- **C2 IST.** Only via epoch ms + 5h30m read with UTC getters, only in `time.ts`. Forbidden in engine source: `Date.now`, `new Date()` without argument, local getters, `toLocale*`, `Intl`, `Math.random`, `process.env`, `parseFloat`, `toFixed`.
- **C3 Cutoff.** Optional inclusive `cutoffMs`; omitted = current.
  - As-of day D = `endOfIstDayMs(D)`; Monthly = end of the month's last IST day; Yearly = end of 31 Dec IST; All Time = no cutoff.
- **C4 Order.**
  - Payments and usage each sort by (timestamp, `created_at`, `id` as a plain string).
  - The running ledger sorts by (timestamp, usage before payment, `created_at`, `id`).
  - Output never depends on input order.
- **C5 Money.** Plain-number paise. Every input and every sum is checked with `Number.isSafeInteger`. Division only via `intDiv`; no floats.
- **C6 Rows.**
  - `deleted_at` set → ignored (not even validated).
  - `total_minutes` ≠ `hours*60+minutes` → throws.
  - Cross-farmer functions ignore rows of unknown farmers.
  - Active = `deleted_at` null and not `is_disabled`.
- **C7 Status.**
  - Charge > 0: `settled` when remaining = 0, `unpaid` when paid = 0, else `partial`.
  - Charge = 0: `payment_only` when cash > 0, else `settled` (entries that rounded to 0).
  - A month row exists only with a live entry or payment.
- **C8** `totalPaidPaise` = Σ non-deleted payments.
- **C9** Cross-farmer months = per-month sums over active farmers; status by C7 on the sums. Credit is never netted.
- **C10** No currency symbol or grouping in the engine. Rupee text goes in and out only through `parseRupeesToPaise` and `paiseToDecimalString`.

### D20 — Engine details chosen in Phase 3 (where the spec and the prompt were silent; for owner review)

- **Accepted instants.** Seconds are optional (`T18:40Z`); up to 9 fraction digits. Sub-millisecond digits are truncated, so rows differing only in microseconds tie and fall through to `created_at`, then `id`.
- **Range.** Instants must lie between 1970-01-01T00:00Z and 9999-12-31 23:59:59.999 IST.
- **Integrity throws.** One ledger with rows of two farmers, or two live rows with the same id, throws `LedgerInputError`. So does a `null` `total_minutes`: the generated column is typed nullable but is never null in the DB.
- **Preview candidates.** A new candidate without `created_at` sorts after every existing payment at the same `paid_at`. A candidate beyond `cutoffMs` gets no pieces.
- **Dashboard order.** The per-farmer list is sorted by farmer id (the engine does not read names). The UI may re-sort for display.
- **Validation codes.** Defined in `validation.ts` (`farmer_required`, `time_invalid`, `minutes_out_of_range`, `duration_zero`, `amount_too_large`, ...). Hinglish messages come in Phase 4/5.

### Rules for callers (data layer, hooks, pages)

- Never recompute money, months, balances, statuses or IST dates outside the engine. If a screen needs a new figure, add it to the engine with a test.
- The data layer maps DB rows straight to the engine input types and filters farmers with `isActiveFarmer`. It never re-implements the definition.
- The payment form (L16) uses `previewPayment`, including `replacesPaymentId` when editing. It never runs its own waterfall.
- Forms parse rupee text with `parseRupeesToPaise`, and screens show amounts with `paiseToDecimalString` (adding "₹" and grouping in the UI layer).
- Forms build `used_at`/`paid_at` as ISO text with `+05:30` from the IST wall clock the owner typed. They call `validate*Input` before saving and `findDuplicate*` to warn.
- A `LedgerInputError` means bad data reached the engine. Show an error state; never swallow it.

### Tests

- 11 test files in `src/lib/ledger/`:
  - E1–E24, one named test each;
  - the D7 sweep: 1,484,640 cases against a BigInt reference;
  - 2,500 seeded random scenarios checked against the invariants and an independent BigInt oracle, current and as-of;
  - preview add/replace properties;
  - time, money, duplicates and validation tests.
- `static-guard.test.ts` reads the engine sources through `import.meta.glob(..., { query: '?raw' })`. It fails on:
  - any C2 token;
  - an import from outside the folder;
  - IST or calendar math outside `time.ts`;
  - the rounding constant outside `entry.ts`.
- The suite also passes with `TZ=America/Los_Angeles` and `TZ=UTC` (checked 2026-10-06, run from PowerShell).

## Data layer (Phase 4A)

`src/lib/data/`: every Supabase read and write. Pages and hooks import the barrel `@/lib/data` only, never the Supabase client.

### Module map

| File | Owns |
|---|---|
| `index.ts` | The barrel |
| `errors.ts` | `DataError` and `toDataError` |
| `paging.ts` | `fetchAllRows`, `PAGE_SIZE` (1,000) |
| `clock.ts` | `nowIso()`: the ONLY clock read in the app |
| `farmerRules.ts` | Pure farmer form rules (no I/O) |
| `farmers.ts` | Farmer queries, the one classification function, and the mutations |
| `test-support/` | Test-only fake Supabase query builder and fictional rows |

### API

```ts
// errors.ts
class DataError extends Error { kind: 'network' | 'permission' | 'constraint' | 'not_found' | 'unknown'; code: string | null }
toDataError(error: unknown, status?: number): DataError
// paging.ts
fetchAllRows<T>(fetchPage: (from, to) => PromiseLike<{ data, error, status? }>, pageSize = 1000): Promise<T[]>
// farmerRules.ts (limits = migration 005: name 100, mobile 20, notes 500)
normalizeFarmerInput({ name, mobile?, notes? }): { name, mobile: string | null, notes: string | null }
validateFarmerInput(input): ('name_required' | 'name_too_long' | 'mobile_invalid' | 'notes_too_long')[]
findDuplicateFarmerNames(name, farmers, { excludeId? }): farmers[]   // warning only
sortFarmersByName(farmers)     matchesFarmerSearch(farmer, text)
// farmers.ts
listFarmers(): Promise<FarmerRow[]>                  // all rows, paged, unchanged DB rows
classifyFarmers(rows): { active, disabled, deleted } // sorted by name
createFarmer(values)   updateFarmer(current, values)   setFarmerDisabled(id, disabled)
softDeleteFarmer(id)   restoreFarmer(id)            // each resolves to the saved row
```

**`DataError` kinds** (`toDataError`):
- `constraint`: SQLSTATE 23514, 23502, 23505, 23503 or 22001, or the data layer's own `client_validation`.
- `permission`: 42501, 28000/28P01, PGRST301–303, or HTTP 401/403.
- `not_found`: PGRST116, or an update that matched 0 rows (code `no_rows`).
- `network`: HTTP status 0, or a fetch failure message.
- `unknown`: everything else.
- The original code and message are kept.

**Rules:**
- **Every call checks `error`.** Every update selects the row back with `.select().maybeSingle()`: supabase-js reports a 0-row update as success, so `null` data becomes `not_found`.
- **Paging.** `fetchAllRows` asks for ranges in a stable order (by `id`) and stops only at an EMPTY page. A short page is not taken as the end, so a server cap smaller than the page size cannot truncate a list silently. This costs one extra request per list.
- **Classification.** `classifyFarmers` is the one place that splits farmers.
  - Chalu = the engine's `isActiveFarmer`.
  - Deleted = `deleted_at` set (also when disabled).
  - Band = the rest.
- **Mutations** filter to the right state: edit, disable and soft delete only touch a non-deleted row (`deleted_at is null`); restore only touches a deleted row. Otherwise the result is `not_found`.
- **Columns.**
  - Updates send only the columns that changed. With nothing changed, no request is made.
  - Rows go back to callers unchanged, so they stay assignable to the engine input types.
- **Audit columns.** The audit trigger (002) sets `created_*`/`updated_*` and `deleted_by`, but NOT `deleted_at`.
  - Soft delete therefore sends `deleted_at: nowIso()`.
  - Restore sends `deleted_at: null`, and the trigger then clears `deleted_by`.
- **Layer guard** (`layer-guard.test.ts`, raw source text via `import.meta.glob`):
  - files under `src/pages`, `src/components` and `src/hooks` may not contain `new Date`, `Date.now`, `getHours`, `getDate`, `getMonth`, `getFullYear`, `toFixed`, `parseFloat`, or a Supabase import;
  - only `lib/supabase.ts`, `lib/data/*` and `auth/*` (Phase 2B) import Supabase;
  - in `src/lib/data`, `new Date` appears only in `nowIso`.

## Farmers screen (Kisan, Phase 4A)

- **Route.** `/farmers` → `src/pages/farmers/FarmersPage.tsx`; `/farmers/:id` is still the placeholder, and rows do not link to it yet.
- **Hook.** `useFarmers()`:
  - loads once, exposes `status` (loading / error / ready), `error`, `all`, `lists` and `reload`;
  - mutations: `create`, `update`, `setDisabled`, `remove`, `restore`, each returning `{ ok, farmer }` or `{ ok: false, error }`;
  - `pending` holds the one mutation in flight; a second call while one runs is refused (no double submit);
  - after a successful mutation it reloads quietly.
- **Copy.** All Hinglish strings, plus the mapping from validation codes and `DataError` kinds to messages, live in `src/pages/farmers/copy.ts`.
- **Screen:**
  - Segments Chalu / Band / Deleted with counts, and search on name and mobile.
  - "Naya Kisan" and Edit open one form dialog with field-level errors.
  - A same-name, non-deleted farmer gives a warning with "Phir bhi save karo" / "Naam badlo". On edit, the farmer itself is excluded, and an unchanged name does not warn again.
  - Delete asks for confirmation; Restore warns about a same-name farmer.
  - The deleted date is the engine's `istDateKey(parseInstantMs(deleted_at))`.
  - Messages go to an `aria-live` region. Buttons are 44 px tall and disabled while a change is saved.
  - No money is shown.

## Backup and restore (Phase 8)

Rules: [.claude/rules/backup-restore.md](../.claude/rules/backup-restore.md). The format is new and versioned; v1 backup files are not imported (no data migration).
