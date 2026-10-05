# Archive — Tubewell Manager v1 (archived 2026-10-05)

> **REFERENCE ONLY. This folder describes the OLD v1 system. Never treat anything here as current.**

What v1 was:

- Payments were assigned to a month by hand (`payments.for_month`). Multi-month payments were split into rows sharing a `payment_group_id`.
- Each month was floored at ₹0 due, so any overpayment (credit) was lost.
- WhatsApp click-to-send notifications (wa.me links), templates and a send log.
- A "Month Close" marker (`month_closings` table).
- Data lived in the OLD Supabase project `tubewell-manager` (`vsgptyuvnistwjjmrfby`). That project is now paused and will be deleted by the owner after cutover.
- Hosting used an old Netlify account. The site ID `cfff021f-…` in these files is stale.

The rebuild (branch `rebuild/fresh-system`) replaces all of this with:

- a continuous per-farmer ledger;
- automatic FIFO allocation with credit carried forward;
- a NEW Supabase project.

Current docs live at the repo root and in `docs/`. Start with `CLAUDE.md` and `PROJECT_STATUS.md`.

## Contents

| File | What it was |
|---|---|
| `CLAUDE.v1.md` | The v1 `CLAUDE.md`. Renamed so Claude Code never auto-loads it as instructions; subdirectory `CLAUDE.md` files load on demand. |
| `PROJECT_STATUS.md` | v1 status, decisions log and session log (Apr–May 2026) |
| `BUSINESS_KNOWLEDGE.md` | v1 terminology, tone and evolution log (Rounds 1–8) |
| `PROJECT_MEMORY.md` | v1 deep reference: schema, calculation logic, bug history, April 2026 ground-truth numbers, WhatsApp addendum |
| `tasks/todo.md` | v1 task list and backlog |
| `tasks/lessons.md` | v1 lessons as of 2026-10-04. The curated active list is in `tasks/lessons.md` at the repo root. |
| `tasks/whatsapp-plan.md` | Track A (WhatsApp) plan |
| `supabase-migrations/001–006` | v1 schema history. Applied to the OLD project only. The NEW project starts its numbering at 001. |

Still useful as history: the bug list and the ground-truth numbers in `PROJECT_MEMORY.md` show the classes of mistakes the new ledger engine and its tests must prevent.
