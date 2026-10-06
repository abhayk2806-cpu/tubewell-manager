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
- [ ] **7** — Dashboard + months ← **next**
  - [ ] Dashboard data from the engine's `buildDashboard({ farmers, usage, payments }, view)` with views All Time / month / year (D1, L11): charges created and cash received by IST timestamp in the period; outstanding and credit as of the period end; All Time = now.
  - [ ] Cross-farmer figures over ACTIVE farmers only (`isActiveFarmer`); Σ outstanding and Σ credit always separate, never netted (E18).
  - [ ] Months screen from `buildAllFarmersMonths` (current figures): status per month incl. "Sirf Payment"; "Cash Mila" and "Charge Clear" never mixed (L10).
  - [ ] Per-farmer rows link to Kisan ka Hisaab (`/farmers/:id`); money via `formatRupees`, months via `src/pages/shared/monthLabel.ts`; no arithmetic in the UI.
- [ ] **8** — Backup / restore
  - [ ] Restore needs a controlled DB function: the audit trigger forces `created_*` and clears `deleted_*` on insert.
- [ ] **9** — Verification: independent script + edge-case matrix
- [ ] **10** — Data wipe (on owner approval), cutover, Netlify re-enable, final docs

## Parked — not in scope unless the owner asks

- Google Drive backup
- Farmer statement share
- Due-threshold alerts
- Rate tiers (per farmer or per period)
- Automated backups to external storage
- WhatsApp notifications (dropped from the rebuild on 2026-10-05)
