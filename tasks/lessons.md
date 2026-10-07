# Lessons Learned — Tubewell Manager

> **Last Updated: 2026-10-06**
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

**Prove the applied migration equals the committed file**
- Practice (Phase 2A): write the SQL file first and apply exactly that text. Then compare `md5(array_to_string(statements, ''))` from `supabase_migrations.schema_migrations` with the file's md5.
- Keep migration files pure ASCII with LF line endings, so the hashes match.
- Impact: medium. Date: 2026-10-05.

**Running SQL tests through the MCP**
- Finding: `execute_sql` returns only the LAST result set. A final `SELECT` before `ROLLBACK` is still returned.
- Collect PASS/FAIL lines in a transaction-local setting (`set_config(..., true)`), not a temp table, so the results keep recording after `SET LOCAL ROLE anon/authenticated`.
- Run the residue check as a separate call after the rollback.
- Impact: medium. Date: 2026-10-05.

**`btrim()` trims spaces only**
- Finding: the `farmers_name_not_blank` check uses `btrim(name)`, which removes only spaces. A tab-only name passes the DB check.
- Rule: app forms must trim all whitespace before saving. Don't rely on the DB check alone.
- Impact: low. Date: 2026-10-05.

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
- Rule: if `tsc`/`vite` cannot be found, delete `node_modules` and run `pnpm install` again (an in-place install keeps saying "Already up to date"), or build in a clean copy (`git archive HEAD` into a temp dir) to verify.
- Impact: medium. Date: 2026-05-23, confirmed 2026-10-04 and 2026-10-05 (fixed by deleting node_modules in Phase 2B).

**Edit tools can save `\u` escapes as literal characters**
- Mistake: backslash-u escape sequences (for example the ones for the em dash and the no-break space) typed into an edit-tool string were written to disk as the real, sometimes invisible, characters, including inside the push-gate regex. This lesson line itself was hit the same way and fixed on 2026-10-05.
- Rule: for security-relevant code, generate the file with a script, or verify with a byte-level scan that no U+00A0, U+202F, U+200B–U+200F, U+2060 or U+FEFF remain.
- Impact: medium. Date: 2026-10-05.

**Vitest with `globals: false` needs explicit Testing Library cleanup**
- Finding (Phase 2B): with globals off, RTL cannot register its automatic `afterEach(cleanup)`, so rendered trees leak between tests.
- Rule: keep `afterEach(cleanup)` in `src/test/setup.ts`.
- Impact: low. Date: 2026-10-05.

**Vitest 5 ignores `// @vitest-environment` file comments**
- Finding (Phase 3): per-file `// @vitest-environment node` comments had no effect; the run still created jsdom once per file. Vitest 5's dist has no code that reads such comments.
- Rule: don't rely on environment comments. The environment comes from `vite.config.ts` only, and changing it needs owner approval. Pure engine tests run fine under jsdom.
- Impact: low. Date: 2026-10-06.

**Run timezone checks from PowerShell, not Git Bash**
- Finding (Phase 3): in Git Bash, `TZ=America/Los_Angeles node ...` reached Node with `TZ` unset (values containing `/` were dropped), so the "other timezone" run silently used IST. `TZ=PST8PDT` and `TZ=UTC` did work.
- Rule: set `$env:TZ='America/Los_Angeles'` in PowerShell. Always print `new Date(0).getTimezoneOffset()` first to prove the zone took effect.
- Impact: medium (a false "passes in every timezone"). Date: 2026-10-06.

**A source-text guard also reads comments**
- Finding (Phase 3): the engine's static guard scans raw source, so a comment saying "Callers import from '@/lib/ledger'" counted as an outside import.
- Rule: in engine files, keep comments free of import-like text and of the forbidden tokens (C2). Don't weaken the guard to strip comments.
- Impact: low. Date: 2026-10-06.

**Prove a guard test can fail**
- Practice (Phase 3): after the static guard and fixtures passed, temporarily inject a violation, see the tests fail, then revert. Examples: `Date.now()` in `money.ts`, or rounding `+ 60` → `+ 59`.
- Impact: medium. Date: 2026-10-06.

**`react-hooks/set-state-in-effect` also flags state set after an `await`**
- Finding (Phase 4A): an effect that called a `useCallback` async loader failed lint, even though every `setState` came after `await`.
- Rule: in a load-on-mount effect, set state only inside promise callbacks (`listX().then(onOk, onError)`). Put the "show loading again" step in the explicit `reload()` handler, not in the effect.
- Impact: low. Date: 2026-10-06.

**Radix modals hide the rest of the page from role queries**
- Finding (Phase 4A): while a Radix `Dialog` is open, everything outside it gets `aria-hidden`, so `getByRole('list')` in a test fails.
- Rule: to assert on the page behind an open modal, pass `{ hidden: true }` to the role query. Don't remove the modal behaviour; it is what traps focus for real users.
- Impact: low. Date: 2026-10-06.

**supabase-js reports a 0-row update as success**
- Rule (Phase 4A): every update in the data layer ends with `.select().maybeSingle()`, and a `null` row becomes `DataError('not_found')`. Never trust `error === null` alone for an update.
- Impact: medium. Date: 2026-10-06.

**A failed refresh after a successful save must not hide the list**
- Mistake (Phase 4A, found in owner review): the quiet reload after a mutation used the same failure path as the initial load, so a saved change could be followed by the full error screen.
- Rule: keep "load failed" (no data yet: error state) and "refresh failed" (data on screen: keep it, show one line with a retry) as separate states. Both hooks share this through `useRowStore`.
- Impact: medium. Date: 2026-10-06.

**SQL residue checks must not assume empty tables**
- Finding (Phase 5): T6 checked `farmers + usage + payments = 0`, but the owner's own (soft-deleted) smoke-test rows now exist, so it would fail without any residue.
- Rule: record the row counts before the tests (T0.01) and compare after the rollback (T6.01). Tests create their own rows inside the rolled-back transaction and never touch or count the owner's rows.
- Impact: medium. Date: 2026-10-06.

**"Delete" in the app is a soft delete**
- Finding (Phase 5): the owner "deleted all entries" in the app before a precondition check that expected 0 rows; the rows stayed (with `deleted_at` set), by design.
- Rule: preconditions about live data should be written as "unchanged from the start count" or "0 live rows", not "0 rows". Only the Phase 10 SQL wipe removes rows.
- Impact: low. Date: 2026-10-06.

**pnpm 11 skips packages published less than a day ago**
- Finding (Phase 4A): `pnpm add @radix-ui/react-dialog` installed 1.1.23 while 1.2.0 was the newest; 1.2.0 was under a day old (pnpm's default minimum release age).
- Rule: report the version actually installed (`pnpm add` output or `package.json`), not the registry's "latest".
- Impact: low. Date: 2026-10-06.

**shadcn components trip `react-refresh/only-export-components`**
- Finding: `button.tsx` exports `buttonVariants` next to the component, so lint fails with `--max-warnings=0`.
- Rule: don't hand-edit generated `src/components/ui/*`. Turn that one rule off only for that folder (done in `eslint.config.js`).
- Impact: low. Date: 2026-10-05.

**pnpm 11 `peers check` can report a false "unmet peer"**
- Finding: `tailwindcss-animate` wants `>=3.0.0 || insiders`, and pnpm 11.1.3 flags the installed `tailwindcss 3.4.1` as unmet.
- Rule: read the range before "fixing" a peer warning. Never upgrade Tailwind to silence it (a major bump needs owner sign-off).
- Impact: low. Date: 2026-10-05.

**Vitest empties CSS modules, even with `?raw`**
- Finding (Phase 6C): `import.meta.glob('/src/index.css', { query: '?raw' })` returns `''` under Vitest, so a token test silently parsed nothing.
- Rule: a test that must read CSS text reads the file from disk (`node:fs` through a dynamic import, as in `src/components/tone.test.ts`). Make the parser throw when a token is missing, so an empty read fails loudly.
- Impact: low. Date: 2026-10-06.

**Never commit the owner's uid or other real ids**
- Practice (migration 004): read the owner id from `auth.users` at apply or test time and build the policy with `format(%L)`. The repo is public.
- Impact: medium. Date: 2026-10-05.

**A lazy page chunk stays cached across tests in one file**
- Finding (PL1): once one test has loaded a `React.lazy` page, later tests in the same file render it at once, so a "shows the fallback" check passed or failed by test order.
- Rule: test a Suspense fallback with its own never-resolving `lazy(() => new Promise(() => {}))` component, not through the real routes. Route tests await pages with `findBy...`.
- Impact: low. Date: 2026-10-07.

**Bash double quotes run backticks, even inside a `node -e` script**
- Finding (PL1): a `node -e "..."` edit whose text held `?month=` in backticks ran it as a command, and the comment lost the words silently.
- Rule: write edit scripts to a file through a quoted heredoc (`<<'EOF'`) or use the Edit tool. Check the edited lines afterwards.
- Impact: low. Date: 2026-10-07.

### Process and deployment

**"Live" does not mean "tested"**
- Mistake: three latent v1 calculation bugs survived several deploys because no end-to-end audit was done.
- Rule: after any change touching calculations or filters, cross-check totals against the per-farmer breakdowns, and run the fixture tests (E1–E24).
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
- Rule: push only `rebuild/fresh-system`, once at the end of a completed task, via the prompt's push step. This rule was updated on 2026-10-05; it originally said "no pushes during the rebuild". Netlify stays disabled until Phase 10. When it is re-enabled, keep branch deploys and deploy previews OFF.
- Impact: medium. Date: 2026-10-05.

**Shell commands must not mention the push guard's marker filename**
- Mistake: twice in Phase 0/1, a harmless read-only check (`git check-ignore`, a `node -e` link check) named the guard's marker file together with `echo`/`node`. The guard blocked it, failing closed.
- Rule: never put the marker filename in a shell command. Put any such check in a script file, and match hidden `.claude/` files generically. The guard deletes its own marker, so no manual cleanup command is needed.
- Impact: low (blocked work, no harm). Date: 2026-10-05.

---

## Tooling-only (environment-specific; kept for reference)

**Generated test rows must have the database's shape when they cross a validator**
- Finding (Phase 9): seeded rows with readable ids passed every ledger check but the backup validator (correctly) rejected them, because real ids are uuids.
- Rule: map generated ids to stable uuids (or generate uuids) before a test goes through `validateBackup` or anything else that checks DB shapes.
- Date: 2026-10-07.


**The Write tool decodes `\uXXXX` escapes into real characters**
- Finding (Phase 8): writing `'\ufeff'` or a regex with `\u00a0` through the Write tool put the real BOM / NBSP into the source (ESLint `no-irregular-whitespace` caught the NBSP).
- Rule: after writing a file with `\u` escapes, check it for non-ASCII bytes and re-escape with a script, or build such characters with `String.fromCharCode`.
- Date: 2026-10-06.

**A piped `tail` hides a failing command's exit code**
- Finding (Phase 8): `pnpm run typecheck 2>&1 | tail` returned 0, so a chained `git commit` ran despite a type error.
- Rule: run each gate without a pipe (or check `$?` / `set -o pipefail`) before committing.
- Date: 2026-10-06.

**`git stash pop` on Windows writes CRLF**
- Finding (Phase 7B / 8): with `core.autocrlf=true`, files restored by `git stash pop` came back with CRLF, so later text replacements that expected LF failed.
- Rule: normalise with `sed -i 's/\r$//'` before scripted edits; the repo content does not change.
- Date: 2026-10-06.


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
