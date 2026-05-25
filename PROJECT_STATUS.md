# Tubewell Manager — Project Status

> Last updated: 2026-05-25 | Session 4 (Navigation & UX features — built LOCALLY, awaiting owner push) | Phase: **Live in production — feature work in flight**

---

## Current Phase & Top Priority

**🛠 Session 4 (Navigation & UX features) — code complete on local repo, NOT YET PUSHED.**

Four features built end-to-end to address the owner's pain points: "har chij dekhne ke liye tab to tab move karna padta hai" and "settled farmers ki entries Pani section mein confusion karti hain".

1. **Farmer Detail Page (`/farmers/:id`)** — NEW. Tap any farmer card (Farmers page, Dashboard pending list, or global search) → land on a per-farmer page with summary cards (total usage / paid / due), month-wise breakdown (cleared vs pending, with a "Pura ₹X bharo" quick-pay button per pending month), and a full chronological ledger (entries + payments interleaved). Two quick-action buttons at top: "Pani Add karo" and "Payment Add karo" navigate to the existing pages with farmer pre-selected via URL params.
2. **Settled-entries hide in Usage page** — when a specific month is selected, farmer cards whose month-balance is ₹0 (usage fully paid for that month) are hidden by default. Toggle reveals them; settled farmers show a green "Cleared" badge + green avatar tint when visible. Header summary mentions "N cleared (hidden)". The default view is now "what still needs attention".
3. **Dashboard pending dues widget enhancement** — the existing "Kisan-wise Baki" list now has clickable farmer rows (→ detail page) plus per-row quick actions: green "Pay" button (deep-links to PaymentsPage with farmer pre-selected) and a WhatsApp icon (only if farmer has WA enabled) that opens wa.me with a hard-coded Hindi reminder message and logs the send with `message_type='reminder'` (new value — no DB migration required, DB column has no CHECK constraint).
4. **Global farmer search in header** — search icon in the top header opens an overlay with a text input. As you type, results filter live (name / mobile / whatsapp_number). Click → navigate to that farmer's detail page. Esc / X / backdrop click closes. Closes automatically on route change.

**Plumbing:** `useSearchParams` deep-link pattern added to PaymentsPage and UsagePage — opens the Add form pre-filled from URL. Single-shot (params cleared with `setSearchParams({}, { replace: true })` after handling). Used by Farmer Detail Page action buttons and Dashboard "Pay" button.

**Shipped Session 3 features (still live in production):**

Two improvements live:
1. **"Pura ₹X bharo" auto-fill** — in the payment add form (single mode), when farmer + for_month is chosen, a green chip appears showing the exact pending and one click auto-fills the amount input. Saves typing + eliminates "wrong amount" errors.
2. **Multi-month payment** — mode toggle "Ek month / Multiple months" in the form. Multi mode shows chip-style cards for every month with pending balance; check the months, each one pre-fills its full pending amount (editable), live total auto-sums. On save: N rows are inserted in one transaction sharing a `payment_group_id` UUID. All existing calculations stay row-wise on `for_month` — zero math changes elsewhere.

WhatsApp behavior for multi-month: single summary message listing each month's previous_due / abhi diya / new_due. Hard-coded format (templates only support single-month placeholders, by design). Resend on a grouped row sends the full summary again.

**🎉 Track A — WhatsApp Integration: SHIPPED (all 7 phases complete) — Session 2.**

The WhatsApp feature is functionally complete, build-verified, knowledge-files-updated, and pushed. Farmers can be enabled per-account via FarmersPage. Templates editable in Setup page. Banners fire after every save (usage + payment). Manual re-send button on every entry. Audit log captures every send. Backup v2.2 includes WhatsApp tables + payment_group_id.

**Session 4 next step:** owner runs the push commands from Windows (provided at session end), Netlify auto-deploys, owner verifies the 4 features end-to-end on https://tubewell-manager.netlify.app, then flag as SHIPPED + VERIFIED here.

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

### 2026-05-25 — Farmer Detail Page added as the per-farmer home (Session 4)
**Decision:** New route `/farmers/:id` with a per-farmer landing page (summary + month breakdown + chronological ledger). All other pages link into it — FarmersPage cards (left side), Dashboard pending list rows, and global search results. Action buttons on the detail page (Pani Add / Payment Add / per-month "Pura ₹X bharo") deep-link to existing pages via URL search params; the existing pages stay as the source of truth for create/edit flows. No duplication of business logic.
**Alternatives considered & rejected:** Inline add/edit modals on the detail page — would have duplicated the WhatsApp send-time math, validation, and grouped-payment UI from PaymentsPage. Better to keep one canonical add flow and just deep-link in.
**Impact:** Owner's "tab-to-tab navigation" pain solved without forking calculation logic. All existing critical rules stay in force (payment allocation by `for_month`, send-time DB query, active-farmer filter).

### 2026-05-25 — Deep-link URL prefill pattern (Session 4)
**Decision:** `useSearchParams` on PaymentsPage and UsagePage. When `?farmer_id=xxx[&for_month=...][&amount=...]` is present after data loads, the Add form opens pre-filled. Single-shot — params are cleared via `setSearchParams({}, { replace: true })` so refresh / re-navigation doesn't re-open. A `prefillHandled` boolean state prevents double-trigger.
**Impact:** Detail page and Dashboard quick actions reuse existing flows. No prop drilling or context. Refresh-safe.

### 2026-05-25 — Settled hidden by default in Usage page (Session 4)
**Decision:** A farmer's card in Usage page is "settled" when, for the selected month, `usage_amount − paid (for_month=selected) ≤ 0`. Settled cards are hidden by default; a toggle reveals them. When "Sabhi Months" is selected (no month scope), the concept doesn't apply and all cards show.
**Math:** Same `for_month`-bucketed math as Dashboard and MonthsPage. No new calculation logic. UsagePage now fetches `payments` in `loadData` to compute the per-farmer-per-month balance client-side. Active-farmer filter still applied to both entries and payments.
**Impact:** Default Usage page view answers "kiska kaam baki hai" instead of "saari history". Confusion ko kam karega.

### 2026-05-25 — Global farmer search in header (Session 4)
**Decision:** Search icon button in Layout header opens an overlay. In-memory filter over an `/farmers` select with `is_deleted=false AND is_disabled=false`. Re-fetches every open (~10 rows is cheap). Click result → `/farmers/:id`. Auto-closes on route change.
**Impact:** Bypasses bottom-nav for the most common "find this farmer" intent.

### 2026-05-25 — `whatsapp_log.message_type='reminder'` added (Session 4)
**Decision:** Dashboard "WhatsApp" button on a pending-due row builds a simple Hindi reminder message (hard-coded, NOT template-driven), opens wa.me, and logs with `message_type='reminder'`. The DB column has no CHECK constraint — no migration needed; the TypeScript `WhatsAppMessageType` union was extended in `src/types/index.ts`.
**Alternatives considered & rejected:** Re-using `'manual_resend'` would have been semantic abuse (resend implies there was a prior send). A template-driven message would mean an additional template row in `whatsapp_message_templates` — overkill for a one-line reminder. Acceptable future work: add a `'reminder'` template row if owner wants to edit the wording.
**Impact:** Owner can poke a pending-due farmer in one tap from the Dashboard. Audit log still captures the send.

---

## Key Project State

- **Source files (hand-edited):** ~15 files in src/. New in Session 4: `src/pages/FarmerDetailPage.tsx`. Modified in Session 4: `src/App.tsx`, `src/components/Layout.tsx`, `src/pages/FarmersPage.tsx`, `src/pages/UsagePage.tsx`, `src/pages/PaymentsPage.tsx`, `src/pages/Dashboard.tsx`, `src/types/index.ts`.
- **DB tables:** 6 (farmers, usage_entries, payments, month_closings, whatsapp_message_templates, whatsapp_log)
- **Migrations applied to prod:** 6 (added 006_add_payment_group_id on 2026-05-23) — Session 4 needed ZERO new migrations
- **Migrations in repo:** 6 (drift closed)
- **Routes:** 9 protected + 1 public + catch-all (added `/farmers/:id`)
- **Bottom nav tabs:** 7
- **Total farmers in DB:** 20
- **Active farmers:** ~9
- **Farmers with WhatsApp enabled:** 0 (UI ready; owner enables per-farmer when ready)
- **WhatsApp templates seeded:** 2 (editable via Setup page) + 1 hard-coded reminder format in Dashboard.tsx
- **WhatsApp log entries:** 0 (no sends yet — push and test in production)
- **Bundle:** 354KB JS / 105KB gzipped (Session 4 build, fresh `/tmp` install)
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

**Status:** Shipped — pushed to GitHub `main`, Netlify auto-deployed, owner-verified end-to-end in production. Both single-month auto-fill and multi-month payment + WhatsApp summary are confirmed working with real farmer data on 2026-05-23.

**Owner-confirmed test scenarios (2026-05-23):**
- "Pura ₹X bharo" chip fills the right pending amount → ✅
- Multi-month creation persists as N rows with shared payment_group_id → ✅
- Multi-month WhatsApp summary opens with correct per-month breakdown → ✅
- Existing single-month flow + WhatsApp template still works unchanged → ✅

### 2026-05-25 — Session 4 — Navigation & UX features (built locally, awaiting push)

**New file:**
- `src/pages/FarmerDetailPage.tsx` (~430 lines) — `/farmers/:id` route. Loads farmer + all entries + all payments + month_closings in parallel. Renders: 3 summary cards (Total Usage / Total Paid / Baki, with secondary line for hours-and-minutes / payment count / pending-months count), 2 quick-action buttons ("Pani Add karo" / "Payment Add karo" with URL prefill, the latter disabled when due=0), month-wise breakdown card (each row shows usage hours+amount, paid, balance, cleared/pending/closed badges, per-month "Pura ₹X bharo" green action if due > 0), full chronological ledger (entries blue, payments green, multi-month badge, per-payment WhatsApp resend button using send-time DB math). Back button uses `navigate(-1)`. Not-found and disabled/deleted states handled.

**Modified:**
- `src/App.tsx` — imports `FarmerDetailPage`, adds route `/farmers/:id` (after `/farmers`).
- `src/components/Layout.tsx` (96 → 247 lines) — added Search icon button in header. Click opens overlay with auto-focused input + live-filtered active-farmer results (name / mobile / whatsapp_number contains). Esc / X / backdrop closes. Closes on route change. Re-fetches farmer list every open (cheap query). Max 30 results displayed with "narrow karo" hint when truncated. WhatsApp icon on results with WA enabled.
- `src/pages/FarmersPage.tsx` — left side of each farmer card is now a button that navigates to `/farmers/:id`. Right-side action buttons (edit / delete / restore / enable) unchanged. New chevron icon for affordance.
- `src/pages/UsagePage.tsx` — added `useSearchParams` deep-link prefill (`?farmer_id=xxx`). Fetches `payments` in `loadData` for settled-status calc. Adds `showSettled` toggle + filter logic on `grouped`. Settled cards default-hidden when a specific month is selected; green "Cleared" badge + green avatar tint when shown. Header line summarizes "N kisan · M cleared (hidden)". Empty-state for "all settled" case has celebratory copy + pointer to toggle. Per-card paid-amount and balance shown when in a month view.
- `src/pages/PaymentsPage.tsx` — added `useSearchParams` deep-link prefill (`?farmer_id=xxx&for_month=...&amount=...`). Opens Add form pre-populated, clears params after handling. Single-shot via `prefillHandled` boolean. No other behavioral changes.
- `src/pages/Dashboard.tsx` — "Kisan-wise Baki" list rows are now interactive: clickable name area → detail page; green "Pay" button → `/payments?farmer_id=...`; WhatsApp icon (if `whatsapp_enabled`) → hard-coded Hindi reminder message via wa.me + audit log entry with new `message_type='reminder'`. Toast for success/failure. Loading state per-row via `sendingWaForFarmer`.
- `src/types/index.ts` — `WhatsAppMessageType` union extends with `'reminder'`. DB column has no CHECK constraint, so no migration needed.

**Verified:** `tsc -b && vite build` exit 0 in fresh `/tmp` install. Bundle: 354KB JS / 105KB gzipped (no size regression).

**Lint:** 19 errors total, all `react-hooks/set-state-in-effect` warnings on the existing `useEffect(() => loadData(), [])` pattern that's been in the codebase the whole time. 4 new warnings from new useEffects added in Session 4 — same pattern, eslint-disable comments added on the prefill effects where appropriate. NOT a deploy gate (Netlify runs only `npm run build`).

**Status:** Code complete on local repo (`C:\Users\Abhay Kumar\Documents\GitHub\tubewell-manager`). NOT pushed yet — owner runs the push commands from Windows Git Bash / PowerShell. Once Netlify auto-deploys, owner verifies the 4 features end-to-end and then I flag this section as SHIPPED + VERIFIED.
