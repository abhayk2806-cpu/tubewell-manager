# Tubewell Manager — Checklist

> **Last Updated: 2026-10-06**
> Mirrors the phase table in [PROJECT_STATUS.md](../PROJECT_STATUS.md). Details, decisions and owner actions live there, not here.

## Phases

- [x] **0** — System understanding, rebuild branch, push gate (2026-10-04, closed 2026-10-05)
- [x] **1** — Documentation foundation (done 2026-10-05)
  - [x] Guard escapes hardened
  - [x] v1 docs archived
  - [x] New context docs, ledger spec, architecture, `.claude/rules`
  - [x] Owner decisions D1–D8 recorded; push policy added
  - [x] First push of `rebuild/fresh-system` to `origin` (branch now backed up)
- [x] **2A** — Database schema: migrations 001–003, SQL tests, advisors (done 2026-10-05; pending owner review)
- [x] **2B** — App foundation (done 2026-10-05; pending owner review)
  - [x] Owner action #1: Auth user exists (verified). Sign-ups off: owner to confirm.
  - [x] v1 code removed, deps + Vitest, `.env`, typed client, generated types, auth, routing, shell, migration 004
- [x] **3** — Ledger engine + tests (done 2026-10-06; pending owner review)
  - [x] Engine in `src/lib/ledger/` (D18/D20); fixtures E1–E24, D7 sweep, invariants + oracle, static guard
  - [ ] Owner: review D20 and the open spec gaps 1, 4 and 5 (`PROJECT_STATUS.md`, 2026-10-06 entry; gaps 2 and 3 resolved in 3B)
- [x] **3B** — Repo sync check (all pushed), spec E9/E19 payment-only rows, D19→D20 relabel (done 2026-10-06)
- [x] **4A** — Data layer + Farmers screen (Kisan) + migration 005 (done 2026-10-06; pending owner review)
  - [x] Data layer `src/lib/data/`: pages every read until empty, checks every `error`, rows unchanged, classification via `isActiveFarmer`
  - [x] Farmer name trims ALL whitespace in the app, and migration 005 tightens `farmers_name_not_blank` the same way
  - [ ] Owner: smoke-test the Kisan screen; review the 4A notes (`PROJECT_STATUS.md`, 2026-10-06 Phase 4A entry)
  - [x] Update `.claude/rules/database-and-migrations.md` (done in 4B)
- [x] **4B** — Pani Entry (done 2026-10-06; pending owner review)
  - [x] Part 0 (D23): mobile needs a digit; saved-but-not-refreshed keeps the list; rules file updated
  - [x] Engine helpers `istWallClockToIso`, `istTimeKey`, `formatRupees` (additive)
  - [x] Usage rules + data layer, `useUsage`, Pani Entry screen (filters, live amount, warnings, delete/restore)
  - [ ] Owner: smoke-test the Pani tab; review the 4B notes (`PROJECT_STATUS.md`, 2026-10-06 Phase 4B entry)
- [x] **5** — Payments (done 2026-10-06; pending owner review)
  - [x] Part 0 (D25): long-duration warning on total entry time
  - [x] Migration 006 (payment note ≤200) + SQL tests 111/111 with a row-count baseline
  - [x] Payment rules (live FIFO preview via the engine), payments data layer, `usePayments`, Paisa screen
  - [ ] Owner: smoke-test the Paisa tab with the worked numbers; review the Phase 5 notes (`PROJECT_STATUS.md`)
- [x] **6** — Farmer profile, Kisan ka Hisaab (done 2026-10-06; pending owner review)
  - [x] Profile rules (one `buildFarmerLedger` call), screen at `/farmers/:id`, list link, shortcut dialogs (`initialFarmerId`), D27
  - [ ] Owner: smoke-test a profile with the worked numbers; review D27 (a)–(g)
- [x] **6C** — Semantic colours (done 2026-10-06; pending owner review)
  - [x] Tone tokens + `src/components/tone.ts` (contrast and colour static guard tests), applied to Kisan, Pani, Paisa and Kisan ka Hisaab; rules file `.claude/rules/ui-color-semantics.md` (D28)
  - [ ] Owner: check the colours by eye; confirm or revisit D28
- [x] **7A** — Dashboard (done 2026-10-06; pending owner review)
  - [x] Part 0 (C-2): dialogs take a fresh IST moment when opened (profile, Pani, Paisa, Dashboard)
  - [x] `dashboardRules.ts` (`buildDashboardScreen`, no second algorithm) and the Dashboard at `/` (D29)
  - [ ] Owner: smoke-test the Dashboard with the worked numbers; confirm or revisit D29
- [x] **7B** — Months screen (done 2026-10-06; pending owner review)
  - [x] Part 0: Dashboard moment refresh; Dashboard Mahina link to `/months?month=`
  - [x] `monthsRules.ts` and the Months screen at `/months` (D30)
  - [ ] Owner: smoke-test the Months screen with the worked numbers; confirm or revisit D30
  - [x] Route `/months` (the Dashboard chart's "Saare mahine" link already points there) and the bottom-nav "Mahine" tab.
  - [x] Months screen from `buildAllFarmersMonths` (current figures): status per month incl. "Sirf Payment"; "Cash Mila" and "Charge Clear" never mixed (L10).
  - [x] Months rows over ACTIVE farmers only; per-farmer links to Kisan ka Hisaab (`/farmers/:id`); money via `formatRupees`, months via `src/pages/shared/monthLabel.ts`; no arithmetic in the UI.
  - [x] Colours only from `src/components/tone.ts` (D28): charges `water`, cash received `cash`, outstanding `due`, credit `credit`, in every tile, chart series and legend; month status via `MONTH_STATUS_TONE`.
- [x] **8** — Backup / restore (done 2026-10-06; pending owner review)
  - [x] Migration 007 `restore_backup` (keeps every column incl. `deleted_at` and audit columns) + SQL T9 (134/134)
  - [x] `src/lib/backup/` pure modules, `backupData.ts` I/O, Backup screen at `/backup`, Dashboard note (D31)
  - [ ] Owner: smoke-test export, Merge, Replace (test data only) and the CSV files in Excel; confirm or revisit D31
- [x] **PR1** — Audit gap fixes (done 2026-10-06; pending owner review)
  - [x] `balanceRules.ts` (balances, trails), Dashboard and profile Pani time, tests for the audited gaps (date move, 2,500-row paging)
  - [x] Kisan balances + Band karo in the delete dialog; Pani form and strip; Paisa trails, picker positions, search, "Pura ₹X bharo"; Dashboard time and Chalu tiles; profile total time (D32)
  - [ ] Owner: smoke-test with test data
  - [x] Later polish (not in PR1): lazy routes for a smaller bundle (done in PL1)
- [x] **9** — Verification (done 2026-10-07; 0 mismatches)
  - [x] Independent oracle (`src/lib/verification/oracle.ts`) vs engine, data layer and every screen function over 320 seeded scenarios and E1–E24
  - [x] Edge-case matrix with test names: [docs/VERIFICATION.md](../docs/VERIFICATION.md)
  - [x] Cross-section consistency, scale (3,000 / 1,500 rows), three device timezones, backup round trip, live read-only cross-check
- [x] **PL1** — Polish (done 2026-10-07; pending owner smoke test)
  - [x] Lazy-loaded routes: one chunk per page, shared "Load ho raha hai..." fallback, chunk-error message with "Dobara try karo"
  - [x] `/months?month=YYYY-MM` scrolls that month into view once (reduced motion, no focus move, invalid month ignored)
  - [ ] Owner: smoke-test tabs, refresh on a deep URL, the Dashboard Mahina link, airplane mode → an unvisited tab
- [ ] **10** — Data wipe (on owner approval), cutover, Netlify re-enable, final docs ← **next**

## Parked — not in scope unless the owner asks

- Google Drive backup
- Farmer statement share
- Due-threshold alerts
- Rate tiers (per farmer or per period)
- Automated backups to external storage
- WhatsApp notifications (dropped from the rebuild on 2026-10-05)
