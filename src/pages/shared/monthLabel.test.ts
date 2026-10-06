import { describe, expect, it } from 'vitest';
import { monthLabel } from './monthLabel';

describe('monthLabel', () => {
  it('labels IST month keys', () => {
    expect(monthLabel('2026-10')).toBe('Oct 2026');
    expect(monthLabel('2025-01')).toBe('Jan 2025');
    expect(monthLabel('2026-12')).toBe('Dec 2026');
  });

  it('shows unexpected text unchanged', () => {
    expect(monthLabel('2026-13')).toBe('2026-13');
    expect(monthLabel('oops')).toBe('oops');
  });
});
