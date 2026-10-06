# Tubewell Manager — Project Status

> **Last Updated: 2026-10-06**
> **Current phase:** PR1 done (audit gap fixes, D32, pending owner review); Phase 9 (Verification) next
> **Branch:** `rebuild/fresh-system`, backed up on `origin`. It has tracked `origin/rebuild/fresh-system` since its first push, the last step of the Phase 1 closure on 2026-10-05. `main` = old v1 production, untouched at `46e3872`.

**Update policy.** Update this file:
- after each phase or task;
- after a failed task (record the attempt, the failure and the correction);
- after schema changes;
- when a major bug is found or fixed;
- when a decision changes.

Do not update it for trivial edits. Every entry carries an exact date (YYYY-MM-DD).

---

## Phase Plan

| # | Phase | Status |
|---|---|---|
| 0 | System understanding, rebuild branch, push gate | ✅ Done (2026-10-04, closed 2026-10-05) |
| 1 | Documentation foundation | ✅ Done (2026-10-05, including the closure with decisions D1–D8 and the first branch push) |
| 2A | Database schema in the NEW project: migrations 001–003 (tables, constraints, audit triggers, RLS), SQL tests, advisors | ✅ Done (2026-10-05), pending owner review |
| 2B | App foundation: v1 code removed, deps + Vitest, `.env` + config + typed client, single-user auth, routing, layout shell, migration 004 (RLS locked to the owner) | ✅ Done (2026-10-05), pending owner review |
| 3 | Ledger engine in `src/lib/ledger/` with tests (fixtures E1–E24) — **before any UI** | ✅ Done (2026-10-06), pending owner review |
| 3B | Repo sync check + docs fixes (spec E9/E19 rows, D19→D20 relabel) | ✅ Done (2026-10-06) |
| 4A | Data layer `src/lib/data/` + Farmers screen (Kisan) + migration 005 (farmer input checks) | ✅ Done (2026-10-06), pending owner review |
| 4B | Usage entry (Pani Entry) + Phase 4A carry-forwards (D23) + 3 additive engine helpers | ✅ Done (2026-10-06), pending owner review |
| 5 | Payments: live FIFO preview, duplicate warning, edit / soft-delete / restore (+ migration 006, D25) | ✅ Done (2026-10-06), pending owner review |
| 6 | Farmer profile (summary, month table, trail, ledger with running balance) | ✅ Done (2026-10-06), pending owner review |
| 6C | Semantic colours for the whole app (tokens, tone module, rules for future screens; D28) | ✅ Done (2026-10-06), pending owner review |
| 7A | Dashboard at `/` (period views, tiles, summary, month chart, farmers by baaki, recent activity, Band note; D29) + C-2 fresh dialog moment | ✅ Done (2026-10-06), pending owner review |
| 7B | Months screen at `/months` (year filter, strip, farmer-wise breakdown, deep link; D30) + Dashboard moment refresh | ✅ Done (2026-10-06), pending owner review |
| 8 | Backup / restore: JSON backup, CSV exports, Merge / Replace restore via migration 007, preview, verification, reminder (D31) | ✅ Done (2026-10-06), pending owner review |
| PR1 | Audit gap fixes: balances in Kisan and Pani, trails in the Paisa list, picker search, "Pura ₹X bharo", Band karo in the delete dialog, Pani time and Chalu count (D32) | ✅ Done (2026-10-06), pending owner review |
| 9 | Verification: independent script + edge-case matrix | ⬜ Not started (next) |
| 10 | Data wipe on owner approval (test rows in the NEW project only; D8), cutover to `main`, Netlify re-enable, final docs | ⬜ Not started |

## Next Action

1. Owner reviews Phase 2B (if not done yet). Run the app locally (`pnpm run dev`), log in, check the 6 tabs, log out, and confirm that a refresh keeps the session. Also review decisions D13–D16 below.
2. Owner reviews Phase 3: decisions D18/D20 and the Phase 3 notes in the 2026-10-06 session entry.
3. Owner smoke-tests Phase 6: open a farmer from the Kisan list (`pnpm run dev`). See the 2026-10-06 Phase 6 session entry.
4. Owner checks the Phase 6C colours by eye (Kisan, Pani, Paisa with preview, Kisan ka Hisaab) and confirms or revisits D28.
5. Owner smoke-tests the Dashboard (Phase 7A) with the worked numbers and confirms or revisits D29. See the 2026-10-06 Phase 7A session entry.
6. Owner smoke-tests the Months screen (Phase 7B) with the worked numbers and confirms or revisits D30.
7. Owner smoke-tests Backup / restore (Phase 8) with test data and confirms or revisits D31. See the 2026-10-06 Phase 8 session entry.
8. Owner smoke-tests the PR1 audit gap fixes (Kisan, Pani, Paisa, Dashboard, profile) with test data.
9. **Phase 9: Verification.** Prerequisites are in [tasks/todo.md](tasks/todo.md). The prompt will be written by the owner's assistant.

---

## Owner Manual Actions (Claude cannot do these)

| # | When | Action | Status |
|---|---|---|---|
| 1 | Before Phase 2B | In NEW Supabase project `tubewell-hisab`: add your email + password under Auth → Users, and **disable public sign-ups** | **Auth user: done.** 1 confirmed user, verified by count on 2026-10-05. **Sign-ups disabled: owner to confirm.** Claude may not read Auth settings. |
| 1b | Optional | Turn on leaked-password protection (Auth → Password security), if the plan offers it. The security advisor reports it as WARN since the Auth user exists. | Optional |
| 2 | Phase 10 | In the NEW Netlify account: set `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (D14), re-enable the site with **branch deploys OFF and deploy previews OFF** | Pending |
| 3 | After cutover | Delete the OLD Supabase project `tubewell-manager` (`vsgptyuvnistwjjmrfby`) in the dashboard | Pending |
| 4 | Optional | GitHub branch protection on `main` (extra layer on top of the push gate) | Optional |

## Open Questions (owner)

None blocking. The 8 questions from Phase 1 were answered on 2026-10-05 (Decisions Log, D1–D8).

Phase 2A and 2B raised notes for the owner's review, listed in their 2026-10-05 session entries. None of them blocks Phase 3.

Phase 3 raised spec gaps and engine choices for review (2026-10-06 session entry, D20). None blocks Phase 4.

## Known Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Accidental push to `main` deploys over production | Low | Push gate hook (only on this branch); Push Policy (only `rebuild/fresh-system`, only via the prompt's push step); optional branch protection |
| Session started on `main` has no push gate | Low | Session Start Protocol step 1 (stop if on `main`) |
| Calculation drift between screens | Medium | One engine, no page formulas, fixture tests E1–E24, Phase 9 verification |
| Timezone month errors | Medium | One IST function; E20 boundary fixtures |
| Silent row truncation (Supabase 1,000-row default) | Medium | Paginate every read in the data layer; Phase 9 >1,000-row test |
| Frequent pushes burn Netlify credits | Medium | Netlify disabled until Phase 10; only `rebuild/fresh-system` is pushed, once per completed task; branch deploys and previews OFF when the site is re-enabled |
| A pushed commit leaks a secret or real farmer data (the repo is PUBLIC) | Low | Secrets scan before every push; fictional data only in tests; public-repo rule in `CLAUDE.md` |
| A Supabase call hits the wrong project | Low | Always pass `project_id ciszgagzhfubuqhpmyeh`; never the old project or StreakForge (`CLAUDE.md`) |
| Old Supabase project auto-deleted after 90 days paused | Low | Only a fallback; no migration planned |

---

## Decisions Log

Numbering: D17 and D19 are workflow and prompt decisions kept in the project manager's folder (their results appear here as `previewPayment` and the two money-text helpers, see C10); D18 = engine conventions C1–C10; D20 = Phase 3 engine details.

### 2026-10-04 — Full fresh rebuild instead of patching v1
v1's month-by-hand allocation lost overpayment credit. In live data on 2026-10-04 there was ₹1,336.68 overpaid across 5 farmer-months, and the summed monthly dues (₹2,850) disagreed with the netted all-time dues (₹2,213.32). The rebuild is built around a continuous per-farmer ledger with automatic FIFO allocation.

### 2026-10-04 — Rebuild on `rebuild/fresh-system`; `main` untouched until cutover
`main` auto-deploys production. A push gate hook blocks pushes to `main` unless the owner sends the exact approval phrase. It was built on 2026-10-04, committed as `b91fe36` on 2026-10-05, and hardened in `bbe7911` on 2026-10-05.

### 2026-10-04 — NEW Supabase project
`tubewell-hisab` (`ciszgagzhfubuqhpmyeh`, ap-south-1, org `digital-store`). The OLD project `vsgptyuvnistwjjmrfby` is paused as a fallback.

### 2026-10-05 — Approval phrase accepts dash variants
The whole message must be `CUTOVER APPROVED — PUSH TO MAIN NOW`. Em dash, en dash or hyphen are accepted, and whitespace is normalized. A hook fidelity test confirmed that typed, pasted, em-dash and multi-line messages reach the hook unchanged.

### 2026-10-05 — Scope decisions
- **WhatsApp:** out of the rebuild.
- **Data migration:** none. Old data is wiped and re-entered by the owner after the new system is verified and approved.
- **Usage entries and payments:** soft-delete only.
- **Users:** a single user.
- **Month Close:** removed.
- **`for_month` and `payment_group_id`:** removed.
- **Old data wipe:** only at the end, on explicit owner approval.
- **Timezone:** Asia/Kolkata everywhere.
- **Phases:** 0–10 as in the table above.

### 2026-10-05 — Ledger rules L1–L18
Transcribed into [docs/LEDGER_AND_ALLOCATION.md](docs/LEDGER_AND_ALLOCATION.md) as the authoritative spec. Worked examples E1–E22 were verified by an independent script and will become the test fixtures. The owner's original Ramu example totals 17h45m = ₹1,775.00 (not 16h45m).

### 2026-10-05 — Netlify facts
The live site is `tubewellhisab.netlify.app` in the owner's NEW Netlify account. It is deliberately disabled. The old site ID `cfff021f-…` is stale. When the site is re-enabled in Phase 10: branch deploys OFF, previews OFF.

### 2026-10-05 — v1 docs archived
Archived to `archive/v1-2026-10/`. The v1 `CLAUDE.md` was renamed `CLAUDE.v1.md` so Claude Code never auto-loads it.

### 2026-10-05 — Decisions D1–D8 (answers to the Phase 1 open questions; proposed by the assistant under the owner's delegation, approved by the owner)
Recorded in [docs/LEDGER_AND_ALLOCATION.md](docs/LEDGER_AND_ALLOCATION.md) → "Decided".

- **D1 — Dashboard Monthly/Yearly.**
  - Charges created and cash received are counted by the IST timestamp within the period.
  - Outstanding and credit are the balance **as of the period end**. All Time = as of now.
  - The farmer profile and the Months table show current balances.
  - Totals are never netted across farmers.
  - May be revisited in Phase 7. (L11, E23, E24)
- **D2 — As-of view.** Uses each row's current state; there is no edit history (documented limitation). (L9)
- **D3 — Payment-only months.** A month with charge 0 and cash > 0 shows the badge "Sirf Payment".
- **D4 — Per-entry rounding confirmed.** A bucket sums the rounded entries (E6b = ₹50.01).
- **D5 — Allocation trail.** Shows plain (possibly future) month pieces; the unapplied remainder is labelled "Advance / Credit".
- **D6 — Rate precision.** Whole paise only, at most 2 decimals.
- **D7 — Money storage.** See [ARCHITECTURE](docs/ARCHITECTURE.md).
  - Integer paise as `bigint`: `rate_paise` on usage entries and `amount_paise` on payments.
  - `total_minutes` is a generated column.
  - The usage amount is not stored. Only the engine computes it, as `floor((2·total_minutes·rate_paise + 60) / 120)`, which was verified equal to L2.
- **D8 — Phase 10 wipe.** Deletes the test rows in the NEW project's tables (the schema and the owner's Auth user are kept) before the owner enters real data. The OLD project is deleted manually by the owner after cutover; Claude never queries, restores or wipes it.
- **Also decided:**
  - farmers keep both Disable and soft-Delete;
  - v1 backup files are not importable;
  - the duplicate-warning wording is decided in Phase 4/5.

### 2026-10-05 — Push policy
- `rebuild/fresh-system` is pushed to GitHub at the end of each completed task, via an explicit push step in the owner's prompt.
- Exactly `git push origin rebuild/fresh-system` (the first push used `-u`). Never `main`, never another branch, never force.
- Before every push: confirm the branch and scan for secrets. After every push: confirm with `git ls-remote --heads origin` that `main` is unchanged.
- Claude never brings up the cutover phrase on its own. It tells the owner the phrase only if the owner says they want to push to `main` or cut over.

Rules: `CLAUDE.md` → Deploy Safety.

### 2026-10-05 — GitHub repo is PUBLIC (owner accepted)
- The repo `abhayk2806-cpu/tubewell-manager` is public, and the owner accepted this.
- Never commit real farmer names, phone numbers, amounts, backup exports or secrets. Tests use fictional data. Rule: `CLAUDE.md`.

### 2026-10-05 — Decisions D9–D12 (Phase 2A database; proposed by the assistant under the owner's delegation)
Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Database schema.
- **D9 — Audit user columns.** `created_by`, `updated_by` and `deleted_by` are plain uuids with **no foreign keys**, so the trail survives user deletion.
- **D10 — Foreign keys.** Foreign keys to `farmers` use **ON DELETE RESTRICT**. There are no hard deletes by design.
- **D11 — RLS.**
  - Enabled on all three tables, with policies only for role `authenticated`.
  - SELECT, INSERT and UPDATE use `((select auth.uid()) is not null)`. There is **no DELETE policy**.
  - Hardening added in migration 003: `anon` has no table privileges, and `authenticated` has no DELETE or TRUNCATE.
  - Consequences:
    - the Phase 8 "Replace" restore must work without client-side DELETE (for example soft-delete everything then insert, or a controlled database function);
    - the Phase 10 test-data wipe is done with SQL by Claude Code, only on explicit owner approval.
- **D12 — Audit triggers.**
  - One trigger function, `public.set_audit_columns()` (`search_path = ''`, EXECUTE revoked), runs BEFORE INSERT OR UPDATE on all three tables.
  - `created_*` is set on insert and immutable afterwards. `updated_*` is always `now()` / `auth.uid()`.
  - `deleted_by` is trigger-only (set on soft delete, cleared on restore). `deleted_at` is forced NULL on insert.

### 2026-10-05 — Decisions D13–D16 (Phase 2B; proposed by the assistant under the owner's delegation)
- **D13 — RLS locked to the owner uid** (migration 004).
  - The 9 `*_owner` policies use `(select auth.uid()) = '<owner uid>'`. The uid is read from `auth.users` at apply time and never committed.
  - Still no DELETE policy. Any other signed-in uid sees 0 rows and cannot write.
  - Re-creating the owner's Auth user requires a new re-pointing migration.
- **D14 — Env names:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (modern `sb_publishable_` key). Validated by `src/lib/config.ts`.
- **D15 — v1 app code removed from the rebuild branch.** It stays on `main` and in git history, for reference only via `git show main:<path>`. No v1 code is copied into new files.
- **D16 — Test runner:** Vitest + jsdom + React Testing Library + jest-dom.

### 2026-10-06 — Decisions D18 and D20 (Phase 3 ledger engine)
Numbered as in the Phase 3 prompt; there is no D17. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Ledger engine.
- **D18 — Engine conventions C1–C10**, given in the Phase 3 prompt:
  - instants with a zone only;
  - IST only in `time.ts`;
  - inclusive `cutoffMs`;
  - deterministic ordering;
  - safe-integer paise;
  - row rules and the active-farmer definition;
  - month statuses;
  - total paid;
  - the cross-farmer months list;
  - two rupee text helpers.
- **D20 — Engine details where the spec and the prompt were silent** (proposed by the assistant, for owner review):
  - sub-millisecond truncation; seconds optional; instants limited to 1970–9999;
  - integrity throws (two farmers in one ledger, duplicate live ids, `null` `total_minutes`);
  - preview tie order; dashboard list sorted by farmer id;
  - validation code names.

### 2026-10-06 — D23 (Phase 4A review carry-forwards, owner approved)
- A farmer's mobile, when present, must contain at least one digit (app rule; the DB check is unchanged).
- When a change is saved but the reload after it fails, the list stays on screen with a short "saved, list not refreshed" line and a retry. It is never replaced by the error screen.
- `.claude/rules/database-and-migrations.md` brought up to date (migrations 001–005, 100 SQL checks).

### 2026-10-06 — D25 (Phase 4B review carry-forward, owner approved)
- The long-duration usage warning uses the TOTAL entry time: over 24 h 00 min warns (24 h 01 min and 24 h 30 min warn; exactly 24 h does not). An unchanged edit still does not warn again.
- `.claude/rules/database-and-migrations.md` updated for migration 006 and 111 SQL checks.

### 2026-10-06 — D28 semantic colours (Phase 6C; manager design choices, owner may revisit)
- One fixed tone per meaning: `water` (Pani and its charge), `cash` (money received, success), `due` (money owed), `credit` (Advance / Credit), `caution` (warnings, Partial, "saved, list not refreshed"), `info` (actions, links), `muted` (Band, Deleted, zero). Errors keep `destructive`.
- Restrained use (text, soft badge, thin bar or dot; white cards), labels always kept, contrast >= 4.5:1 tested.
- The Dashboard, Months screen and every chart or stat tile must use the same tones. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Semantic colours, and `.claude/rules/ui-color-semantics.md`.

### 2026-10-06 — D29 Dashboard (Phase 7A; manager design choices (a)–(m), owner may revisit)
- Default "Abhi tak"; Mahina / Saal with pickers; one explanation sentence; four separate tiles; summary line; 6-month charge-vs-cash chart that opens a month; farmers by baaki with search, profile links and shortcuts; recent activity; Band note; quick buttons; one bad-data message; Hinglish empty states; D28 colours; 360 px.
- Details and the "connected to what" table: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Dashboard.

### 2026-10-06 — D30 Months screen (Phase 7B; manager design choices (a)–(j), owner may revisit)
- Explanation block; "Saal" filter (default all years); strip with time, Charge and Cash Mila only; month cards newest first with the profile's words and tones; farmer-wise breakdown per month (Baaki first, profile links); `?month=` deep link, linked from the Dashboard's Mahina view.
- Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Months screen.

### 2026-10-06 — D32 Audit gap fixes (PR1; owner decision)
- Fix the requirements-audit gaps in one step: balances in the Kisan list and Pani section, Pani time and Chalu count on the Dashboard, total time on the profile, the allocation trail on each Paisa row, a farmer search in the Pani and Paisa pickers, "Pura ₹X bharo", "Band karo (delete nahi)" in the delete dialog, tests for the audited gaps.
- Not built (owner choice): different rows in the Pani / Paisa lists or CSVs (D24 h stays), grouping by farmer, global search, recovery % or pie, reports, "hide settled", per-entry badges, lazy routes (later), renaming "Baaki".
- Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Audit gap fixes.

### 2026-10-06 — D31 Backup and restore (Phase 8; manager design choices (a)–(j), owner may revisit)
- Versioned JSON backup of every row (soft-deleted included) with counts and the engine All Time summary; validation before any database call; Excel CSV exports (not restorable); Merge / Replace through the migration-007 function in one transaction; preview; Replace safety (safety backup first, typed REPLACE); verification; a per-browser reminder with one Dashboard note.
- Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Backup and restore.

---

## Session Log

### 2026-10-04 — Phase 0: system understanding
- Read-only audit of the v1 code, live DB and docs.
- Created `rebuild/fresh-system` from `main@46e3872`.
- Added the push gate (committed as `b91fe36` on 2026-10-05).

### 2026-10-05 — Phase 0 closure
- One repository copy confirmed (`C:\Users\Abhay Kumar\Documents\tubewell-manager`).
- Phrase matcher made dash-tolerant.
- Hook-input fidelity test passed; the diagnostic was removed.

### 2026-10-05 — Phase 1: documentation foundation
- **Guard hardening** (`bbe7911`): literal invisible/dash characters replaced with `\u` escapes. The byte scan is clean. Self-test 63/63; end-to-end 11/11 and 46/46.
- **v1 docs archived** (`8d604b6`).
- **New docs written:** `CLAUDE.md`, this file, `BUSINESS_KNOWLEDGE.md`, `README.md`, `tasks/todo.md`, `tasks/lessons.md`, `docs/ARCHITECTURE.md`, `docs/LEDGER_AND_ALLOCATION.md`, and 4 `.claude/rules` files.
- **Failed attempt:** none.

### 2026-10-05 — Phase 1 closure
- **Decisions:** D1–D8 recorded. New fixtures E23 (monthly views) and E24 (yearly views, IST year boundary), verified by an independent script. The D7 integer formula was checked equal to L2 for all E22 cases.
- **CLAUDE.md:**
  - Push Policy added;
  - cutover-phrase rule changed (never bring it up unprompted; tell the owner only when they ask to push to `main`);
  - marker-filename rule added;
  - the manual marker-cleanup command removed (the guard cleans up itself).
- **First push:** the last step of this closure was the first push, `git push -u origin rebuild/fresh-system`, after a secrets scan. `main` unchanged at `46e3872`.
- **Failed attempt:** none.

### 2026-10-05 — Phase 2A: database schema (NEW project `ciszgagzhfubuqhpmyeh`)
- **Migrations** `001_core_tables`, `002_audit_triggers`, `003_rls_policies` applied with the MCP and committed (`60e540a`). The stored SQL md5 equals the repo file md5 for all three.
- **Tests:** `supabase/tests/001_schema_checks.sql` (`65db277`). 68/68 checks PASS (T1–T5) inside one rolled-back transaction, and T6 found 0 rows left.
- **Advisors:**
  - Security: none.
  - Performance: INFO `unused_index` on the 4 new indexes. Expected with no data yet; not a blocker.
- **Repo vs live:** the live `public` schema contains exactly the objects from migrations 001–003.
- **Notes for owner review (none blocking):**
  1. `btrim()` trims spaces only, so a tab-only farmer name passes the DB check. The app form must trim all whitespace.
  2. The audit trigger always sets `created_at`/`created_by` and clears `deleted_*` on insert. So a Phase 8 restore through plain inserts cannot keep original timestamps or soft-deleted state; it will need a controlled database function (D11 consequence).
  3. Hardening went beyond the prompt: anon has no privileges, authenticated has no DELETE/TRUNCATE, and EXECUTE on the trigger function is revoked. All of this is tested in T5.
  4. Within one transaction `now()` is constant, so T3 proves "`updated_at` is set by the trigger" (client value ignored), not a different timestamp from `created_at`.
- **Failed attempt:** none.

### 2026-10-05 — Phase 2B: app foundation
- **Preconditions:** 1 Auth user, 1 confirmed. node v24.14.0, pnpm 11.1.3.
- **Code:**
  - v1 app code removed (61 files; D15). Kept: build config, `index.css`, `lib/utils.ts`, the favicon, and shadcn `button`/`card`/`input`/`label`.
  - Deps trimmed (react-hook-form, zod, date-fns, recharts, sonner and other unused v1 packages removed). Vitest stack added (D16).
  - `node_modules` repaired with a clean reinstall.
- **New:** `.env` (gitignored), `lib/config.ts`, typed `lib/supabase.ts`, generated `types/database.ts`, auth provider, route guards, layout shell with 6 tabs, placeholder pages, NotFound, ErrorBoundary, design tokens.
- **Quality gates:** typecheck, lint (0 warnings), 16 tests and build all green. `dist/` contains no `service_role`. The real key is in no tracked file.
- **Migration 004** (D13) applied; md5 identical to the repo file. SQL tests 80/80 PASS, 0 rows after.
- **Advisors:** new security WARN `auth_leaked_password_protection` (owner setting, see action 1b). Performance unchanged (`unused_index` INFO).
- **Notes for owner review:**
  1. "Sign-ups disabled" could not be verified, because this phase may not read Auth settings.
  2. `pnpm peers check` reports a false "unmet peer" for `tailwindcss-animate` (3.4.1 satisfies `>=3.0.0`).
  3. The JS bundle is ~463 kB (137 kB gzip), almost all supabase-js plus react-router. Fine for now.
- **Failed attempt:** none. The first `pnpm install` said "Already up to date" on a broken `node_modules` (known lesson); fixed by deleting `node_modules` and reinstalling.

### 2026-10-06 — Phase 3: ledger engine
- **Preconditions:**
  - branch `rebuild/fresh-system`, clean tree, HEAD = `origin/rebuild/fresh-system` = `ed0a3e6`; `main` = `origin/main` = `46e3872`;
  - spec md5 `898327d9a7767775034228ca308e866a` (unchanged in this phase).
- **Tests first:** all 11 new test files failed with "Cannot find module './index'" before any engine code existed.
- **Code** (engine commit `5bdd743`):
  - 13 engine files and 3 test-support files in `src/lib/ledger/`;
  - no dependency, config or lockfile changes.
- **Tests:** 14 files / 268 tests green: 16 from Phase 2B plus 252 for the engine.
  - E1–E24, one named test each.
  - D7 sweep: 1,484,640 cases, 0 mismatches.
  - 2,500 seeded scenarios checked against the invariants and the BigInt oracle, current and as-of.
  - Preview add/replace properties over 2,500 scenarios.
  - The suite also passes with `TZ=America/Los_Angeles` and `TZ=UTC`.
- **Mutation checks:**
  - adding `Date.now()` plus an outside import to `money.ts` failed 3 static-guard tests;
  - changing the rounding `+ 60` to `+ 59` failed 6 tests.
  - Both mutations were reverted.
- **Gates:** typecheck, lint (0 warnings), test and build all green, run twice.
- **Spec gaps for owner review** (the spec was NOT edited):
  1. `total_minutes` is typed `number | null` by the generator. The engine throws on `null` (C6, literally). The DB never stores null there.
  2. E9's table lists only 2026-06..08, but by L11 the payment-only 2026-09 row still exists. The test asserts both.
  3. E19's "Months" column for 2026-09-10 lists 05–08; the payment-only 09 row also exists. The test checks the charge months.
  4. L17 lists only Settled / Partial / Unpaid. C7 adds `settled` for a month whose entries all round to 0 paise (charge 0, cash 0).
  5. Preview with `cutoffMs`: the spec is silent. The prompt's rule (a candidate beyond the cutoff gets no pieces) is implemented.
- **Failed attempt:** none.
  - The `// @vitest-environment node` docblocks first added to the tests were removed, because Vitest 5 does not read them; engine tests run under jsdom.
  - Two first-run test failures were fixed before the commit: the new-candidate id check in `records.ts`, and a comment in `index.ts` that the static guard read as an import.

### 2026-10-06 — Phase 3B: repo sync check and docs fixes
- **Owner rule D21** (from this step on): every step ends with its own commit(s) and a push of `rebuild/fresh-system`. A step is complete only when `git ls-remote --heads origin` shows the branch tip equal to the local HEAD.
- **Sync result:**
  - before this step, local HEAD = `origin/rebuild/fresh-system` = `a530292`, clean tree, no stashes, no other local branch ahead;
  - all 12 recorded commits (Phase 0 `b91fe36` to Phase 3 `a530292`) are ancestors of the remote branch;
  - nothing was unpushed or uncommitted.
- **Spec amended** (docs only, owner approved): E9 gains the 2026-09 "Sirf Payment" row, and E19's 2026-09-10 Months cell reads `05–09 (09 = Sirf Payment)`. No number changed. This resolves Phase 3 spec gaps 2 and 3; gaps 1, 4 and 5 stay open for owner review.
- **Relabel:** the Phase 3 engine details are now D20 (were "D19"). See the numbering note in the Decisions Log.
- **Gates:** unchanged behaviour; typecheck, lint, test and build green.
- **Failed attempt:** none.

### 2026-10-06 — Phase 4A: data layer, Farmers screen, migration 005
- **Preconditions:**
  - HEAD = origin = `a37f592`; `main` = `46e3872`; spec md5 `47b5d688…`;
  - migrations 001–004 only; `farmers` had 0 rows; only SELECT/INSERT/UPDATE policies for `authenticated`; trigger `farmers_set_audit` exists.
  - Audit trigger (002): created_*/updated_* are forced by the trigger, `deleted_at` is NOT set by it (the client sends it), and `deleted_by` is set on soft delete and cleared on restore.
- **Migration 005** (`005_farmers_input_checks.sql`, applied to `ciszgagzhfubuqhpmyeh`):
  - `farmers_name_not_blank` is redefined (same name) to trim space, tab, LF, VT, FF, CR and NBSP;
  - new length checks: name ≤100, mobile ≤20, notes ≤500 (NULL allowed);
  - stored md5 = file md5 `a0e4593f…`.
- **SQL tests:** 100/100 PASS (80 before plus T7.01–T7.20), and the residue check found 0 rows. Advisors: no new findings. Generated types unchanged (CHECK constraints do not appear in them).
- **Code:**
  - `src/lib/data/`: errors, paging, clock, farmerRules, farmers, barrel;
  - `src/hooks/useFarmers.ts`;
  - `src/pages/farmers/`: page, form dialog, list item, copy;
  - shadcn-style `dialog` and `alert-dialog`;
  - `/farmers` wired through an optional `page` on the feature route (2-line change in `App.tsx`).
- **Dependencies:** `@radix-ui/react-dialog` ^1.1.23 and `@radix-ui/react-alert-dialog` ^1.1.23. pnpm 11's one-day minimum release age skipped react-dialog 1.2.0 (published 2026-10-05).
- **Tests:** 21 files / 367 tests (before: 14 / 268).
- **Gates:** typecheck, lint, test and build green. The build warns that the single JS chunk is 525 kB (over Vite's 500 kB hint). Not an error.
- **Notes for owner review:**
  1. Mobile accepts digits, spaces, `+` and `-` (≤20), even without a digit; tell us if it should require one.
  2. Editing a farmer without changing the name does not warn again about an already-known duplicate.
  3. `.claude/rules/database-and-migrations.md` still says "Live: 001–004" and "80 checks". It was not in this phase's allowed files, so it was not updated.
- **Failed attempt:** none.
  - The first hook version failed lint (`react-hooks/set-state-in-effect`); fixed by setting state only in promise callbacks.
  - One page test failed because Radix hides the page behind a modal; fixed in the test with `hidden: true`.

### 2026-10-06 — Phase 4B: Pani Entry screen
- **Preconditions:**
  - HEAD = origin = `3efd260`; `main` = `46e3872`; spec md5 `47b5d688…`; migrations 001–005;
  - `usage_entries` and `payments` 0 rows; `farmers` 2 rows (owner's smoke test);
  - `usage_entries`: SELECT/INSERT/UPDATE policies for `authenticated`, trigger `usage_entries_set_audit`.
- **Part 0 (D23):**
  - a present mobile must contain a digit;
  - a failed reload after a saved change keeps the list and shows "Save ho gaya, par list refresh nahi ho payi." with a retry (shared `useRowStore`);
  - `.claude/rules/database-and-migrations.md` now says 001–005 / 100 checks.
- **Engine (additive only):** `istWallClockToIso`, `istTimeKey`, `formatRupees`, plus barrel exports and 2 new test files. Existing engine code paths, tests and the static guard are unchanged and green.
- **Code:**
  - `src/lib/data/usageRules.ts`, `usage.ts`, `rows.ts`, `currentIstMoment` in `clock.ts`;
  - `src/hooks/useRowStore.ts`, `useUsage.ts`;
  - `src/pages/usage/` (page, form dialog, list item, copy);
  - `/usage` wired in `routes.ts`.
- **Database:** no migration. `usage_entries` still 0 rows. No dependency added.
- **Tests:** 28 files / 489 tests (before: 21 / 367).
- **Gates:** typecheck, lint, test and build green. The JS chunk is 549 kB (Vite's 500 kB warning, as in 4A).
- **Notes for owner review:**
  1. `long_duration` warns only when hours > 24 (so 24h30 does not warn), as worded in the prompt.
  2. `describeUsageWarnings` takes an extra `original` option, so an unchanged edit does not warn again.
  3. Month names in the filter come from a label table in the copy module ("Oct 2026").
- **Failed attempt:** none.

### 2026-10-06 — Phase 5: Paisa (payments) screen
- **Preconditions:**
  - HEAD = origin = `44a4596`; `main` = `46e3872`; spec md5 `47b5d688…`; migrations 001–005; `payments` 0 rows; `payments` policies SELECT/INSERT/UPDATE for `authenticated`; trigger `payments_set_audit`.
  - **Deviation:** `usage_entries` had 2 rows (not 0) from the owner's 4B smoke test. Claude stopped and reported it. The owner then deleted everything in the app, which is a soft delete: 2 usage rows and 3 farmer rows remain with `deleted_at` set.
  - On the owner's "please complete your task" the work continued, with the end check "row counts unchanged": farmers 3, usage_entries 2, payments 0.
- **Part 0 (D25):** long-duration warning on total time (boundaries 23h59 no, 24h00 no, 24h01 yes, 25h00 yes); rules file updated.
- **Migration 006** (`006_payments_note_check.sql`): `payments_note_max_length` (note NULL or ≤200 characters). Stored md5 = file md5 `5e63e96c…`.
- **SQL tests:** 111/111 PASS (100 before, plus the T0.01 row-count baseline and T8.01–T8.10).
  - T6.01 (residue) now prints counts that must equal T0.01; both printed farmers=3 usage_entries=2 payments=0. The old T6 assumed empty tables.
  - Advisors: no new findings. Generated types unchanged (a CHECK constraint does not appear in them).
- **Code:**
  - `src/lib/data/`: `paymentRules.ts`, `payments.ts`, `timeline.ts`;
  - `src/hooks/usePayments.ts`;
  - `src/pages/payments/` (page, form dialog, preview panel, list item, copy);
  - `src/pages/shared/monthLabel.ts`;
  - `/payments` wired.
  - No engine change; no dependency added.
- **Tests:** 33 files / 571 tests (before: 28 / 489). Worked numbers (a), (b), (c) are covered in `paymentRules.test.ts` and `PaymentsPage.test.tsx`.
- **Gates:** typecheck, lint, test and build green. The JS chunk is 576 kB (the 500 kB warning, as before).
- **Notes for owner review:**
  1. Payment code `amount_too_large` (listed in the prompt) cannot happen for payments: the engine produces it only for usage, and an amount too large for a safe integer is already refused by `parseRupeesToPaise` (`amount_invalid`).
  2. If the usage rows fail to load, the preview shows a message and Save stays allowed. Only a bad-data preview (`ok: false`) disables Save.
  3. Test rows from the smoke tests stay in the live database (soft-deleted) until the Phase 10 wipe (D8).
- **Failed attempt:** one lint error (`prefer-const` in a test) fixed before commit.

### 2026-10-06 — Phase 6: Kisan ka Hisaab (farmer profile)
- **Preconditions:** HEAD = origin = `d40c703`; `main` = `46e3872`; spec md5 `47b5d688…`; migrations 001–006. Baseline row counts: farmers 3, usage_entries 3, payments 3 (owner's smoke-test rows); unchanged at the end.
- **Part 0 (C-1):** removed the unused copy key `PAYMENTS_COPY.preview.noPieces`.
- **Code:**
  - `src/lib/data/profileRules.ts`: `buildFarmerProfile`, `findProfileFarmer`, `toProfileBalance`, `visiblePart`, `nextShownCount`, `PROFILE_PAGE_SIZE` = 30.
  - The profile screen (`FarmerProfilePage.tsx`, `ProfileSections.tsx`, `profileCopy.ts`) wired at `/farmers/:id`; Kisan list rows link to it.
  - An optional `initialFarmerId` prop on `UsageFormDialog` and `PaymentFormDialog`.
  - No engine change, migration or dependency.
- **Decision D27** (manager design choices (a)–(g), owner may revisit): see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Farmer profile.
- **Tests:** 37 files / 610 tests (before: 33 / 571). Gates green. The JS chunk is 590 kB (the 500 kB warning, as before).
- **Notes for owner review:**
  1. Month cards label FIFO-settled charge "Charge Clear" and payments dated in the month "Cash Mila (is mahine)" (L10 wording from the UI-copy rules).
  2. Ledger lines show "Pani entry: ₹x" / "Paisa mila: ₹x" with the running balance; the duration is shown in the Pani entries section, not on ledger lines.
- **Failed attempt:** none. Adding the list link required wrapping the Kisan list tests in a router (expected).

### 2026-10-06 — Phase 6C: semantic colours
- **Preconditions:** HEAD = origin = `0bf6403`; `main` = `46e3872`; spec md5 `47b5d688…`; migrations 001–006. **Deviation:** row counts at the start were farmers 3, usage_entries 4, payments 5 (not the 3/3/3 given in the prompt; most likely the owner's Phase 6 smoke test). This step makes no DB writes, so 3/4/5 was used as the baseline; unchanged at the end.
- **Code:** colour tokens in `src/index.css` and `tailwind.config.js` (`tone-*`), `src/components/tone.ts` with tests, and class-level changes to the Kisan, Pani, Paisa (incl. preview) and Kisan ka Hisaab screens. No copy, logic, engine, data-layer, hook, route or DB change; no dependency.
- **Decision D28:** see the Decisions Log and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Semantic colours. New rules file `.claude/rules/ui-color-semantics.md` for future screens.
- **Tests:** 38 files / 658 tests (before: 37 / 610). No existing test changed. Gates green; JS chunk 593 kB (the 500 kB warning, as before).
- **Not verified:** a real-browser look at 360 px (the screens sit behind the owner's login). The owner checks by eye.
- **Fix 1 (2026-10-06, review finding):** `--muted-foreground` darkened to `220 8.9% 41%` (was 4.08:1 on the grey badge and 4.44:1 on the page; now 4.91 and 5.35). The contrast test covers the muted and info tones too. 38 files / 660 tests.
- **Failed attempt:** Vitest returns an empty string for `.css` modules even with `?raw`, so the contrast test reads `src/index.css` from disk (config changes were out of scope).

### 2026-10-06 — Phase 7A: Dashboard
- **Preconditions:** HEAD = origin = `8312ada`; `main` = `46e3872`; spec md5 `47b5d688…`; migrations 001–006. Row counts at the start: farmers 3, usage_entries 4, payments 6; unchanged at the end.
- **Part 0 (C-2):** the Pani / Paisa dialogs on the profile, Pani Entry and Paisa pages (and the new Dashboard) take a fresh IST moment when opened, not the page-load moment.
- **Code:** `src/lib/data/dashboardRules.ts` (`buildDashboardScreen` and helpers; wraps `buildDashboard` and `buildAllFarmersMonths`, no second algorithm), the Dashboard screen in `src/pages/dashboard/` wired at `/`. No engine change, migration or dependency.
- **Decision D29:** see the Decisions Log and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Dashboard.
- **Tests:** 40 files / 724 tests (before: 38 / 660). Gates green. JS chunk 615 kB (the 500 kB warning, as before).
- **Notes for owner review:**
  1. The Band note follows the selected period (balances at its end), like the totals; bad data in a Band farmer's rows also stops the whole dashboard.
  2. Search matches the name only (the Kisan screen also matches mobile).
  3. Chart bars use an inline height style (a size, not a colour).
- **Not verified:** a real-browser look at 360 px (behind the owner's login).
- **Failed attempt:** none.

### 2026-10-06 — Phase 7B: Months screen
- **Preconditions:** HEAD = origin = `ac49345`; `main` = `46e3872`; spec md5 `47b5d688…`; migrations 001–006. Row counts at the start: farmers 7, usage_entries 6, payments 9 (the owner's own test rows); unchanged at the end.
- **Part 0:** the Dashboard refreshes its IST moment on `visibilitychange` (visible) and when a period button is pressed. In the Mahina view it links to `/months?month=<month>`.
- **Code:** `src/lib/data/monthsRules.ts` (wraps `buildAllFarmersMonths` and per-farmer `buildFarmerProfile`; strip via `sumPaise`), the Months screen in `src/pages/months/` wired at `/months`. No engine change, migration or dependency.
- **Decision D30:** see the Decisions Log and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Months screen.
- **Tests:** 42 files / 766 tests (before: 40 / 724). Gates green. JS chunk 627 kB (the 500 kB warning, as before).
- **Not verified:** a real-browser look at 360 px (behind the owner's login).
- **Failed attempt:** none.

### 2026-10-06 — Phase 8: Backup / restore
- **Preconditions:** HEAD = origin = `da8a58d`; `main` = `46e3872`; spec md5 `47b5d688…`; migrations 001–006; policies SELECT / INSERT / UPDATE for the owner only, no DELETE policy, no DELETE / TRUNCATE for `authenticated`; the three audit triggers enabled; 1 Auth user. Row counts at the start: farmers 7, usage_entries 6, payments 9; unchanged at the end.
- **Migration 007** (`007_restore_backup_function.sql`): `public.restore_backup(jsonb, text)`. Every column of the file is kept (audit triggers off only inside the call, on again after; a failed call rolls everything back). Stored md5 = file md5 `afef0a30…`.
- **SQL tests:** 134/134 PASS (111 before, plus T9.01–T9.23). Section B equals the T0.01 baseline.
- **Advisors:** one NEW finding, expected: "authenticated can execute a SECURITY DEFINER function" for `restore_backup` (justified: owner check inside, no table grants changed). Existing: leaked-password protection off, three unused indexes.
- **Code:** pure `src/lib/backup/` (format, validation, diff, CSV, reminder), `src/lib/data/backupData.ts` (export, restore, verify), the Backup screen at `/backup`, one Dashboard note. Generated types regenerated (the function). No engine change, no dependency.
- **Decision D31:** see the Decisions Log and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Backup and restore.
- **Tests:** 45 files / 839 tests (before: 42 / 766). Gates green. JS chunk 657 kB (the 500 kB warning, as before).
- **Not verified:** a real-browser look at 360 px (behind the owner's login) and a live round trip through the app (the function itself is proven by the rolled-back SQL tests).
- **Failed attempts:** (1) the Write tool turned `\u00a0` / `\ufeff` escapes into real characters (lint caught the NBSP; files re-escaped). (2) One commit (`7c01354`) went in with a test type error because a piped `tail` hid the exit code; fixed in `f866141`.

### 2026-10-06 — PR1: audit gap fixes
- **Preconditions:** HEAD = origin = `0212272`; `main` = `46e3872`; spec md5 `47b5d688…`; migrations 001–007. Row counts at the start: farmers 7, usage_entries 6, payments 9; unchanged at the end. Baseline gates: 45 files / 839 tests.
- **Code:** `src/lib/data/balanceRules.ts` (`buildFarmerBalances`, `buildPaymentTrails`), additive `time` / `activeFarmerCount` on the Dashboard screen and `time` on the profile, `splitMinutes` shared from `timeline.ts`; screen changes in Kisan, Pani, Paisa, Dashboard and profile. No engine, hook, migration or dependency change; `.gitignore` ignores `.claude/launch.json`.
- **Decision D32:** see the Decisions Log and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → Audit gap fixes.
- **Tests:** 46 files / 875 tests (before: 45 / 839). Gates green. JS chunk 666 kB (the 500 kB warning, as before).
- **Changed expectations (by design):** the Kisan list test no longer asserts "no money"; the Paisa picker options carry the position; a payment row shows its amount twice (amount and trail).
- **Not verified:** a real-browser look at 360 px (behind the owner's login).
- **Failed attempt:** none.

---

## Known Local Issues

- `netlify.toml` builds with `npm run build` while the repo uses pnpm. Review in Phase 10.
