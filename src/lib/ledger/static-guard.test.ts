// Static guard over the engine's own source text (C2, "one engine", "one IST function").
// Sources are read through Vite's import.meta.glob raw query, not Node fs.
import { describe, expect, it } from 'vitest';

const engineSources = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const nestedSources = import.meta.glob<string>(['./**/*.ts', '!./*.ts', '!./test-support/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const EXPECTED_FILES = [
  './dashboard.ts',
  './duplicates.ts',
  './entry.ts',
  './errors.ts',
  './farmers.ts',
  './index.ts',
  './ledger.ts',
  './money.ts',
  './preview.ts',
  './records.ts',
  './time.ts',
  './types.ts',
  './validation.ts',
];

const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ['Date.now', /\bDate\.now\b/],
  ['new Date() without argument', /\bnew\s+Date\s*\(\s*\)/],
  ['local date getters', /\.get(?:FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds|Year|TimezoneOffset)\s*\(/],
  ['local date setters', /\.set(?:FullYear|Month|Date|Hours|Minutes|Seconds|Milliseconds|Time)\s*\(/],
  ['toLocale*', /\btoLocale\w*/],
  ['localeCompare', /\blocaleCompare\b/],
  ['Intl', /\bIntl\b/],
  ['Math.random', /\bMath\.random\b/],
  ['Math rounding', /\bMath\.(?:floor|ceil|round|trunc)\b/],
  ['process.env', /\bprocess\.env\b/],
  ['import.meta', /\bimport\.meta\b/],
  ['parseFloat', /\bparseFloat\b/],
  ['parseInt', /\bparseInt\b/],
  ['toFixed', /\btoFixed\b/],
  ['Date.parse', /\bDate\.parse\b/],
  ['require', /\brequire\s*\(/],
  ['console', /\bconsole\./],
];

/** Every module specifier in import/export-from statements and dynamic imports. */
function specifiers(source: string): string[] {
  const out: string[] = [];
  const patterns = [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]/g];
  for (const re of patterns) {
    for (const match of source.matchAll(re)) out.push(match[1] ?? '');
  }
  return out;
}

describe('engine static guard', () => {
  const files = Object.keys(engineSources).sort();

  it('scans the expected, non-empty set of engine files (tests excluded)', () => {
    expect(files).toEqual(EXPECTED_FILES);
    for (const required of ['./time.ts', './money.ts', './entry.ts', './duplicates.ts', './validation.ts']) {
      expect(files).toContain(required);
    }
    for (const file of files) expect((engineSources[file] ?? '').length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith('.test.ts'))).toBe(false);
  });

  it('has no engine code in subfolders (only test-support)', () => {
    expect(Object.keys(nestedSources)).toEqual([]);
  });

  it.each(EXPECTED_FILES)('%s uses no forbidden tokens', (file) => {
    const source = engineSources[file] ?? '';
    const hits = FORBIDDEN.filter(([, re]) => re.test(source)).map(([name]) => name);
    expect(hits).toEqual([]);
  });

  it.each(EXPECTED_FILES)('%s imports only sibling engine modules', (file) => {
    const bad = specifiers(engineSources[file] ?? '').filter((s) => !/^\.\/[a-z-]+$/.test(s));
    expect(bad).toEqual([]);
  });

  it('IST and calendar math lives only in time.ts', () => {
    const offenders = files.filter(
      (file) =>
        file !== './time.ts' &&
        /\bDate\b|getUTC|19_?800_?000|IST_OFFSET_MS|\.slice\(0,\s*7\)|padStart/.test(engineSources[file] ?? ''),
    );
    expect(offenders).toEqual([]);
  });

  it('the D7 rounding formula lives only in entry.ts', () => {
    const offenders = files.filter((file) => file !== './entry.ts' && /\b120\b/.test(engineSources[file] ?? ''));
    expect(offenders).toEqual([]);
  });

  it('no explicit any, enums, namespaces or module-level let/var', () => {
    for (const file of files) {
      const source = engineSources[file] ?? '';
      expect([file, /:\s*any\b|\bas\s+any\b|<any>/.test(source)]).toEqual([file, false]);
      expect([file, /^\s*(?:export\s+)?(?:const\s+)?enum\b|^\s*(?:export\s+)?namespace\b/m.test(source)]).toEqual([file, false]);
      expect([file, /^(?:export\s+)?(?:let|var)\s/m.test(source)]).toEqual([file, false]);
    }
  });
});
