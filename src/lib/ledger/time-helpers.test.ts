import { describe, expect, it } from 'vitest';
import { istDateKey, istTimeKey, istWallClockToIso, parseInstantMs } from './index';

describe('istTimeKey', () => {
  it('reads the IST clock time of an instant', () => {
    expect(istTimeKey(parseInstantMs('2026-10-06T08:35:00Z'))).toBe('14:05');
    expect(istTimeKey(parseInstantMs('2026-05-31T18:29:59.999Z'))).toBe('23:59');
    expect(istTimeKey(parseInstantMs('2026-05-31T18:30:00Z'))).toBe('00:00');
    expect(istTimeKey(parseInstantMs('1970-01-01T00:00:00Z'))).toBe('05:30');
  });

  it('rejects an invalid instant like istDateKey does', () => {
    expect(() => istTimeKey(-1)).toThrow();
    expect(() => istTimeKey(1.5)).toThrow();
  });
});

describe('istWallClockToIso', () => {
  it('builds ISO text with +05:30 for an IST date and time', () => {
    expect(istWallClockToIso('2026-10-06', '14:05')).toBe('2026-10-06T14:05:00+05:30');
    expect(istWallClockToIso('2026-10-06', '00:00')).toBe('2026-10-06T00:00:00+05:30');
    expect(istWallClockToIso('2026-10-06', '23:59')).toBe('2026-10-06T23:59:00+05:30');
  });

  it('round-trips: the instant has the same IST date and time', () => {
    for (const [date, time] of [
      ['2026-05-31', '23:59'],
      ['2026-06-01', '00:10'],
      ['2025-12-31', '23:30'],
      ['2026-01-01', '00:00'],
      ['2028-02-29', '12:00'],
    ] as const) {
      const iso = istWallClockToIso(date, time);
      expect(iso).not.toBeNull();
      const ms = parseInstantMs(iso ?? '');
      expect([istDateKey(ms), istTimeKey(ms)]).toEqual([date, time]);
    }
  });

  it('month ends and the leap day', () => {
    expect(istWallClockToIso('2026-01-31', '10:00')).not.toBeNull();
    expect(istWallClockToIso('2026-04-30', '10:00')).not.toBeNull();
    expect(istWallClockToIso('2026-04-31', '10:00')).toBeNull();
    expect(istWallClockToIso('2028-02-29', '10:00')).toBe('2028-02-29T10:00:00+05:30');
    expect(istWallClockToIso('2027-02-29', '10:00')).toBeNull();
  });

  it.each([
    ['2026-02-30', '10:00'],
    ['2026-13-01', '10:00'],
    ['2026-10-06', '24:00'],
    ['2026-10-06', '12:60'],
    ['2026-10-06', '9:05'],
    ['2026-10-06', '09:05:00'],
    ['2026-10-06', '0905'],
    ['2026-10-06', ''],
    ['', '10:00'],
    ['06-10-2026', '10:00'],
    ['2026-10-06T10:00', '10:00'],
    [' 2026-10-06', '10:00'],
    ['2026-10-06', ' 10:00'],
    ['1969-12-31', '10:00'],
    ['1970-01-01', '05:29'],
  ])('returns null for %j %j', (date, time) => {
    expect(istWallClockToIso(date, time)).toBeNull();
  });

  it('never throws on non-string input', () => {
    expect(istWallClockToIso(undefined as unknown as string, '10:00')).toBeNull();
    expect(istWallClockToIso('2026-10-06', 1005 as unknown as string)).toBeNull();
  });
});
