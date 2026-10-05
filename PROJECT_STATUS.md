# Tubewell Manager — Project Status

> **Last Updated: 2026-10-05**
> **Current phase:** 1 — Documentation foundation (in progress)
> **Branch:** `rebuild/fresh-system` (local only, no upstream). `main` = old v1 production, untouched.

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
| 1 | Documentation foundation | 🔄 In progress (2026-10-05) |
| 2 | New Supabase schema + project foundation (`.env`, `pnpm install`, migrations from 001, RLS, auth user) | ⬜ Not started |
| 3 | Ledger engine in `src/lib/ledger/` with tests (fixtures E1–E22) — **before any UI** | ⬜ Not started |
| 4 | Farmers + usage entry (Pani Entry) | ⬜ Not started |
| 5 | Payments: live FIFO preview, duplicate warning, edit / soft-delete / restore | ⬜ Not started |
| 6 | Farmer profile (summary, month table, trail, ledger with running balance) | ⬜ Not started |
| 7 | Dashboard + months view | ⬜ Not started |
| 8 | Backup / restore | ⬜ Not started |
| 9 | Verification: independent script + edge-case matrix | ⬜ Not started |
| 10 | Data wipe on owner approval, cutover to `main`, Netlify re-enable, final docs | ⬜ Not started (wipe scope **PENDING OWNER DECISION**, see Open Questions) |

## Next Action

Owner reviews the Phase 1 docs and answers the Open Questions. Then Phase 2 begins with the owner's manual action #1.

---

## Owner Manual Actions (Claude cannot do these)

| # | When | Action | Status |
|---|---|---|---|
| 1 | Phase 2 | In NEW Supabase project `tubewell-hisab`: add your email + password under Auth → Users, and **disable public sign-ups** | Pending |
| 2 | Phase 10 | In the NEW Netlify account: set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, re-enable the site with **branch deploys OFF and deploy previews OFF** | Pending |
| 3 | After cutover | Delete the OLD Supabase project `tubewell-manager` (`vsgptyuvnistwjjmrfby`) in the dashboard | Pending |
| 4 | Optional | GitHub branch protection on `main` (extra layer on top of the push gate) | Optional |

## Open Questions (owner)

1. **Monthly/Yearly dashboard.** Do "outstanding" and "credit" in these views mean: the balance as of the period end, the current balance, or that period's buckets only? → [ledger spec](docs/LEDGER_AND_ALLOCATION.md) L11.
2. **As-of view.** For rows edited or soft-deleted after the as-of date, should the current row state be used? → L9.
3. **Status label for a charge-0 (payment-only) month.**
4. **Per-entry rounding.** Confirm that a bucket is the sum of individually rounded entries (three 10-min entries = ₹50.01; E6b).
5. **Trail presentation.** When a payment predates the usage it covers: plain future-month pieces, or an "advance, later used for <month>" label?
6. **Rate precision.** Is the rate limited to 2 decimal places?
7. **DB money type.** `bigint` paise vs `numeric(12,2)`; per-entry `amount` / `total_minutes` stored (generated columns) vs computed in the engine only. → [ARCHITECTURE](docs/ARCHITECTURE.md).
8. **Phase 10 "data wipe".** What exactly is wiped: test data in the NEW project before you re-enter real data, the OLD project, or both?

## Known Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Accidental push to `main` deploys over production | Low | Push gate hook (only on this branch); never push unless asked; optional branch protection |
| Session started on `main` has no push gate | Low | Session Start Protocol step 1 (stop if on `main`) |
| Calculation drift between screens | Medium | One engine, no page formulas, fixture tests E1–E22, Phase 9 verification |
| Timezone month errors | Medium | One IST function; E20 boundary fixtures |
| Silent row truncation (Supabase 1,000-row default) | Medium | Paginate every read in the data layer; Phase 9 >1,000-row test |
| Frequent pushes burn Netlify credits | Medium | Netlify disabled until Phase 10; no pushes during rebuild |
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

---

## Session Log

### 2026-10-04 — Phase 0: system understanding
- Read-only audit of the v1 code, live DB and docs.
- Created `rebuild/fresh-system` from `main@46e3872`.
- Added the push gate (`b91fe36`).

### 2026-10-05 — Phase 0 closure
- One repository copy confirmed (`C:\Users\Abhay Kumar\Documents\tubewell-manager`).
- Phrase matcher made dash-tolerant.
- Hook-input fidelity test passed; the diagnostic was removed.

### 2026-10-05 — Phase 1: documentation foundation
- **Guard hardening** (`bbe7911`): literal invisible/dash characters replaced with `\u` escapes. The byte scan is clean. Self-test 63/63; end-to-end 11/11 and 46/46.
- **v1 docs archived** (`8d604b6`).
- **New docs written:** `CLAUDE.md`, this file, `BUSINESS_KNOWLEDGE.md`, `README.md`, `tasks/todo.md`, `tasks/lessons.md`, `docs/ARCHITECTURE.md`, `docs/LEDGER_AND_ALLOCATION.md`, and 4 `.claude/rules` files.
- **Failed attempt:** none.

---

## Known Local Issues

- No `.env` file exists locally (created in Phase 2 for the NEW project).
- Local `node_modules` is broken: `tsc` is missing. Run `pnpm install` in Phase 2.
- `netlify.toml` builds with `npm run build` while the repo uses pnpm. Review in Phase 10.
