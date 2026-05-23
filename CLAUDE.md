# Tubewell Manager — Claude Instructions

> Production web app (React 19 + TypeScript + Vite + Supabase + Netlify) — single-family internal tool for tracking farmer tubewell water usage, dues, and WhatsApp notifications. Live at https://tubewell-manager.netlify.app. UI language is Hinglish.

---

## Session Start Protocol

At the start of EVERY session, in this order:

1. This file (CLAUDE.md) — reading now ✓
2. `PROJECT_STATUS.md` — current phase, blockers, open questions
3. `tasks/todo.md` — what needs to be done today
4. `tasks/lessons.md` — scan headings, read full sections only if today's task touches that area
5. `BUSINESS_KNOWLEDGE.md` — ONLY if task involves UX, copy, calculation rules, or product decisions
6. `project/PROJECT_MEMORY.md` — ONLY if task touches DB schema, calculation logic, WhatsApp internals, or you need the full feature history. The "Track A Addendum" at the end covers everything WhatsApp.

If owner states a change to calculation rules, terminology, schema, or workflow → update `BUSINESS_KNOWLEDGE.md` immediately, not at session end.

---

## Project Overview

Single-family tubewell water tracking app. ~9 farmers, ~5 users, no money flow through the app itself. Data is the source of truth for in-person settlement of dues with real farmers — accuracy matters more than uptime. WhatsApp notifications (wa.me click-to-send) optional per farmer.

Stack: React 19 + TypeScript ~6.0 + Vite 8 + Tailwind 3 + shadcn/ui (40+ components installed) + Supabase (Postgres + Auth + RLS) + Netlify hosting with auto-deploy from GitHub `main`. No backend functions — pure static site.

---

## Directory Map

```
/src/pages/           → 8 pages: Login, Dashboard, Farmers, Usage, Payments, Months, Backup, Settings
/src/components/      → Layout.tsx + 40+ shadcn ui/ components (don't edit ui/ unless intentional)
/src/context/         → AuthContext.tsx (Supabase auth)
/src/lib/             → supabase.ts (client init), utils.ts (cn()), whatsapp.ts (all WhatsApp helpers)
/src/types/           → index.ts — all interfaces (Farmer, UsageEntry, Payment, MonthClosing, BackupData, WhatsAppMessageTemplate, WhatsAppLogEntry)
/src/hooks/           → use-toast.ts
/supabase/migrations/ → 001-006 (drift closed; 006 added payment_group_id on 2026-05-23)
/project/             → PROJECT_MEMORY.md — canonical deep-dive doc, read on-demand
/tasks/               → todo.md (active), lessons.md (mistake memory), whatsapp-plan.md (Track A reference)
```

---

## Critical Commands

```bash
pnpm install              # First-time setup (pnpm is the package manager)
pnpm run dev              # Local dev server (Vite)
pnpm run build            # tsc -b && vite build — runs full TS check
pnpm run lint             # eslint .
pnpm run preview          # Preview built dist/
```

Deploy = `git push origin main`. Netlify auto-builds. No manual deploy step.

---

## Critical Rules — Never Break Payment Allocation

The single most error-prone area of this app. Every monthly calculation depends on this.

### Never use `payment.date` for monthly allocation

- Monthly views, monthly due, monthly collected → ALWAYS filter by `payment.for_month === selectedMonth`
- `payment.date` is only when the payment was recorded, not what it's for
- A payment made on April 5 might be FOR March — the system handles this only because `for_month` is honored everywhere
- If you see `p.date` being used to bucket payments by month, that's a bug — fix it
- Verify before touching `Dashboard.tsx`, `MonthsPage.tsx`, or `PaymentsPage.tsx`: read `project/PROJECT_MEMORY.md` section 6 first

---

## Critical Rules — `payment_group_id` Is UI Hint Only, NEVER in Math

Added in migration 006 (Session 3 — multi-month payments). `payments.payment_group_id` is a nullable UUID that groups N rows created from one user action.

- All due/balance/total calculations remain row-wise on `for_month`. NEVER filter or bucket by `payment_group_id` for math.
- Use `payment_group_id` only for: UI badges ("Part of ₹X (N-month payment)"), group-aware delete warnings, multi-month resend (sending the summary again).
- For the multi-month WhatsApp summary: `paid_before` for each month MUST exclude EVERY row sharing the current `payment_group_id`, not just the current row id. Easiest way — fetch all payments for the months, filter client-side on `p.payment_group_id !== groupId` (correctly handles Postgres NULL semantics; `WHERE col != 'uuid'` excludes NULL rows).
- Multi-month summary message format is hard-coded in `PaymentsPage.tsx::buildAndLogMultiMonthPaymentWhatsApp` (NOT template-driven). Single-month sends continue to use the editable DB template. Don't unify them — template placeholders are single-month by design.
- See `BUSINESS_KNOWLEDGE.md` Round 8 + `tasks/lessons.md` for the full rationale.

---

## Critical Rules — Never Skip Active-Farmer Filter

Three separate bugs have been caused by forgetting this filter. All calculations, all dropdowns, all displays must only count farmers where `is_deleted=false AND is_disabled=false`.

- Before fetching `usage_entries` or `payments` for display/calculation → fetch active farmer IDs first, then filter
- "Active" means `is_deleted=false AND is_disabled=false` — both conditions required
- If a stat card shows a different total than the per-farmer breakdown, this filter is missing somewhere
- Disabled/deleted farmer data IS kept in the DB for audit — don't try to "clean it up"

---

## Critical Rules — Never Hard-Delete

- Soft delete only: set `is_deleted=true` or `is_disabled=true`
- Never run `DELETE FROM farmers` or `DELETE FROM usage_entries` from the app
- The only place that does bulk delete is `BackupPage.tsx` Replace mode — that's intentional and has double confirmation
- If you're tempted to add a "clean up old data" feature → don't. Bring it up with the owner first.

---

## Critical Rules — Backup Replace Mode

`BackupPage.tsx` Replace mode wipes ALL existing data before importing. This is the only data-loss vector in the app.

- Never remove the double-confirm UX (red warning box + confirm dialog)
- Delete order must be: `whatsapp_log → month_closings → payments → usage_entries → whatsapp_message_templates → farmers` (FK + independence ordering)
- Don't change backup `CURRENT_BACKUP_VERSION` string without updating the importer's compatibility handling
- Backup JSON includes RLS-protected data — treat exported files as sensitive

---

## Critical Rules — WhatsApp Send-Time Calculation

The WhatsApp message helpers (`buildAndLogUsageWhatsApp` in UsagePage, `buildAndLogPaymentWhatsApp` in PaymentsPage) MUST compute totals/dues from Supabase at SEND TIME, not from React state.

- Multi-device concurrency: another family member could have added an entry 30 seconds ago — React state is stale, DB is truth
- Always include `.neq('id', current_entry_id)` to exclude the current row from "previous total" calculations
- For usage: `previous_total_minutes = Σ usage_entries.total_minutes WHERE farmer_id AND month AND id != current`
- For payments: `previous_due = max(0, usage_sum − paid_before)` where `paid_before` EXCLUDES the current payment
- New totals/dues = previous + this entry's current values (so edits produce correct messages)
- If you see WhatsApp message math reading from `useState` arrays → that's a bug, fix it
- See `project/PROJECT_MEMORY.md` section A5 for the full math spec

---

## Critical Rules — WhatsApp Number & Templates

- Numbers are stored normalized as `91XXXXXXXXXX` (12 digits, no `+`, no spaces, no dashes). Use `normalizeWhatsAppNumber()` from `src/lib/whatsapp.ts` to convert any user input.
- Only India mobile numbers (10 digits, starts with 6/7/8/9). Other formats are rejected.
- Templates live in `whatsapp_message_templates` table (2 rows, keyed by `template_type`). The constants `DEFAULT_USAGE_TEMPLATE` / `DEFAULT_PAYMENT_TEMPLATE` in `src/lib/whatsapp.ts` MUST stay identical to the seed text in `005_whatsapp_support.sql` — they're used as fallback when DB row is missing, and as the "Reset to default" target.
- WhatsApp send is **decoupled** from data save. If the wa.me link fails to open or the log insert fails, the entry/payment save is NOT rolled back. Toast tells user to retry — entry is safe.
- No auto-resend on edit/delete. The per-entry/payment manual re-send button is the only way to send a non-banner message.
- `whatsapp_log.status` is always `'initiated'`. wa.me click-to-send cannot confirm delivery. Don't add `'delivered'` or `'read'` values unless we migrate to WhatsApp Business API.
- Consent timestamp (`whatsapp_consent_at`) is set on FIRST consent and PRESERVED on subsequent edits (don't overwrite the original date). Only uncheck → recheck creates a fresh timestamp.

---

## Core Technical Rules

- `import type` is required for all interface imports (`verbatimModuleSyntax` is on)
- Amount formula: `(hours + minutes/60) × rate_per_hour`. `total_minutes = hours*60 + minutes`. Both stored.
- `rate_per_hour` is stored per-entry — never look up a "current rate" to recalculate old entries
- `month` field is generated from entry date, format exactly `"April 2026"` (English month + space + 4-digit year)
- All env vars must start with `VITE_` to be exposed to the client (Vite convention)
- Supabase client: `persistSession: true, autoRefreshToken: true` — don't disable these
- Path alias `@/` → `src/` (configured in tsconfig and vite.config)
- TypeScript ~6.0 with `ignoreDeprecations: "6.0"` in tsconfig.app.json — needed for `baseUrl` warning, don't remove
- Tailwind 3.4.1 — do NOT upgrade to v4 without owner confirmation (breaking changes)
- React Router v7 — `BrowserRouter` is used, not `HashRouter`. Netlify SPA redirect is in `netlify.toml` and is required
- After insert/update where you need the saved row back: use `.select().maybeSingle()` (Phase 4/5 pattern in UsagePage/PaymentsPage)

---

## Never Touch These Files

- `src/components/ui/*.tsx` — shadcn-generated. Don't hand-edit unless owner asked. Re-running shadcn would overwrite.
- `pnpm-lock.yaml` — managed by pnpm
- `dist/` — build output, gitignored
- `.env` — local secrets, gitignored

---

## Infrastructure & Secrets Rules

- Secrets live in: local `.env` (gitignored) + Netlify dashboard env vars. Never in source.
- Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Both must be set in Netlify and local `.env`.
- Anon key is safe to expose to client (RLS enforces access). Service role key MUST NEVER be put in `VITE_*` vars or committed anywhere.
- Deploy trigger: `git push origin main`. Don't push broken builds — Netlify will publish them. Run `pnpm run build` locally before pushing if uncertain.
- Commit message format: `fix:`, `feat:`, `refactor:`, `chore:` prefix preferred (see git log for examples).

---

## MCP Tools Available

- **Supabase MCP** — Use for migrations, SQL execution, schema inspection. Always check `digital-store` org → `tubewell-manager` project (`vsgptyuvnistwjjmrfby`). Apply migrations via `apply_migration` AND immediately commit the SQL to `supabase/migrations/NNN_name.sql` (lesson learned: MCP migrations don't auto-commit to repo).
- **Netlify MCP** — Site info and env var management. Site ID `cfff021f-a629-41ef-af45-394f09e5c3d0`.
- **GitHub** (via local git) — Standard `git push origin main` triggers deploy.

---

## What to Challenge — Do Not Just Implement

- **Schema changes** → State migration plan, confirm before applying. After applying, ALSO commit the SQL to `supabase/migrations/`.
- **Delete-all or bulk-update SQL** → Show the affected row count first, then ask.
- **Changing payment allocation logic** → Re-read PROJECT_MEMORY.md section 6 first. Confirm with owner before touching.
- **Adding a "force delete" or "clean up" feature** → Don't. Ask first.
- **Changing the `for_month` format** (`"April 2026"`) → Many calculations parse this string. Don't change without auditing every consumer.
- **Removing the active-farmer filter "for performance"** → Hard no. Performance is fine at this scale; this filter is a correctness guarantee.
- **Tailwind v4 upgrade, React Router v8, TS 7.x** → Major version bumps need owner sign-off; they've caused build breakage before.
- **Changing WhatsApp message math to read from React state** → No. The send-time DB query exists specifically to prevent the multi-device-stale-state bug class.
- **"Wiring up auto-send on edit/delete" or "sending without consent"** → No. Owner explicitly rejected both during Track A scoping.
- **Mixing Track B (advance credit tracking) with anything else** → Track B is a deliberate isolated future project. Do not bundle it with quick fixes.

---

## Known Technical Debt (Do Not "Fix" These)

- RLS policy is `USING (true) WITH CHECK (true)` for `authenticated` role on all 6 tables — i.e., any authenticated user can do anything. — **intentional**: this is a single-family tool with no role separation. Risk: low (small known user set). Don't tighten without owner direction.
- `README.md` is still the default Vite template. — **risk: low** (not user-facing). PROJECT_MEMORY.md is the real doc.
- Zero test files in the repo. — **risk: medium**. Calculation logic is critical and untested. Manual ground-truth numbers in PROJECT_MEMORY.md section 10 are the only verification layer. Don't add tests without owner direction on framework.
- Overpayment isn't tracked as advance credit across months — capped at ₹0 due per month. WhatsApp message reflects this same cap (₹0 new_due even on overpayment). — **intentional**: simpler mental model; family reconciles overpayment in person. Track B (future project) addresses this holistically.
- Month Close is a soft visual marker, not a lock — new entries can still be added to a closed month. — **intentional**: human override always wins.
- `whatsapp_log.status` only has value `'initiated'`. Cannot confirm WhatsApp delivery via wa.me. — **intentional**: this is a fundamental wa.me limitation, not a code defect.
- Bundle size warning (>500KB) from vite — pre-existing, no impact on family use. — **intentional**: code splitting would add complexity without user benefit at this scale.

✅ RESOLVED 2026-05-17: Schema drift — backfill of migrations `002`/`003`/`004` complete. Repo can now reconstruct production schema from `supabase/migrations/`.

---

## When There's a Conflict

- CLAUDE.md vs. code behavior → Follow CLAUDE.md, flag the discrepancy
- CLAUDE.md vs. BUSINESS_KNOWLEDGE.md → CLAUDE.md wins for code decisions; BUSINESS_KNOWLEDGE.md wins for terminology/UX/business rules
- CLAUDE.md vs. PROJECT_MEMORY.md → PROJECT_MEMORY.md is the deeper truth on calculations and feature history (especially the Track A Addendum for WhatsApp); CLAUDE.md is the rule set. If they contradict, surface it to owner.
- PROJECT_STATUS.md says done but code is incomplete → Report; don't assume either is correct
- `lessons.md` says "never do X" and owner asks for X → Acknowledge the risk explicitly, then follow owner

---

## When Uncertain

- Missing context → "I don't have context on [X]. My assumption is [Y]. Proceed?"
- Unclear instruction → "Do you mean [A] or [B]?"
- Risky action (schema change, delete, env var change, deploy) → "This will [consequence]. Confirm?"
- Calculation logic question → Read PROJECT_MEMORY.md section 6 (or A5 for WhatsApp math) first, then ask if still unclear

Default: surface uncertainty before acting, not after.

---

## Progressive Disclosure — Read On Demand Only

Do NOT load these at session start. Read only when the task requires them.

- `project/PROJECT_MEMORY.md` → Full feature list, every fixed bug, ground-truth numbers, full DB schema, calculation logic, conversation timeline. The "Track A Addendum" at the end (sections A1-A9) covers every WhatsApp internal. Read when working on calculations, schema, or any non-trivial feature.
- `BUSINESS_KNOWLEDGE.md` → Terminology, brand voice, user audience, business evolution log. Read when working on UX, copy, or product decisions.
- `tasks/whatsapp-plan.md` → The original Track A plan with phase-by-phase implementation notes. Read only if revisiting Track A scope or planning Track B.
- `supabase/migrations/*.sql` → All migrations 001-006 are in the repo (drift closed). For current schema, query Supabase live via MCP — migration files describe history, not necessarily current state if anyone has run ad-hoc SQL.
