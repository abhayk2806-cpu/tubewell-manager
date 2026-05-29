# Tubewell Manager — Task List

> Last updated: 2026-05-26
> Active project: **NONE** — Session 4 (Navigation & UX) shipped + owner-verified in production. Awaiting owner direction.

---

## 🔴 This Session (Do These Now)

_Nothing assigned. **Session 4 fully shipped, pushed (`85f0b2e`), Netlify-deployed, and verified live by owner on 2026-05-26.** Recommended next moves below._

---

## 🟡 Next Up (Recommended — owner picks AFTER Session 4 verified)

- [ ] **Test WhatsApp in the wild** — enable WhatsApp for 1 farmer in production, add a usage entry, click the banner, verify the message lands correctly. Then a payment. Then a re-send. Confirm `whatsapp_log` rows in Supabase. If issues surface → file specific bug; otherwise enable for more farmers as comfortable. (Also exercises the new reminder send from Dashboard.)
- [ ] **Track B — Advance credit tracking across months** — the deferred major refactor. See Decisions Log 2026-05-17 for full scope context. Estimated 3-5 sessions. Touches all 5 calculation pages. **Do NOT bundle with anything else.**
- [ ] **Add Vitest + minimal calculation tests** — 5-10 unit tests on the formulas in PROJECT_MEMORY.md section 6 (amount, max-cap due, recovery rate, for_month allocation) + section A5 (WhatsApp math) + new multi-month math (paid_before group exclusion). Would catch the most common bug class. ~1-2 hours.
- [ ] **Replace default Vite README.md** — currently shipped with `npm create vite` boilerplate. Replace with a real README that points to PROJECT_MEMORY.md and the live URL.

---

## 🟢 Backlog (Not Yet Prioritized)

- [ ] WhatsApp reminders for overdue farmers (separate from per-entry notifications — would be scheduled / batched). Different feature than Track A.
- [ ] Farmer statement share (WhatsApp-ready summary card via wa.me — one message summarizing a farmer's full account).
- [ ] WhatsApp Business API migration (only worth it if owner wants truly automatic send with no manual tap).
- [ ] Google Drive backup integration (was in original spec, deferred).
- [ ] Real-time Supabase subscriptions (currently relies on page refresh / re-fetch).
- [ ] Due threshold alerts (highlight farmers above ₹X).
- [ ] Multiple rate tiers (different rates for different farmers or time periods).
- [ ] Automated Supabase backup to external storage (free tier has no built-in backup guarantee).
- [ ] (Maybe) revisit nav layout — 7 tabs in bottom nav may feel tight on narrow phones.

---

## ✅ Done (Recent)

### Session 4 — Navigation & UX features (SHIPPED + VERIFIED — 2026-05-26)

- [x] **Feature 1 — Farmer Detail Page (`/farmers/:id`)** — new file `src/pages/FarmerDetailPage.tsx` (~430 lines). Per-farmer landing page with 3 summary cards, month-wise breakdown (with cleared/pending/closed badges + "Pura ₹X bharo" quick-pay per pending month), full chronological ledger (entries blue + payments green, multi-month badge, per-payment WhatsApp resend), 2 top-level quick actions (Pani Add / Payment Add with URL prefill). Back button via `navigate(-1)`. Not-found + disabled/deleted states handled. — 2026-05-25
- [x] **Feature 2 — Settled-entries hide in UsagePage** — `showSettled` toggle (default off). UsagePage now also fetches `payments` to compute per-farmer-per-month balance via `for_month`-bucketed math (same as Dashboard/MonthsPage). Settled farmer cards (usage_amount > 0, balance = 0) hidden when a specific month is selected; green "Cleared" badge + green avatar tint when shown. Empty-state has celebratory copy + toggle pointer. — 2026-05-25
- [x] **Feature 3 — Dashboard pending dues widget enhancement** — "Kisan-wise Baki" rows now clickable (→ detail page) + per-row green "Pay" button (deep-links to PaymentsPage) + WhatsApp icon (for WA-enabled farmers) that opens wa.me with hard-coded Hindi reminder + logs with `whatsapp_log.message_type='reminder'` (new value, no migration). Toast for success/failure. — 2026-05-25
- [x] **Feature 4 — Global farmer search in Layout header** — Search icon in header → overlay with auto-focused input → live in-memory filter on active farmers (name / mobile / whatsapp_number contains) → click result navigates to `/farmers/:id`. Esc / X / backdrop close. Closes on route change. Max 30 results displayed with "narrow karo" hint when truncated. WhatsApp icon on result rows that have WA enabled. — 2026-05-25
- [x] **Deep-link URL prefill in PaymentsPage + UsagePage** — `useSearchParams` reads `farmer_id`, `for_month`, `amount` and opens the Add form pre-filled. Single-shot (params cleared via `setSearchParams({}, { replace: true })`). `prefillHandled` boolean prevents double-trigger. — 2026-05-25
- [x] **FarmersPage cards clickable** — left side of each card is now a button → `/farmers/:id`. Edit / delete / restore / enable buttons still work (separate flex container, no event conflict). Chevron icon added for affordance. — 2026-05-25
- [x] **App.tsx — new route `/farmers/:id`** — wrapped in `ProtectedRoute`. Imported FarmerDetailPage. — 2026-05-25
- [x] **types/index.ts — `WhatsAppMessageType` extended with `'reminder'`** — DB column has no CHECK constraint, no migration required. — 2026-05-25
- [x] **Build verified** — `tsc -b && vite build` exit 0 in fresh `/tmp` install. Bundle: 354KB JS / 105KB gz. No size regression. — 2026-05-25
- [x] **Pushed + deployed** — commit `85f0b2e` pushed to `origin/main` (`0b56abb..85f0b2e`). Netlify auto-build triggered. Owner confirmed site live on https://tubewell-manager.netlify.app — 2026-05-26

### Session 3 — Payment UX improvements (SHIPPED + VERIFIED — 2026-05-23)

- [x] **Migration 006** — `006_add_payment_group_id.sql` applied to prod via MCP, committed to repo. Nullable `payment_group_id uuid` column on `payments` + partial index. UI grouping hint only — NEVER used in due/balance math. — 2026-05-23
- [x] **Type update** — `Payment.payment_group_id?: string | null` in `src/types/index.ts`. — 2026-05-23
- [x] **"Pura ₹X bharo" chip (single mode)** — in PaymentsPage add form, when farmer + for_month chosen, a green chip auto-fills pending amount into amount input. Hidden when pending = ₹0. Uses existing month-due math, no new calculation logic. — 2026-05-23
- [x] **Multi-month payment UI** — mode toggle "Ek month / Multiple months" at top of form. Multi mode shows chip-style cards for every month with balance > 0, each card has its own pre-filled allocation input, live total summary, "Sab pending select" one-click button. On save: client-side `crypto.randomUUID()`, N rows inserted in batch sharing `payment_group_id`. — 2026-05-23
- [x] **Multi-month WhatsApp** — new helper `buildAndLogMultiMonthPaymentWhatsApp` in PaymentsPage. Single summary message (hard-coded format, NOT template-driven). Send-time DB queries with `paid_before` correctly excluding ALL rows sharing the group (client-side filter on `p.payment_group_id !== groupId` to handle SQL NULL semantics). — 2026-05-23
- [x] **Grouped row UX** — purple "Part of ₹X (N-month payment)" badge in payment list. Delete on grouped row warns about siblings. Resend on grouped row sends full multi-month summary. Edit on grouped row works on single row only (with explanatory note in modal). — 2026-05-23
- [x] **Backup v2.1 → v2.2** — `payment_group_id` auto-included via `select('*')`. Importer accepts v1/v2/v2.1/v2.2 (backward compat: missing field = NULL in DB). — 2026-05-23
- [x] **Build verified** — `tsc -b && vite build` exit 0 in fresh `/tmp` install. Bundle: 354KB JS / 105KB gz. — 2026-05-23
- [x] **Knowledge updates** — PROJECT_STATUS.md Session 3 log + 2 Decisions entries, BUSINESS_KNOWLEDGE.md Round 8 (terminology + evolution log), CLAUDE.md new critical rule for `payment_group_id`, lessons.md +4 entries (pnpm broken state, multi-month schema choice, paid_before group exclusion, Windows git lock), PROJECT_MEMORY.md Session 3 Addendum. — 2026-05-23
- [x] **Pushed + deployed** — git push origin main triggered Netlify auto-deploy. Owner verified end-to-end in production (auto-fill chip, multi-month create, multi-month WhatsApp summary, multi-month resend, multi-month delete warning). — 2026-05-23

### Track A — WhatsApp Integration (COMPLETE — 2026-05-17 → 2026-05-18)

- [x] **Phase 7** — Final knowledge file updates. PROJECT_MEMORY.md Track A Addendum (A1-A9) appended. BUSINESS_KNOWLEDGE.md Round 7 + WhatsApp Terminology section. CLAUDE.md fully rewritten with new critical rules (send-time DB calc, number normalization, templates source-of-truth, backup v2.1, decoupled send). PROJECT_STATUS.md marks Track A complete. todo.md reset to "awaiting direction". — 2026-05-18
- [x] **Phase 6** — Backup integration. BackupPage exports v2.1 format including `whatsapp_message_templates` + `whatsapp_log`. Importer backward-compat for v1.0/v2.0. Replace-mode delete order updated. Template upsert uses `template_type` conflict; log uses `id`. — 2026-05-18
- [x] **Phase 5** — PaymentsPage WhatsApp send + log. Helper `buildAndLogPaymentWhatsApp` with `for_month`-scoped due math. Banner + per-payment re-send + farmer header pill. — 2026-05-18
- [x] **Phase 4** — UsagePage WhatsApp send + log. Helper `buildAndLogUsageWhatsApp` with send-time DB query for monthly totals (exclude-current-entry). Banner + per-entry re-send. WhatsApp errors decoupled from save. — 2026-05-18
- [x] **Phase 3** — FarmersPage WhatsApp fields: number input with live preview + validation, iOS-style toggle, consent checkbox, WhatsApp icon on cards. Consent timestamp preserved on edit. — 2026-05-18
- [x] **Phase 2** — `src/lib/whatsapp.ts` helper library (356 lines, 24 exports) + `src/pages/SettingsPage.tsx` template editor (Preview / Reset / Save). Route `/settings` + 7th nav tab "Setup". — 2026-05-18
- [x] **Migration drift cleanup** — `002_add_month_closings.sql`, `003_add_for_month_and_indexes.sql`, `004_add_is_disabled_to_farmers.sql` backfilled from production schema. Repo can now reconstruct DB from migrations. — 2026-05-17
- [x] **Phase 1** — Migration `005_whatsapp_support` applied to production (additive only — zero data loss). `src/types/index.ts` updated with WhatsApp interfaces. Full TS build verified. — 2026-05-17

### Pre-Track-A

- [x] Initialize knowledge system (CLAUDE.md, PROJECT_STATUS.md, BUSINESS_KNOWLEDGE.md, tasks/, CLAUDE.local.md). — 2026-05-17
