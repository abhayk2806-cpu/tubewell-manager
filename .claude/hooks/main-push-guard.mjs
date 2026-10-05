#!/usr/bin/env node
// main-push-guard — production-push safety gate for Claude Code (project-level hook).
//
// WHY: GitHub `main` auto-deploys to the live Netlify site. During the rebuild
// (branch `rebuild/fresh-system`) an accidental or inferred push to `main` would
// replace the family's production app. This guard makes a push to `main` by
// Claude possible ONLY right after the owner sends the exact approval phrase.
//
// MODES (set by the hook config in .claude/settings.json):
//   prompt  — UserPromptSubmit. If the owner's ENTIRE message (after the
//             normalization in isApprovalMessage) is the approval phrase, write
//             a timestamped marker. Any other prompt revokes an existing marker.
//   pre     — PreToolUse (Bash | PowerShell | Write | Edit | MultiEdit | NotebookEdit).
//             Denies any shell command that would update `main` on a remote unless
//             a fresh marker from this same session exists; consumes the marker
//             (single use) when it lets such a push through. Also denies attempts
//             by Claude to create/modify the marker itself, and asks before edits
//             to this guard or the settings file.
//   post    — PostToolUse (Bash | PowerShell). After a successful main push,
//             deletes the marker (belt-and-braces; `pre` already consumed it).
//
// FAIL-CLOSED: in `pre` mode any unexpected error on a command that mentions
// `push`/`merge` is treated as a push to main and denied.
//
// Self-test: `node main-push-guard.mjs selftest` runs the classifier test table.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const APPROVAL_PHRASE = 'CUTOVER APPROVED — PUSH TO MAIN NOW';
export const FRESHNESS_MS = 5 * 60 * 1000; // 5 minutes
export const MARKER_NAME = '.main-push-unlocked';
const PROTECTED_BRANCH = 'main';

// ── helpers ──────────────────────────────────────────────────────────────────

function projectDir(input) {
  return process.env.CLAUDE_PROJECT_DIR || (input && input.cwd) || process.cwd();
}

function markerPath(input) {
  return path.join(projectDir(input), '.claude', MARKER_NAME);
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function deny(reason) {
  // Exit 2 = block the tool call; stderr is shown to Claude as the reason.
  process.stderr.write(`[main-push-guard] BLOCKED: ${reason}\n`);
  process.exit(2);
}

function ask(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `[main-push-guard] ${reason}`,
    },
  }));
  process.exit(0);
}

function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

function removeMarker(input) {
  try { fs.rmSync(markerPath(input), { force: true }); } catch { /* ignore */ }
}

// ── approval phrase matching ─────────────────────────────────────────────────
//
// Normalization (in order): Unicode NFC; non-breaking (U+00A0) and narrow
// no-break (U+202F) spaces → normal space; every run of whitespace → one space;
// trim. Then the WHOLE message must match APPROVAL_RE: exact uppercase words,
// and the separator between APPROVED and PUSH may be an em dash (U+2014),
// en dash (U+2013) or hyphen-minus, each side with or without one space.
// Anything else — lowercase, extra words, quotes/backticks, trailing
// punctuation, the phrase inside a longer message — does not match.

export const APPROVAL_RE = /^CUTOVER APPROVED ?[—–-] ?PUSH TO MAIN NOW$/;
const APPROVAL_INSIDE_RE = /CUTOVER APPROVED ?[—–-] ?PUSH TO MAIN NOW/i;

export function normalizePrompt(s) {
  return String(s)
    .normalize('NFC')
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isApprovalMessage(prompt) {
  return APPROVAL_RE.test(normalizePrompt(prompt));
}

// ── shell tokenizer (bash-ish + PowerShell-ish, good enough for classification) ─

// Splits a command line into segments (on unquoted && || ; | & newline) and each
// segment into tokens, honouring single/double quotes and backslash escapes.
export function tokenizeSegments(cmd) {
  const segments = [];
  let tokens = [];
  let cur = '';
  let inTok = false;
  let q = null;
  const pushTok = () => { if (inTok) { tokens.push(cur); cur = ''; inTok = false; } };
  const pushSeg = () => { pushTok(); if (tokens.length) segments.push(tokens); tokens = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) { q = null; continue; }
      if (q === '"' && c === '\\' && i + 1 < cmd.length && '"\\$`'.includes(cmd[i + 1])) {
        cur += cmd[++i]; continue;
      }
      cur += c; continue;
    }
    if (c === "'" || c === '"') { q = c; inTok = true; continue; }
    if (c === '\\' && i + 1 < cmd.length && cmd[i + 1] !== '\n') { cur += cmd[++i]; inTok = true; continue; }
    if (c === '\n' || c === ';' || c === '|' || c === '&') {
      pushSeg();
      if ((c === '|' || c === '&') && cmd[i + 1] === c) i++;
      continue;
    }
    if (c === '(' || c === ')' || c === '{' || c === '}') {
      // Subshell / grouping / PowerShell script blocks: treat as separators.
      pushSeg();
      continue;
    }
    if (/\s/.test(c)) { pushTok(); continue; }
    cur += c; inTok = true;
  }
  pushSeg();
  return segments;
}

const SHELL_C_RUNNERS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'powershell', 'pwsh', 'cmd', 'wsl']);

function baseName(tok) {
  return tok.replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
}

// Returns nested command strings passed to `bash -c "..."`, `pwsh -Command "..."`,
// `cmd /c ...`, `eval ...`, so they are classified too.
function nestedCommands(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const b = baseName(tokens[i]);
    if (b === 'eval' || b === 'invoke-expression' || b === 'iex') {
      out.push(tokens.slice(i + 1).join(' '));
    }
    if (SHELL_C_RUNNERS.has(b)) {
      for (let j = i + 1; j < tokens.length; j++) {
        const t = tokens[j].toLowerCase();
        if (t === '-c' || t === '-lc' || t === '-ic' || t === '/c' || t === '/k' ||
            t === '-command' || t === '-c:' || t.startsWith('-encodedcommand') || t === '-e' || t === '-ec') {
          out.push(tokens.slice(j + 1).join(' '));
          break;
        }
      }
    }
  }
  return out;
}

// ── classification ───────────────────────────────────────────────────────────

const GIT_GLOBAL_WITH_VALUE = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--exec-path']);
const PUSH_OPTS_WITH_VALUE = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);

function isMainRef(ref) {
  if (!ref) return false;
  const r = ref.toLowerCase();
  return r === PROTECTED_BRANCH || r === `refs/heads/${PROTECTED_BRANCH}` || r === `heads/${PROTECTED_BRANCH}`;
}

function hasDynamic(s) {
  return /[$`%]|\$\(/.test(s);
}

// Analyse one `git ... push ...` invocation. Returns a reason string if it would
// (or might) update `main` on a remote, else null.
function analyzePush(pushArgs, ctx) {
  const positional = [];
  let all = false;
  let del = false;
  let repoOpt = null;
  for (let i = 0; i < pushArgs.length; i++) {
    const a = pushArgs[i];
    if (a === '--') { positional.push(...pushArgs.slice(i + 1)); break; }
    if (a.startsWith('-')) {
      if (a === '--all' || a === '--branches' || a === '--mirror') all = true;
      if (a === '--delete' || a === '-d') del = true;
      if (a.startsWith('--repo=')) repoOpt = a.slice(7);
      if (PUSH_OPTS_WITH_VALUE.has(a)) {
        if (a === '--repo') repoOpt = pushArgs[i + 1];
        i++;
      }
      continue;
    }
    positional.push(a);
  }
  if (all) return 'push with --all/--branches/--mirror includes main';
  const joined = positional.join(' ');
  if (hasDynamic(joined)) return 'push target uses a variable/substitution (cannot verify it is not main)';
  const refspecs = repoOpt !== null ? positional : positional.slice(1);
  const remote = repoOpt !== null ? repoOpt : positional[0];

  if (refspecs.length === 0) {
    // Implicit refspec: depends on current branch / config.
    if (ctx.unknownCwd) return 'bare push after a directory change (cannot determine the branch being pushed)';
    const dir = ctx.dir;
    const branch = git(['symbolic-ref', '--short', '-q', 'HEAD'], dir);
    if (branch === null) return 'bare push but the current branch could not be determined';
    if (isMainRef(branch)) return `bare push while on branch "${branch}"`;
    const remoteName = remote || git(['config', '--get', `branch.${branch}.pushRemote`], dir) ||
      git(['config', '--get', 'remote.pushDefault'], dir) || git(['config', '--get', `branch.${branch}.remote`], dir) || 'origin';
    const cfgPush = git(['config', '--get-all', `remote.${remoteName}.push`], dir);
    if (cfgPush) {
      for (const spec of cfgPush.split(/\r?\n/)) {
        const s = spec.replace(/^\+/, '');
        const dst = s.includes(':') ? s.slice(s.indexOf(':') + 1) : s;
        if (dst.includes('*') || isMainRef(dst) || (dst === 'HEAD' && isMainRef(branch))) {
          return `remote.${remoteName}.push config ("${spec}") targets main`;
        }
      }
    }
    const pushDefault = (git(['config', '--get', 'push.default'], dir) || 'simple').toLowerCase();
    if (pushDefault === 'matching') return 'push.default=matching would push main too';
    if (pushDefault === 'upstream' || pushDefault === 'tracking') {
      const merge = git(['config', '--get', `branch.${branch}.merge`], dir);
      if (isMainRef(merge)) return `branch "${branch}" pushes to its upstream, which is main`;
    }
    return null;
  }

  for (const raw of refspecs) {
    let spec = raw.replace(/^\+/, '');
    if (spec.startsWith('tag ') || spec === 'tag') continue;
    let src = spec;
    let dst = spec;
    if (spec.includes(':')) {
      src = spec.slice(0, spec.indexOf(':'));
      dst = spec.slice(spec.indexOf(':') + 1);
    }
    if (dst.includes('*')) return `wildcard refspec "${raw}" may include main`;
    if (del && isMainRef(dst)) return `deleting main ("${raw}")`;
    if (isMainRef(dst)) return `refspec "${raw}" targets main`;
    if (!spec.includes(':') && (src === 'HEAD' || src === '@')) {
      if (ctx.unknownCwd) return `"${raw}" after a directory change (cannot determine the branch HEAD points to)`;
      const branch = git(['symbolic-ref', '--short', '-q', 'HEAD'], ctx.dir);
      if (branch === null || isMainRef(branch)) return `"${raw}" resolves to main (or an undeterminable branch)`;
    }
  }
  return null;
}

// Classify a full command string. Returns { main: boolean, reasons: string[] }.
export function classifyCommand(cmd, baseCwd, depth = 0) {
  const reasons = [];
  if (!cmd || depth > 3) return { main: false, reasons };
  const segments = tokenizeSegments(cmd);
  let unknownCwd = false;
  for (const tokens of segments) {
    const first = baseName(tokens[0] || '');
    if (['cd', 'pushd', 'popd', 'set-location', 'sl', 'chdir', 'push-location', 'pop-location'].includes(first)) {
      unknownCwd = true;
    }
    for (const nested of nestedCommands(tokens)) {
      const r = classifyCommand(nested, baseCwd, depth + 1);
      reasons.push(...r.reasons);
    }
    // GitHub CLI operations that change main on the remote.
    if (tokens.some(t => baseName(t) === 'gh')) {
      const i = tokens.findIndex(t => baseName(t) === 'gh');
      const sub = tokens.slice(i + 1).filter(t => !t.startsWith('-'));
      if (sub[0] === 'pr' && sub[1] === 'merge') reasons.push('`gh pr merge` merges into the base branch (main)');
      if (sub[0] === 'api' && tokens.some(t => /refs\/heads\/main\b|git\/refs/i.test(t)) &&
          tokens.some(t => /^-X$|^--method$|^-f$|^-F$|^--field|^--raw-field|PATCH|POST|PUT|DELETE/i.test(t))) {
        reasons.push('`gh api` write to git refs');
      }
      if (sub[0] === 'repo' && sub[1] === 'sync') reasons.push('`gh repo sync` can update main');
    }
    for (let i = 0; i < tokens.length; i++) {
      if (baseName(tokens[i]) !== 'git') continue;
      let j = i + 1;
      let dir = baseCwd;
      while (j < tokens.length && tokens[j].startsWith('-')) {
        const opt = tokens[j];
        if (opt === '-C' && tokens[j + 1]) dir = path.resolve(dir, tokens[j + 1]);
        if (GIT_GLOBAL_WITH_VALUE.has(opt)) j++;
        j++;
      }
      const sub = tokens[j];
      if (!sub) continue;
      const ctx = { dir, unknownCwd: unknownCwd && dir === baseCwd };
      if (sub === 'push') {
        const r = analyzePush(tokens.slice(j + 1), ctx);
        if (r) reasons.push(r);
      } else if (sub === 'subtree' && tokens[j + 1] === 'push') {
        reasons.push('`git subtree push`');
      } else if (/^[A-Za-z0-9._-]+$/.test(sub)) {
        // Git alias that expands to a push?
        const alias = git(['config', '--get', `alias.${sub}`], dir);
        if (alias && /\bpush\b/.test(alias)) reasons.push(`git alias "${sub}" runs a push ("${alias}")`);
      }
      break;
    }
  }
  return { main: reasons.length > 0, reasons };
}

// ── marker protection ────────────────────────────────────────────────────────

const READONLY_CMDS = new Set(['rm', 'del', 'erase', 'remove-item', 'ri', 'ls', 'dir', 'cat', 'type', 'stat', 'test', '[', 'test-path', 'get-item', 'gi', 'get-content', 'gc', 'git']);

// Claude may read or delete the marker, never create/modify it.
function markerTamper(cmd) {
  if (!cmd.includes(MARKER_NAME)) return null;
  for (const tokens of tokenizeSegments(cmd)) {
    const segText = tokens.join(' ');
    if (!segText.includes(MARKER_NAME)) continue;
    const first = baseName(tokens[0] || '');
    if (!READONLY_CMDS.has(first)) return `command "${first}" touches the approval marker`;
    if (first === 'git' && !tokens.some(t => ['status', 'check-ignore', 'ls-files', 'diff', 'log'].includes(t))) {
      return 'git command touches the approval marker';
    }
  }
  if (/>/.test(cmd.split(MARKER_NAME)[0].slice(-200)) || /\b(tee|Set-Content|Add-Content|Out-File|New-Item|Copy-Item|Move-Item|cp|mv|touch|echo|printf)\b/i.test(cmd)) {
    return 'command could write the approval marker';
  }
  return null;
}

const GUARDED_CONFIG = [/\.claude[\\/]hooks[\\/]main-push-guard\.mjs$/i, /\.claude[\\/]settings(\.local)?\.json$/i];

// ── modes ────────────────────────────────────────────────────────────────────

function modePrompt(input) {
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (isApprovalMessage(prompt)) {
    const now = Date.now();
    const marker = {
      approved: true,
      phrase: APPROVAL_PHRASE,
      session_id: input.session_id || null,
      prompt_id: input.prompt_id || null,
      created_at: new Date(now).toISOString(),
      created_at_ms: now,
      expires_at: new Date(now + FRESHNESS_MS).toISOString(),
      single_use: true,
    };
    fs.mkdirSync(path.dirname(markerPath(input)), { recursive: true });
    fs.writeFileSync(markerPath(input), JSON.stringify(marker, null, 2));
    process.stdout.write(
      `[main-push-guard] Owner sent the exact cutover approval phrase. A push to main is unlocked ` +
      `for ONE push command within 5 minutes (until ${marker.expires_at}). Any other message from the owner ` +
      `revokes it. Delete .claude/${MARKER_NAME} right after the push succeeds.\n`,
    );
    return;
  }
  const hadMarker = fs.existsSync(markerPath(input));
  removeMarker(input);
  if (APPROVAL_INSIDE_RE.test(normalizePrompt(prompt))) {
    process.stdout.write(
      '[main-push-guard] The cutover approval phrase appears inside this message but is not the ENTIRE message, ' +
      'so main is NOT unlocked (quoted/pasted text never unlocks). If the owner intends to approve, ask them to ' +
      `send a message containing only: ${APPROVAL_PHRASE}\n`,
    );
  } else if (hadMarker) {
    process.stdout.write('[main-push-guard] A previous push-to-main approval was revoked because a new message arrived.\n');
  }
}

function modePre(input) {
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};

  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const p = String(ti.file_path || ti.notebook_path || '');
    if (p.includes(MARKER_NAME)) deny('Claude may not create or edit the push-approval marker. Only the owner\'s exact approval phrase creates it.');
    if (GUARDED_CONFIG.some(re => re.test(p))) ask(`Editing ${path.basename(p)} changes the push-to-main safety gate. Owner must confirm.`);
    return;
  }

  if (tool !== 'Bash' && tool !== 'PowerShell') return;
  const cmd = String(ti.command || '');
  const baseCwd = input.cwd || projectDir(input);

  const tamper = markerTamper(cmd);
  if (tamper) deny(`${tamper}. Only the owner's exact approval phrase may create .claude/${MARKER_NAME}.`);
  if (/\.claude[\\/](hooks[\\/]main-push-guard\.mjs|settings(\.local)?\.json)/i.test(cmd) &&
      /(>|sed\s+-i|\btee\b|Set-Content|Out-File|Add-Content|Remove-Item|\brm\b|\bmv\b|\bcp\b|Copy-Item|Move-Item)/i.test(cmd)) {
    ask('This command may modify the push-to-main safety gate (guard script or settings). Owner must confirm.');
  }

  const { main, reasons } = classifyCommand(cmd, baseCwd);
  if (!main) return;

  const mp = markerPath(input);
  let marker = null;
  try { marker = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch { marker = null; }
  const now = Date.now();
  const fresh = marker && marker.approved === true && marker.phrase === APPROVAL_PHRASE &&
    typeof marker.created_at_ms === 'number' && now - marker.created_at_ms >= -5000 &&
    now - marker.created_at_ms <= FRESHNESS_MS;
  const sameSession = marker && (!input.session_id || marker.session_id === input.session_id);

  if (fresh && sameSession) {
    // Single use: consume the approval now. The push proceeds through the normal permission flow.
    removeMarker(input);
    process.stderr.write(`[main-push-guard] Push to main ALLOWED by owner approval at ${marker.created_at} (approval consumed).\n`);
    return;
  }
  if (marker && !fresh) removeMarker(input);
  const why = !marker ? 'no owner approval on record'
    : !fresh ? 'owner approval expired (older than 5 minutes)'
    : 'owner approval belongs to a different session';
  deny(
    `This command would update "main" on the remote (${reasons.join('; ')}), which auto-deploys to production. ` +
    `Blocked: ${why}. Do NOT retry or work around this. Ask the owner to send a message containing ONLY the exact ` +
    `phrase: ${APPROVAL_PHRASE}`,
  );
}

function modePost(input) {
  const tool = input.tool_name || '';
  if (tool !== 'Bash' && tool !== 'PowerShell') return;
  const cmd = String((input.tool_input || {}).command || '');
  const { main } = classifyCommand(cmd, input.cwd || projectDir(input));
  if (!main) return;
  const existed = fs.existsSync(markerPath(input));
  removeMarker(input);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `[main-push-guard] Push-to-main command finished; approval marker ${existed ? 'deleted' : 'already consumed'}. A new exact approval phrase is required for any further push to main.`,
    },
  }));
}

// ── self-test ────────────────────────────────────────────────────────────────

function selftest() {
  const cwd = process.cwd();
  const cases = [
    ['git push origin main', true],
    ['git push origin HEAD:main', true],
    ['git push -f origin main', true],
    ['git push --force-with-lease origin main', true],
    ['git push origin +main', true],
    ['git push origin refs/heads/main', true],
    ['git push origin rebuild/fresh-system:main', true],
    ['git push -u origin main', true],
    ['git push origin --delete main', true],
    ['git push origin :main', true],
    ['git push --all origin', true],
    ['git push --mirror', true],
    ['git -C "C:/x y" push origin main', true],
    ['cd sub && git push', true],
    ['npm run build && git push origin main', true],
    ['bash -c "git push origin main"', true],
    ['powershell -Command "git push origin main"', true],
    ['git push origin $BRANCH', true],
    ['git push origin "refs/heads/*:refs/heads/*"', true],
    ['gh pr merge 12 --squash', true],
    ['git push origin rebuild/fresh-system', false],
    ['git push -u origin rebuild/fresh-system', false],
    ['git push origin feature/x:feature/x', false],
    ['git push origin v1.0.0', false],
    ['git status', false],
    ['git commit -m "push to main later"', false],
    ['git log origin/main..HEAD', false],
    ['git fetch origin main', false],
    ['git pull origin main', false],
    ['git merge main', false],
    ['git checkout main', false],
    ['echo git push origin main', true], // fail-closed false positive: any `git push` token sequence counts
    ['git diff main', false],
  ];
  let fail = 0;
  for (const [cmd, expect] of cases) {
    const r = classifyCommand(cmd, cwd);
    const ok = r.main === expect;
    if (!ok) fail++;
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  main=${String(r.main).padEnd(5)} ${cmd}${r.reasons.length ? `   <- ${r.reasons.join('; ')}` : ''}\n`);
  }
  process.stdout.write(`\n${cases.length - fail}/${cases.length} command cases passed\n\n`);

  // Approval-phrase matcher cases: [label, message, expectAccept]
  const P = 'CUTOVER APPROVED — PUSH TO MAIN NOW';
  const phraseCases = [
    ['canonical em dash', P, true],
    ['en dash', 'CUTOVER APPROVED – PUSH TO MAIN NOW', true],
    ['hyphen-minus', 'CUTOVER APPROVED - PUSH TO MAIN NOW', true],
    ['em dash, no spaces', 'CUTOVER APPROVED—PUSH TO MAIN NOW', true],
    ['en dash, no spaces', 'CUTOVER APPROVED–PUSH TO MAIN NOW', true],
    ['hyphen, no spaces', 'CUTOVER APPROVED-PUSH TO MAIN NOW', true],
    ['hyphen, space before only', 'CUTOVER APPROVED -PUSH TO MAIN NOW', true],
    ['em dash, space after only', 'CUTOVER APPROVED— PUSH TO MAIN NOW', true],
    ['leading/trailing whitespace + newline', `  \n${P}\n\t `, true],
    ['non-breaking spaces', 'CUTOVER APPROVED — PUSH TO MAIN NOW', true],
    ['narrow no-break spaces', 'CUTOVER APPROVED  — PUSH TO MAIN NOW', true],
    ['runs of spaces/tabs collapsed', 'CUTOVER   APPROVED\t—  PUSH TO   MAIN NOW', true],
    ['NFD-decomposed input still NFC-normalizes', P.normalize('NFD'), true],
    ['lowercase', P.toLowerCase(), false],
    ['title case word', 'Cutover APPROVED — PUSH TO MAIN NOW', false],
    ['extra word before', `OK ${P}`, false],
    ['extra word after', `${P} PLEASE`, false],
    ['inside a longer message', `Here it is:\n${P}\nthanks`, false],
    ['double quotes', `"${P}"`, false],
    ['single quotes', `'${P}'`, false],
    ['backticks', '`' + P + '`', false],
    ['trailing period', `${P}.`, false],
    ['trailing exclamation', `${P}!`, false],
    ['double hyphen', 'CUTOVER APPROVED -- PUSH TO MAIN NOW', false],
    ['two spaces kept around dash? (collapsed → accepted)', 'CUTOVER APPROVED  —  PUSH TO MAIN NOW', true],
    ['minus sign U+2212 (not allowed)', 'CUTOVER APPROVED − PUSH TO MAIN NOW', false],
    ['figure dash U+2012 (not allowed)', 'CUTOVER APPROVED ‒ PUSH TO MAIN NOW', false],
    ['no separator', 'CUTOVER APPROVED PUSH TO MAIN NOW', false],
    ['wrapped in <pasted_content> tag', `<pasted_content id="x">\n${P}\n</pasted_content>`, false],
    ['empty', '', false],
  ];
  let pfail = 0;
  for (const [label, msg, expect] of phraseCases) {
    const got = isApprovalMessage(msg);
    const ok = got === expect;
    if (!ok) pfail++;
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${expect ? 'accept' : 'reject'}  ${label}\n`);
  }
  process.stdout.write(`\n${phraseCases.length - pfail}/${phraseCases.length} phrase cases passed\n`);
  process.exit(fail || pfail ? 1 : 0);
}

// ── entry ────────────────────────────────────────────────────────────────────

const mode = process.argv[2];
if (mode === 'selftest') selftest();

let input = {};
const raw = readStdin();
try { input = raw ? JSON.parse(raw) : {}; } catch { input = {}; }

try {
  if (mode === 'prompt') modePrompt(input);
  else if (mode === 'pre') modePre(input);
  else if (mode === 'post') modePost(input);
  process.exit(0);
} catch (err) {
  if (mode === 'pre') {
    const cmd = String((input.tool_input || {}).command || '');
    if (/\b(push|merge)\b/i.test(cmd)) {
      deny(`guard error while checking a push/merge command (${err && err.message}); failing closed.`);
    }
  }
  process.stderr.write(`[main-push-guard] internal error in ${mode}: ${err && err.stack}\n`);
  process.exit(1);
}
