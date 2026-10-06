import { describe, expect, it } from 'vitest';
import { findDuplicatePayments, findDuplicateUsage } from './index';
import { DELETED_AT, FARMER_B, RAMU, payment, usage } from './test-support/fixtures';

describe('findDuplicatePayments (L14: same farmer + amount + IST date)', () => {
  const p1 = payment('p1', RAMU, '2026-06-02T10:00', 20000);

  it('E12: a second same-day, same-amount payment matches the first', () => {
    const candidate = { farmer_id: RAMU, paid_at: '2026-06-02T18:00:00+05:30', amount_paise: 20000 };
    expect(findDuplicatePayments(candidate, [p1])).toEqual([p1]);
  });

  it('uses the IST date, not the UTC date', () => {
    // 2026-06-01T18:40Z is 2026-06-02 00:10 IST: same IST day as p1.
    expect(findDuplicatePayments({ farmer_id: RAMU, paid_at: '2026-06-01T18:40:00Z', amount_paise: 20000 }, [p1])).toEqual([p1]);
    // 2026-06-02T18:40Z is 2026-06-03 00:10 IST: a different IST day although the UTC date matches.
    expect(findDuplicatePayments({ farmer_id: RAMU, paid_at: '2026-06-02T18:40:00Z', amount_paise: 20000 }, [p1])).toEqual([]);
  });

  it('different amount, farmer or day do not match', () => {
    expect(findDuplicatePayments({ farmer_id: RAMU, paid_at: '2026-06-02T11:00:00+05:30', amount_paise: 20001 }, [p1])).toEqual([]);
    expect(findDuplicatePayments({ farmer_id: FARMER_B, paid_at: '2026-06-02T11:00:00+05:30', amount_paise: 20000 }, [p1])).toEqual([]);
    expect(findDuplicatePayments({ farmer_id: RAMU, paid_at: '2026-06-03T11:00:00+05:30', amount_paise: 20000 }, [p1])).toEqual([]);
  });

  it("excludes the candidate's own row and soft-deleted rows", () => {
    const deleted = payment('p0', RAMU, '2026-06-02T09:00', 20000, { deletedAt: DELETED_AT });
    expect(findDuplicatePayments({ ...p1 }, [p1, deleted])).toEqual([]);
  });

  it('returns every match in a stable order and never throws', () => {
    const a = payment('a', RAMU, '2026-06-02T12:00', 20000);
    const b = payment('b', RAMU, '2026-06-02T08:00', 20000);
    const broken = { ...payment('c', RAMU, '2026-06-02T09:00', 20000), paid_at: 'garbage' };
    const candidate = { farmer_id: RAMU, paid_at: '2026-06-02T20:00:00+05:30', amount_paise: 20000 };
    expect(findDuplicatePayments(candidate, [a, broken, b]).map((r) => r.id)).toEqual(['b', 'a']);
    expect(findDuplicatePayments({ ...candidate, paid_at: 'not a date' }, [a, b])).toEqual([]);
    expect(findDuplicatePayments({ ...candidate, paid_at: '2026-06-02' }, [a, b])).toEqual([]);
  });
});

describe('findDuplicateUsage (L14: same farmer + IST date + hours/minutes)', () => {
  const u1 = usage('u1', RAMU, '2026-05-05T06:00', 1, 30);

  it('same IST date and same time matches, whatever the rate', () => {
    const candidate = { farmer_id: RAMU, used_at: '2026-05-05T20:00:00+05:30', hours: 1, minutes: 30 };
    expect(findDuplicateUsage(candidate, [u1])).toEqual([u1]);
  });

  it('different minutes, farmer or IST date do not match', () => {
    expect(findDuplicateUsage({ farmer_id: RAMU, used_at: '2026-05-05T20:00:00+05:30', hours: 1, minutes: 31 }, [u1])).toEqual([]);
    expect(findDuplicateUsage({ farmer_id: RAMU, used_at: '2026-05-05T20:00:00+05:30', hours: 0, minutes: 90 }, [u1])).toEqual([]);
    expect(findDuplicateUsage({ farmer_id: FARMER_B, used_at: '2026-05-05T20:00:00+05:30', hours: 1, minutes: 30 }, [u1])).toEqual([]);
    expect(findDuplicateUsage({ farmer_id: RAMU, used_at: '2026-05-05T18:30:00Z', hours: 1, minutes: 30 }, [u1])).toEqual([]);
  });

  it("excludes the candidate's own row and soft-deleted rows; never throws", () => {
    const deleted = usage('u0', RAMU, '2026-05-05T07:00', 1, 30, { deletedAt: DELETED_AT });
    expect(findDuplicateUsage({ ...u1 }, [u1, deleted])).toEqual([]);
    expect(findDuplicateUsage({ farmer_id: RAMU, used_at: 'x', hours: 1, minutes: 30 }, [u1])).toEqual([]);
    expect(findDuplicateUsage({ farmer_id: RAMU, used_at: '2026-05-05T20:00:00+05:30', hours: 1, minutes: 30 }, [
      { ...u1, used_at: 'x' },
    ])).toEqual([]);
  });
});
