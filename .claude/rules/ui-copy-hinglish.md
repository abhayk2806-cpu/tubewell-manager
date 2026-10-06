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
- **D32 (owner, 2026-10-06):** the screens keep the spelling **"Baaki"** ("Abhi baaki", "Baaki nahi"); "Kitna Baki Hai" is not used. Picker options read "Naam — Baaki ₹x" / "Naam — Advance ₹x" / "Naam — Baaki nahi".
- Other D32 labels: "Pura ₹X bharo" (fill the full Baaki), "Band karo (delete nahi)", "Pani ka samay", "Total pani ka samay", "Chalu kisan", "Kisan dhundo (naam ya mobile)", "Kahan laga" (a payment's trail).

**Month status words:** "Settled", "Partial", "Unpaid".
- A month with charge 0 and cash received > 0 shows the badge **"Sirf Payment"** (D3, 2026-10-05).
- In a payment's allocation trail, an unapplied remainder is labelled **"Advance / Credit"** (D5).

**Duplicates.** A duplicate is shown as a warning with an option to save anyway, never as a hard error (L14). The exact Hinglish wording is decided with the owner in Phase 4/5 (decided 2026-10-05).

**Forbidden.** No v1 wording: "Kis month ke liye?", "hisaab close karo", "WhatsApp Bhejo", multi-month allocation by hand. No "entry by <user>" display (there is a single user).

Copy does not compute. Every number shown comes from the ledger engine.
