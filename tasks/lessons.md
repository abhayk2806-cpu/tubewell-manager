# Lessons Learned — Tubewell Manager

> At session start: scan headings only. Read the full section only if relevant to today's task.
> Add lessons IMMEDIATELY after any correction. Never delete. Add superseding lessons if behavior changes.

---

## Lesson Format

**[Short descriptive title]**
- Mistake: [what went wrong]
- Root cause: [why it happened]
- Rule: [specific actionable rule to prevent recurrence]
- Impact: [low / medium / high / critical]
- Date: [YYYY-MM-DD]

---

## 🗄️ Database & Migrations

**Migrations applied via MCP don't auto-commit to repo**
- Mistake: 3 of 4 production migrations (`add_month_closings`, `add_for_month_and_indexes`, `add_is_disabled_to_farmers`) live only in Supabase, not in `supabase/migrations/` folder
- Root cause: Using Supabase MCP `apply_migration` only changes the live DB; it doesn't write a `.sql` file to the repo
- Rule: After every `apply_migration` call, ALSO write the same SQL to `supabase/migrations/NNN_name.sql` and commit it
- Impact: high
- Date: 2026-04

**IST timezone bug in `for_month` backfill**
- Mistake: First migration to backfill `for_month` from existing payment dates used `(date AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata'` — double conversion shifted dates into the wrong month (April 1 IST → "March 2026")
- Root cause: `TIMESTAMPTZ` columns are already UTC in storage; the first `AT TIME ZONE 'UTC'` was a no-op that confused the second conversion
- Rule: For IST conversion of a `TIMESTAMPTZ`, use `date AT TIME ZONE 'Asia/Kolkata'` directly. Verify dates near month boundaries (00:00-04:00 UTC) before deploying any timezone-sensitive migration.
- Impact: high
- Date: 2026-04

---

## 🔢 Payment Allocation & Month Math

**Filtering payments by `payment.date` for monthly views**
- Mistake: MonthsPage and Dashboard's Monthly view filtered payments using `payment.date` to bucket by month — but a payment made April 5 might be FOR March
- Root cause: Conflating "when paid" with "what month it pays for"
- Rule: For any monthly bucket, ALWAYS use `payment.for_month`, never `payment.date`. Yearly view uses `payment.date` (different semantics — calendar year). All-time view uses no date filter.
- Impact: critical (caused wrong "Remaining" numbers shown to user)
- Date: 2026-04

**Naive `totalAmount − totalPaid` for remaining**
- Mistake: MonthsPage computed monthly remaining as `Σ usage − Σ paid` across all farmers — Farmer A's overpayment masked Farmer B's underpayment
- Root cause: Treating dues as fungible across farmers — but they aren't
- Rule: Monthly remaining = `Σ per-farmer max(0, usage_i − paid_i)`. Same pattern for all-time due per farmer (`max(0, ...)`).
- Impact: high
- Date: 2026-04

**Recovery rate exceeded 100%**
- Mistake: If a farmer overpaid, recovery rate showed values like 120% or 150%
- Root cause: No cap on `collected / usage × 100`
- Rule: Always wrap recovery percentages in `Math.min(100, Math.round(...))`
- Impact: low (cosmetic, but trust-eroding)
- Date: 2026-04

---

## 👥 Active-Farmer Filtering

**Three separate pages forgot active-farmer filter (UsagePage, PaymentsPage, MonthsPage)**
- Mistake: Counts and totals included deleted/disabled farmer entries because the entries themselves weren't filtered after fetching
- Root cause: Fetching all entries and filtering ONLY the farmer list — entries from inactive farmers still leak into counts and `rawUsage` month dropdowns
- Rule: Fetch active farmer IDs FIRST (`is_deleted=false AND is_disabled=false`), then filter every downstream collection (`usage_entries`, `payments`, derived `rawUsage`, computed month lists) by that ID set. Don't trust that filtering the farmer list alone is sufficient.
- Impact: high (caused ghost months in dropdowns, inflated entry counts, miscounted dues)
- Date: 2026-04

**Disabled vs Deleted both must be filtered out**
- Mistake: After adding `is_disabled` column, some places only filtered `is_deleted=false` and let disabled farmers leak into calculations
- Root cause: Adding a second flag means every existing filter needs updating
- Rule: Active = `is_deleted=false AND is_disabled=false`. Both conditions, always. If you grep for `is_deleted` in the codebase, every hit should have `is_disabled` next to it.
- Impact: high
- Date: 2026-04

---

## 💾 Backup & Restore

**Replace mode deletion order must respect FK constraints**
- Mistake: Early Replace logic tried to delete `farmers` before `usage_entries` / `payments` — FK constraint violation
- Root cause: `usage_entries.farmer_id` and `payments.farmer_id` reference `farmers(id) ON DELETE CASCADE`, but `month_closings.farmer_id` also references — and Postgres needs children gone first if you're not using CASCADE on every path
- Rule: Replace mode delete order: `month_closings → payments → usage_entries → farmers`. Always.
- Impact: medium
- Date: 2026-04

**Backup backward-compat needs explicit version handling**
- Mistake: Importing a v1.0 backup (no `month_closings` field) failed because the importer assumed the field existed
- Root cause: No null/undefined check on optional new fields
- Rule: When bumping backup version, treat all newly-added fields as optional in importer (`month_closings ?? []`). Add a version field to backup JSON so importers can branch.
- Impact: medium
- Date: 2026-04

---

## 🛠️ Build & TypeScript

**`verbatimModuleSyntax` requires `import type` for interfaces**
- Mistake: Initial build failed with 20+ errors because interface imports used regular `import { Foo }`
- Root cause: TS option `verbatimModuleSyntax` enforces explicit `import type` for type-only imports
- Rule: When importing from `types/index.ts` or any file that only exports types/interfaces, use `import type { Foo }` — never plain `import { Foo }`
- Impact: medium (build break)
- Date: 2026-04

**`react-resizable-panels` v4 renamed exports**
- Mistake: `resizable.tsx` from shadcn template used `PanelGroup` / `PanelResizeHandle` — v4 renamed them to `Group` / `Separator`
- Root cause: Major version upgrade with API rename
- Rule: When a shadcn ui/ component fails to compile after a dependency bump, check the dep's CHANGELOG for renamed exports before assuming the component is broken
- Impact: medium (build break)
- Date: 2026-04

---

## 🧪 SQL Verification Pitfalls

**JOIN multiplication in verification queries**
- Mistake: SQL query to verify a farmer's total paid amount used `JOIN payments` against another table — multi-row join multiplied the payment rows, showing ₹1000 paid instead of actual ₹500
- Root cause: Cartesian-style multiplication when joining two one-to-many tables to the same parent
- Rule: For aggregate verification, use subqueries or CTEs (`SELECT SUM(amount) FROM payments WHERE ...`) — NOT JOINs that multiply rows. The app code uses separate `.reduce()` calls (not JOINs), so app numbers are the trustworthy source.
- Impact: critical (almost led to "fixing" a non-existent bug)
- Date: 2026-04

---

## ⚙️ General Mistakes

**Don't assume "live in production" means "tested"**
- Mistake: After Round 4 deployment, three latent bugs (UsagePage filter, PaymentsPage rawUsage filter, MonthsPage per-farmer remaining) survived because no end-to-end audit was done
- Root cause: Deployed each round individually; assumed each round's narrow fix was complete; didn't audit interaction with prior rounds
- Rule: After any round that touches calculation/filter logic, do a full sweep of every page that reads the same data. Cross-check stat-card totals against per-farmer breakdowns — they should always reconcile.
- Impact: high
- Date: 2026-04

---

## 🛠 Claude Workflow & Tooling

**Claude bash mount can show truncated content for files written via Edit/Write tools**
- Mistake: After using the Edit or Write tool to modify an existing file, the bash mount sometimes returned a stale/truncated view of the file content (correct beginning, cut off mid-line) — making local `tsc -b` build appear to fail with confusing JSX/brace errors that didn't exist in the real file.
- Root cause: VFS caching layer between the file tools (which write to the user's Windows-native filesystem) and the bash sandbox mount. The Read tool sees actual disk state; the bash mount sometimes lags or holds a stale snapshot. Doesn't affect the user's machine or Netlify build — purely a Claude verification artifact.
- Rule: If a `tsc` or `vite build` reports errors that don't match the Read-tool view of the same file, suspect the bash mount. Force-sync by rewriting the file via `cat > /sessions/.../path <<'EOF' ... EOF`. After heredoc rewrite, bash and Read tool agree, and the build passes.
- Diagnostic: `stat <file>` showing a `Modify` time from before your edit + bytes count matching original size = stale mount. `tail -3 <file>` showing the file cut off mid-token confirms it.
- Impact: high (caused multiple confusing "build broken" detours in Session 2 Phase 2)
- Date: 2026-05-18
