// A minimal Chrome DevTools Protocol client over --remote-debugging-pipe (the transport Playwright
// uses), and a launcher for the Chromium that Playwright already installed. No npm dependency and no
// browser download: the playwright package is not part of this project, only its browsers are.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The newest Playwright-installed headless shell binary, or PERF_CHROME. */
export function findChromium() {
  if (process.env.PERF_CHROME) return process.env.PERF_CHROME;
  const root =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
      : process.platform === 'darwin'
        ? path.join(process.env.HOME ?? '', 'Library', 'Caches', 'ms-playwright')
        : path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');
  const dirs = existsSync(root) ? readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const dir of dirs) {
    const exe =
      process.platform === 'win32'
        ? path.join(root, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')
        : path.join(root, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (existsSync(exe)) return exe;
  }
  throw new Error(`No Playwright Chromium found under ${root}; set PERF_CHROME to a Chromium binary.`);
}

/** Starts a fresh headless Chromium (own empty profile) and returns a client attached to its first page. */
export async function launch() {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'tubewell-perf-profile-'));
  // --no-sandbox: on some Windows setups the sandboxed renderer crashes at once. The browser only
  // loads the local preview server; every other host is failed by the measurement script.
  const child = spawn(
    findChromium(),
    ['--remote-debugging-pipe', '--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`, '--no-first-run', '--disable-background-networking', '--window-size=412,915', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  const browser = pipeConnection(child.stdio[3], child.stdio[4]);
  const { targetInfos } = await browser.send('Target.getTargets');
  const page = targetInfos.find((t) => t.type === 'page');
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  const client = browser.session(sessionId);
  return {
    client,
    async close() {
      try {
        await browser.send('Browser.close');
      } catch {
        child.kill();
      }
      await new Promise((r) => setTimeout(r, 300));
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // The profile folder is temporary; a locked file on Windows is harmless.
      }
    },
  };
}

function pipeConnection(writable, readable) {
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  let buffer = '';
  readable.setEncoding('utf8');
  readable.on('data', (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\0')) !== -1) {
      const msg = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (p === undefined) continue;
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p.resolve(msg.result);
      } else {
        for (const fn of listeners.get(`${msg.sessionId ?? ''}|${msg.method}`) ?? []) fn(msg.params);
      }
    }
  });
  const send = (method, params = {}, sessionId) => {
    nextId += 1;
    const id = nextId;
    writable.write(`${JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params })}\0`);
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
  };
  const on = (method, fn, sessionId) => {
    const key = `${sessionId ?? ''}|${method}`;
    listeners.set(key, [...(listeners.get(key) ?? []), fn]);
  };
  return {
    send,
    session(sessionId) {
      return {
        send: (method, params) => send(method, params, sessionId),
        on: (method, fn) => on(method, fn, sessionId),
        /** Evaluates an expression in the page and returns its (awaited) value. */
        async evaluate(expression) {
          const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
          if (exceptionDetails) throw new Error(`page error: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
          return result.value;
        },
      };
    },
  };
}
