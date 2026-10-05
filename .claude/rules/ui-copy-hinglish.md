---
paths:
  - "src/**/*.tsx"
---

# UI copy rules (Hinglish)

**Tone.**
- Hinglish, as the owner's family speaks it.
- Not formal Hindi (no शुद्ध हिंदी), not corporate English. Short, direct, friendly.

**Labels that carry over from v1 (use them as written):**
- "Kisan", "Kisan Add karo"
- "Pani Entry karo"
- "Paisa Add karo"
- "Kitna Baki Hai"
- "Hisaab"

**Two concepts that must never be mixed** (`docs/LEDGER_AND_ALLOCATION.md` L10):
- **"Cash Mila (is mahine)"**: cash received, i.e. payments dated in the period.
- **"Charge Clear (is mahine ka)"**: how much of that month's charge is settled (`paid_i`).

Never label one figure with the other's words, and never add them together.

**Credit and outstanding.**
- Credit is shown as **"Advance / Credit"**.
- Outstanding is shown as **"Baki"** / "Kitna Baki Hai".
- Never show credit as a negative Baki. Never show a cross-farmer figure that nets credit against dues.

**Month status words:** "Settled", "Partial", "Unpaid". The label for a charge-0 month is PENDING OWNER DECISION.

**Duplicates.** A duplicate is shown as a warning with an option to save anyway, never as a hard error (L14). The exact Hinglish wording is decided with the owner in Phase 4/5.

**Forbidden.** No v1 wording: "Kis month ke liye?", "hisaab close karo", "WhatsApp Bhejo", multi-month allocation by hand. No "entry by <user>" display (there is a single user).

Copy does not compute. Every number shown comes from the ledger engine.
