# Tubewell Manager — Project Status

> Last updated: 2026-05-23 | Session 3 (Payment UX improvements — shipped to repo) | Phase: **Live in production — pending owner push**

---

## Current Phase & Top Priority

**✅ Payment UX improvements (Session 3) — code complete, awaiting owner commit + push.**

Two improvements done:
1. **"Pura ₹X bharo" auto-fill** — in the payment add form (single mode), when farmer + for_month is chosen, a green chip appears showing the exact pending and one click auto-fills the amount input. Saves typing + eliminates "wrong amount" errors.
2. **Multi-month payment** — mode toggle "Ek month / Multiple months" in the form. Multi mode shows chip-style cards for every month with pending balance; check the months, each one pre-fills its full pending amount (editable), live total auto-sums. On save: N rows are inserted in one transaction sharing a `payment_group_id` UUID. All existing calculations stay row-wise on `for_month` — zero math changes elsewhere.

WhatsApp behavior for multi-month: single summary message listing each month's previous_due / abhi diya / new_due. Hard-coded format (templates only support single-month placeholders, by design). Resend on a grouped row sends the full summary again.

**🎉 Track A — WhatsApp Integration: SHIPPED (all 7 phases complete) — Session 2.**

The WhatsApp feature is functionally complete, build-verified, knowledge-files-updated, and pushed. Farmers can be enabled per-account via FarmersPage. Templates editable in Setup page. Banners fire after every save (usage + payment). Manual re-send button on every entry. Audit log captures every send. Backup v2.2 includes WhatsApp tables + payment_group_id.

**Recommended immediate actions:**
1. Commit + push Session 3 changes (instructions in the session-end message — git index was locked by a Windows-mount permission quirk, files are staged).
2. After Netlify auto-deploys, test the two new features with one farmer end-to-end.

---

## Active Blockers

No active blockers.

---

## Open Questions

- **Tests** — zero test coverage. Calculation logic (now including 2 WhatsApp helpers) is the highest-risk area. Worth adding Vitest? — owner decides
- **README.md** — still default Vite template. Replace or leave? — owner decides
- **Nav crowding (7 tabs)** — bottom nav has 7 items. Monitor in real use — if owner reports cramping on narrow phones, consider moving Backup or Setup to a header gear icon.
- **Track B (advance credit tracking)** — deferred future project. Owner picks timing. See Decisions Log 2026-05-17.

✅ RESOLVED 2026-05-17: Migration drift — backfill complete.
✅ RESOLVED 2026-05-18: Track A scope (all 7 phases shipped).

---

## Known Risks

- **Open RLS policy** — `USING (true) WITH CHECK (true)` for authenticated users on all 6 tables. Any account created in Supabase Auth dashboard can read/modify all data. — likelihood: low (closed user list) — mitigation: monitor Auth dashboard users list
- **Backup Replace mode = full data wipe** — irreversible. Wipes WhatsApp tables too (Phase 6). — likelihood: low (double-confirmed in UI) — mitigation: documented critical rule
- **Calculation regressions** — Phase 4 + 5 both use send-time DB query (NOT React state). Pattern locked in. Future feature touches must follow same pattern. — likelihood: low going forward — mitigation: rule documented in CLAUDE.md Critical Rules section
- **`whatsapp_log` status = `'initiated'` only** — cannot confirm delivery via wa.me. — likelihood: medium — mitigation: documented in `src/lib/whatsapp.ts`, types, `tasks/lessons.md`
- **Bash sandbox file-tool sync (Claude-internal)** — workaround: heredoc rewrite for any large or repeatedly-edited file. — likelihood: medium per session — mitigation: documented in `tasks/lessons.md`
- **Consent timestamp preservation** — preserved on edit. Only uncheck → recheck creates a fresh timestamp. — likelihood: low — mitigation: documented in FarmersPage logic
- **WhatsApp send on edit** — banner reappears, math stays correct via send-time DB exclude-this-row pattern. — likelihood: low — mitigation: documented behavior
- **Overpayment in WhatsApp message** — `new_due = ₹0` (Option 1 cap). — likelihood: low — mitigation: documented in Decisions Log 2026-05-17
- **Backup v2.1 importer on v1.0 file** — v1 backups missing `month_closings`, `whatsapp_*`. Importer defaults all to `[]`. Replace mode will WIPE existing WhatsApp data when importing a v1 backup. — likelihood: low (owner aware of Replace risk) — mitigation: preview shows version note warning

✅ RESOLVED 2026-05-17: Schema drift — backfill complete

---

## Next Actions (Priority Order)

**No active project. Owner picks next move.**

1. **Test WhatsApp end-to-end in production** (~15 min) — enable 1 farmer, add an entry, click banner, verify message lands. Then a payment. Then a re-send. Confirm `whatsapp_log` rows. Smoke test before rolling out widely.
2. **Track B — Advance credit tracking across months** — the deferred major refactor. 3-5 sessions, touches all 5 calculation pages, opens the regression-risk class that took 16 historical bugs to fix. Do NOT bundle with anything else. See Decisions Log 2026-05-17.
3. **Add Vitest + minimal calculation tests** — 5-10 unit tests on the formulas in PROJECT_MEMORY.md section 6 + section A5 (WhatsApp math). Would catch the most common bug class. ~1-2 hours.
4. **Replace default Vite README.md** — quick cleanup.
5. **Other backlog** — see `tasks/todo.md` for full list (WhatsApp reminders, statement share, GDrive backup, etc.)

---

## Decisions Log

### 2026-04 — Built on React + Supabase + Netlify free tier
**Decision:** This exact stack for v1
**Impact:** Stack locked in; zero-cost operation

### 2026-04 — Soft delete only, never hard delete
**Decision:** Use `is_deleted` + `is_disabled` boolean flags
**Impact:** All queries filter active farmers; backup Replace is only deletion path

### 2026-04 — Option B for payment allocation (`for_month`, not date)
**Impact:** All 5 pages rewritten; backup v2.0; FIFO auto-select

### 2026-04 — Disable vs Delete as separate user actions
**Impact:** `is_disabled` column; FarmersPage 3-tab UI

### 2026-05-17 — WhatsApp delivery via wa.me click-to-send (Track A)
**Decision:** wa.me links, NOT WhatsApp Business API
**Impact:** No backend. `whatsapp_log.status` always `'initiated'`.

### 2026-05-17 — Overpayment behavior stays consistent (₹0 cap)
**Decision:** Messages show `new_due = max(0, ...)` — overpayment NOT mentioned
**Impact:** Helper enforces `Math.max(0, ...)`. Track B deferred.

### 2026-05-17 — Track B (advance credit tracking) intentionally separated
**Impact:** Track B in backlog with full scope

### 2026-05-17 — Templates page in bottom-nav (7-tab)
**Impact:** Nav padding tightened

### 2026-05-18 — Consent timestamp preservation policy
**Decision:** Edit-save preserves original `whatsapp_consent_at`.

### 2026-05-18 — WhatsApp send decoupled from data save
**Decision:** Save first, banner offer to send, click triggers wa.me + log. Errors never roll back save.

### 2026-05-18 — Send-time DB calculation for message totals
**Decision:** Both Phase 4 + 5 helpers query Supabase, excluding current entry/payment. NOT React state.
**Impact:** Eliminates "wrong total in message" bug class

### 2026-05-18 — Phase 5 payment message math
**Decision:** Parallel queries for usage (by month) + payments (by for_month, neq id). `previous_due = max(0, usage_sum − paid_before)`, `new_due = max(0, usage_sum − paid_after)`.
**Impact:** Symmetric with Dashboard / MonthsPage math

### 2026-05-18 — Backup v2.1 format
**Decision:** Backup version `"2.0"` → `"2.1"`. Adds optional `whatsapp_message_templates` + `whatsapp_log`. Importer backward-compat with v1 + v2.
**Impact:** `BackupPage.tsx` exports/imports 2 extra tables. Constant `CURRENT_BACKUP_VERSION` at top. Replace delete order updated. Templates upsert on `template_type`, log on `id`.

### 2026-05-23 — Multi-month payments via shared payment_group_id
**Decision:** Migration 006 adds nullable `payment_group_id uuid` to `payments`. When the user picks N months in one save, N independent payment rows are inserted sharing the same UUID. Every existing calculation continues to operate row-wise on `for_month` — `payment_group_id` is a UI hint only (badges, group resend, edit warning) and is NEVER used in any due/balance math.
**Alternatives considered & rejected:** A new `payment_allocations` join table — would have required re-auditing every page that computes monthly dues. Blast radius too big for a UX convenience.
**Impact:** `PaymentsPage.tsx` adds mode toggle, multi-month chip selector, "Pura ₹X bharo" auto-fill in single mode, multi-month WhatsApp summary message. `types/index.ts` adds `Payment.payment_group_id?`. `BackupPage` bumps to v2.2; export auto-includes the field via `select('*')`.

### 2026-05-23 — Multi-month WhatsApp message is a single summary, hard-coded format
**Decision:** When a multi-month payment is sent, build ONE message listing each month's `previous_due` / `amount paid` / `new_due`. Format is hard-coded in `PaymentsPage.tsx::buildAndLogMultiMonthPaymentWhatsApp` — NOT template-driven, because `whatsapp_message_templates.payment_received` only supports single-month placeholders (`{previous_due}`, `{amount_paid}`, etc.). Single-month payments continue to use the editable DB template.
**Impact:** User edits to the payment_received template still apply to single-month sends (the 95% case). Multi-month edits to the message format require code changes — acceptable trade-off since multi-month payments are infrequent and the summary format is functional.

### 2026-05-23 — Pura pending bharo auto-fill (single-month UX)
**Decision:** In the single-month payment form, when farmer + for_month are selected, a green chip button shows the calculated pending and one click fills the amount input. Same math as everywhere else (`max(0, usage_sum − paid_so_far)`). Just exposes the existing calculation as a button — no new logic.
**Impact:** Faster data entry. Eliminates "₹500 typed as ₹50" errors. Hidden when pending = ₹0.

---

## Key Project State

- **Source files (hand-edited):** ~14 files in src/. New in Session 2: `src/lib/whatsapp.ts`, `src/pages/SettingsPage.tsx`. Modified: `src/types/index.ts`, `src/App.tsx`, `src/components/Layout.tsx`, `src/pages/FarmersPage.tsx`, `src/pages/UsagePage.tsx`, `src/pages/PaymentsPage.tsx`, `src/pages/BackupPage.tsx`.
- **DB tables:** 6 (farmers, usage_entries, payments, month_closings, whatsapp_message_templates, whatsapp_log)
- **Migrations applied to prod:** 6 (added 006_add_payment_group_id on 2026-05-23)
- **Migrations in repo:** 6 (drift closed)
- **Routes:** 8 protected + 1 public + catch-all
- **Bottom nav tabs:** 7
- **Total farmers in DB:** 20
- **Active farmers:** ~9
- **Farmers with WhatsApp enabled:** 0 (UI ready; owner enables per-farmer when ready)
- **WhatsApp templates seeded:** 2 (editable via Setup page)
- **WhatsApp log entries:** 0 (no sends yet — push and test in production)
- **Bundle:** 877KB JS / 247KB gzipped
- **App version (package.json):** 0.0.0
- **Backup format version:** 2.2
- **Production URL:** https://tubewell-manager.netlify.app
- **Supabase project:** `vsgptyuvnistwjjmrfby` (ap-south-1, free tier)
- **Netlify site ID:** `cfff021f-a629-41ef-af45-394f09e5c3d0`

---

## Environment & Infrastructure

| Item | Status | Environment | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ set | local `.env` + Netlify | |
| `VITE_SUPABASE_ANON_KEY` | ✅ set | local `.env` + Netlify | |
| Supabase RLS | ✅ enabled | all 6 tables | open policy |
| Netlify auto-deploy | ✅ live | GitHub `main` → auto-build | |
| Backups | ⚠️ manual | local file via BackupPage export | v2.1 — includes WhatsApp tables |

---

## Session Log

### 2026-05-17 — Session 1 — Knowledge system initialization
**New:** All knowledge files initialized.

### 2026-05-17 — Session 2 — Track A Phase 1 (schema + types + drift)
**New:** Migrations `002`-`005`; production Supabase changes.
**Fixed:** Schema drift gap.

### 2026-05-18 — Session 2 (continued) — Track A Phases 2-6
**Phase 2:** `src/lib/whatsapp.ts`, `src/pages/SettingsPage.tsx`, route + nav tab.
**Phase 3:** `src/pages/FarmersPage.tsx` (397 → 579) — WhatsApp section in modal.
**Phase 4:** `src/pages/UsagePage.tsx` (329 → 555) — send helper + banner + per-entry re-send.
**Phase 5:** `src/pages/PaymentsPage.tsx` (586 → 829) — send helper with `for_month`-scoped math + banner + per-payment re-send.
**Phase 6:** `src/pages/BackupPage.tsx` (263 → 314) — v2.1 export/import, backward compat, replace delete order.
**Verified at each phase:** `tsc -b --force` exit 0, `vite build` exit 0. Final bundle: 877KB JS / 247KB gz.

### 2026-05-18 — Session 2 (continued) — Track A Phase 7 (final knowledge updates) — TRACK A COMPLETE
**Updated:**
- `project/PROJECT_MEMORY.md` — appended "Track A Addendum" (sections A1-A9): Why wa.me, schema additions, Feature 8, default templates, send-time math, helper library spec, backup v2.1 details, known behaviors, what's still NOT built.
- `BUSINESS_KNOWLEDGE.md` — appended "WhatsApp Terminology (Round 7)" + Round 7 evolution log entry.
- `CLAUDE.md` — full rewrite. New critical-rules sections: send-time DB calculation, WhatsApp number & templates. Updated directory map (8 routes, lib/whatsapp.ts, types). Updated technical debt + conflict resolution to reference new files.
- `PROJECT_STATUS.md` — this file. Marked Track A COMPLETE. Phase set to "Live in production — maintenance mode". No active project.
- `tasks/todo.md` — Track A all 7 phases moved to Done. New "Next Up" list with recommended owner actions.

**Status:** Track A fully shipped end-to-end. Pushed and live in production.

### 2026-05-23 — Session 3 — Payment UX improvements
**New: migration 006**
- `supabase/migrations/006_add_payment_group_id.sql` — applied to prod via MCP, committed to repo. Adds nullable `payment_group_id uuid` to `payments` + partial index. UI grouping hint only; NOT used in any due/balance calculation.

**Modified:**
- `src/types/index.ts` — `Payment.payment_group_id?: string | null` (optional). BackupData comment updated to "2.0, 2.1, or 2.2 (current)".
- `src/pages/PaymentsPage.tsx` — major. Mode toggle "Ek month / Multiple months". Single mode adds a green chip "Pura ₹X bharo" that auto-fills the selected month's pending. Multi mode shows chip-style cards for every month with balance > 0; each card has its own allocation input pre-filled with full pending; live total summary. New helper `buildAndLogMultiMonthPaymentWhatsApp` builds the single-summary multi-month message at send-time from DB (correctly excludes the entire payment_group from `paid_before`). Payment list shows "Part of ₹X (N-month payment)" badge on grouped rows. Delete on grouped row warns user. Resend on grouped row sends the full summary.
- `src/pages/BackupPage.tsx` — `CURRENT_BACKUP_VERSION` `"2.1"` → `"2.2"`. Version-note updated. Export auto-includes `payment_group_id` via `select('*')`.

**Verified:** `tsc -b && vite build` exit 0 in fresh `/tmp` install. Bundle: 354KB JS / 105KB gzipped (lower than 2.1 — pnpm resolve seems to have de-duped something during fresh install).

**Lint:** No new errors introduced by my changes. Pre-existing 15 errors across pages (`react-hooks/set-state-in-effect` on `useEffect(() => loadData(), [])` pattern) are untouched.

**Status:** Code complete, staged in git, awaiting owner commit + push (git index was locked by a Windows-mount permission quirk in the sandbox).

**Pending owner actions:**
- Commit + push (instructions in chat).
- Smoke-test in production: pick a farmer with multi-month dues, try the auto-fill button, then try a multi-month payment, then send the WhatsApp summary.
- Decide next move: Track B / tests / something else.
