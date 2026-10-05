# Tubewell Manager

Owner-only web app for a family tubewell business in India. It records water usage (time × rate) and farmer payments, and derives each farmer's account: monthly charges, FIFO allocation of payments, outstanding dues and carried-forward credit. The UI is in Hinglish.

> **Status:** full rebuild in progress on branch `rebuild/fresh-system` (backed up on `origin`). `main` is the old v1 system, untouched until cutover. See [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Stack

React 19 · TypeScript · Vite · Tailwind 3 · shadcn/ui · Supabase (Postgres, Auth, RLS) · Netlify · pnpm.

## Run locally

```bash
pnpm install
pnpm run dev
```

You need a `.env` file at the repo root (gitignored; template in `.env.example`) with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the NEW Supabase project. That file is created in Phase 2.

Other commands:

```bash
pnpm run build   # type-check + production build
pnpm run lint
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
