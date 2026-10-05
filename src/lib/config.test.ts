import { describe, expect, it } from 'vitest';
import { parseConfig } from '@/lib/config';

const VALID = {
  VITE_SUPABASE_URL: 'https://example-ref.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-key',
};

describe('parseConfig', () => {
  it('returns typed config for valid env vars (trimmed, URL normalised to its origin)', () => {
    const config = parseConfig({
      VITE_SUPABASE_URL: '  https://example-ref.supabase.co/  ',
      VITE_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_test-key ',
    });
    expect(config).toEqual({
      supabaseUrl: 'https://example-ref.supabase.co',
      supabasePublishableKey: 'sb_publishable_test-key',
    });
  });

  it('names every missing variable in one clear error', () => {
    expect(() => parseConfig({})).toThrow(
      /Missing environment variable\(s\): VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it('treats blank values as missing', () => {
    expect(() => parseConfig({ ...VALID, VITE_SUPABASE_PUBLISHABLE_KEY: '   ' })).toThrow(
      /Missing environment variable\(s\): VITE_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it('rejects a URL that cannot be parsed', () => {
    expect(() => parseConfig({ ...VALID, VITE_SUPABASE_URL: 'not a url' })).toThrow(/not a valid URL/);
  });

  it('rejects a non-https URL', () => {
    expect(() => parseConfig({ ...VALID, VITE_SUPABASE_URL: 'http://example-ref.supabase.co' })).toThrow(/https/);
  });

  it('ignores non-string values (for example Vite booleans)', () => {
    expect(() => parseConfig({ ...VALID, VITE_SUPABASE_URL: true })).toThrow(/VITE_SUPABASE_URL/);
  });
});
