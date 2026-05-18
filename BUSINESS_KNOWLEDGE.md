# Tubewell Manager — Business Knowledge Base

> Last updated: 2026-05-17

---

## What This Business Does

Tubewell Manager replaces a physical notebook used by Abhay's family to track water (pani) usage by farmers from a shared tubewell and the money those farmers owe / pay. Multiple family members can open it on their own phones and see the same numbers, in real time.

Not a SaaS. Not for sale. Single-family internal tool — but built to production quality because the data drives real-world collections from real farmers.

---

## Target Audience

**Users:** Abhay Kumar + 3-5 family members (parents, siblings).
**Devices:** Mostly Android phones, some desktop. Designed mobile-first.
**Tech literacy:** Mixed. UI is Hinglish (Hindi + English), not pure English, because that's how the family actually talks.
**Indirect "customers":** ~9 farmers whose usage and dues are tracked. Farmers don't use the app — family members reconcile with them in person or on phone.

---

## Revenue Model

No revenue. The app costs ₹0 to run:
- Supabase free tier
- Netlify free tier
- Domain: free `tubewell-manager.netlify.app`

Cost only kicks in if Supabase free-tier limits are crossed (500MB DB, 2GB egress/month) — extremely unlikely at this scale.

---

## Product Architecture (Business Logic)

**Core flow:**
1. Family member adds a farmer (one-time)
2. Whenever a farmer uses the tubewell → log `usage entry` (hours + minutes + auto-calculated amount)
3. When farmer pays → log `payment` against a specific month (`for_month` field)
4. App shows live per-farmer dues, monthly summaries, and total collection rate

**Six pages:**
- Dashboard — All-time / Monthly / Yearly view with stat cards, pie chart, top dues
- Farmers — Add / edit / disable / delete (3-tab Active/Disabled/Deleted)
- Usage — Add water entries, farmer-wise accordion, month filter
- Payments — Add payments with `for_month` allocation + Month Close
- Months — Per-month breakdown across all farmers
- Backup — Export JSON / Import (Merge or Replace)

**Critical business rules:**
- Money formula: `amount = (hours + minutes/60) × rate_per_hour`
- Default rate: ₹100/hour, stored per-entry (so rate changes don't rewrite history)
- A farmer can be **disabled** (temporarily ignored, restorable) OR **deleted** (soft delete, restorable, hidden from all calculations). Neither actually removes DB rows — full audit trail preserved.
- Payment allocation uses `for_month`, NOT payment date. A payment made on April 5 for March's usage correctly counts toward March.
- Overpayment never goes negative — capped at ₹0 due. No advance-credit tracking across months.
- Monthly "Remaining" is summed per-farmer (`Σ max(0, usage_i − paid_i)`) — so one farmer's overpayment can't mask another's underpayment.

---

## Competitive Context

Direct competition = the paper notebook the family was using before. The app wins on:
- Multi-device sync (no one needs to "hold" the book)
- Auto-calculation of dues
- Audit trail of who entered what
- No risk of losing the book

There's no commercial product worth comparing to — this is custom for one family's specific workflow.

---

## Brand & Communication

**Voice in the app:**
- Hinglish, not formal Hindi or formal English
- Direct, action-oriented
- Friendly, not corporate

**Example labels (use these exact phrases — don't translate):**
- "Kisan Add karo" (add farmer)
- "Pani Entry karo" (add water usage)
- "Paisa Add karo" (add payment)
- "Kitna Baki Hai" (how much is due)
- "Kis month ke liye?" (which month is this payment for)
- "April ka hisaab close karo" (close April's accounts)
- "Entry save ho gayi ✓" (entry saved)
- "Closed ✓" / "Enable karo" / "Restore karo"

**Don't:**
- Don't translate to pure English in UI
- Don't use formal Hindi (शुद्ध हिंदी) — feels alien
- Don't add corporate flair ("Welcome to Tubewell Manager Pro")

---

## Key Business Rules

| Rule | Reason |
|---|---|
| Soft delete only — never hard delete | Audit trail; farmer might come back; data is the source of truth for who owes what |
| `for_month` is the source of truth for payment allocation, never `date` | A farmer can pay last month's dues this month |
| Only `is_deleted=false AND is_disabled=false` farmers appear in calculations | Disabled/deleted farmer entries are kept in DB but excluded from totals |
| `rate_per_hour` stored per-entry | Rate may change in future; old entries must keep old rate |
| Backup Replace mode requires double confirmation | Wipes all data before import |
| Recovery rate capped at 100% | Overpayment shouldn't show "120% collected" |

---

## Domain Terminology

Always use the user's words. Translating these to "standard English" breaks the mental model.

- **Pani** = water usage from the tubewell
- **Kisan / Farmer** = the person being tracked
- **Udhar / Due / Baki** = unpaid amount owed
- **Hisaab** = the running accounts / settlement
- **Month Close** = marking a month's accounts as settled (soft marker, not a lock)
- **`for_month`** = the month a payment is FOR (allocation target), separate from the date the payment was made
- **Active farmer** = `is_deleted=false AND is_disabled=false`
- **Disabled** = temporarily not counted, restorable
- **Deleted** = soft-deleted, hidden everywhere but restorable
- **Recovery rate** = `min(100, totalCollected / totalUsage × 100)`

---

## Third-Party Ecosystem

| Service | Purpose | Integration | Account |
|---|---|---|---|
| Supabase | Postgres DB + Auth + RLS | `@supabase/supabase-js` client, env vars in Netlify + local `.env` | `digital-store` org, project `tubewell-manager` (`vsgptyuvnistwjjmrfby`), ap-south-1 region, free tier |
| Netlify | Hosting + CI/CD | GitHub auto-deploy on push to `main` | `abhayk2806's team`, site ID `cfff021f-a629-41ef-af45-394f09e5c3d0` |
| GitHub | Source repo | `tubewell-manager` repo, connected to Netlify | abhay's personal GitHub |
| Claude MCPs | Dev workflow | Supabase MCP for migrations, Netlify MCP for site mgmt, Filesystem MCP for direct file edits | — |

---

## Business Evolution Log

### 2026-04 — Initial build → live in production
Complete v1 built and deployed. 7 pages, auth, full CRUD, backup/restore. Live at https://tubewell-manager.netlify.app.

### 2026-04 — UI/UX overhaul (Round 2)
Flat lists were confusing — moved Usage and Payments to farmer-wise accordion with month filters. Dashboard got 3-tab All-Time / Monthly / Yearly view.

### 2026-04 — Month Closing feature added (Round 3)
New `month_closings` table. "April ka hisaab close karo" button + closed badge. Backup version bumped to v2.0.

### 2026-04 — Payment allocation moved to `for_month` (Round 4 / Option B)
Replaced "filter payments by payment date" with explicit `for_month` allocation. FIFO auto-select of oldest unpaid month. All calculation pages rewritten.

### 2026-04 — Disable vs Delete feature (Round 5)
Added `is_disabled` column + 3-tab Farmers page. Delete modal now offers "Temporarily Disable" vs "Permanently Delete" with separate flows.

### 2026-04 — Final audit fixes (Round 6)
3 latent calculation bugs fixed: UsagePage active-farmer filter, PaymentsPage `rawUsage` filter, MonthsPage per-farmer remaining sum.

---

## WhatsApp Terminology (Round 7)

App-internal terms added with the WhatsApp feature:

- **WhatsApp number** = farmer's phone number used for messaging. Stored normalized as `91XXXXXXXXXX` (12 digits, no '+', no spaces). Separate from the existing `mobile` field — farmer's mobile may be a landline or different number.
- **WhatsApp enabled** = a per-farmer toggle. When ON, the app shows "WhatsApp Bhejo" banners after saving an entry/payment for that farmer. When OFF, no banners — farmer is in the system but doesn't receive automated notifications.
- **Consent / Haan boli hai** = the farmer has explicitly agreed to receive WhatsApp messages. Recorded as `whatsapp_consent_at` timestamp. Required (alongside a valid number) to enable WhatsApp messaging.
- **Template** = the Hindi message body with `{placeholder}` variables. Two templates exist: one for usage entries, one for payment receipts. Editable from the Setup page.
- **WhatsApp Bhejo** = the green action button shown post-save in UsagePage/PaymentsPage that opens WhatsApp with a pre-filled message. The user must still tap "Send" inside WhatsApp.
- **wa.me link** = the URL format (`https://wa.me/{number}?text={message}`) that opens WhatsApp with a pre-composed message. Click-to-send model — free, no API.
- **`initiated` status** = the only value of `whatsapp_log.status`. Means "we opened wa.me for this row" — does NOT mean the farmer received the message. wa.me cannot confirm delivery.
- **Setup page** = the 7th bottom-nav tab (`/settings`). Currently houses the WhatsApp template editor; future settings (default rate, etc.) will live here too.

---

## Business Evolution Log — Round 7 (added)

### 2026-05-17 / 2026-05-18 — Round 7 — WhatsApp Integration (Track A)

**Owner's ask:** "Whenever a farmer takes water and I add the running time, the system should immediately send a WhatsApp message. Same for payments. Some farmers don't have smartphones — keep the field optional. I should be able to turn WhatsApp on/off per farmer. Templates must be editable in simple Hindi."

**Decision tree resolved in conversation:**
- **Delivery:** wa.me click-to-send (free, manual tap) chosen over WhatsApp Business API (paid, automatic). Reasoning: 9 farmers, ₹0 cost mandate, full template freedom, zero backend.
- **Overpayment in messages:** Stay consistent with the app's existing ₹0 cap. Don't mention "advance credit" in messages. Owner reconciles overpayment in person. The full advance-tracking rebuild was scoped out as a separate future project (Track B).
- **Auto-send on edit/delete:** No — too noisy for farmers, easy to spam. Manual re-send button on every entry/payment instead.
- **Send architecture:** Save first, then offer to send via banner. WhatsApp failures never roll back a save. Data integrity beats notification reliability.
- **Templates location:** Bottom-nav 7th tab "Setup" for discoverability (vs. tucked under a gear icon).

**What shipped (May 2026):**
- Migration 005 added 3 nullable columns to `farmers` + 2 new tables (`whatsapp_message_templates`, `whatsapp_log`)
- New helper library `src/lib/whatsapp.ts` (24 exports — number normalization, template rendering, wa.me URL building, DB ops)
- New `SettingsPage` with Hindi template editor (Preview / Reset Default / Save)
- WhatsApp section added to FarmersPage modal (number input with live preview, iOS-style toggle, consent checkbox)
- Post-save WhatsApp banner + per-entry re-send icon on UsagePage and PaymentsPage
- Send-time DB query for totals/dues (NOT React state — protects multi-device-sync scenarios)
- BackupPage updated to v2.1 format (includes templates + log, backward compatible with v1.0 and v2.0)
- 7 new Decisions Log entries
- Full TypeScript build verified clean across all 6 implementation phases

**Status:** Live in production after 6 phases of work + 1 documentation pass. Zero farmers have WhatsApp enabled yet — owner will enable per-farmer as they confirm consent.
