# Tubewell Manager — Task List

> Last updated: 2026-05-18
> Active project: **NONE** — Track A complete. Awaiting owner direction.

---

## 🔴 This Session (Do These Now)

_Nothing assigned. **Track A (WhatsApp Integration) fully shipped.** Recommended next moves below._

---

## 🟡 Next Up (Recommended — owner picks)

- [ ] **Test WhatsApp in the wild** — enable WhatsApp for 1 farmer in production, add a usage entry, click the banner, verify the message lands correctly. Then a payment. Then a re-send. Confirm `whatsapp_log` rows in Supabase. If issues surface → file specific bug; otherwise enable for more farmers as comfortable.
- [ ] **Track B — Advance credit tracking across months** — the deferred major refactor. See Decisions Log 2026-05-17 for full scope context. Estimated 3-5 sessions. Touches all 5 calculation pages. **Do NOT bundle with anything else.**
- [ ] **Add Vitest + minimal calculation tests** — 5-10 unit tests on the formulas in PROJECT_MEMORY.md section 6 (amount, max-cap due, recovery rate, for_month allocation) + section A5 (WhatsApp message math). Would catch the most common bug class. ~1-2 hours.
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
