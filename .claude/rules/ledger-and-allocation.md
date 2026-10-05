---
paths:
  - "src/lib/ledger/**"
  - "src/**/*.test.{ts,tsx}"
  - "tests/**"
---

# Ledger engine rules

The authoritative spec is `docs/LEDGER_AND_ALLOCATION.md` (rules L1–L18, worked examples E1–E22). Read it before changing engine code or tests. Do not restate or reinterpret its rules here or in code comments; link to the rule number instead.

Five invariants. Breaking any of them is a bug:

1. **One engine.**
   - Every derived figure comes from pure functions in `src/lib/ledger/`: charge, paid, remaining, outstanding, credit, allocation trail, months list, dashboard totals.
   - No I/O and no React in the engine.
2. **Derived, not stored.**
   - Inputs are raw usage entries and payments only.
   - Never persist totals, allocations, balances or month text.
3. **Integer paise.**
   - All money math is in integer paise.
   - Round half-up per entry (L2), using integer arithmetic only.
   - Never use floats to sum money.
4. **One IST month/day function.**
   - Every month or date bucket uses the single shared Asia/Kolkata function.
   - Never `Date#getMonth()` in local time, never UTC.
   - Test near midnight IST (E20).
5. **No per-page formulas.**
   - Pages, components and hooks call the engine; they never compute money themselves.
   - If a screen needs a new figure, add it to the engine with a test.

Testing:
- Worked examples E1–E22 are the fixtures. Expected values are exact paise, not approximations.
- Any change to engine behaviour needs a fixture that fails before the change.
- If a rule is marked PENDING OWNER DECISION, don't implement a guess; ask the owner.
