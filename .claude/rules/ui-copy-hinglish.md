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

**App shell strings (PL1, `src/components/shellCopy.ts`):**
- While a screen's code loads: "Load ho raha hai..." (muted line).
- When a screen's code cannot be downloaded: "Yeh screen load nahi ho payi." / "Internet check karo, ya app ka naya version aa gaya hai. Page dobara load karo." / button "Dobara try karo" (reloads the page).

**Config-error screen (P10A-fix1, `src/configErrorCopy.ts`):** shown at start-up when a Supabase variable is missing or wrong; it names the variables, never their values.
- "App shuru nahi ho paya." / "Supabase se judne ki setting adhoori ya galat hai."
- "Yeh variable nahi mila:" / "Yeh variable galat hai (https:// se shuru hona chahiye):"
- "Netlify mein Environment variables check karo, phir dobara deploy karo." / button "Dobara try karo".

**Month status words:** "Settled", "Partial", "Unpaid".
- A month with charge 0 and cash received > 0 shows the badge **"Sirf Payment"** (D3, 2026-10-05).
- In a payment's allocation trail, an unapplied remainder is labelled **"Advance / Credit"** (D5).

**Duplicates.** A duplicate is shown as a warning with an option to save anyway, never as a hard error (L14). The exact Hinglish wording is decided with the owner in Phase 4/5 (decided 2026-10-05).

**Forbidden.** No v1 wording: "Kis month ke liye?", "hisaab close karo", "WhatsApp Bhejo", multi-month allocation by hand. No "entry by <user>" display (there is a single user).

Copy does not compute. Every number shown comes from the ledger engine.
