# Verification (Phase 9)

Every number the app shows is checked against an **independent oracle**: a second implementation of the ledger rules, written from [LEDGER_AND_ALLOCATION.md](LEDGER_AND_ALLOCATION.md) only. All tests are in `src/lib/verification/` (plus the older engine tests named below). Test-only code; no production file depends on it.

## What is in `src/lib/verification/`

| File | What it does |
|---|---|
| `oracle.ts` | The oracle. Imports only TYPES from the engine. BigInt money, the D7 floor form, `Date.parse` plus its own civil-calendar maths for IST months / years, an explicit FIFO queue (each payment fills the oldest unpaid month). One farmer (months, trail, totals, running balance, as-of), Dashboard periods (D1, D29 row order), all-farmers months (C9), balances, trails. |
| `generate.ts` | Deterministic scenarios from a seed (mulberry32): 1–6 made-up farmers (Chalu, Band, deleted), usage of 1 minute to 72 hours at odd rates (1, 7, 9999, 12345, …), IST boundary instants, leap day, microsecond timestamps, payments before any charge, exact settles, over-payments, 1-paisa payments, equal timestamps, soft deletes, shuffled rows. |
| `compare.ts` | Shape helpers and the seed list (320 seeds, 9000–9319). |
| `ledger.verify.test.ts` | Oracle vs `buildFarmerLedger` (current and as-of), `buildFarmerProfile` (incl. total time, running balance), `buildFarmerBalances`, `buildPaymentTrails`, `previewPayment` (new and edit equal the real recompute; delete recomputes), and the properties. |
| `screens.verify.test.ts` | Oracle vs `buildDashboardScreen` for All Time and EVERY month and year with data, `buildMonthsScreen` / `buildAllFarmersMonths`, CSV totals, and Kisan = Profile = Dashboard All Time = sum of Mahine rows for every Chalu farmer. |
| `examples.verify.test.ts` | The oracle reproduces E1–E24 (numbers transcribed from the spec) and the engine agrees on every input. |
| `io.verify.test.ts` | Scale (30 farmers, 3,000 usage, 1,500 payments through the paged reads) and the in-memory backup round trip (export, JSON, validate, Merge and Replace, verify). |

A failing comparison names its seed (`seed 9123 farmer f-9123-2 …`); `scenario(9123)` rebuilds the exact rows.

## Edge-case matrix

| Class | Status | Test(s) |
|---|---|---|
| IST month / day boundaries (23:59:59 vs 00:00:00 IST, Z vs +05:30) | COVERED | `time.test` > E20 boundaries, day key flips at 18:30Z; `examples.verify` > E20; generator boundary instants in every seeded test |
| Year end (31 Dec → 1 Jan IST) | COVERED | `examples.test` > E24c; `examples.verify` > E24a-c; `dashboardRules.test` / `monthsRules.test` IST year boundary; seeded Dashboard year views |
| Leap day 2028-02-29 | COVERED | `time.test` > leap day; `time-helpers.test` > month ends and the leap day; generator instants |
| Device timezone | COVERED (by command) | The whole suite run under UTC, America/Los_Angeles and Pacific/Auckland (see "How to run"); not part of the default single run |
| Rounding: D7 formula | COVERED | `entry.test` > D7 sweep (1,484,640 cases); `examples.verify` > E22; oracle uses the floor form on every seeded entry |
| Rounding: 1-minute entries, odd rates, per-entry sum (E6b) | COVERED | `examples.verify` > E6a / E6b; generator (1-minute entries, rates 1, 7, 9999, 12345, 33333) |
| Money: 0, 1 paisa, very large | COVERED | `entry.test` > can round to zero paise, large values near the safe-integer limit; `ledger.test` > sums beyond the safe-integer range are rejected; generator 1-paisa payments |
| Money: parse / format round trip | COVERED | `money.test` > round-trips with parseRupeesToPaise; `rupees.test` > round-trips with paiseToDecimalString; `screens.verify` (g) CSV decimals parse back to the screen figures |
| Allocation: payment before any charge | COVERED | `examples.verify` > E13; generator (payments on 2025-11-02 and random dates before usage) |
| Allocation: exact settle, partial, over-pay, credit consumed later | COVERED | `examples.verify` > E2-E4, E5a / E5b; generator exact settles and over-payments |
| Allocation: many small payments, ties at the same instant | COVERED | `ledger.test` > ties: payments at the same instant; generator equal paid_at and 1-paisa payments; `ledger.verify` (a) trails per payment |
| Allocation: order independence | COVERED | `ledger.verify` > properties (shuffled and reversed input); `invariants.test` > shuffled input gives identical output |
| Soft delete and restore | COVERED | `examples.verify` > E8-E11; `ledger.verify` > properties (delete then restore, add then remove); generator soft-deleted rows |
| Band and deleted farmers | COVERED | `examples.verify` > E21; `screens.verify` (c) active count and rows; `ledger.verify` (e) balances for non-deleted farmers |
| Bad data (negative, fractional, NaN, missing fields, total_minutes mismatch) → documented error, never a silent fix | COVERED | `ledger.test` > rejects bad input; `validation.test`; `dashboardRules.test` / `monthsRules.test` / `balanceRules.test` bad data gives { ok: false }; `backup.test` validation problems |
| Duplicates (warning, never a block) | COVERED | `duplicates.test` (payments and usage, IST date); `examples.test` > E12; page tests "duplicate warning" |
| Empty states (no rows, one farmer, one entry) | COVERED | `ledger.test` > empty input; `examples.verify` > E17; `monthsRules.test` > active farmers without any row; generator farmers with 0 rows |
| Scale beyond 1,000 rows per read | COVERED | `io.verify` > scale (3,000 usage, 1,500 payments); `paging.test` > 2,500 rows; `usage.test` / `payments.test` / `backupData.test` 2,500-row paging |
| Backup round trip | COVERED | `io.verify` > backup round trip (10 seeds, Merge and Replace); `backup.test`; SQL T9 for the database function |
| Preview vs real recompute | COVERED | `ledger.verify` (f) new and edit; `invariants.test` > previewPayment property |
| As-of views (D1, L9) | COVERED | `examples.verify` > E13, E19, E23, E24; `ledger.verify` (a) random cutoffs; `screens.verify` (c) every month and year |
| Cross-screen consistency | COVERED | `screens.verify` > cross-screen; `balanceRules.test` consistency; `dashboardRules.test` / `monthsRules.test` consistency |
| Live database (read-only SQL vs engine) | COVERED (by procedure) | Phase 9 step: per-farmer SQL waterfall vs engine vs oracle; not part of the automated suite (it would read real rows) |

No class is NOT COVERED. Two are covered by a documented command or procedure instead of the default test run: device timezone and the live database check.

## How to run

```bash
pnpm run test                                          # everything, including src/lib/verification
pnpm exec vitest run src/lib/verification --silent=false   # verification only, with the comparison counts
```

Device timezones (PowerShell; Git Bash drops TZ values that contain "/"):

```powershell
foreach ($tz in 'UTC','America/Los_Angeles','Pacific/Auckland') { $env:TZ = $tz; node -e "console.log(new Date(0).getTimezoneOffset())"; pnpm run test }
```

Print the offset first: it proves the zone took effect. Every run must pass with identical results (the app computes IST from the instant, never from the device clock).
