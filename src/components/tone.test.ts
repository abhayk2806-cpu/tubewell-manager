// Semantic tones (D28): complete class strings, WCAG contrast of the tone tokens, and a static
// guard against ad-hoc colours in pages and components.
import { describe, expect, it } from 'vitest';
import { BALANCE_TONE, ENTRY_KIND_TONE, MONEY_TONE, MONTH_STATUS_TONE, NOTICE_TONE, TONE, type Tone } from './tone';

const TONES: readonly Tone[] = ['water', 'cash', 'due', 'credit', 'caution', 'info', 'muted'];
const NEW_TONES = ['water', 'cash', 'due', 'credit', 'caution'] as const;
const KEYS = ['text', 'soft', 'border', 'bar', 'dot', 'badge', 'notice'] as const;

// Vitest turns every CSS module into an empty string (even with ?raw), so the token file is read
// from disk; tests run from the project root.
const fsModule = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync(path: string, encoding: 'utf8'): string };
const css = readFileSync('src/index.css', 'utf8');

const uiSources = import.meta.glob<string>(
  ['/src/pages/**/*.{ts,tsx}', '/src/components/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
);

type Hsl = readonly [number, number, number];

/** Reads one `--name: H S% L%;` token from index.css. */
function token(name: string): Hsl {
  const m = new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%;`).exec(css);
  if (!m) throw new Error(`token --${name} not found in src/index.css`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function luminance([h, s, l]: Hsl): number {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

function contrast(a: Hsl, b: Hsl): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('TONE classes', () => {
  it.each(TONES)('%s has every class key as a non-empty literal string', (tone) => {
    for (const key of KEYS) {
      const value = TONE[tone][key];
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
    }
  });

  it('every domain lookup points at a known tone', () => {
    const used = [
      ...Object.values(MONEY_TONE),
      ...Object.values(MONTH_STATUS_TONE),
      ...Object.values(BALANCE_TONE),
      ...Object.values(ENTRY_KIND_TONE),
      ...Object.values(NOTICE_TONE),
    ];
    for (const tone of used) expect(TONES).toContain(tone);
  });

  it('keeps the meaning map of D28', () => {
    expect(MONEY_TONE).toEqual({ charge: 'water', cash: 'cash', outstanding: 'due', credit: 'credit' });
    expect(MONTH_STATUS_TONE).toEqual({ settled: 'cash', partial: 'caution', unpaid: 'due', payment_only: 'credit' });
    expect(BALANCE_TONE).toEqual({ baaki: 'due', advance: 'credit', zero: 'muted' });
    expect(ENTRY_KIND_TONE).toEqual({ usage: 'water', payment: 'cash' });
    expect(NOTICE_TONE).toEqual({ success: 'cash', warning: 'caution', refreshFailed: 'caution' });
  });
});

describe('tone contrast (WCAG, >= 4.5:1)', () => {
  const card = token('card');
  const page = token('background');

  it.each(NEW_TONES)('%s text is readable on the card, the page and its own soft background', (tone) => {
    const strong = token(`tone-${tone}`);
    expect(contrast(strong, card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(strong, page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(strong, token(`tone-${tone}-soft`))).toBeGreaterThanOrEqual(4.5);
  });

  it('the contrast maths matches known WCAG values', () => {
    expect(contrast([0, 0, 0], [0, 0, 100])).toBeCloseTo(21, 5);
    expect(contrast([0, 0, 100], [0, 0, 100])).toBeCloseTo(1, 5);
  });
});

describe('colour static guard (pages and components)', () => {
  const files = Object.keys(uiSources).sort();
  const PALETTE =
    /\b(?:text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|divide|shadow|accent|caret|placeholder)-(?:[lrtbxy]-)?(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/;
  const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
    ['raw hex colour', /#[0-9a-fA-F]{3,8}\b/],
    ['inline colour style', /style=\{\{[^}]*\b(?:colou?r|background|fill|stroke|border)/i],
    ['raw rgb()/hsl()', /\b(?:rgba?|hsla?)\(/],
    ['default palette class', PALETTE],
  ];

  it('scans the screens, the shared components and the shadcn ui files', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        '/src/components/tone.ts',
        '/src/components/ui/button.tsx',
        '/src/pages/farmers/FarmersPage.tsx',
        '/src/pages/farmers/ProfileSections.tsx',
        '/src/pages/usage/UsageListItem.tsx',
        '/src/pages/payments/PaymentPreviewPanel.tsx',
      ]),
    );
  });

  it('the palette pattern catches default palette classes', () => {
    expect(PALETTE.test('text-red-600')).toBe(true);
    expect(PALETTE.test('border-l-emerald-500')).toBe(true);
    expect(PALETTE.test('text-tone-due')).toBe(false);
  });

  it.each(files)('%s uses token colour classes only', (file) => {
    const source = uiSources[file] ?? '';
    for (const [name, pattern] of FORBIDDEN) expect({ file, name, found: pattern.test(source) }).toEqual({ file, name, found: false });
  });
});
