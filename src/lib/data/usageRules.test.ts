import { describe, expect, it } from 'vitest';
import { LedgerInputError } from '@/lib/ledger';
import {
  buildUsageInput,
  classifyUsage,
  describeUsageWarnings,
  filterUsage,
  listUsageMonths,
  newUsageForm,
  usageAmountPaise,
  usageFormFromRow,
  usageInputAmountPaise,
} from './usageRules';
import type { UsageForm } from './usageRules';
import { usageRow } from './test-support/fakeSupabase';

const NOW = { dateKey: '2026-10-06', timeKey: '14:05', monthKey: '2026-10' };
const good: UsageForm = { farmerId: 'f-1', date: '2026-10-06', time: '09:30', hours: '3', minutes: '35', rate: '100' };

describe('newUsageForm and usageFormFromRow', () => {
  it('a new form starts at the current IST moment, 0h 0m, rate 100', () => {
    expect(newUsageForm(NOW)).toEqual({ farmerId: '', date: '2026-10-06', time: '14:05', hours: '0', minutes: '0', rate: '100' });
  });

  it('an edit form shows the stored entry in IST with the rate in rupees', () => {
    const row = usageRow({ id: 'u', farmer_id: 'f-1', used_at: '2026-10-05T20:00:00+00:00', hours: 2, minutes: 5, rate_paise: 10050 });
    expect(usageFormFromRow(row)).toEqual({ farmerId: 'f-1', date: '2026-10-06', time: '01:30', hours: '2', minutes: '5', rate: '100.50' });
  });
});

describe('buildUsageInput', () => {
  it('happy path: trims, builds +05:30 ISO and integer paise', () => {
    expect(buildUsageInput({ ...good, farmerId: ' f-1 ', hours: ' 3 ', rate: ' 100.5 ' })).toEqual({
      ok: true,
      input: { farmer_id: 'f-1', used_at: '2026-10-06T09:30:00+05:30', hours: 3, minutes: 35, rate_paise: 10050 },
    });
  });

  it.each([
    [{ farmerId: '  ' }, ['farmer_required']],
    [{ date: '' }, ['time_required']],
    [{ time: '' }, ['time_required']],
    [{ date: '2026-02-30' }, ['time_invalid']],
    [{ time: '24:00' }, ['time_invalid']],
    [{ hours: '' }, ['hours_required']],
    [{ hours: '1.5' }, ['hours_not_integer']],
    [{ hours: '-1' }, ['hours_not_integer']],
    [{ hours: '1e2' }, ['hours_not_integer']],
    [{ minutes: '' }, ['minutes_required']],
    [{ minutes: '7.5' }, ['minutes_not_integer']],
    [{ minutes: '60' }, ['minutes_out_of_range']],
    [{ hours: '0', minutes: '0' }, ['duration_zero']],
    [{ rate: '' }, ['rate_required']],
    [{ rate: '0' }, ['rate_not_positive']],
    [{ rate: '-100' }, ['rate_invalid']],
    [{ rate: '1,000' }, ['rate_invalid']],
    [{ rate: '100.555' }, ['rate_invalid']],
    [{ hours: '999999999999', rate: '99999999' }, ['amount_too_large']],
    [{ hours: '99999999999999999999' }, ['hours_not_integer']],
    [{ farmerId: '', hours: '', rate: 'abc' }, ['farmer_required', 'hours_required', 'rate_invalid']],
  ] as const)('%j -> %j', (patch, codes) => {
    expect(buildUsageInput({ ...good, ...patch })).toEqual({ ok: false, codes });
  });

  it('the default new form is not valid until a duration is entered', () => {
    expect(buildUsageInput({ ...newUsageForm(NOW), farmerId: 'f-1' })).toEqual({ ok: false, codes: ['duration_zero'] });
  });
});

describe('amounts', () => {
  it('usageInputAmountPaise uses the engine rounding (E22)', () => {
    expect(usageInputAmountPaise({ farmer_id: 'f', used_at: 'x', hours: 3, minutes: 35, rate_paise: 10000 })).toBe(35833);
    expect(usageInputAmountPaise({ farmer_id: 'f', used_at: 'x', hours: 0, minutes: 1, rate_paise: 10050 })).toBe(168);
  });

  it('usageAmountPaise of stored rows', () => {
    expect(usageAmountPaise(usageRow({ id: 'u', farmer_id: 'f', used_at: 'x', hours: 4, minutes: 25 }))).toBe(44167);
    expect(usageAmountPaise(usageRow({ id: 'u', farmer_id: 'f', used_at: 'x', hours: 0, minutes: 3, rate_paise: 10010 }))).toBe(501);
  });

  it('a null or inconsistent total_minutes throws, never a guess (K-03)', () => {
    expect(() => usageAmountPaise(usageRow({ id: 'u', farmer_id: 'f', used_at: 'x', hours: 1, minutes: 0, total_minutes: null }))).toThrow(
      LedgerInputError,
    );
    expect(() => usageAmountPaise(usageRow({ id: 'u', farmer_id: 'f', used_at: 'x', hours: 1, minutes: 0, total_minutes: 61 }))).toThrow(
      LedgerInputError,
    );
  });
});

describe('describeUsageWarnings', () => {
  const input = { farmer_id: 'f-1', used_at: '2026-10-06T09:30:00+05:30', hours: 3, minutes: 35, rate_paise: 10000 };
  const sameDay = usageRow({ id: 'u-1', farmer_id: 'f-1', used_at: '2026-10-06T02:00:00+00:00', hours: 3, minutes: 35 });

  it('duplicate: same farmer, IST day, hours and minutes', () => {
    expect(describeUsageWarnings(input, [sameDay], NOW)).toEqual([{ kind: 'duplicate', matches: [sameDay] }]);
    expect(describeUsageWarnings({ ...input, minutes: 36 }, [sameDay], NOW)).toEqual([]);
  });

  it('excludeId skips the entry itself', () => {
    expect(describeUsageWarnings(input, [sameDay], NOW, { excludeId: 'u-1' })).toEqual([]);
  });

  it.each([
    [23, 59, false],
    [24, 0, false],
    [24, 1, true],
    [24, 30, true],
    [25, 0, true],
  ])('long_duration on TOTAL time over 24 h (D25): %ih %im -> %s', (hours, minutes, warns) => {
    expect(describeUsageWarnings({ ...input, hours, minutes }, [], NOW)).toEqual(warns ? [{ kind: 'long_duration' }] : []);
  });

  it('an unchanged 24 h 30 min edit does not warn again; changing the minutes does', () => {
    const original = usageRow({ id: 'u-9', farmer_id: 'f-1', used_at: '2026-10-06T02:00:00+00:00', hours: 24, minutes: 30 });
    const edited = { ...input, used_at: '2026-10-06T07:30:00+05:30', hours: 24, minutes: 30, rate_paise: 12000 };
    expect(describeUsageWarnings(edited, [original], NOW, { excludeId: 'u-9', original })).toEqual([]);
    expect(describeUsageWarnings({ ...edited, minutes: 45 }, [original], NOW, { excludeId: 'u-9', original })).toEqual([
      { kind: 'long_duration' },
    ]);
  });

  it('future_date when the IST date is after today (IST)', () => {
    expect(describeUsageWarnings({ ...input, used_at: '2026-10-06T23:59:00+05:30' }, [], NOW)).toEqual([]);
    expect(describeUsageWarnings({ ...input, used_at: '2026-10-07T00:00:00+05:30' }, [], NOW)).toEqual([{ kind: 'future_date' }]);
  });

  it('editing without changing the warned fields does not warn again', () => {
    const original = usageRow({ id: 'u-2', farmer_id: 'f-1', used_at: '2026-10-08T04:00:00+00:00', hours: 30, minutes: 0 });
    const twin = usageRow({ id: 'u-3', farmer_id: 'f-1', used_at: '2026-10-08T06:00:00+00:00', hours: 30, minutes: 0 });
    const edited = { farmer_id: 'f-1', used_at: '2026-10-08T10:00:00+05:30', hours: 30, minutes: 0, rate_paise: 12000 };
    expect(describeUsageWarnings(edited, [original, twin], NOW, { excludeId: 'u-2', original })).toEqual([]);
    expect(describeUsageWarnings({ ...edited, hours: 31 }, [original, twin], NOW, { excludeId: 'u-2', original })).toEqual([
      { kind: 'long_duration' },
    ]);
  });

  it('never throws on a bad timestamp in the input or the rows', () => {
    const broken = { ...sameDay, used_at: 'garbage' };
    expect(describeUsageWarnings({ ...input, used_at: 'nope' }, [broken], NOW)).toEqual([]);
  });
});

describe('classify, filter and months', () => {
  const rows = [
    usageRow({ id: 'a', farmer_id: 'f-1', used_at: '2026-10-01T04:00:00+00:00', hours: 1, minutes: 0 }),
    usageRow({ id: 'b', farmer_id: 'f-2', used_at: '2026-10-05T04:00:00+00:00', hours: 1, minutes: 0 }),
    usageRow({ id: 'c', farmer_id: 'f-1', used_at: '2026-09-15T04:00:00+00:00', hours: 1, minutes: 0, deleted_at: '2026-10-02T00:00:00+00:00' }),
    // 2026-10-31T19:00Z is 2026-11-01 00:30 IST: IST month 2026-11.
    usageRow({ id: 'd', farmer_id: 'f-2', used_at: '2026-10-31T19:00:00Z', hours: 1, minutes: 0 }),
    usageRow({ id: 'e', farmer_id: 'f-1', used_at: '2026-10-05T04:00:00+00:00', hours: 2, minutes: 0 }),
  ];

  it('classifyUsage splits on deleted_at, newest first then id', () => {
    const lists = classifyUsage(rows);
    expect(lists.live.map((r) => r.id)).toEqual(['d', 'b', 'e', 'a']);
    expect(lists.deleted.map((r) => r.id)).toEqual(['c']);
  });

  it('filterUsage by farmer and IST month (midnight boundary)', () => {
    expect(filterUsage(rows, { monthKey: '2026-11' }).map((r) => r.id)).toEqual(['d']);
    expect(filterUsage(rows, { monthKey: '2026-10' }).map((r) => r.id)).toEqual(['a', 'b', 'e']);
    expect(filterUsage(rows, { farmerId: 'f-1', monthKey: '2026-10' }).map((r) => r.id)).toEqual(['a', 'e']);
    expect(filterUsage(rows, {}).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('listUsageMonths: distinct months plus the current month, newest first', () => {
    expect(listUsageMonths(rows, '2026-10')).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(listUsageMonths([], '2026-10')).toEqual(['2026-10']);
  });
});
