# Tubewell Manager — Project Status

> **Last Updated: 2026-10-05**
> **Current phase:** 1 done; 2 next (not started)
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
| 1 | Documentation foundation | ✅ Done (2026-10-05, including the closure with owner decisions D1–D8 and the first branch push) |
| 2 | New Supabase schema + project foundation (`.env`, `pnpm install`, migrations from 001, RLS, auth user) | ⬜ Not started (next) |
| 3 | Ledger engine in `src/lib/ledger/` with tests (fixtures E1–E24) — **before any UI** | ⬜ Not started |
| 4 | Farmers + usage entry (Pani Entry) | ⬜ Not started |
| 5 | Payments: live FIFO preview, duplicate warning, edit / soft-delete / restore | ⬜ Not started |
| 6 | Farmer profile (summary, month table, trail, ledger with running balance) | ⬜ Not started |
| 7 | Dashboard + months view | ⬜ Not started |
| 8 | Backup / restore | ⬜ Not started |
| 9 | Verification: independent script + edge-case matrix | ⬜ Not started |
| 10 | Data wipe on owner approval (test rows in the NEW project only; D8), cutover to `main`, Netlify re-enable, final docs | ⬜ Not started |

## Next Action

**Phase 2: Supabase schema + project foundation.** The prompt will be written by the owner's assistant. It starts with Owner Manual Action #1.

---

## Owner Manual Actions (Claude cannot do these)

| # | When | Action | Status |
|---|---|---|---|
| 1 | Phase 2 | In NEW Supabase project `tubewell-hisab`: add your email + password under Auth → Users, and **disable public sign-ups** | Pending |
| 2 | Phase 10 | In the NEW Netlify account: set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, re-enable the site with **branch deploys OFF and deploy previews OFF** | Pending |
| 3 | After cutover | Delete the OLD Supabase project `tubewell-manager` (`vsgptyuvnistwjjmrfby`) in the dashboard | Pending |
| 4 | Optional | GitHub branch protection on `main` (extra layer on top of the push gate) | Optional |

## Open Questions (owner)

None open. The 8 questions from Phase 1 were answered on 2026-10-05; see the Decisions Log (D1–D8).

## Known Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Accidental push to `main` deploys over production | Low | Push gate hook (only on this branch); Push Policy (only `rebuild/fresh-system`, only via the prompt's push step); optional branch protection |
| Session started on `main` has no push gate | Low | Session Start Protocol step 1 (stop if on `main`) |
| Calculation drift between screens | Medium | One engine, no page formulas, fixture tests E1–E24, Phase 9 verification |
| Timezone month errors | Medium | One IST function; E20 boundary fixtures |
| Silent row truncation (Supabase 1,000-row default) | Medium | Paginate every read in the data layer; Phase 9 >1,000-row test |
| Frequent pushes burn Netlify credits | Medium | Netlify disabled until Phase 10; only `rebuild/fresh-system` is pushed, once per completed task; branch deploys and previews OFF when the site is re-enabled |
| A pushed commit leaks a secret | Low | Secrets scan before every push (Push Policy in `CLAUDE.md`) |
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

### 2026-10-05 — Owner decisions D1–D8 (answers to the Phase 1 open questions)
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

---

## Known Local Issues

- No `.env` file exists locally (created in Phase 2 for the NEW project).
- Local `node_modules` is broken: `tsc` is missing. Run `pnpm install` in Phase 2.
- `netlify.toml` builds with `npm run build` while the repo uses pnpm. Review in Phase 10.
