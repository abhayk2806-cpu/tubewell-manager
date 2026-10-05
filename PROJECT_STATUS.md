# Tubewell Manager — Project Status

> **Last Updated: 2026-10-05**
> **Current phase:** 2B done (app foundation, pending owner review); Phase 3 next
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
| 3 | Ledger engine in `src/lib/ledger/` with tests (fixtures E1–E24) — **before any UI** | ⬜ Not started (next) |
| 4 | Farmers + usage entry (Pani Entry) | ⬜ Not started |
| 5 | Payments: live FIFO preview, duplicate warning, edit / soft-delete / restore | ⬜ Not started |
| 6 | Farmer profile (summary, month table, trail, ledger with running balance) | ⬜ Not started |
| 7 | Dashboard + months view | ⬜ Not started |
| 8 | Backup / restore | ⬜ Not started |
| 9 | Verification: independent script + edge-case matrix | ⬜ Not started |
| 10 | Data wipe on owner approval (test rows in the NEW project only; D8), cutover to `main`, Netlify re-enable, final docs | ⬜ Not started |

## Next Action

1. Owner reviews Phase 2B. Run the app locally (`pnpm run dev`), log in, check the 6 tabs, log out, and confirm that a refresh keeps the session. Also review decisions D13–D16 below.
2. **Phase 3: ledger engine with tests** (fixtures E1–E24), before any UI. The prompt will be written by the owner's assistant.

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

---

## Known Local Issues

- `netlify.toml` builds with `npm run build` while the repo uses pnpm. Review in Phase 10.
