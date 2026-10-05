# Tubewell Manager

Owner-only web app for a family tubewell business in India. It records water usage (time × rate) and farmer payments, and derives each farmer's account: monthly charges, FIFO allocation of payments, outstanding dues and carried-forward credit. The UI is in Hinglish.

> **Status:** full rebuild in progress on branch `rebuild/fresh-system` (backed up on `origin`). `main` is the old v1 system, untouched until cutover. See [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Stack

React 19 · TypeScript · Vite · Tailwind 3 · shadcn/ui · Supabase (Postgres, Auth, RLS) · Netlify · pnpm.

## Run locally

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Create `.env` (gitignored) by copying `.env.example`. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the Supabase project `tubewell-hisab`: Dashboard → Project Settings → API Keys, publishable key. Never use a secret / service-role key.
3. Start the dev server and open http://localhost:5173:
   ```bash
   pnpm run dev
   ```
   Log in with the owner's account. There is no sign-up.

Other commands:

```bash
pnpm run test        # unit + component tests (Vitest)
pnpm run typecheck   # tsc -b
pnpm run lint        # eslint, zero warnings allowed
pnpm run build       # type-check + production build into dist/
```

## Documentation map

| File | Purpose |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Rules and session protocol for Claude Code (deploy safety, non-negotiables) |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Phase plan, decisions log, session log, owner actions, open questions |
| [BUSINESS_KNOWLEDGE.md](BUSINESS_KNOWLEDGE.md) | Business, terminology, Hinglish labels |
| [docs/LEDGER_AND_ALLOCATION.md](docs/LEDGER_AND_ALLOCATION.md) | **Authoritative** calculation spec with worked examples |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, data model, data-access and testing approach (draft) |
| [tasks/todo.md](tasks/todo.md) | Phase checklist and parked ideas |
| [tasks/lessons.md](tasks/lessons.md) | Lessons learned |
| `.claude/rules/` | Path-scoped rules for Claude Code |
| [archive/v1-2026-10/](archive/v1-2026-10/README.md) | Old v1 docs and migrations (reference only) |
