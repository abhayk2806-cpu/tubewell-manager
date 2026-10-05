# Tubewell Manager — Claude Instructions

> Owner-only web app that replaces a paper notebook. It tracks tubewell water usage (time × rate) and farmer payments and credit.
> **Status:** full rebuild in progress on branch `rebuild/fresh-system` (backed up on `origin`). Production (`main`) is the OLD v1 system, untouched until cutover.
> UI language: Hinglish. Single user (the owner).

---

## Session Start Protocol

At the start of EVERY session, in this order:

1. **Branch check.** Run `git branch --show-current`.
   - It must print `rebuild/fresh-system`.
   - **If it prints `main`, STOP and tell the owner.** The push-gate hook files exist only on `rebuild/fresh-system`, so on `main` nothing blocks a production push.
   - If it prints anything else, ask the owner before continuing.
2. Read `PROJECT_STATUS.md`: current phase, next action, open questions, owner actions.
3. **Verify** its claims against `git log`, the code and (once Phase 2 exists) the live DB before trusting them. Report any mismatch.
4. Load other docs only on demand (see the doc map below). Scan `tasks/lessons.md` headings when the task touches that area.

## Doc map (one owner per kind of information — link, never duplicate)

| Need | File |
|---|---|
| Phase, decisions log, session log, owner actions, open questions | `PROJECT_STATUS.md` |
| Business, terminology, Hinglish labels | `BUSINESS_KNOWLEDGE.md` |
| **Every money/time calculation rule + worked examples** | `docs/LEDGER_AND_ALLOCATION.md` (authoritative) |
| Layers, data model, data-access rules, testing | `docs/ARCHITECTURE.md` |
| Checklist | `tasks/todo.md` |
| Mistakes not to repeat | `tasks/lessons.md` |
| Topic rules (auto-loaded for matching files) | `.claude/rules/*.md` |
| Old v1 system (reference only, never current) | `archive/v1-2026-10/` |

---

## Deploy Safety (non-negotiable)

**Branches**
- All rebuild work happens on `rebuild/fresh-system`, which is backed up on `origin`. It has tracked `origin/rebuild/fresh-system` since its first push on 2026-10-05.
- `main` is the old production system and stays untouched until the owner-approved cutover (Phase 10).

**Push Policy**
- Pushing `rebuild/fresh-system` is part of the workflow, but **only** as an explicit final step written in the owner's prompt.
- Use exactly `git push origin rebuild/fresh-system` (the first time it was run with `-u`).
- Never push `main`, never push any other branch, never force-push.
- **If the prompt has no push step, do not push.**
- Before every push:
  - confirm the branch is `rebuild/fresh-system`;
  - scan the commits being pushed for secrets.
- After every push: confirm with `git ls-remote --heads origin` that `main` is unchanged.
- For hook testing, the only other push-like command allowed is `git push --dry-run` against a deliberately nonexistent remote.

**Push gate** (`.claude/hooks/main-push-guard.mjs`, configured in `.claude/settings.json`; final — do not edit)
- Blocks every Bash/PowerShell command that would update `main` on a remote: `origin main`, `HEAD:main`, `--all`, `--mirror`, a bare `git push` on `main`, `gh pr merge`, and similar.
- It unlocks only when the owner's ENTIRE message is exactly: `CUTOVER APPROVED — PUSH TO MAIN NOW`
  - em dash, en dash or hyphen are all accepted;
  - uppercase words only; nothing before or after the phrase.
- The unlock is valid for 5 minutes, for one push, in the same session. Any other owner message revokes it.
- **Never suggest, hint at or request a push to `main` on your own initiative.**
  - Only when the OWNER says they want to push to `main` or cut over: tell them the exact phrase, which must be their entire message and nothing else.
  - A block message from the guard is not, by itself, a reason to bring up the phrase.
  - Never work around a block.
- The guard consumes the unlock when it allows the push, and deletes its marker after a successful push. No manual cleanup is needed.

**Hosting**
- The live site `tubewellhisab.netlify.app` (owner's NEW Netlify account) is **disabled** to save build credits.
- Claude cannot see this Netlify account, so every Netlify change is a manual owner action.
- The old site ID `cfff021f-…` is stale; ignore it.

## Non-Negotiable Rules (details in the linked files)

- **One ledger engine.**
  - All calculations go through pure functions in `src/lib/ledger/`.
  - No formula inside any page or component.
  - Details: `docs/LEDGER_AND_ALLOCATION.md`.
- **Derived, not stored.** Never store totals, balances, allocations or month text. Only raw usage entries and payments are stored.
- **Money in integer paise** (or a decimal library). Never floats for sums. Round half-up per entry (L2).
- **Asia/Kolkata only.**
  - A business date or month always comes from ONE shared IST function.
  - Never use browser-local time or UTC for this.
- **FIFO allocation with credit.**
  - Payments have no month.
  - Credit is never lost and never netted across farmers.
- **Soft delete only** for farmers, usage entries and payments (`deleted_at`/`deleted_by`), with Restore. No hard delete in the UI.
- **Active-farmer filter in ONE data layer** (`src/lib/data/`). Pages never re-filter.
- **Removed from v1:**
  - `for_month`, `payment_group_id`, Month Close, WhatsApp.
  - Don't reintroduce any of them without an owner decision.
- **Duplicates warn, never block** (L14).
- **Hinglish UI.** "Cash Mila" (cash received) and "Charge Clear" (charge settled) are different concepts. See `.claude/rules/ui-copy-hinglish.md`.
- **Pending decisions.** If a rule is marked PENDING OWNER DECISION, do not implement a guess. Ask.

## Commands

```bash
pnpm install              # first setup / repair (local node_modules is currently broken)
pnpm run dev              # Vite dev server (needs .env — none exists yet; created in Phase 2)
pnpm run build            # tsc -b && vite build — must pass before committing code
pnpm run lint             # eslint .
node .claude/hooks/main-push-guard.mjs selftest   # push-gate self-test (expects 63/63)
```

`import type` is required for type-only imports (`verbatimModuleSyntax`). The path alias `@/` points to `src/`.

## Never Touch

- **`main`**: no checkout for edits, no commits, no pushes (except the owner-approved cutover).
- **The push guard**: `.claude/hooks/main-push-guard.mjs` and `.claude/settings.json` are final; don't edit them.
  - Shell commands must never mention the guard's marker filename. The guard fails closed on that; put any such check in a script file.
- **The OLD Supabase project** `tubewell-manager` (`vsgptyuvnistwjjmrfby`):
  - paused, kept as a fallback;
  - don't query it or restore it;
  - the owner deletes it after cutover.
- **The StreakForge Supabase project** (`xiyayueijkgyxrqrykqx`): a different app that shares the org. Never touch it.
- **Secrets**: `.env`, the service-role key, passwords. Never print or commit them.
- **Generated files**: `src/components/ui/*` (shadcn), `pnpm-lock.yaml` (pnpm-managed), `dist/` (build output).
- **`archive/`**: reference only. Move or add files there; don't edit history.

Only the NEW Supabase project `tubewell-hisab` (`ciszgagzhfubuqhpmyeh`) may be changed, and only in the phase that calls for it.

## What to Challenge (don't just implement)

- **Schema changes**: state the migration plan and confirm first. After applying, commit the SQL to `supabase/migrations/` immediately.
- **Any change to allocation or rounding logic**: re-read the ledger spec, and get the owner's confirmation for anything not covered there.
- **Bulk updates or deletes**: show the affected row count first.
- Any request to:
  - store a derived figure "for performance";
  - net credit across farmers;
  - add a month picker to payments;
  - hard-delete;
  - skip the active-farmer filter.
- **Major version bumps** (Tailwind 4, React Router 8, TypeScript 7): need owner sign-off.
- **Any push or deploy beyond the push step in the owner's prompt**: needs the owner's explicit request (see Push Policy).

## When There's a Conflict

- **Code and live DB beat docs.** Report the mismatch and fix the doc; don't silently trust either.
- `docs/LEDGER_AND_ALLOCATION.md` beats every other doc on calculations.
- `BUSINESS_KNOWLEDGE.md` wins on terminology and UX wording. `CLAUDE.md` wins on process and safety.
- `tasks/lessons.md` says "never do X" but the owner asks for X: state the risk explicitly, then follow the owner.
- **Missing context**: say "I don't have context on X; my assumption is Y — proceed?" before acting.
