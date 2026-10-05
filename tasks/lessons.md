# Lessons Learned — Tubewell Manager

> **Last Updated: 2026-10-05**
> At session start, scan the headings only and read a section when the task touches it.
> Add a lesson immediately after any correction. Never silently delete one: move it to "Superseded" with a reason.
> The full v1 text of every lesson is in [archive/v1-2026-10/tasks/lessons.md](../archive/v1-2026-10/tasks/lessons.md).

Format: **Title** · Mistake · Rule · Impact · Date.

---

## Active lessons

### Database and migrations

**Migrations applied outside the repo must be committed immediately**
- Mistake: v1 migrations applied via the Supabase MCP existed only in the live DB.
- Rule: after every `apply_migration` (or dashboard SQL), write the same SQL to `supabase/migrations/NNN_name.sql` and commit it at once.
- Impact: high. Date: 2026-04.

**IST timezone conversion bug**
- Mistake: `(date AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata'` double-converted and pushed 1 April IST into March.
- Rule: for a `timestamptz`, use `x AT TIME ZONE 'Asia/Kolkata'` once. In app code, use the single shared IST function. Always test times near midnight IST (see fixture E20).
- Impact: high. Date: 2026-04.

**JOIN double-counting when verifying with SQL**
- Mistake: a verification query that joined two one-to-many tables doubled a farmer's payments (₹1,000 instead of ₹500).
- Rule: verify aggregates with subqueries or CTEs (`SELECT SUM(...) FROM payments WHERE ...`), never with multiplying JOINs.
- Impact: critical. Date: 2026-04.

### Active-farmer filtering (idea kept, mechanism to rethink)

**Filtering only the farmer list is not enough**
- Mistake: v1 pages filtered farmers but not their entries and payments, so ghost months and inflated totals appeared.
- Rule (rebuild): apply the active filter ONCE in the data layer, to every collection derived from farmers. Pages never re-filter.
- Impact: high. Date: 2026-04.

**Disabled AND deleted must both be excluded**
- Mistake: after `is_disabled` was added, some filters still checked only `is_deleted`.
- Rule: the definition of "active" lives in one function, and every new status flag updates that function.
- Impact: high. Date: 2026-04.

### Build, TypeScript and tooling

**`verbatimModuleSyntax` requires `import type`**
- Mistake: plain imports of interfaces broke the build.
- Rule: use `import type { X }` for type-only imports.
- Impact: medium. Date: 2026-04.

**Renamed library exports (shadcn components after dependency bumps)**
- Mistake: `react-resizable-panels` v4 renamed `PanelGroup`/`PanelResizeHandle`.
- Rule: when a generated UI component stops compiling after a bump, check the library's changelog for renamed exports first.
- Impact: medium. Date: 2026-04.

**pnpm `node_modules` can break silently**
- Mistake: `pnpm install` said "Already up to date" while `node_modules/typescript` was missing. This was reproduced again on 2026-10-04.
- Rule: if `tsc`/`vite` can't be found, do a fresh `pnpm install`, or build in a clean copy (`git archive HEAD` into a temp dir) to verify.
- Impact: medium. Date: 2026-05-23, confirmed 2026-10-04.

**Edit tools can save `\u` escapes as literal characters**
- Mistake: `—`, ` ` etc. typed into an edit-tool string were written to disk as the real (sometimes invisible) characters, including inside the push-gate regex.
- Rule: for security-relevant code, generate the file with a script, or verify with a byte-level scan that no U+00A0, U+202F, U+200B–U+200F, U+2060 or U+FEFF remain.
- Impact: medium. Date: 2026-10-05.

### Process and deployment

**"Live" does not mean "tested"**
- Mistake: three latent v1 calculation bugs survived several deploys because no end-to-end audit was done.
- Rule: after any change touching calculations or filters, cross-check totals against the per-farmer breakdowns, and run the fixture tests (E1–E22).
- Impact: high. Date: 2026-04.

**Backup format needs version handling**
- Mistake: importing an older backup failed on a missing field.
- Rule: every backup carries a version header. The importer treats newly added fields as optional and branches on version.
- Impact: medium. Date: 2026-04.

**Docs held a stale Netlify site ID from a different account**
- Mistake: v1 docs named site `cfff021f-…` and URL `tubewell-manager.netlify.app`. The real site had moved to `tubewellhisab.netlify.app` in a new account.
- Rule: treat infrastructure IDs in docs as claims. Verify them, and record which account they belong to.
- Impact: medium. Date: 2026-10-05.

**Netlify build credits make frequent pushes costly**
- Rule: no pushes during the rebuild. Netlify stays disabled until Phase 10. When it is re-enabled, keep branch deploys and deploy previews OFF.
- Impact: medium. Date: 2026-10-05.

---

## Tooling-only (environment-specific; kept for reference)

**Stale file view in the old Cowork sandbox mount**
- After an Edit/Write, the bash mount sometimes showed a truncated old copy of the file, so builds failed on errors that didn't exist.
- Rule: if build errors don't match the Read-tool view of the file, suspect the mount and re-sync.
- Date: 2026-05-18.

**`.git/index.lock` stuck on the Windows mount (old sandbox)**
- The Linux sandbox couldn't delete a lock file created on the Windows filesystem.
- Rule: if it recurs, the owner removes `.git\index.lock` from Windows. Note that the old workaround text used the wrong path `Documents\GitHub\…`; the repo is at `Documents\tubewell-manager`.
- Date: 2026-05-23.

---

## Superseded (v1) — kept for history, do not apply

| v1 lesson | Why superseded | Principle that survives |
|---|---|---|
| Filter monthly payments by `payment.for_month`, never `payment.date` | Payments have no month; FIFO allocation (ledger L5–L6) | Cash received (by payment date) and charge settled are different concepts (L10) |
| Monthly remaining = Σ per-farmer `max(0, usage − paid)` per month | The per-month ₹0 cap lost credit; replaced by the FIFO waterfall with carry-forward | **One farmer's credit must never offset another farmer's due** (L8, L11) |
| Multi-month payments = N rows sharing `payment_group_id` | No month selection, so no grouping is needed | — |
| Multi-month WhatsApp `paid_before` must exclude the whole group | WhatsApp and grouping are both removed | Messages and figures must be computed from current DB data, not stale screen state |
| Replace-mode delete order `month_closings → payments → usage_entries → farmers` | Tables changed. Also, its stated cause was wrong: the v1 foreign keys were `ON DELETE CASCADE`, so child rows cascaded anyway | Replace mode still needs a defined order and a double confirmation (`.claude/rules/backup-restore.md`) |
| Recovery rate capped at 100% | Dashboard metrics are redefined in the ledger spec (L11) | Never show a misleading percentage |
