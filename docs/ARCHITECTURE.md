# Architecture — Tubewell Manager (rebuild)

> **Status (2026-10-06):**
> - The **database schema is live** (Phase 2A, migrations 001–003; 004 from Phase 2B locks RLS to the owner; 005 from Phase 4A adds farmer input checks).
> - The **app foundation exists** (Phase 2B): auth, routing, layout shell, Supabase client, generated types, tests.
> - The **ledger engine exists** (Phase 3): `src/lib/ledger/`, see [Ledger engine](#ledger-engine-phase-3).
> - The **data layer and the Farmers screen exist** (Phase 4A): see [Data layer](#data-layer-phase-4a) and [Farmers screen](#farmers-screen-kisan-phase-4a).
> - The **Pani Entry (usage) screen exists** (Phase 4B): see [Usage data](#usage-data-phase-4b) and [Pani Entry screen](#pani-entry-screen-phase-4b).
> - The **Paisa (payments) screen exists** (Phase 5): see [Payment data](#payment-data-phase-5) and [Paisa screen](#paisa-screen-phase-5).
> - The **farmer profile (Kisan ka Hisaab) exists** (Phase 6): see [Farmer profile](#farmer-profile-kisan-ka-hisaab-phase-6). The **Dashboard exists** (Phase 7A): see [Dashboard](#dashboard-phase-7a-d29). The **Months screen exists** (Phase 7B): see [Months screen](#months-screen-phase-7b-d30).
> - **Backup and restore exist** (Phase 8): migration 007 adds `restore_backup`; see [Backup and restore](#backup-and-restore-phase-8-d31).
> - **Audit gap fixes** (PR1, D32): balances in the Kisan list and the Pani section, trails in the Paisa list, picker search, "Pura ₹X bharo", Pani time on the Dashboard and profile; see [Audit gap fixes](#audit-gap-fixes-pr1-d32).
> - **Independent verification** (Phase 9): an oracle written from the spec checks every screen function over 320 seeded scenarios, E1–E24, scale, timezones and the backup round trip; see [VERIFICATION.md](VERIFICATION.md).
> - **Semantic colours** (Phase 6C, D28): every kind of information has one fixed tone; see [Semantic colours](#semantic-colours-phase-6c-d28).
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
| `hooks/useRowStore.ts` | Shared hook core (Phase 4B): load once, one mutation at a time, quiet reload, `refreshFailed` |
| `hooks/useFarmers.ts` | Loads farmers, exposes the three lists and the mutations (Phase 4A, on `useRowStore` since 4B) |
| `hooks/useUsage.ts` | Loads usage entries, exposes live / deleted lists and the mutations (Phase 4B) |
| `hooks/usePayments.ts` | Loads payments, exposes live / deleted lists and the mutations (Phase 5) |
| `types/database.ts` | GENERATED Supabase types (see Type generation) |
| `components/layout/AppLayout.tsx` | Header (app name + Logout) and mobile-first bottom nav; centred `max-w-2xl` |
| `components/ErrorBoundary.tsx`, `components/FullScreenMessage.tsx` | Top-level error screen; loading/status screen |
| `components/tone.ts` | Semantic colour tones and meaning lookups (Phase 6C, D28) |
| `components/ui/` | shadcn/ui: `button`, `card`, `input`, `label`, plus `dialog` and `alert-dialog` (Phase 4A, written by hand in the shadcn Tailwind-3 style, because the current shadcn CLI targets Tailwind 4). Never hand-edit them otherwise. |
| `pages/` | `LoginPage`, `PlaceholderPage` ("Yeh screen Phase N mein banegi"), `NotFoundPage`, `farmers/` (Kisan), `usage/` (Pani Entry), `payments/` (Paisa), `shared/monthLabel.ts` (month label "Oct 2026", used by Pani Entry, Paisa and the profile); `farmers/FarmerProfilePage.tsx` (Kisan ka Hisaab, Phase 6); `dashboard/` (Dashboard at `/`, Phase 7A); `months/` (Mahine at `/months`, Phase 7B) |
| `test/setup.ts`, `**/*.test.ts(x)` | Vitest + React Testing Library (D16) |
| `index.css` + `tailwind.config.js` | Design tokens as CSS variables, including the semantic `tone-*` tokens (D28); no hex colours or inline styles in components |

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

## Database schema (live, migrations 001–007, updated 2026-10-06)

Sources:
- SQL: `supabase/migrations/001_core_tables.sql`, `002_audit_triggers.sql`, `003_rls_policies.sql`, `004_lock_rls_to_owner.sql`, `005_farmers_input_checks.sql`, `006_payments_note_check.sql`, `007_restore_backup_function.sql` (the restore function, D31).
- Checks: `supabase/tests/001_schema_checks.sql` (134 checks since 007, all rolled back).
  - T0.01 records the row counts that already exist; the owner's rows are never touched or assumed absent.
  - The residue check T6.01 (second call) must print the same counts.

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
| `note` | text NULL | `payments_note_max_length`: NULL or at most 200 characters (006) |

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

- **Active-farmer filter is applied in ONE place.** The rule itself lives in `src/lib/ledger/farmers.ts` (`isActiveFarmer`: `deleted_at IS NULL` and not disabled) and is applied through the data layer; pages never re-implement it.
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
  - Phase 4B tests cover the three engine helpers, the usage rules and data functions, the clock helper, `useUsage`, the Pani Entry screen, and the Part 0 farmer changes (mobile digit rule, refresh failure).
  - Phase 5 tests cover the payment rules (including the live preview with the worked numbers), the payments data functions, `usePayments`, the Paisa screen with its preview panel, the shared month label, and the D25 long-duration boundaries.
  - Phase 6 tests cover the profile rules (worked numbers, balances, paging, bad data, one-engine consistency with the Paisa preview), the profile screen, the Kisan list link, and the `initialFarmerId` dialog prop.
  - Phase 7B tests cover the months rules (worked numbers incl. "Unpaid with Cash Mila" and "Sirf Payment", IST month and year boundaries, inactive farmers, order, deep link, bad data, consistency with the engine, the Dashboard and the profile), the Months screen, the Dashboard moment refresh and the Dashboard link to a month.
  - Phase 7A tests cover the dashboard rules (worked numbers for All Time / Mahina / Saal, IST month and year boundaries, never netted, inactive farmers, Band note, sorting, search, chart, recent activity, bad data, consistency with the profile and the months list), the Dashboard screen, and the fresh dialog moment (C-2).
  - Phase 6C tests cover the tone classes and lookups, the WCAG contrast of the tone tokens, and a colour static guard over pages and components.
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
istTimeKey(ms): 'HH:mm'                                          // Phase 4B, additive
istWallClockToIso(dateKey, 'HH:mm'): 'YYYY-MM-DDTHH:mm:00+05:30' | null   // Phase 4B; null for bad input, never throws
endOfIstDayMs(dateKey): number   istMonthRangeMs(monthKey) / istYearRangeMs(yearKey): { startMs, endMs } // inclusive
compareMonthKeys(a, b): number   isMonthKey / isDateKey / isYearKey(key): boolean
// money.ts
assertPaise(v, what)  intDiv(a, d)  sumPaise(values)
parseRupeesToPaise(text): number      paiseToDecimalString(paise): string
formatRupees(paise): string   // Phase 4B: rupee sign, Indian grouping, 2 decimals, "-" before the sign
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
| `clock.ts` | `nowIso()`: the ONLY clock read in the app; `currentIstMoment()` built on it (4B) |
| `rows.ts` | `oneRow`: an insert/update result row, 0 rows → `not_found` (4B, shared) |
| `farmerRules.ts` | Pure farmer form rules (no I/O) |
| `farmers.ts` | Farmer queries, the one classification function, and the mutations |
| `usageRules.ts` | Pure Pani Entry rules (no I/O), Phase 4B |
| `usage.ts` | Usage queries and mutations, Phase 4B |
| `paymentRules.ts` | Pure Paisa rules (no I/O), including the live preview through the engine, Phase 5 |
| `payments.ts` | Payment queries and mutations, Phase 5 |
| `timeline.ts` | Private helpers shared by the usage and payment rules: newest-first sort, IST month/day, month list (Phase 5) |
| `profileRules.ts` | Pure Kisan ka Hisaab rules: one `buildFarmerLedger` call per profile, joins and display splits only (Phase 6) |
| `balanceRules.ts` | Pure per-farmer balances and per-payment trails from `buildFarmerLedger` (rows grouped once) for the Kisan, Pani and Paisa screens (PR1, D32) |
| `monthsRules.ts` | Pure Months rules: wraps `buildAllFarmersMonths` and per-farmer `buildFarmerProfile` months; order, year filter, strip (`sumPaise`), deep link (Phase 7B) |
| `dashboardRules.ts` | Pure Dashboard rules: wraps `buildDashboard` and `buildAllFarmersMonths`; names, order, search, summary, Band note, chart bars, recent activity (Phase 7A) |
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
// mobile: digits, spaces, + and -, at least one digit (D23, Phase 4B), at most 20
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
  - files under `src/pages`, `src/components` and `src/hooks` may not contain `new Date`, `Date.now`, `getHours`, `getDate`, `getMonth`, `getFullYear`, `toFixed`, `parseFloat`, `toLocale*`, `Intl.` (both added in 4B), or a Supabase import;
  - only `lib/supabase.ts`, `lib/data/*` and `auth/*` (Phase 2B) import Supabase;
  - in `src/lib/data`, `new Date` appears only in `nowIso`.

## Farmers screen (Kisan, Phase 4A)

- **Route.** `/farmers` → `src/pages/farmers/FarmersPage.tsx`. Since Phase 6, Chalu and Band rows link to `/farmers/:id` (Kisan ka Hisaab); deleted rows do not.
- **Hook.** `useFarmers()`:
  - loads once, exposes `status` (loading / error / ready), `error`, `all`, `lists` and `reload`;
  - mutations: `create`, `update`, `setDisabled`, `remove`, `restore`, each returning `{ ok, farmer }` or `{ ok: false, error }`;
  - `pending` holds the one mutation in flight; a second call while one runs is refused (no double submit);
  - after a successful mutation it reloads quietly. If that reload fails (D23, Phase 4B), the old list stays, the mutation still returns ok, and `refreshFailed` is set. The page shows one line, "Save ho gaya, par list refresh nahi ho payi.", with a retry (`retryRefresh`). Only a failed initial or retried full load shows the error state.
- **Copy.** All Hinglish strings, plus the mapping from validation codes and `DataError` kinds to messages, live in `src/pages/farmers/copy.ts`.
- **Screen:**
  - Segments Chalu / Band / Deleted with counts, and search on name and mobile.
  - "Naya Kisan" and Edit open one form dialog with field-level errors.
  - A same-name, non-deleted farmer gives a warning with "Phir bhi save karo" / "Naam badlo". On edit, the farmer itself is excluded, and an unchanged name does not warn again.
  - Delete asks for confirmation; Restore warns about a same-name farmer.
  - The deleted date is the engine's `istDateKey(parseInstantMs(deleted_at))`.
  - Messages go to an `aria-live` region. Buttons are 44 px tall and disabled while a change is saved.
  - No money is shown.

## Usage data (Phase 4B)

```ts
// usageRules.ts (pure; money, rounding and IST math come from the engine)
newUsageForm(now, farmerId?) / usageFormFromRow(row): UsageForm      // strings as typed; rate in rupees
buildUsageInput(form): { ok: true, input: UsageInput } | { ok: false, codes: UsageFormCode[] }
usageInputAmountPaise(input) / usageAmountPaise(row): number           // via entryAmountPaise (D7)
describeUsageWarnings(input, rows, now, { excludeId?, original? }): UsageWarning[]
classifyUsage(rows): { live, deleted }     filterUsage(rows, { farmerId?, monthKey? })
listUsageMonths(rows, currentMonthKey): string[]
// usage.ts
listUsage()  createUsage(input)  updateUsage(current, input)  softDeleteUsage(id)  restoreUsage(id)
// clock.ts
currentIstMoment(): { dateKey, timeKey, monthKey }
```

- **`buildUsageInput`** trims every field, then:
  - hours and minutes must be digits only (an empty field is `*_required`, anything else non-digit is `*_not_integer`);
  - the rate goes through `parseRupeesToPaise` (failure gives the local code `rate_invalid`);
  - date and time go through `istWallClockToIso`;
  - the engine's `validateUsageInput` decides the rest. `UsageFormCode` = the engine usage codes plus `rate_invalid`.
- **`usageAmountPaise`** throws `LedgerInputError` when `total_minutes` is null or differs from hours×60+minutes (K-03). It never guesses.
- **Warnings** (never block):
  - `duplicate`: same farmer, IST day, hours and minutes (`findDuplicateUsage`, L14);
  - `long_duration`: TOTAL entry time over 24 h 00 min (D25, Phase 5: 24 h 01 min warns, exactly 24 h does not);
  - `future_date`: IST date after today.
  - When editing (`original`), a warning whose fields did not change is not raised again.
- **Soft-delete split.** `classifyUsage` is the only usage soft-delete split; both lists are newest first by `used_at`, then id.
- **Data functions.**
  - Same rules as for farmers: validate first with `validateUsageInput` (`client_validation`), check every `error`, 0 rows → `not_found`, live-only edit/delete and deleted-only restore, changed columns only.
  - `used_at` is compared as an instant.
  - `total_minutes` is never sent. A foreign-key violation (23503) maps to `constraint`.

## Pani Entry screen (Phase 4B)

- **Route.** `/usage` → `src/pages/usage/UsagePage.tsx` (with `UsageFormDialog.tsx`, `UsageListItem.tsx`); hook `useUsage()`; the farmer picker and names come from `useFarmers()`.
- **Copy.** All Hinglish strings, including the `UsageFormCode`, warning and `DataError` maps (typed `Record`s, so a missing code fails the typecheck), live in `src/pages/usage/copy.ts`.
- **Screen:**
  - **Filters and segments.** Segments Entries / Deleted. The farmer filter has Sabhi kisan plus non-deleted farmers (Band marked). The month filter has `listUsageMonths` plus "Sabhi mahine", defaulting to the current IST month. Filters apply to both segments and to the counts.
  - **Form.** Farmer (active only; an edited entry keeps its own farmer even if Band/Deleted), date and time prefilled with the current IST moment, hours, minutes and rate (₹/hour, default 100). Errors appear after the first save attempt, next to their fields.
  - **Live amount.** The line "Rakam: ₹…" (`usageInputAmountPaise` + `formatRupees`) appears as soon as the form is valid.
  - **Warnings** sit in one box with "Phir bhi save karo" / "Wapas jao, badlo".
  - **Rows.** Farmer, IST date and time, "H ghante M minute", rate per hour, amount. Edit, and Delete with a confirmation. The Deleted segment shows the delete date and "Wapas lao".
  - **Bad rows.** If any row's amount cannot be computed, the page shows an error state (no list, no add).
  - **No totals.** No month totals, balances or per-farmer sums.

## Payment data (Phase 5)

```ts
// paymentRules.ts (pure; money, FIFO and IST math come from the engine)
newPaymentForm(now, farmerId?) / paymentFormFromRow(row): PaymentForm     // strings; amount starts EMPTY
buildPaymentInput(form): { ok: true, input: PaymentInput } | { ok: false, codes: PaymentFormCode[] }
paymentInputCodes(input): PaymentFormCode[]                               // used by the data layer before writes
describePaymentWarnings(input, rows, now, { excludeId?, original? }): PaymentWarning[]   // duplicate | future_date
buildPaymentPreview({ farmerId, input?, usageRows, paymentRows, replacesPaymentId? }): PaymentPreviewResult
classifyPayments(rows): { live, deleted }    filterPayments(rows, { farmerId?, monthKey? })
listPaymentMonths(rows, currentMonthKey): string[]
// payments.ts
listPayments()  createPayment(input)  updatePayment(current, input)  softDeletePayment(id)  restorePayment(id)
```

- **`buildPaymentInput`** trims every field, then:
  - the amount goes through `parseRupeesToPaise`: empty gives `amount_required`, unreadable text gives the local `amount_invalid`;
  - date and time go through `istWallClockToIso`;
  - the engine's `validatePaymentInput` decides the rest;
  - the note is trimmed of all whitespace, empty becomes `null`, and more than 200 code points gives `note_too_long`.
  - `PaymentFormCode` = the engine payment codes plus `amount_invalid` and `note_too_long`. The engine's `amount_too_large` exists only for usage.
- **`buildPaymentPreview`** keeps only that farmer's usage and payment rows, then calls the engine:
  - without `input`: `buildFarmerLedger(...).totals` (kind `current`);
  - with `input`: the full `previewPayment` result (kind `preview`), passing `replacesPaymentId` when editing.
  - A `LedgerInputError` (bad data, such as a null `total_minutes` or a deleted replaced payment) gives `{ ok: false }`. It computes nothing itself.
- **Warnings** (never block):
  - `duplicate`: same farmer, amount and IST day (`findDuplicatePayments`, L14);
  - `future_date`: IST date after today.
  - With `original`, a warning whose fields did not change is not raised again.
- **Data functions.**
  - Same rules as for usage: validate first (`client_validation`), check every `error`, 0 rows → `not_found`, live-only edit/delete and deleted-only restore.
  - `updatePayment` sends only the changed columns among `amount_paise`, `paid_at` (compared as an instant) and `note`.
  - The farmer of a payment cannot change: a different `farmer_id` is refused with `DataError('constraint', 'farmer_locked')` before any request.

## Paisa screen (Phase 5)

- **Route.** `/payments` → `src/pages/payments/PaymentsPage.tsx` (with `PaymentFormDialog.tsx`, `PaymentListItem.tsx`, `PaymentPreviewPanel.tsx`).
- **Data.** Hooks `usePayments()`, `useUsage()` (rows for the preview only; their loading or failure never blocks the list) and `useFarmers()` (picker and names).
- **Copy.** All Hinglish strings, including the code, warning and `DataError` maps, live in `src/pages/payments/copy.ts`. The month label is the shared `src/pages/shared/monthLabel.ts`.
- **List.**
  - Segments Payments / Deleted.
  - Farmer filter (Sabhi kisan plus non-deleted farmers, Band marked) and month filter (current IST month by default, "Sabhi mahine"). Both apply to the segments and the counts.
  - Rows show farmer, IST date and time, amount and note. Edit, and Delete with a confirmation that says the farmer's baaki / advance can change. Deleted rows show the delete date and "Wapas lao".
- **Form.**
  - Farmer: active farmers only; read-only when editing.
  - Date and time: prefilled with the current IST moment.
  - Amount: empty at the start. Note: optional, up to 200 characters.
  - There is no month field anywhere (L5).
- **Preview panel.** Every figure is an engine field shown with `formatRupees`. The UI does no arithmetic, and outstanding and credit are always two separate lines (E18).

  | Shown | Engine field |
  |---|---|
  | Abhi ka hisaab (farmer chosen, form not yet valid) | `buildFarmerLedger(...).totals.outstandingPaise` / `.creditPaise` |
  | Abhi ka hisaab / Pehle (form valid) | `preview.before.totals.outstandingPaise` / `.creditPaise` |
  | Is payment se: month lines | `preview.pieces[]` (`monthKey` → month label, `amountPaise`), oldest first |
  | Is payment se: "Advance / Credit" | `preview.unappliedPaise` (shown only when > 0; D5) |
  | Payment ke baad / Baad mein | `preview.after.totals.outstandingPaise` / `.creditPaise` (the current value is shown next to it when adding) |
  | Naya Advance / Credit | `preview.creditCreatedPaise` (shown only when > 0) |

  - If the usage rows are still loading or failed, a short message replaces the numbers. Save stays allowed.
  - A bad-data result shows a message and disables Save.
- **Warnings** sit in one box with "Phir bhi save karo" / "Wapas jao, badlo".
- **States** match the other screens: loading, error with retry, empty messages, `aria-live` messages, the `refreshFailed` line, buttons disabled while saving.

## Farmer profile (Kisan ka Hisaab, Phase 6)

**Data** (`src/lib/data/profileRules.ts`, pure, no second algorithm):

```ts
buildFarmerProfile({ farmerId, usageRows, paymentRows }): { ok: true, profile } | { ok: false }
findProfileFarmer(farmers, id): { kind: 'active' | 'disabled', farmer } | { kind: 'not_found' }
toProfileBalance(balancePaise): { kind: 'baaki' | 'advance' | 'zero', amountPaise }   // absolute amount
visiblePart(rows, shown): { visible, hidden }      nextShownCount(total, shown)     PROFILE_PAGE_SIZE = 30
```

- `buildFarmerProfile` keeps only that farmer's rows and makes ONE `buildFarmerLedger` call. It then only selects, joins and orders:
  - `totals`: the engine totals;
  - `months`: newest first, with `hours`/`minutes` from `totalMinutes` (integer division);
  - `payments`: live, newest first, each joined to its engine trail;
  - `usage`: live, newest first, with `usageAmountPaise`;
  - `ledger`: engine rows newest first, the signed `balancePaise` split by `toProfileBalance`.
- `LedgerInputError` gives `{ ok: false }`; any other error is re-thrown.

**Screen** (`src/pages/farmers/FarmerProfilePage.tsx`, `ProfileSections.tsx`, copy in `profileCopy.ts`; route `/farmers/:id`):

| Shown | Source |
|---|---|
| Total charge / Total mila | `totals.chargesPaise` / `totals.totalPaidPaise` |
| Abhi baaki / Advance / Credit (two separate figures, E18) | `totals.outstandingPaise` / `totals.creditPaise` |
| Advance / Credit badge at the top (only when > 0) | `totals.creditPaise` |
| Month card: samay, Charge, Charge Clear, Baaki, Cash Mila, status | `hours`/`minutes`, `chargePaise`, `paidPaise`, `remainingPaise`, `cashPaise`, `status` (Settled / Partial / Unpaid / Sirf Payment) |
| Payment: amount, IST time, note; trail lines; "Advance / Credit" line | the payment row; `pieces[]` (oldest first, plain months, D5); `unappliedPaise` (when > 0) |
| Pani entry: IST time, ghante-minute, rate, amount | the usage row; `amountPaise` (`usageAmountPaise`) |
| Hisaab ki line: Pani entry / Paisa mila amount; "Baaki ₹x" / "Advance ₹x" / "Barabar" | engine `amountPaise`; `balance.kind` + `balance.amountPaise` |

**Decision D27** (manager design choices, 2026-10-06; the owner may revisit):
- **(a) Opening.** The profile opens by tapping a farmer in the Kisan list: Chalu and Band rows get a 44 px link, while Edit, Band/Chalu karo and Delete keep working. Deleted rows have no link.
- **(b) Band and deleted farmers.** A Band farmer opens with a "Band" badge and no shortcut buttons. A deleted or unknown id shows "Kisan nahi mila" with a link back.
- **(c) Ledger section.** Newest first. Each line shows the running balance after it, as "Baaki ₹x" (≥ 0) or "Advance ₹x" (absolute amount when < 0), or "Barabar" at 0. It is never mixed into the headline totals.
- **(d) Credit badge.** The Advance / Credit badge shows only when credit > 0. "Abhi baaki" and "Advance / Credit" are always two separate figures.
- **(e) Month layout.** Month cards, not a wide table; no horizontal scrolling.
- **(f) Shortcut dialogs.** "Pani add" / "Paisa add" open the existing `UsageFormDialog` / `PaymentFormDialog` with `initialFarmerId` (pre-selected, still changeable). After saving, the hooks reload and the profile shows the new figures.
- **(g) Status words.** "Settled", "Partial", "Unpaid", "Sirf Payment" (typed `Record<MonthStatus, string>`).

**Other details:**
- Payments, Pani entries and the ledger show 30 rows, then "Aur dikhao" for 30 more. Month cards and totals always use all rows.
- States: loading; error with retry; the `refreshFailed` line; a bad-data message that hides all figures.
- Saved confirmations reuse `USAGE_COPY.done.created` / `PAYMENTS_COPY.done.created`.
- **Dialog prop.** `UsageFormDialog` and `PaymentFormDialog` have an optional `initialFarmerId` (new entry only; ignored when editing). It feeds `newUsageForm` / `newPaymentForm`.

## Audit gap fixes (PR1, D32)

The requirements audit (step PAUDIT) found no wrong figure; it found missing information and connections. PR1 adds them with the existing engine only (no new algorithm).

**Data** (additive, pure):

```ts
// src/lib/data/balanceRules.ts
buildFarmerBalances({ farmers, usageRows, paymentRows }): Map<farmerId, { ok: true, outstandingPaise, creditPaise } | { ok: false }>
buildPaymentTrails({ usageRows, paymentRows }): Map<paymentId, { ok: true, pieces, unappliedPaise } | { ok: false }>
// src/lib/data/dashboardRules.ts
buildDashboardScreen(...).screen.time { totalMinutes, hours, minutes }   .activeFarmerCount   periodTime(months, view)
// src/lib/data/profileRules.ts
buildFarmerProfile(...).profile.time { totalMinutes, hours, minutes }
// src/lib/data/timeline.ts (private helper, now shared): splitMinutes(totalMinutes)
```

- Rows are grouped by farmer ONCE; each farmer's figures are `buildFarmerLedger` on that farmer's own rows, exactly what the profile shows. Balances cover every non-deleted farmer (Chalu and Band); trails cover every live payment (any farmer). Bad data for a farmer gives that farmer `{ ok: false }`.
- Dashboard time = the engine's month rows (`buildAllFarmersMonths`, active farmers) inside the period, added with `sumPaise`; payment-only months add 0. Profile time = the sum of its month rows.
- **Active-farmer rule:** defined once in `src/lib/ledger/farmers.ts` (`isActiveFarmer`) and applied through the data layer (`classifyFarmers`, `rowsByActiveFarmer` inside the engine's cross-farmer views). Pani and Paisa lists and the CSV exports still list entries of Band and deleted farmers (owner decision, D24 h).

**Screens:**

| Screen | Added | Source |
|---|---|---|
| Kisan list | "Abhi baaki" (due) or "Baaki nahi" (muted) + separate "Advance / Credit" badge (credit) on Chalu and Band rows; none on deleted rows. Delete dialog: "Band karo (delete nahi)" | `buildFarmerBalances` |
| Pani | Chosen farmer's position in the entry form; a strip above a list filtered to one farmer; name-or-mobile search in the picker | `buildFarmerBalances`, `matchesFarmerSearch` |
| Paisa | Allocation trail on each live payment; picker options with the position as text; search; "Pura ₹X bharo" (new payment, Baaki > 0) | `buildPaymentTrails`, `buildFarmerBalances`, `paiseToDecimalString` |
| Dashboard | "Pani ka samay" (water) and "Chalu kisan" tiles | `screen.time`, `screen.activeFarmerCount` |
| Profile | "Total pani ka samay" (water) | `profile.time` |

**Decision D32** (owner, 2026-10-06): fix the audit gaps in one step as listed above. Not built (owner choice): changing which entries the Pani / Paisa lists or CSVs show, grouping lists by farmer, a global search, a recovery % or pie, separate reports, "hide settled farmers", per-entry paid badges, lazy routes (later polish), renaming "Baaki" to "Kitna Baki Hai".

**Consistency tests** (`balanceRules.test.ts`): Kisan figure = profile totals = Dashboard All Time row for every Chalu farmer; Paisa trail = profile trail; Dashboard time = sum of the Mahine month times (All Time, a year, every month); a usage date moved into another IST month moves its charge and re-allocates.

## Months screen (Phase 7B, D30)

**Data** (`src/lib/data/monthsRules.ts`, pure, no second algorithm):

```ts
buildMonthsScreen({ farmers, usageRows, paymentRows }): { ok: true, screen: { months, years, hasFarmers } } | { ok: false }
filterMonthsByYear(months, year | null)    monthsStrip(months): { totalMinutes, hours, minutes, chargePaise, cashPaise }
monthsYearOptions(monthKeys)    sortMonthFarmers(rows)    deepLinkMonth(value, monthKeys): { monthKey, yearKey } | null
```

- `months` are the engine's `buildAllFarmersMonths` rows (status of the sums included), newest first, with `hours` / `minutes`. Each has `farmers`: every ACTIVE farmer's `buildFarmerProfile(...).profile.months` row for that month (one engine call per farmer), highest Baaki first, then name, then id.
- `monthsStrip` adds the shown months' minutes, charge and cash with the engine's `sumPaise`; it has no Baaki and no credit.
- `deepLinkMonth` accepts only a valid month key that is in the list.
- `LedgerInputError` (or a farmer profile that is not ok) gives `{ ok: false }`; other errors are re-thrown.

**Screen** (`src/pages/months/`: `MonthsPage.tsx`, `MonthsSections.tsx`, `copy.ts`; route `/months`):

| Element | Engine field | Leads to |
|---|---|---|
| Month card | `MonthRow` charge, paid (Charge Clear), remaining (Baaki), cash (Cash Mila), minutes, status, counts | "Kisan-wise dekho (n)" opens the breakdown |
| Breakdown row | that farmer's profile month (`ProfileMonth`) | name → `/farmers/:id` |
| Year strip | `sumPaise` of the shown months' minutes, `chargePaise`, `cashPaise` (= Dashboard year view charges / cash) | "Dashboard kholo" → `/` for year-end Baaki / credit |
| Deep link `/months?month=YYYY-MM` | — | opens that month expanded, year filter set; invalid values ignored |
| Dashboard Mahina view | — | "Is mahine ka kisan-wise hisaab" → `/months?month=<month>` |

**Decision D30** (manager design choices, 2026-10-06; the owner may revisit):
- **(a) Layout.** Title "Mahine": explanation, year filter, year strip, months list.
- **(b) Year filter.** "Saal" select: "Sabhi saal" (default) plus each year with months, newest first.
- **(c) Year strip.** Time, Charge, Cash Mila of the shown months (no Baaki: monthly Baaki is "as of now"; year-end balances live in the Dashboard "Saal" view, linked).
- **(d) Month cards.** Newest first; the profile's words and tones; a count line "x entry, y payment"; "Sirf Payment" as on the profile.
- **(e) Breakdown.** A full-width toggle (`aria-expanded`, `aria-controls`) per card; farmers with usage or payments in the month, Baaki first; 30 then "Aur dikhao"; several months may be open; cards start closed.
- **(f) Deep link.** `?month=YYYY-MM` opens that month and sets its year; the Dashboard's Mahina view links to it.
- **(g) Explanation.** One block: Charge, Charge Clear, Baaki, Cash Mila in plain words, including why "Unpaid" can show Cash Mila.
- **(h) States.** Loading, error with retry, one bad-data message, no active farmer (link to Kisan), no month yet, a year without months. No dialogs, so no "saved, list not refreshed" line.
- **(i) Colours.** D28 only (see the rules file's Months mapping).
- **(j) 360 px.** No horizontal scroll; 44 px targets; long names wrap.

## Dashboard (Phase 7A, D29)

**Data** (`src/lib/data/dashboardRules.ts`, pure, no second algorithm):

```ts
buildDashboardScreen({ farmers, usageRows, paymentRows, view, now }): { ok: true, screen } | { ok: false }
  screen = { dashboard, periodHasActivity, summary, rows, band, chart, recent, periodOptions }
sortDashboardRows(rows)            filterDashboardRows(rows, query)       summarizeDashboard(sortedRows)
chartBars(months): ChartMonth[]    buildRecentActivity({ farmers, usageRows, paymentRows, limit? })
buildPeriodOptions(monthKeys, now, view)    periodView(kind, now)
CHART_MONTHS = 6   CHART_MIN_PERCENT = 4   RECENT_LIMIT = 8
```

- `dashboard` is the engine's `buildDashboard(…, view)`. `rows` are its per-farmer rows plus the name, highest baaki first, then name (case-insensitive), then id.
- `band` runs the same `buildDashboard` over copies of the Band farmers with the flag cleared, so their as-of balances use the same rule. It is never added to the totals; it is null when no Band farmer has a balance.
- `chart` comes from `buildAllFarmersMonths`: the newest 6 months with usage or payments, oldest to newest. Bar heights are integer percents of the largest bar shown; any amount above zero is at least 4 %.
- `recent`: the newest 8 live entries and payments of active farmers, mixed (ties: payment before usage, then id), amounts from `usageAmountPaise` / `amount_paise`.
- `LedgerInputError` anywhere (including a Band farmer's rows or an invalid period key) gives `{ ok: false }`; other errors are re-thrown.

**Screen** (`src/pages/dashboard/`: `DashboardPage.tsx`, `DashboardSections.tsx`, `copy.ts`; route `/`):

| Element | Engine field | Leads to |
|---|---|---|
| Tile Charge / Cash Mila | `dashboard.chargesCreatedPaise` / `cashReceivedPaise` (in the period) | — |
| Tile Baaki / Advance / Credit | `dashboard.outstandingPaise` / `creditPaise` (as of the period end; never netted) | — |
| Summary line | counts of rows with outstanding > 0 / credit > 0; top row's `outstandingPaise` | — |
| Chart column | `MonthRow.chargePaise` / `cashPaise` | switches to the Mahina view of that month; "Saare mahine" → `/months` |
| Farmer row | `DashboardFarmerRow` outstanding, credit (and period charge / cash) | name → `/farmers/:id`; Paisa / Pani → the dialogs with the farmer pre-selected |
| Recent line | `usageAmountPaise` / `amount_paise`, IST date and time | farmer name → `/farmers/:id` |
| Band note | Band farmers' `outstandingPaise` and `creditPaise` (separate) | → `/farmers` |
| Quick buttons Pani add / Paisa add | — | the dialogs without a farmer; the lists reload after a save |

**Decision D29** (manager design choices, 2026-10-06; the owner may revisit):
- **(a) Period.** Default "Abhi tak" (All Time = now). "Mahina" opens the current IST month with a month picker (months with data plus the current one, newest first); "Saal" the current year with a year picker. Changing the period re-runs the pure function only.
- **(b) Explanation.** One sentence under the selector: what charge and cash mean for the period, and that Baaki and Advance / Credit are as of its end (D1).
- **(c) Tiles.** Four separate figures with D28 tones; no netted figure anywhere.
- **(d) Summary.** "x kisan ka baaki hai. Sabse zyada: naam ₹y." or "Kisi kisan ka baaki nahi."; plus "z kisan ke paas Advance / Credit hai." when z > 0.
- **(e) Chart.** "Mahine ke hisaab": the last 6 months with data, two bars per month (charge, cash), legend with colours and words, each column a 44 px button with an aria-label; pressing it opens that month; a screen-reader table with the same figures; "Saare mahine" → `/months` (Phase 7B).
- **(f) Farmer list.** Every active farmer, highest baaki first; Advance / Credit only when > 0; period charge and cash in Mahina / Saal; name search with "x / y kisan"; name → profile; Paisa / Pani shortcuts.
- **(g) Recent activity.** Newest 8 live entries and payments of active farmers, each linking to the profile.
- **(h) Band note.** Count and separate Baaki / Advance totals of Band farmers with a balance, "not in the totals above" (L12), link to Kisan. Soft-deleted farmers are never mentioned.
- **(i) Quick buttons.** Pani add / Paisa add without a farmer; saved confirmations reuse the Pani and Paisa `done` copy.
- **(j) Data health.** Bad data shows one plain message instead of all figures; loading, error with retry, and the "saved, list not refreshed" line as on the profile.
- **(k) Empty states.** No active farmers (link to Kisan); no entry or payment in the period; no months; no recent activity.
- **(l) Colours.** D28 only (see the rules file's Dashboard mapping).
- **(m) 360 px.** Six chart columns fit; 44 px targets; long names wrap.

**Other details:**
- The Band note follows the selected view (balances at the period end), like the totals.
- Bar heights use an inline `style` height (a size, not a colour); colours come only from tone classes.
- Each Pani / Paisa dialog takes a fresh IST moment when opened (C-2, also on the profile, Pani Entry and Paisa pages).
- The Dashboard refreshes its IST moment when the page becomes visible again and when a period button is pressed (Phase 7B Part 0), so the current month and year never go stale.
- In the Mahina view, "Is mahine ka kisan-wise hisaab" links to `/months?month=<month>`.

## Semantic colours (Phase 6C, D28)

Every kind of information has ONE fixed tone by meaning, the same on every screen. The rules for pages, components and future screens are in [.claude/rules/ui-color-semantics.md](../.claude/rules/ui-color-semantics.md).

**Tokens** (`src/index.css`, HSL channels; mapped in `tailwind.config.js` as `tone-<name>`, `tone-<name>-soft`, `tone-<name>-border`):

| Tone | Strong (text) | Soft (badge / notice) | Border | Contrast of strong on card / page / soft | Meaning |
|---|---|---|---|---|---|
| `water` | #0c6e68 | #e9f9f7 | #8cd9cf | 6.08 / 5.59 / 5.62 | Pani usage and its charge |
| `cash` | #137236 | #e9f9ee | #90d5a9 | 6.02 / 5.53 / 5.53 | Money received, success |
| `due` | #aa1838 | #fdecef | #f1b1bc | 7.27 / 6.68 / 6.39 | Money still owed |
| `credit` | #652fbc | #f3eefe | #cfbaf3 | 7.83 / 7.20 / 6.90 | Advance / Credit |
| `caution` | #89420b | #fef6dc | #f3c568 | 7.41 / 6.81 / 6.84 | Warnings, in-between states |
| `info` | existing `primary` / `accent` | | | (existing) | Actions, links, focus |
| `muted` | existing `muted-foreground` / `muted` | | | (existing) | Band, Deleted, zero, helper text |

Errors keep the existing `destructive` tokens; `due` is a separate meaning.

**Fix 1 (2026-10-06):** `--muted-foreground` darkened from `220 8.9% 46.1%` to `220 8.9% 41%` (contrast on card / page / `muted` was 4.83 / 4.44 / 4.08, now 5.82 / 5.35 / 4.91). The contrast test now also covers muted text on card, page and `muted`, and `accent-foreground` on `accent` (info badge, 6.61).

**Module** (`src/components/tone.ts`):

```ts
type Tone = 'water' | 'cash' | 'due' | 'credit' | 'caution' | 'info' | 'muted'
TONE: Record<Tone, { text, soft, border, bar, dot, badge, notice }>   // complete literal class strings
MONEY_TONE        { charge: water, cash: cash, outstanding: due, credit: credit }
MONTH_STATUS_TONE { settled: cash, partial: caution, unpaid: due, payment_only: credit }
BALANCE_TONE      { baaki: due, advance: credit, zero: muted }
ENTRY_KIND_TONE   { usage: water, payment: cash }
NOTICE_TONE       { success: cash, warning: caution, refreshFailed: caution }
```

**Tests** (`src/components/tone.test.ts`): every tone has every class key; the D28 lookups; WCAG contrast >= 4.5:1 for each new tone's strong text on the card, the page and its soft background, computed from `index.css` (read from disk, because Vitest empties CSS modules even with `?raw`); a static guard over `src/pages/**` and `src/components/**` (shadcn `ui` files included) against raw hex, inline colour styles, raw `rgb()`/`hsl()` and Tailwind default-palette classes.

**Decision D28** (manager design choices, 2026-10-06; the owner may revisit after seeing it):
- **(a) Meaning map.** One tone per meaning, as in the table above and the rules file.
- **(b) Restrained use.** Coloured text for key amounts and labels; a soft tint only for small badges and notice boxes; a thin left bar or small dot for the entry type; white cards. At most one tone per element.
- **(c) Accessibility.** Labels always stay; contrast >= 4.5:1 is tested; borders, bars and dots are decorative.
- **(d) Applied** to Kisan (Band / Deleted rows muted), Pani (water rows and live amount, caution warnings), Paisa (cash rows; preview: outstanding due, pieces cash, credit and "naya Advance / Credit" credit) and Kisan ka Hisaab (tiles, badge, month cards, payment trail, Pani entries, ledger dots and balances). Success notices use `cash`; "saved, list not refreshed" uses `caution`.
- **(e) Future screens.** The Dashboard, the Months screen and every chart or stat tile use the same tones (charges water, cash received cash, outstanding due, credit credit), in every series and legend.
- **(f) No dark mode** in this step.

## Backup and restore (Phase 8, D31)

Rules: [.claude/rules/backup-restore.md](../.claude/rules/backup-restore.md). The format is new and versioned; old app backup files are not imported (no data migration).

**Modules.**

```ts
// src/lib/backup (pure: no I/O, no Supabase)
buildBackupFile(rows, exportedAt): BackupFile      backupSummary(rows)      pickBackupRows(rows)      sameSummary(a, b)
validateBackup(value) / parseBackupText(text, bytes): { ok: true, file } | { ok: false, problems }   MAX_RESTORE_BYTES = 10 MB
diffBackup(file, current): per table { new, changed, same, onlyCurrent }      rowsOnlyInCurrent(diff)
farmersCsv / usageCsv / paymentsCsv / monthsCsv(input, labels[, now]): { ok: true, text } | { ok: false }   csvCell, toCsv
backupReminder(lastIso, now): { kind: 'never' | 'ok' | 'old', days }   BACKUP_REMINDER_DAYS = 7   backupFileName, csvFileName
// src/lib/data/backupData.ts (I/O)
exportBackup(): { ok: true, file } | { ok: false, kind }          // paged reads of the three tables, every error checked
restoreBackup(file, mode): { ok: true, report } | { ok: false, kind: 'not_owner' | 'invalid_payload' | 'network' | 'constraint' | 'unknown' }
verifyRestore(file, mode): { ok: true, verification: { verified, counts, summary, diff } } | { ok: false, kind }
```

**Format.** `{ format: "tubewell-hisab-backup", version: 1, exported_at, counts, summary, farmers, usage_entries, payments }`: every row (soft-deleted included), every stored column except `total_minutes`; `summary` = the engine's All Time charges, cash, outstanding and credit (`buildDashboard`, view all).

**Database function** (migration 007): `public.restore_backup(p_payload jsonb, p_mode text) returns jsonb`. One call = one transaction. Merge upserts by id (parents first) and never deletes; Replace deletes payments, usage_entries, farmers, then inserts. The three audit triggers are disabled only inside the call, so every column of the file is kept (`deleted_at`, `deleted_by`, `created_*`, `updated_*`). Returns `{ mode, deleted, inserted, updated }` per table. Owner-only (42501), payload guard (22023). SQL checks T9.01–T9.23.

**Screen** (`src/pages/backup/`: `BackupPage.tsx`, `BackupSections.tsx`, `browser.ts`, `copy.ts`; route `/backup`):

| Element | Source | Leads to |
|---|---|---|
| Reminder | `backupReminder` of the stored last-backup time (this browser) | the JSON backup button; the Dashboard note links to `/backup` |
| JSON backup | `exportBackup` → `buildBackupFile`: counts per table | a downloaded `tubewell-backup-YYYY-MM-DD-HHMM.json`; the stored time |
| CSV buttons | Dashboard rows (All Time), live Pani entries, live payments, Months rows | four downloaded `.csv` files (not restorable) |
| Preview | the file's counts and `summary`; `diffBackup` against the hooks' rows | the Merge / Replace choice |
| Replace | `rowsOnlyInCurrent` (rows that will be lost) | safety backup (`exportBackup`) → typed `REPLACE` → `restoreBackup` |
| Report and check | the function report; `verifyRestore` (paged re-read, counts, engine totals) | "Verified" or the red numbers; the three lists reload |

**Decision D31** (manager design choices, 2026-10-06; the owner may revisit):
- **(a) Format** as above; later versions may add optional fields; `format` and `version` are checked first; old app files are rejected plainly.
- **(b) Validation** before any database call: first 10 problems with table and row; engine totals recomputed and compared with `summary`; 10 MB limit.
- **(c) Export** reads with the existing paging, checks every error, never shows "done" for a partial read, shows the counts and stores the time (try/catch).
- **(d) CSV**: four files, engine / data-layer figures, plain decimals, BOM, RFC 4180, formula neutralisation.
- **(e) Restore function** in one transaction; Merge never deletes; Replace deletes children before parents; exact counts returned.
- **(f) Preview**: file date, counts, the four separate totals, and new / changed / same / only-current per table.
- **(g) Replace safety**: red warning, safety backup first (abort if it fails), typed `REPLACE`; Merge needs one confirmation; no double submit.
- **(h) After restore**: report, paged re-read and verification, lists reload.
- **(i) Reminder**: never / ok / old (7 IST days); `caution` for old and never; one Dashboard note only for old or never.
- **(j) Screen order**: reminder and the not-encrypted warning, JSON backup, CSV, restore.

**Known limits.** One request per restore (10 MB); the reminder remembers only this browser / phone; files are not encrypted; Google Drive and automatic backups are parked. Verification of a Merge checks that every file row is present and equal (rows only in the database stay, so counts and totals may differ from the file).
