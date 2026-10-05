# Tubewell Manager — Checklist

> **Last Updated: 2026-10-05**
> Mirrors the phase table in [PROJECT_STATUS.md](../PROJECT_STATUS.md). Details, decisions and owner actions live there, not here.

## Phases

- [x] **0** — System understanding, rebuild branch, push gate (2026-10-04, closed 2026-10-05)
- [x] **1** — Documentation foundation (done 2026-10-05)
  - [x] Guard escapes hardened
  - [x] v1 docs archived
  - [x] New context docs, ledger spec, architecture, `.claude/rules`
  - [x] Owner decisions D1–D8 recorded; push policy added
  - [x] First push of `rebuild/fresh-system` to `origin` (branch now backed up)
- [ ] **2** — New Supabase schema + project foundation ← **next**
  - [ ] Owner action #1: auth user + sign-ups off
  - [ ] `pnpm install`, `.env` for the NEW project
  - [ ] Migrations from 001, committed to the repo
- [ ] **3** — Ledger engine + tests (fixtures E1–E24), before any UI
- [ ] **4** — Farmers + Pani Entry
- [ ] **5** — Payments: live FIFO preview, duplicate warning, edit / soft-delete / restore
- [ ] **6** — Farmer profile
- [ ] **7** — Dashboard + months
- [ ] **8** — Backup / restore
- [ ] **9** — Verification: independent script + edge-case matrix
- [ ] **10** — Data wipe (on owner approval), cutover, Netlify re-enable, final docs

## Parked — not in scope unless the owner asks

- Google Drive backup
- Farmer statement share
- Due-threshold alerts
- Rate tiers (per farmer or per period)
- Automated backups to external storage
- WhatsApp notifications (dropped from the rebuild on 2026-10-05)
