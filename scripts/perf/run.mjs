// FIX-1 (I-001) performance measurement. Builds the app against a MOCK Supabase origin, serves it
// with `vite preview`, and drives the installed Playwright Chromium over the DevTools protocol:
// cold open (stored session), Dashboard -> Pani -> Paisa -> Kisan -> Mahine -> Dashboard, one save,
// with a fixed delay per request and CPU throttling. Fictional data only; any request to a host
// other than the preview server or the mock origin is failed, so nothing reaches a real backend.
//
//   node scripts/perf/run.mjs [--label before] [--no-build] [--api-delay 150] [--static-delay 40] [--cpu 4]
//
// Results are printed and written to <tmp>/tubewell-perf-<label>.json.
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { makeDataset } from './dataset.mjs';
import { MOCK_ORIGIN, STORAGE_KEY, createMock, fakeSession } from './mock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const LABEL = opt('label', 'run');
const API_DELAY = Number(opt('api-delay', 150));
const STATIC_DELAY = Number(opt('static-delay', 40));
const CPU = Number(opt('cpu', 4));
const PORT = Number(opt('port', 4173));
const OUT_DIR = path.join(tmpdir(), 'tubewell-perf-dist');
const BASE = `http://localhost:${PORT}`;
const SETTLE_MS = 800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

function run(cmdArgs, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cmdArgs, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmdArgs.join(' ')} exited ${code}`))));
  });
}

async function build() {
  await run([VITE, 'build', '--outDir', OUT_DIR, '--emptyOutDir', '--logLevel', 'warn'], {
    VITE_SUPABASE_URL: MOCK_ORIGIN,
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_perf_mock_not_a_key',
  });
  // Guard: the measured build must point at the mock origin and at no real Supabase project.
  const js = readdirSync(path.join(OUT_DIR, 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(path.join(OUT_DIR, 'assets', f), 'utf8'))
    .join('\n');
  if (!js.includes(MOCK_ORIGIN)) throw new Error('perf build does not use the mock origin');
  if (/[a-z0-9]{20}\.supabase\.co/.test(js)) throw new Error('perf build contains a real Supabase URL: aborting');
}

async function startPreview() {
  const child = spawn(process.execPath, [VITE, 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(BASE)).ok) return child;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  child.kill();
  throw new Error('vite preview did not start');
}

// Runs in the page before any app script: stores the fake session and records, after every DOM
// change, which page heading is shown and whether any loading line is on screen.
const INIT = (session) => `
  try { if (!localStorage.getItem(${JSON.stringify(STORAGE_KEY)})) localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(session))}); } catch {}
  (() => {
    const trace = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => { trace.push({ t: Math.round(performance.now()), what: 'fetch ' + String(input instanceof Request ? input.url : input).replace(location.origin, '').replace(${JSON.stringify(MOCK_ORIGIN)}, '').split('?')[0] }); return realFetch(input, init); };
    try { new PerformanceObserver((list) => { for (const e of list.getEntries()) trace.push({ t: Math.round(e.startTime), what: 'longtask ' + Math.round(e.duration) + 'ms' }); }).observe({ type: 'longtask', buffered: true }); } catch {}
    const log = [];
    const LOADING = /load ho rah[aie]/i;
    let queued = false;
    const check = () => {
      queued = false;
      const h1 = document.querySelector('main h1');
      const main = document.querySelector('main');
      log.push({ t: performance.now(), h1: h1 ? h1.textContent.trim() : null, loading: main ? LOADING.test(main.textContent) : true,
        balances: document.querySelectorAll('[data-testid="farmer-balance"]').length, dialog: document.querySelector('[role="dialog"]') !== null });
      for (const w of waiters.splice(0)) if (!w()) waiters.push(w);
    };
    const waiters = [];
    new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(check); } })
      .observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['role'] });
    window.__perf = {
      log,
      trace,
      /** Resolves with the first time >= since when the page titled 'title' shows no loading line. */
      waitFor(pred, since) {
        return new Promise((resolve) => {
          const test = () => { const hit = log.find((e) => e.t >= since && pred(e)); if (hit) { resolve(hit.t); return true; } return false; };
          if (!test()) waiters.push(test);
        });
      },
      waitReady(title, since, needBalances) {
        return this.waitFor((e) => e.h1 === title && !e.loading && (!needBalances || e.balances > 0), since);
      },
    };
  })();
`;

/** Longest chain of requests where each one starts after the previous one ended (sequential stages). */
function stages(records) {
  const done = records.filter((r) => r.end !== undefined).sort((a, b) => a.start - b.start);
  const depth = new Map();
  for (const r of done) {
    let d = 1;
    for (const q of done) if (q !== r && q.end <= r.start + 1) d = Math.max(d, (depth.get(q) ?? 0) + 1);
    depth.set(r, d);
  }
  return Math.max(0, ...depth.values());
}

const PAGES = [
  { to: '/usage', title: 'Pani Entry', name: 'Pani' },
  { to: '/payments', title: 'Paisa', name: 'Paisa' },
  { to: '/farmers', title: 'Kisan', name: 'Kisan', balances: true },
  { to: '/months', title: 'Mahine', name: 'Mahine' },
  { to: '/', title: 'Dashboard', name: 'Dashboard (again)' },
];

async function scenario(name, dataset) {
  const mock = createMock(dataset);
  const browser = await launch();
  const { client } = browser;
  const records = [];
  const byNetId = new Map();

  client.on('Fetch.requestPaused', async (e) => {
    const { url, method, headers, postData } = e.request;
    const kind = url.startsWith(MOCK_ORIGIN)
      ? method === 'OPTIONS'
        ? 'preflight'
        : url.includes('/auth/v1/')
          ? 'auth'
          : method === 'GET'
            ? 'read'
            : 'write'
      : url.startsWith(BASE)
        ? 'static'
        : 'blocked';
    const rec = { kind, method, url: url.replace(MOCK_ORIGIN, '').replace(BASE, ''), start: now() };
    records.push(rec);
    if (e.networkId) byNetId.set(e.networkId, rec);
    try {
      if (kind === 'blocked') {
        rec.end = now();
        await client.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'BlockedByClient' });
      } else if (kind === 'static') {
        await sleep(STATIC_DELAY);
        await client.send('Fetch.continueRequest', { requestId: e.requestId });
      } else {
        await sleep(API_DELAY);
        const res = mock.handle({ method, url, headers, postData });
        rec.end = now();
        await client.send('Fetch.fulfillRequest', {
          requestId: e.requestId,
          responseCode: res.status,
          responseHeaders: Object.entries(res.headers).map(([n, value]) => ({ name: n, value: String(value) })),
          body: Buffer.from(res.body).toString('base64'),
        });
      }
    } catch {
      // The page navigated away or the browser closed; nothing to answer.
    }
  });
  client.on('Network.loadingFinished', (e) => {
    const rec = byNetId.get(e.requestId);
    if (rec && rec.end === undefined) rec.end = now();
    if (rec) rec.bytes = e.encodedDataLength;
  });

  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Performance.enable', { timeDomain: 'threadTicks' });
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT(fakeSession()) });

  // Every page wait is bounded: on a timeout the last DOM states and requests are printed.
  const evaluate = async (expression, label) => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name}: timed out waiting for ${label}`)), 30_000);
    });
    try {
      return await Promise.race([client.evaluate(expression), timeout]);
    } catch (error) {
      const tail = await client.evaluate('JSON.stringify(window.__perf ? __perf.log.slice(-4) : null)').catch(() => 'n/a');
      console.error(error.message, tail, records.slice(-6));
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
  const cpuMs = async () => {
    const { metrics } = await client.send('Performance.getMetrics');
    return (metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0) * 1000;
  };
  const count = (list, kind) => list.filter((r) => r.kind === kind).length;
  const summary = (list) => ({ reads: count(list, 'read'), writes: count(list, 'write'), auth: count(list, 'auth'), preflights: count(list, 'preflight'), blocked: count(list, 'blocked') });

  // (1) Cold open of "/" with a stored session.
  const loaded = new Promise((r) => client.on('Page.loadEventFired', r));
  await client.send('Page.navigate', { url: `${BASE}/` });
  await loaded;
  const readyAt = await evaluate(`__perf.waitReady('Dashboard', 0)`, 'cold open');
  await sleep(SETTLE_MS);
  const cold = records.slice();
  const trace = await client.evaluate('__perf.trace');
  const coldData = cold.filter((r) => r.kind === 'read');
  // First-load size: the shell and the opened screen, not the idle prefetch of the other screens.
  const prefetchAt = cold.findIndex((r) => /\/assets\/(FarmersPage|FarmerProfilePage|UsagePage|PaymentsPage|MonthsPage|BackupPage)-/.test(r.url));
  const staticFiles = (prefetchAt === -1 ? cold : cold.slice(0, prefetchAt)).filter((r) => r.kind === 'static' && /\.(js|css)$/.test(r.url));
  const firstLoad = staticFiles.reduce(
    (acc, r) => {
      const file = readFileSync(path.join(OUT_DIR, r.url.replace(/^\//, '')));
      return { files: acc.files + 1, raw: acc.raw + file.length, gzip: acc.gzip + gzipSync(file).length };
    },
    { files: 0, raw: 0, gzip: 0 },
  );
  const result = {
    dataset: name,
    rows: { farmers: dataset.farmers.length, usage: dataset.usage_entries.length, payments: dataset.payments.length },
    coldOpen: {
      trace: trace.map((e) => `${e.t}ms ${e.what}`),
      ...summary(cold),
      dataStages: stages(coldData),
      allStages: stages(cold.filter((r) => r.kind !== 'auth' && r.kind !== 'blocked')),
      timeToDataMs: Math.round(readyAt),
      cpuMs: Math.round(await cpuMs()),
      firstLoad,
      waterfall: cold.filter((r) => r.kind !== 'preflight').map((r) => `${r.kind} ${r.method} ${r.url.split('?')[0]} @${Math.round(r.start - cold[0].start)}-${Math.round((r.end ?? r.start) - cold[0].start)}ms`),
      dataRequests: coldData.map((r) => `${r.method} ${r.url.split('?')[0]} @${Math.round(r.start - cold[0].start)}-${Math.round(r.end - cold[0].start)}ms`),
    },
    switches: [],
  };

  // (2) Tab switches through the bottom navigation.
  for (const page of PAGES) {
    const mark = records.length;
    const cpu0 = await cpuMs();
    const nodeStart = now();
    const t = await evaluate(`(async () => {
      const t0 = performance.now();
      document.querySelector('nav a[href="${page.to}"]').click();
      const ready = await __perf.waitReady(${JSON.stringify(page.title)}, t0, ${page.balances ? 'true' : 'false'});
      const sawLoading = __perf.log.some((e) => e.t >= t0 && e.t <= ready && e.loading);
      return { ms: ready - t0, sawLoading };
    })()`, page.name);
    const readyNode = nodeStart + t.ms;
    await sleep(SETTLE_MS);
    const during = records.slice(mark);
    result.switches.push({
      to: page.name,
      timeToDataMs: Math.round(t.ms),
      loadingState: t.sawLoading,
      blockingReads: during.filter((r) => r.kind === 'read' && r.start <= readyNode).length,
      backgroundReads: during.filter((r) => r.kind === 'read' && r.start > readyNode).length,
      cpuMs: Math.round((await cpuMs()) - cpu0),
    });
  }

  // (3) One save: a new Pani entry through the form.
  await evaluate(`(async () => {
    document.querySelector('nav a[href="/usage"]').click();
    await __perf.waitReady('Pani Entry', performance.now() - 1);
  })()`, 'Pani before save');
  await sleep(SETTLE_MS);
  const mark = records.length;
  const save = await evaluate(`(async () => {
    const byText = (sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent.includes(text));
    byText('main button', 'Naya Pani Entry').click();
    await __perf.waitFor((e) => e.dialog, performance.now() - 1);
    const setValue = (el, value, type) => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event(type, { bubbles: true }));
    };
    const select = document.getElementById('usage-farmer');
    setValue(select, [...select.options].find((o) => o.value !== '').value, 'change');
    await new Promise((r) => setTimeout(r, 50));
    setValue(document.getElementById('usage-hours'), '1', 'input');
    await new Promise((r) => setTimeout(r, 50));
    const t0 = performance.now();
    document.querySelector('[role="dialog"] button[type="submit"]').click();
    for (let i = 0; i < 200 && document.querySelector('[role="dialog"]'); i += 1) {
      const anyway = byText('[role="dialog"] button', 'Phir bhi save karo');
      if (anyway) anyway.click();
      await new Promise((r) => setTimeout(r, 10));
    }
    return { ms: performance.now() - t0, closed: !document.querySelector('[role="dialog"]') };
  })()`, 'save');
  await sleep(SETTLE_MS * 2);
  const saveReqs = records.slice(mark);
  result.save = { dialogClosedAfterMs: Math.round(save.ms), closed: save.closed, ...summary(saveReqs), requests: saveReqs.filter((r) => r.kind === 'read' || r.kind === 'write').map((r) => `${r.method} ${r.url}`), stages: stages(saveReqs.filter((r) => r.kind === 'read' || r.kind === 'write')) };

  await browser.close();
  return result;
}

async function main() {
  if (!args.includes('--no-build')) await build();
  const preview = await startPreview();
  const results = [];
  try {
    for (const size of opt('only', 'small,large').split(',')) results.push(await scenario(size, await makeDataset(size)));
  } finally {
    preview.kill();
  }
  const out = { label: LABEL, apiDelayMs: API_DELAY, staticDelayMs: STATIC_DELAY, cpuThrottle: CPU, results };
  const file = path.join(tmpdir(), `tubewell-perf-${LABEL}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  for (const r of results) {
    const c = r.coldOpen;
    console.log(`
[${LABEL}] ${r.dataset} (${r.rows.farmers} farmers, ${r.rows.usage} usage, ${r.rows.payments} payments)`);
    console.log(`  cold open: ${c.reads} reads (+${c.preflights} preflights), ${c.dataStages} data stages, ${c.allStages} stages in all, data after ${c.timeToDataMs} ms, CPU ${c.cpuMs} ms, first load ${c.firstLoad.files} files ${(c.firstLoad.gzip / 1024).toFixed(1)} kB gzip`);
    for (const w of r.switches) console.log(`  -> ${w.to}: ${w.timeToDataMs} ms, loading state ${w.loadingState ? 'yes' : 'no'}, ${w.blockingReads} blocking + ${w.backgroundReads} background reads, CPU ${w.cpuMs} ms`);
    console.log(`  save: ${r.save.writes} write + ${r.save.reads} reads (+${r.save.preflights} preflights), ${r.save.stages} stages, dialog closed after ${r.save.dialogClosedAfterMs} ms`);
  }
  console.log(`written to ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
