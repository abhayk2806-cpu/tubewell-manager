// FIX-1 Part 4: CPU of the screens' ledger derivations on the 3,000-row dataset, in Node (no
// throttling; the browser run in run.mjs gives the 4x-throttled per-switch CPU). "Before" = what the
// pages computed on every mount; "after" = the shared memo (src/data-store/derive.ts), which computes
// once per data change and returns the remembered result when a screen mounts again.
//
//   node scripts/perf/derive-cpu.mjs
import { createServer } from 'vite';
import { makeDataset } from './dataset.mjs';

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function time(fn, runs = 7) {
  const ms = [];
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    fn();
    ms.push(performance.now() - t0);
  }
  return median(ms);
}

const data = await makeDataset('large');
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, entries: [] } });
try {
  const lib = await vite.ssrLoadModule('/src/lib/data/index.ts');
  const { createDerive } = await vite.ssrLoadModule('/src/data-store/derive.ts');
  const req = { farmers: data.farmers, usageRows: data.usage_entries, paymentRows: data.payments };
  const now = { dateKey: '2026-11-03', timeKey: '10:00', monthKey: '2026-11' };
  const farmerId = data.farmers[0].id;
  // The derivations each screen runs when it mounts (Dashboard, Pani, Paisa, Kisan, Mahine, profile).
  const screens = {
    Dashboard: (d) => d.dashboardScreen({ ...req, view: { kind: 'all' }, now }),
    Pani: (d) => d.farmerBalances(req),
    Paisa: (d) => d.paymentTrails(req),
    Kisan: (d) => d.farmerBalances(req),
    Mahine: (d) => d.monthsScreen(req),
    'Kisan ka Hisaab': (d) => d.farmerProfile({ farmerId, usageRows: req.usageRows, paymentRows: req.paymentRows }),
  };
  const plain = { dashboardScreen: lib.buildDashboardScreen, farmerBalances: lib.buildFarmerBalances, paymentTrails: lib.buildPaymentTrails, monthsScreen: lib.buildMonthsScreen, farmerProfile: lib.buildFarmerProfile };
  const rows = [];
  for (const [name, run] of Object.entries(screens)) {
    const before = time(() => run(plain));
    // After: the first visit after a data change computes (a fresh memo); later mounts hit the memo.
    const firstVisit = time(() => run(createDerive()));
    const memo = createDerive();
    run(memo);
    const remount = time(() => run(memo));
    rows.push({ screen: name, everyMountBeforeMs: +before.toFixed(1), firstVisitAfterMs: +firstVisit.toFixed(1), remountAfterMs: +remount.toFixed(3) });
  }
  // A full round Dashboard -> Pani -> Paisa -> Kisan -> Mahine -> Dashboard, once per data change.
  const round = ['Dashboard', 'Pani', 'Paisa', 'Kisan', 'Mahine', 'Dashboard'];
  const roundBefore = time(() => round.forEach((s) => screens[s](plain)), 3);
  const roundAfter = time(() => {
    const memo = createDerive();
    round.forEach((s) => screens[s](memo));
  }, 3);
  console.table(rows);
  console.log(`round of 6 screen mounts (${data.farmers.length} farmers, ${data.usage_entries.length} usage, ${data.payments.length} payments): before ${roundBefore.toFixed(1)} ms, after ${roundAfter.toFixed(1)} ms (Node, unthrottled)`);
} finally {
  await vite.close();
}
