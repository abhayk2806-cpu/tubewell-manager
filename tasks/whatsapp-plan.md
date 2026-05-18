# Track A — WhatsApp Integration Plan

> Status: **DRAFT — awaiting owner approval**
> Created: 2026-05-17
> Estimated: ~5 sessions (can compress to 3 if focused)

---

## Final Scope (locked after Q1/Q2/Q3 decisions)

- Delivery: **wa.me click-to-send link** (free, manual tap, no backend, no API approval)
- Per-farmer toggle: enable/disable WhatsApp messaging
- Optional WhatsApp number (farmers without smartphones unaffected)
- Auto-trigger on: new usage entry, new payment
- Editable Hindi templates (DB-stored, editable via UI)
- Audit log of every send
- Farmer consent field (checkbox + timestamp)
- Manual re-send button per entry
- **No** Month Close notification (skipped)
- **No** advance credit tracking (deferred to separate Track B project)
- **No** auto-send on edit/delete (manual re-send only)

---

## Database Schema Changes

### Migration `005_whatsapp_support.sql`

**Alter `farmers`:**
```sql
ALTER TABLE farmers
  ADD COLUMN whatsapp_number TEXT,                    -- nullable, normalized to "91XXXXXXXXXX"
  ADD COLUMN whatsapp_enabled BOOLEAN DEFAULT false,
  ADD COLUMN whatsapp_consent_at TIMESTAMPTZ;         -- nullable
```

**New table `whatsapp_message_templates`:**
```sql
CREATE TABLE whatsapp_message_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  template_type TEXT NOT NULL UNIQUE,    -- 'usage_entry' or 'payment_received'
  template_text TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  updated_by_email TEXT
);
-- Seed with 2 rows (usage_entry, payment_received) with default Hindi templates
```

**New table `whatsapp_log`:**
```sql
CREATE TABLE whatsapp_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL,            -- 'usage_entry' | 'payment_received' | 'manual_resend'
  related_entry_id UUID,                 -- usage_entries.id or payments.id (nullable)
  message_text TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  status TEXT DEFAULT 'initiated',       -- 'initiated' (wa.me opened; delivery not confirmable)
  sent_by UUID REFERENCES auth.users(id),
  sent_by_email TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_whatsapp_log_farmer_id ON whatsapp_log(farmer_id);
CREATE INDEX idx_whatsapp_log_sent_at ON whatsapp_log(sent_at DESC);
```

**RLS:** Same `USING (true) WITH CHECK (true)` for `authenticated` role on both new tables (consistent with existing pattern).

**Migration drift cleanup (bundled):**
- Backfill `002_add_month_closings.sql`, `003_add_for_month_and_indexes.sql`, `004_add_is_disabled_to_farmers.sql` from current Supabase schema dump
- Commit `005_whatsapp_support.sql` on top
- Closes the high-risk drift gap flagged in PROJECT_STATUS.md

---

## Default Templates

**Placeholder syntax:** `{name}` — single curly braces

### Usage template (default, editable)

```
Namaste {farmer_name} ji 🙏

Aaj ka pani entry:
⏱️ Aaj chala: {today_hours} ghante {today_minutes} minute
⏱️ Iss mahine pehle: {previous_total_hours} ghante {previous_total_minutes} minute
⏱️ Iss mahine kul: {new_total_hours} ghante {new_total_minutes} minute

Date: {date}

— Tubewell Manager
```

### Payment template (default, editable)

```
Namaste {farmer_name} ji 🙏

Payment receive ho gaya:
💰 Pichla baki: ₹{previous_due}
💰 Abhi diya: ₹{amount_paid}
💰 Ab baki: ₹{new_due}

Kis mahine ke liye: {for_month}
Date: {date}

— Tubewell Manager
```

### Placeholder variables (full list)

| Placeholder | Usage | Payment | Source |
|---|---|---|---|
| `{farmer_name}` | ✓ | ✓ | `farmers.name` |
| `{date}` | ✓ | ✓ | entry/payment date, formatted `DD MMM YYYY` |
| `{today_hours}`, `{today_minutes}` | ✓ | — | new entry's hours / minutes |
| `{previous_total_hours}`, `{previous_total_minutes}` | ✓ | — | sum of farmer's usage in **same month** BEFORE this entry |
| `{new_total_hours}`, `{new_total_minutes}` | ✓ | — | previous + today |
| `{previous_due}` | — | ✓ | `max(0, usage_for_month − paid_for_month_before_this)` |
| `{amount_paid}` | — | ✓ | this payment's amount |
| `{new_due}` | — | ✓ | `max(0, usage_for_month − total_paid_for_month_after_this)` — capped at 0 |
| `{for_month}` | — | ✓ | `payments.for_month` |

**Critical rule:** all totals/dues queried from Supabase at send-time, NOT from React state. Protects against concurrent entries by other family members.

---

## UI Changes

### 1. `FarmersPage.tsx`
- Add to farmer create/edit modal:
  - `whatsapp_number` text input (helper: "10 digits, India only — automatically prefixed with 91")
  - `whatsapp_enabled` toggle (default off)
  - `whatsapp_consent_at` checkbox: "Farmer ne WhatsApp ke liye haan boli hai" (saves timestamp if checked)
- Number normalization: strip spaces/dashes/leading `+91` or `0`. Store as `91XXXXXXXXXX`.
- Validation: if `whatsapp_enabled=true`, number must be present and valid (10 Indian digits after normalization)
- Display: small WhatsApp icon next to farmer name when enabled

### 2. New file: `src/pages/SettingsPage.tsx` (templates editor)
- New route `/settings`, protected
- Two textareas: usage template, payment template
- Live placeholder reference card per template
- "Save" → updates `whatsapp_message_templates` row, records `updated_by_email`
- "Reset to default" button
- "Preview" button — renders template with sample data
- Bottom-nav icon (new 7th tab) OR header gear icon — TBD

### 3. `UsagePage.tsx`
- After successful save (if farmer has `whatsapp_enabled` + number): green prominent "WhatsApp Bhejo" button in success banner
- Opens `https://wa.me/{number}?text={url_encoded_message}` in new tab
- On click → insert `whatsapp_log` row (status='initiated')
- In entry list (expanded view): per-entry small WhatsApp icon → manual re-send (re-calculates totals from DB)
- Disabled if farmer doesn't have WhatsApp enabled

### 4. `PaymentsPage.tsx`
- Same pattern as UsagePage with payment template
- `for_month`-scoped balance calculation

### 5. New helper: `src/lib/whatsapp.ts`
- `normalizeWhatsAppNumber(input: string): string | null`
- `buildUsageMessage(farmer, entry, prevTotal, newTotal, templateText): string`
- `buildPaymentMessage(farmer, payment, prevDue, newDue, templateText): string`
- `buildWaMeUrl(number: string, message: string): string`
- `logWhatsAppSend(args): Promise<void>`
- Template rendering: simple `replace()` per `{placeholder}`

### 6. `BackupPage.tsx`
- Export adds: `whatsapp_message_templates`, `whatsapp_log`
- Backup version bumps `"2.0"` → `"2.1"`
- Importer: backward compat for v2.0 (new tables default to empty)
- Replace mode delete order: `whatsapp_log → month_closings → payments → usage_entries → whatsapp_message_templates → farmers`

### 7. `src/types/index.ts`
- Add `whatsapp_number`, `whatsapp_enabled`, `whatsapp_consent_at` to `Farmer`
- New interfaces: `WhatsAppMessageTemplate`, `WhatsAppLogEntry`
- Update `BackupData` with new arrays

---

## Implementation Phases

| Phase | Work | Acceptance | Est |
|---|---|---|---|
| 1 | Apply migration `005`, backfill `002/003/004`, update types, verify build | Schema deployed, types compile, no runtime change | 0.5 session |
| 2 | `src/lib/whatsapp.ts`, `SettingsPage.tsx`, route + nav | Can edit/save/reset/preview both templates | 1 session |
| 3 | FarmersPage WhatsApp fields + normalization + validation | Can add farmer with WhatsApp, toggle, edit number | 0.5 session |
| 4 | UsagePage send button + per-entry re-send + log + send-time calculation | End-to-end: add entry → WhatsApp opens with correct totals → log row exists | 1 session |
| 5 | PaymentsPage send button + per-entry re-send + log + for_month-scoped balance | End-to-end: add payment → WhatsApp opens with correct `previous_due` / `new_due` for `for_month` | 1 session |
| 6 | BackupPage export/import update, version bump, replace delete order | Export → merge import, export → replace import, v2.0 → v2.1 compat works | 0.5 session |
| 7 | Update CLAUDE.md, PROJECT_STATUS.md, BUSINESS_KNOWLEDGE.md, tasks/lessons.md, project/PROJECT_MEMORY.md, tasks/todo.md | All knowledge files reflect new feature | 0.5 session |

**Total: ~5 sessions**

---

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Concurrent entries → stale totals in message | Medium | Medium | Calculate totals from Supabase at send-time, not React state |
| User cancels in WhatsApp after click — log says "initiated" | High | Low | Document `status='initiated'` ≠ delivered. Don't promise delivery in UI. |
| Template placeholder typo (e.g. `{farmerr_name}`) | Medium | Low | Template "Preview" button shows sample render. Literal `{...}` visible before send. |
| WhatsApp number entered wrong | High | Medium | Validation + "Will send to: +91 98765 43210" preview in farmer modal |
| Farmer enabled without consent | Low | Medium | Consent checkbox required to flip toggle on |
| Schema drift continues | High | High | Bundle 002/003/004 backfill in Phase 1 |
| Calculation regression (the historical bug class) | Medium | High | Use existing `for_month` + active-farmer-filter patterns. Send-time DB query. Test against PROJECT_MEMORY.md section 10 ground-truth numbers post-deploy. |

---

## Open Questions (need decision before / during Phase 1)

1. **Templates page location** — separate `/settings` bottom-nav (7-tab) OR drawer/modal from header gear icon? — recommend: bottom-nav (discoverability)
2. **Edge case: payment for month with zero usage** — send anyway showing ₹0/₹500/₹0, OR suppress? — recommend: send anyway (farmer should know money received)
3. **Bundle drift cleanup (002/003/004) with Phase 1** OR separate ticket? — recommend: bundle (touching migrations anyway)
4. **Default Hindi templates** — use the drafts above, OR want to write your own first? — recommend: use drafts (editable, low cost to change)
5. **Re-send button location** — inline icon in every entry row OR only in expanded accordion content? — recommend: expanded content only (less clutter)

---

## What Gets Updated in Knowledge Files (Phase 7)

- **CLAUDE.md** — new critical rules: number normalization format, send-time DB calculation (not React state), no auto-resend on edit/delete, templates table = source of truth
- **PROJECT_STATUS.md** — new session log entries (one per phase), decisions log entry for "Option 1 wa.me chosen", new env/infrastructure row if any
- **BUSINESS_KNOWLEDGE.md** — WhatsApp terminology added, template editing as new user flow, evolution log entry "Round 7 — WhatsApp"
- **tasks/lessons.md** — anticipatory lessons under new `📱 WhatsApp & Notifications` category: number format pitfalls, template placeholder mismatch, send-time vs render-time calc
- **project/PROJECT_MEMORY.md** — full WhatsApp feature section (matching existing depth), schema additions, migration 005 documented, ground-truth numbers refreshed if applicable
- **tasks/todo.md** — mark WhatsApp done, add Track B (advance credit tracking) to backlog with clear scope

---

**Awaiting owner approval to start Phase 1.**
