# Performance — Tubewell Manager

> FIX-1 (issue I-001, 2026-11-03). The owner reported the live app slow everywhere: slow to open, slow to show data, slow between sections. No figure on any screen changed; `src/lib/ledger/` is untouched.
> Rules for the data flow: [docs/ARCHITECTURE.md → Data flow and shared store](ARCHITECTURE.md#data-flow-and-shared-store-fix-1-i-001).

## 1. Diagnosis (measured, not guessed)

The cost was the NUMBER and the ORDER of round trips from the phone to Supabase, not hosting and not data size.

| # | Cause (code at `1ccbb0b`) | Measured |
|---|---|---|
| a | Every page called `useFarmers`, `useUsage`, `usePayments`; each hook (`useRowStore`) kept its OWN state, loaded on mount, had no cache. | Confirmed: every tab switch = 6 blocking reads behind a loading line (7 with a 2,000-row table). |
| b | `fetchAllRows` read until an EMPTY page: ≥ 2 sequential requests per table, even for 9 rows. A save reloaded the whole table the same way. | Confirmed: cold open 6 reads in 2 sequential stages; a save = 1 write + 2 sequential reads. |
| c | Start-up waterfall: `index.html` → entry → `startApp` chunk → `getSession` → page chunk → page render → data. | Confirmed, and one more stage found: React reveals a lazy page at least 300 ms after its fallback (Suspense throttle), and the data requests started only in the page's effects, after that. |
| d | Static hosting and data size are not the problem. | Agreed: first load ~186 kB gzip, cached `immutable` on `/assets/*`. |

Also seen: in the mock every request to the Supabase origin is preceded by a CORS preflight (`OPTIONS`), because the client sends `apikey` / `authorization` headers. Whether Supabase lets the phone cache preflights (`Access-Control-Max-Age`) was not measured (no live requests). Fewer requests also means fewer preflights.

## 2. Before / after

Setup: production build served by `vite preview`; the Playwright-installed Chromium (headless shell) driven over the DevTools protocol; mocked Supabase auth + REST with **150 ms per request** (preflights too), **40 ms per static file**, **4× CPU throttling**; fictional data from the verification generator. Small = 3 farmers / 15 usage / 12 payments (30 rows). Large = 30 farmers / 2,000 usage / 970 payments (3,000 rows). Before = `1ccbb0b`. After = two runs, both shown.

| Measure | Small before | Small after | Large before | Large after |
|---|---|---|---|---|
| Cold open: data requests | 6 | **3** | 7 | **4** (usage > 1,000 rows = 2) |
| Cold open: sequential data stages | 2 | **1** | 3 | **2** |
| Cold open: stages in all (static + data) | 7 | **4** | 9 | **6** |
| Cold open: time until the Dashboard shows data | 2,065 ms | **1,153 / 1,190 ms** | 3,288 ms | **2,449 / 2,250 ms** |
| Tab switch Pani / Paisa / Kisan / Mahine / Dashboard: blocking requests | 6 each | **0** | 7 / 6 / 7 / 7 / 7 | **0** |
| Tab switch: loading state shown | yes | **no** | yes | **no** |
| Tab switch: time to data | 734–785 ms | **20–77 ms** | 859–2,043 ms | **269–448 ms** |
| Tab switch: main-thread CPU (4×) | 42–82 ms | 23–66 ms | 143–357 ms | 91–170 ms |
| One save (new Pani entry): requests | 1 write + 2 reads (3 stages) | **1 write + 1 read (2 stages)** | 1 write + 4 reads (5 stages) | **1 write + 3 reads (3 stages)**, 2,001 rows |
| One save: dialog closes after | 1,037 ms | **372 / 393 ms** | 1,957 ms | **527 / 613 ms** |
| First-load size (shell + Dashboard, gzip) | 186.1 kB (19 files) | 188.4 kB (20 files) | same | same |

**Ledger derivations, 3,000-row set** (`scripts/perf/derive-cpu.mjs`, Node, unthrottled): what each screen computed on EVERY mount before, and on its first visit after a data change now; a later mount is a memo hit (~0.005 ms).

| Screen | Before (every mount) | After (first visit) | After (remount) |
|---|---|---|---|
| Dashboard | 156.5 ms | 155 ms | 0 |
| Mahine | 47.1 ms | 48.1 ms | 0 |
| Paisa (trails) | 11.9 ms | 11.8 ms | 0 |
| Pani / Kisan (balances) | 10.3 / 10.1 ms | 9.6 ms, shared by both | 0 |
| Kisan ka Hisaab (one farmer) | 1.6 ms | 1.5 ms | 0 |
| Round Dashboard → Pani → Paisa → Kisan → Mahine → Dashboard | 408.5 ms | 240.6 ms (first round), then 0 | |

In the browser at 4× CPU (large set, render included) the five switches Pani → Paisa → Kisan → Mahine → Dashboard cost 1,058 ms of main-thread time before and 577–630 ms after; the switch back to the Dashboard went from 357 ms to 117–132 ms.

## 3. What changed

- **Shared data store** (`src/data-store/`): one store per signed-in session, stale-while-revalidate, 30 s freshness, visibility revalidation, save = patch + one quiet reconcile, cleared on sign-out. Hooks keep their public API.
- **Paging with a count** (`src/lib/data/paging.ts`): one request up to 1,000 rows; remaining pages in parallel; count, overflow and duplicate checks against silent truncation.
- **Start-up**: the three tables start loading as soon as a session exists (provider), in parallel with the page chunk; `main.tsx` preloads the opened screen's chunk in parallel with the app shell; every other screen's chunk is prefetched when the browser is idle after the first paint (`src/pagePreload.ts`).
- **Derivations memoized** in the shared layer (`src/data-store/derive.ts`), computed once per data change.

## 4. Budgets (enforced by tests)

`src/data-store/budgets.test.tsx` runs the real `App` + `DataStoreProvider` + data layer against a counting fake client (tables ≤ 1,000 rows, auth refresh excluded):

| Budget | Test |
|---|---|
| Cold open after login: exactly 3 data requests (one per table), all asked before any answers (1 sequential data stage) | `budget: cold open after login` |
| Tab switch with a warm cache: 0 requests, no loading state | `budget: tab switch with a warm cache` |
| Cache older than 30 s: cached rows at once, one quiet background revalidation | same block |
| One save: 1 write + at most 1 reload of the affected table | `budget: one save` |
| Backup export / restore verification: fresh server reads, never the cache | `budget: backup reads the server, never the cache` |
| Sign-out clears the store; signing in again as the same user shows the loading state, never the old rows | `budget: sign-out clears the store` |

With the hooks forced back to private per-hook stores, 4 of these 7 tests fail (checked during FIX-1). Paging budgets: `src/lib/data/paging.test.ts`.

## 5. How to re-run

```bash
node scripts/perf/run.mjs --label after
```

```bash
node scripts/perf/derive-cpu.mjs
```

- `run.mjs` builds the app into a temp folder with `VITE_SUPABASE_URL=https://perf-mock.supabase.test` (it aborts if the build contains a real `*.supabase.co` URL), starts `vite preview` on port 4173, and drives Chromium. Options: `--no-build`, `--api-delay 150`, `--static-delay 40`, `--cpu 4`, `--only small|large`, `--label <name>`. Results: printed, and written to `<temp>/tubewell-perf-<label>.json`.
- Every request to a host other than the preview server and the mock origin is failed, so nothing can reach the live database. The session is fake; the data is fictional (`scripts/perf/dataset.mjs`, seeded).
- Chromium: the newest Playwright-installed headless shell (`%LOCALAPPDATA%\ms-playwright`), or `PERF_CHROME`. The playwright npm package is NOT a project dependency; the scripts speak the DevTools protocol over `--remote-debugging-pipe` (`scripts/perf/cdp.mjs`). It runs with `--no-sandbox` because the sandboxed renderer crashed on this Windows machine. Nothing in `scripts/` is part of the build.
- Single runs vary by roughly ±10 %; compare runs from the same machine, not with other load running.

## 6. Known limits and what was not measured

- **Two devices.** A change made on another phone shows after the next revalidation: a screen mount or the tab becoming visible, once the cache is older than 30 s, or after a save or a retry. A screen kept open and visible does not poll.
- **Two failure flags (FIX-1b).** A failed reload after a save sets `refreshFailed` ("Save ho gaya, par ... refresh nahi ho payi/paya."); a failed background revalidation sets `backgroundRefreshFailed` ("Naya data abhi nahi aa paya. Jo ... dikh raha/rahi hai wo purana/purani ho sakta/sakti hai.", never a word about saving). The cached rows stay; the save message wins when both are set; any successful reload clears both; the retry reloads quietly.
- **Not measured:** the owner's real phone (CPU, browser, network), the real Supabase server time per request, the real round-trip time from the owner's location to `ap-south-1`, whether preflights are cached by the browser, and a token refresh at start-up (excluded by design). The mock's fixed 150 ms per request stands in for all of these.
- **Large tables** (> 1,000 rows) still need one more request per extra 1,000 rows, in parallel after the counted first page.
- **First visit after a data change** on a big data set still computes the derivations once (the Dashboard is the heaviest; the ledger engine was not touched).
