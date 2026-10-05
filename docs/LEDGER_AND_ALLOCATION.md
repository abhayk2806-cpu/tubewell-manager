# Ledger and Allocation — Authoritative Spec

> **Status:** owner-approved rules, transcribed 2026-10-05. Owner decisions D1–D8 were recorded on 2026-10-05 (see "Decided" at the end). Tests come first, in Phase 3.
> **This file is the single source of truth** for every money and time calculation in the app.
> Code, other docs and `.claude/rules/` must point here; they must not restate the rules.
> Every number in the worked examples was checked on 2026-10-05 with an independent throwaway script (integer paise).

## Definitions

| Term | Meaning |
|---|---|
| Usage entry | One recorded tubewell run for one farmer: start timestamp, hours, minutes, rate. |
| Amount | The charge for one usage entry (L2). |
| IST month | Calendar month of a timestamp in Asia/Kolkata (UTC+05:30, no DST), written `YYYY-MM` (L3). |
| Monthly charge bucket | Sum of a farmer's non-deleted entry amounts in one IST month (L4). |
| Payment | Money received from a farmer at a real timestamp. It is never assigned to a month (L5). |
| Paid / remaining (per bucket) | How much of a bucket the FIFO waterfall has settled, and what is left (L6). |
| Outstanding | Sum of the farmer's remaining across all buckets (L6). |
| Credit / advance | Money paid beyond total charges. It is carried forward and never lost (L6, L8). |
| Allocation trail | The (month, amount) pieces that each payment was applied to (L7). |
| Cash received | Payments whose timestamp falls in a period. This is **not** the same as charge settled (L10). |

## Rules

**L1. Source of truth.**
- Only raw usage entries and payments are stored.
- Everything else is derived at read time by ONE shared pure engine (`src/lib/ledger/`). That covers monthly charge, paid, remaining, outstanding, credit, the allocation trail and every dashboard figure.
- Never store totals, allocations or month text.

**L2. Usage entry.**
- Fields: farmer, timestamp, hours, minutes (0–59), total_minutes, and rate_per_hour stored on each entry (default 100).
- The rate is whole paise only, at most 2 decimals (D6).
- `amount = round_half_up(total_minutes × rate_per_hour / 60)` to 2 decimals, computed in integer paise.
  - Integer form (D7): `amount_paise = floor((2 × total_minutes × rate_paise + 60) / 120)`.
  - This formula was checked equal to the definition for every E22 case.
- The amount is **not stored** (D7). The ledger engine is the only implementation of this rounding; the Phase 9 script recomputes it independently.
- Entries stay individually stored and individually editable.

**L3. Month.**
- A row's month is the IST calendar month of its timestamp, computed by ONE shared function.
- Never use browser-local time or UTC for this. Never store it as free text.

**L4. Monthly charge bucket.** The sum of a farmer's non-deleted usage amounts per (farmer, IST month). It is the sum of the already-rounded entry amounts (see E6b).

**L5. Payment.**
- Fields: farmer, amount > 0, the actual payment timestamp (IST), optional note.
- **No month selection anywhere.**

**L6. FIFO waterfall.** For one farmer: sort buckets by month ascending, and let `P` = sum of non-deleted payments.
- `paid_i = min(charge_i, max(0, P − Σ charges of earlier buckets))`
- `remaining_i = charge_i − paid_i`
- `outstanding = Σ remaining_i`
- `credit = max(0, P − Σ all charges)`

**L7. Allocation trail.**
- Always derived, never stored.
- Walk the payments in chronological order (timestamp, then created_at, then id) through the same waterfall.
- Each payment gets a list of (month, amount) pieces, plus any unapplied remainder.
- Invariant: for every bucket, the pieces add up to that bucket's end-state `paid_i`.
- The trail is computed from the **current** buckets. If usage is added later, an earlier payment's unapplied remainder becomes a piece of the new month (see E5, E13).
- Presentation (D5): pieces are shown as plain months, including months later than the payment. Any unapplied remainder is labelled **"Advance / Credit"**. The math is unchanged.

**L8. Credit.**
- Credit is never lost. Later usage consumes it automatically (this follows from L6).
- Credit is never netted across farmers.

**L9. As-of view (D2).**
- An as-of view for IST day D includes the entries and payments whose timestamp ≤ end of D (23:59:59.999 IST).
- Each row is taken in its **current** state: its current amount, and whether it is currently deleted.
- **Limitation:** there is no edit history. A row edited or soft-deleted *after* D therefore changes the as-of figures for D. As-of views are a recomputation from the current data, not a frozen snapshot.

**L10. Two different concepts.**
- *Cash received in a period* is the payments dated in that period.
- *Charge settled for a month* is `paid_i`.
- Never mix them in math or in the UI.

**L11. Months list and dashboard (D1).**
- The months list is every month with usage OR payments.
  - A payment-only month shows charge 0, cash received > 0, and the badge "Sirf Payment" (D3).
  - The months list shows **current** balances (as of now).
- The dashboard has All Time / Monthly / Yearly views. For the selected period P:
  - **Charges created** = Σ usage amounts whose IST timestamp falls in P.
  - **Cash received** = Σ payments whose IST timestamp falls in P.
  - **Outstanding** and **Credit** = each farmer's L6 balance **as of the end of P** (last IST day of the month or year), using the L9 rule.
  - **All Time** = as of now.
  - The per-farmer list in a period view uses the same as-of figures.
- The farmer profile (L17) and the Months table always show **current** balances.
- Cross-farmer totals are Σ per-farmer outstanding and, **separately**, Σ per-farmer credit. Never net the two.
- The owner may revisit D1 in Phase 7 after seeing the UI.

**L12. Farmers.**
- Farmers have BOTH Disable (temporary) and soft-Delete; both are restorable.
- Deleted and disabled farmers are excluded from every list and total.
- Their rows stay in the database, and restoring a farmer brings everything back.

**L13. Edits and deletes.**
- An edit changes only that row. `created_by` and `created_at` are preserved; `updated_at` and `updated_by` are set.
- Delete is a soft-delete (`deleted_at`, `deleted_by`), with a Recently Deleted view and Restore.
- There is no hard delete in the UI.

**L14. Duplicate protection is a WARNING, never a block.**
- Payment: same farmer + amount + IST date.
- Usage: same farmer + IST date + hours/minutes.
- The Hinglish wording of the warning is decided in Phase 4/5.

**L15. Money math.** Integer paise (or a decimal library). Never floats for sums.

**L16. Payment form.**
- Shows a live FIFO preview (per-month pieces plus the resulting credit), produced by the same engine.
- When editing, it shows before and after.

**L17. Farmer profile shows:**
- total charges, total paid, outstanding, credit;
- a month table: hours, charge, paid, remaining, status (Settled / Partial / Unpaid);
- payment history with each payment's allocation trail;
- usage history;
- a chronological ledger with a running balance (Σ charges − Σ payments, in the same order as L7).

**L18. Validation.**
- No empty required fields and no negatives.
- minutes 0–59, hours ≥ 0, total_minutes > 0, rate > 0.
- Payment amount > 0.

### Clarifications and consequences

- **Status for a month with charge 0 and cash > 0:** the badge **"Sirf Payment"**, in place of Settled / Partial / Unpaid (D3).
- **Rounding (L2):**
  - Half-up on exact half-paise.
  - Integer form: `floor((2 × total_minutes × rate_paise + 60) / 120)`. This is equivalent to the quotient/remainder form: `q`, `r` of `total_minutes × rate_paise / 60`; if `2r ≥ 60` then `q + 1`.
  - Per-entry rounding is confirmed (D4): a bucket sums individually rounded entries. Three 10-minute entries make ₹50.01; one 30-minute entry is ₹50.00 (E6b).
- **The owner's original Ramu example had an arithmetic slip.** The four entries total **17h45m = ₹1,775.00**, not 16h45m = ₹1,675. The canonical paise values are 358.33, 441.67, 525.00 and 450.00.

## Worked examples (Phase 3 and Phase 9 test fixtures)

Conventions for all examples:
- Rate is ₹100/hr unless stated. Times are IST and entries are at 10:00 IST unless stated.
- Months are written `YYYY-MM`.
- "Cash" means cash received in that month (L10). "Sirf Payment" marks a month with no charge but with cash received (D3).

### E1 — Canonical Ramu
Inputs:
- Usage: 2026-05-10 3h35, 2026-06-10 4h25, 2026-07-10 5h15, 2026-08-10 4h30.
- Payment: ₹500 on 2026-09-10.

| Month | Time | Charge | Paid | Remaining | Status | Cash |
|---|---|---|---|---|---|---|
| 2026-05 | 3h35 | 358.33 | 358.33 | 0.00 | Settled | 0.00 |
| 2026-06 | 4h25 | 441.67 | 141.67 | 300.00 | Partial | 0.00 |
| 2026-07 | 5h15 | 525.00 | 0.00 | 525.00 | Unpaid | 0.00 |
| 2026-08 | 4h30 | 450.00 | 0.00 | 450.00 | Unpaid | 0.00 |
| 2026-09 | 0h00 | 0.00 | 0.00 | 0.00 | Sirf Payment | 500.00 |

Totals: charges 1,775.00 · paid 500.00 · **outstanding 1,275.00** · credit 0.00.

Trail: P1 (500.00) → 2026-05: 358.33, 2026-06: 141.67.

Running balance: 358.33 → 800.00 → 1,325.00 → 1,775.00 → (−500.00) 1,275.00.

### E2 — Two partial payments on one month
Inputs: usage 2026-05-05 3h00 (300.00); payments ₹100 on 2026-05-20 and ₹150 on 2026-05-28.

Result: 2026-05 charge 300.00, paid 250.00, remaining 50.00, Partial, cash 250.00. Outstanding 50.00, credit 0.00.

Trail: P1 → 2026-05: 100.00; P2 → 2026-05: 150.00.

### E3 — Exact payment
Inputs: usage 2026-05-05 2h00 (200.00); payment ₹200 on 2026-05-25.

Result: 2026-05 Settled. Outstanding 0.00, credit 0.00.

Trail: P1 → 2026-05: 200.00.

### E4 — Overpayment becomes credit
Inputs: usage 2026-05-05 2h00 (200.00); payment ₹500 on 2026-05-25.

Result: 2026-05 Settled, cash 500.00. Outstanding 0.00, **credit 300.00**.

Trail: P1 → 2026-05: 200.00, Advance / Credit 300.00.

### E5 — Credit consumed by later usage
- **E5a.** E4 plus usage 2026-06-15 1h30 (150.00):
  - 2026-06 paid 150.00, Settled.
  - Outstanding 0.00, credit 150.00.
  - Trail: P1 → 05: 200.00, 06: 150.00, Advance / Credit 150.00.
- **E5b.** Then usage 2026-07-15 2h00 (200.00):
  - 2026-07 paid 150.00, remaining 50.00, Partial.
  - Outstanding 50.00, credit 0.00.
  - Trail: P1 → 05: 200.00, 06: 150.00, 07: 150.00.

### E6 — Several entries in one month form one bucket
- **E6a.** Usage on 2026-05-03 1h00 (100.00), 05-12 0h45 (75.00) and 05-25 2h20 (233.33) gives one 2026-05 bucket: 4h05, charge 408.33, Unpaid.
- **E6b.** Three entries of 0h10 (on 05-03, 05-04 and 05-05), each 16.67, give a bucket of **50.01**. A single 30-minute entry would be 50.00 (L4 sums rounded entries).

### E7 — Payment-only month
Inputs: usage 2026-05-05 2h00 (200.00); payment ₹200 on 2026-06-05.

Months list:
- 2026-05: charge 200.00, paid 200.00, Settled, cash 0.00.
- **2026-06: charge 0.00, cash 200.00, badge "Sirf Payment".**

Outstanding 0.00, credit 0.00. Trail: P1 → 2026-05: 200.00.

### E8 — Edit an old usage entry
Inputs: E1 with the June entry edited from 4h25 to 2h25 (241.67).

Result:
- 2026-06 paid 141.67, remaining 100.00, Partial.
- Totals: charges 1,575.00 · outstanding 1,075.00 · credit 0.00.
- Trail unchanged: 05: 358.33, 06: 141.67.

### E9 — Soft-delete an old usage entry
Inputs: E1 with the May entry soft-deleted. 2026-05 disappears from the months list (no usage, no payment).

| Month | Charge | Paid | Remaining | Status |
|---|---|---|---|---|
| 2026-06 | 441.67 | 441.67 | 0.00 | Settled |
| 2026-07 | 525.00 | 58.33 | 466.67 | Partial |
| 2026-08 | 450.00 | 0.00 | 450.00 | Unpaid |

Totals: charges 1,416.67 · outstanding 916.67. Trail: P1 → 06: 441.67, 07: 58.33.

Restoring the entry returns exactly the E1 figures.

### E10 — Edit a payment (₹500 → ₹300)
Inputs: E1 with P1 = 300.

Result:
- 2026-05 paid 300.00, remaining 58.33, Partial. June, July and August are Unpaid.
- Outstanding 1,475.00.
- Trail: P1 → 05: 300.00.

The payment form shows the before (E1) and after figures (L16).

### E11 — Soft-delete a payment
Inputs: E1 with P1 soft-deleted.

Result: all four months Unpaid; outstanding 1,775.00; no trail. P1 appears in Recently Deleted and can be restored.

### E12 — Two same-day, same-amount payments
Inputs: usage 2026-05-05 5h00 (500.00); payments ₹200 at 2026-06-02 10:00 and ₹200 at 2026-06-02 18:00.

Result:
- **Both count.** 2026-05 paid 400.00, remaining 100.00. Cash in 2026-06 is 400.00 (badge "Sirf Payment").
- P2 triggers a duplicate **warning** (same farmer + amount + IST date) and is still saved.
- Trail: P1 → 05: 200.00; P2 → 05: 200.00.

### E13 — Usage after an earlier payment
Inputs: payment ₹1,000 on 2026-05-01; usage 2026-05-15 3h00 (300), 2026-06-15 4h00 (400), 2026-07-15 5h00 (500).

Result:
- 05 Settled, 06 Settled, 07 paid 300.00 and remaining 200.00 (Partial).
- Outstanding 200.00, credit 0.00.
- Trail: P1 → 05: 300.00, 06: 400.00, 07: 300.00.

As-of views (L9):
- As of 2026-05-31: charges 300.00 · paid 1,000.00 · **credit 700.00**.
- As of 2026-06-30: credit 300.00.

### E14–E17 — Farmer summary states
| Example | Charges | Paid | Outstanding | Credit | Payments |
|---|---|---|---|---|---|
| E14 outstanding (Ramu, E1) | 1,775.00 | 500.00 | 1,275.00 | 0.00 | 1 |
| E15 zero balance (E3) | 200.00 | 200.00 | 0.00 | 0.00 | 1 |
| E16 credit (E4) | 200.00 | 500.00 | 0.00 | 300.00 | 1 |
| E17 no payment history (usage 1h00 only) | 100.00 | 0.00 | 100.00 | 0.00 | 0 (empty trail and payment list) |

### E18 — One farmer's credit never offsets another's due
Inputs:
- Farmer A: usage 1h00 (100.00), payment ₹300, so credit 200.00.
- Farmer B: usage 2h00 (200.00), no payment, so outstanding 200.00.

Dashboard: **Σ outstanding 200.00 and Σ credit 200.00, shown separately.** A netted figure of 0.00 is wrong and must never be shown.

### E19 — As-of view (Ramu, E1 data; current row state per L9)
| As of (end of IST day) | Months | Charges | Paid | Outstanding |
|---|---|---|---|---|
| 2026-06-30 | 05, 06 | 800.00 | 0.00 | 800.00 |
| 2026-09-09 | 05–08 | 1,775.00 | 0.00 | 1,775.00 |
| 2026-09-10 | 05–08 | 1,775.00 | 500.00 | 1,275.00 |

### E20 — IST month boundaries
| Stored timestamp | IST | Month |
|---|---|---|
| 2026-05-31T23:30:00+05:30 | 05-31 23:30 | 2026-05 |
| 2026-06-01T00:10:00+05:30 | 06-01 00:10 | 2026-06 |
| 2026-05-31T18:40:00Z | 06-01 00:10 | **2026-06** |
| 2026-05-31T18:29:00Z | 05-31 23:59 | 2026-05 |

### E21 — Disabled farmer excluded from totals
Inputs: farmer A outstanding 100.00; farmer C (5h00, 500.00 outstanding) is disabled.

- Dashboard: 1 active farmer, Σ outstanding 100.00.
- After restoring C: 2 active farmers, Σ outstanding 600.00.

### E22 — Rounding
| Time @ rate | Exact (paise) | Result |
|---|---|---|
| 3h35 @ 100.00 | 35833.33 | ₹358.33 |
| 4h25 @ 100.00 | 44166.67 | ₹441.67 |
| 0h10 @ 100.00 | 1666.67 | ₹16.67 |
| 0h01 @ 100.50 | 167.50 (half) | ₹1.68 (rounded up) |
| 0h03 @ 100.10 | 500.50 (half) | ₹5.01 (rounded up) |
| 0h01 @ 100.30 | 167.17 | ₹1.67 |

The D7 integer formula `floor((2 × total_minutes × rate_paise + 60) / 120)` gives the same paise as the definition for all six rows. It was also checked over a sweep of 1,484,640 cases with no mismatch (2026-10-05).

### E23 — Monthly dashboard views (Ramu, E1 data; D1)
| Month | Charges created | Cash received | Outstanding as of month end | Credit |
|---|---|---|---|---|
| 2026-05 | 358.33 | 0.00 | 358.33 (2026-05-31) | 0.00 |
| 2026-06 | 441.67 | 0.00 | 800.00 (2026-06-30) | 0.00 |
| 2026-07 | 525.00 | 0.00 | 1,325.00 (2026-07-31) | 0.00 |
| 2026-08 | 450.00 | 0.00 | 1,775.00 (2026-08-31) | 0.00 |
| 2026-09 | 0.00 | 500.00 | 1,275.00 (2026-09-30) | 0.00 |

The farmer profile and the Months table show the **current** figures (E1), not these as-of figures.

### E24 — Yearly dashboard views (D1)
- **E24a. Ramu 2026 (E1 data):** charges 1,775.00 · cash 500.00 · outstanding as of 2026-12-31 1,275.00 · credit 0.00.
- **E24b. One farmer, usage 2025-12-20 1h00 (100.00), payment ₹100 on 2026-01-05:**
  - Yearly 2025: charges 100.00 · cash 0.00 · outstanding as of 2025-12-31 100.00 · credit 0.00.
  - Yearly 2026: charges 0.00 · cash 100.00 · outstanding as of 2026-12-31 0.00 · credit 0.00.
- **E24c. IST year boundary:**
  - A usage entry (1h00) stored at `2025-12-31T18:40:00Z` is IST 2026-01-01 00:10, i.e. month 2026-01.
  - It counts in the **2026** view: charges 100.00. The 2025 view shows charges 0.00.

## Decided (owner, 2026-10-05)

| # | Decision | Where |
|---|---|---|
| D1 | Monthly/Yearly dashboard: charges created and cash received by IST timestamp in the period; outstanding/credit as of the period end; All Time = now; profile and Months table = current; never net across farmers. May be revisited in Phase 7. | L11, E23, E24 |
| D2 | As-of uses each row's current state; no edit history (documented limitation). | L9 |
| D3 | Charge-0 month with cash > 0 shows the badge "Sirf Payment". | L11, Clarifications |
| D4 | Per-entry rounding confirmed (E6b = 50.01). | Clarifications, L4 |
| D5 | Trail shows plain (possibly future) month pieces; the unapplied remainder is labelled "Advance / Credit". | L7 |
| D6 | Rate is whole paise only (max 2 decimals). | L2 |
| D7 | Integer paise: `rate_paise` and `amount_paise` are bigint; `total_minutes` is a generated column; the entry amount is not stored and is computed only by the engine using `floor((2·total_minutes·rate_paise + 60) / 120)`. | L2, E22, `docs/ARCHITECTURE.md` |
| D8 | Phase 10 wipe = test rows in the NEW project only (schema and the owner's Auth user are kept). The OLD project is deleted manually by the owner. | `PROJECT_STATUS.md` |

Also decided on 2026-10-05:
- farmers keep both Disable and soft-Delete (L12);
- v1 backup files are not importable;
- the duplicate-warning wording is decided in Phase 4/5 (L14).
