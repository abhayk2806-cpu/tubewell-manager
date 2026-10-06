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
  - [x] Engine in `src/lib/ledger/` (D18/D19); fixtures E1–E24, D7 sweep, invariants + oracle, static guard
  - [ ] Owner: review D19 and the 5 spec gaps (`PROJECT_STATUS.md`, 2026-10-06 entry)
- [ ] **4** — Farmers + Pani Entry ← **next**
  - [ ] Data layer `src/lib/data/`: page every read past 1,000 rows, check every `error`, map rows to the engine input types unchanged, filter with `isActiveFarmer`.
  - [ ] Pani Entry form: build `used_at` as ISO with `+05:30` from the typed IST wall clock, parse the rate with `parseRupeesToPaise`, call `validateUsageInput`, and warn with `findDuplicateUsage`.
  - [ ] Hinglish messages for the `ValidationCode` values and the duplicate warning wording (L14).
  - [ ] Show money with `paiseToDecimalString` (add "₹" and grouping in the UI only); handle `LedgerInputError` as an error state.
  - [ ] The farmer name form must trim ALL whitespace (the DB `btrim` check trims spaces only). Consider a migration tightening `farmers_name_not_blank`.
- [ ] **5** — Payments: live FIFO preview, duplicate warning, edit / soft-delete / restore
- [ ] **6** — Farmer profile
- [ ] **7** — Dashboard + months
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
