import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentIstMoment, nowIso } from './clock';

afterEach(() => {
  vi.useRealTimers();
});

describe('clock', () => {
  it('nowIso returns ISO text with Z', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 6, 8, 35, 0));
    expect(nowIso()).toBe('2026-10-06T08:35:00.000Z');
  });

  it('currentIstMoment gives the IST date, time and month (midnight boundary)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 31, 19, 0, 0)); // 2026-11-01 00:30 IST
    expect(currentIstMoment()).toEqual({ dateKey: '2026-11-01', timeKey: '00:30', monthKey: '2026-11' });
  });
});
