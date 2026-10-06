import { describe, expect, it } from 'vitest';
import { LedgerInputError, buildFarmerLedger, endOfIstDayMs } from './index';
import type { LedgerUsage } from './index';
import { DELETED_AT, RAMU, e1Payments, e1Usage, payment, usage } from './test-support/fixtures';

describe('buildFarmerLedger: rows and filters (C4, C6, C7)', () => {
  it('ignores soft-deleted usage and payments entirely', () => {
    const l = buildFarmerLedger({
      usage: [...e1Usage(), usage('u-del', RAMU, '2026-04-01', 9, 0, { deletedAt: DELETED_AT })],
      payments: [...e1Payments(), payment('p-del', RAMU, '2026-03-01', 999999, { deletedAt: DELETED_AT })],
    });
    expect(l.months.map((r) => r.monthKey)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(l.totals.usageCount).toBe(4);
    expect(l.totals.paymentCount).toBe(1);
    expect(l.rows.some((r) => r.id.endsWith('del'))).toBe(false);
  });

  it('does not validate soft-deleted rows', () => {
    const broken = { ...usage('u-del', RAMU, '2026-04-01', 1, 0), used_at: 'not a date', deleted_at: DELETED_AT };
    expect(() => buildFarmerLedger({ usage: [broken], payments: [] })).not.toThrow();
  });

  it('empty input gives an empty ledger', () => {
    const l = buildFarmerLedger({ usage: [], payments: [] });
    expect(l.months).toEqual([]);
    expect(l.trail).toEqual([]);
    expect(l.rows).toEqual([]);
    expect(l.totals).toEqual({
      chargesPaise: 0,
      totalPaidPaise: 0,
      outstandingPaise: 0,
      creditPaise: 0,
      usageCount: 0,
      paymentCount: 0,
    });
  });

  it('an entry that rounds to 0 paise makes a settled month with charge 0 (C7)', () => {
    const l = buildFarmerLedger({ usage: [usage('u1', RAMU, '2026-05-05', 0, 1, { rate: 1 })], payments: [] });
    expect(l.months).toEqual([
      {
        monthKey: '2026-05',
        totalMinutes: 1,
        chargePaise: 0,
        paidPaise: 0,
        remainingPaise: 0,
        cashPaise: 0,
        status: 'settled',
        entryCount: 1,
        paymentCount: 0,
      },
    ]);
  });

  it('a payment-only month after a zero-charge entry in the same month is payment_only', () => {
    const l = buildFarmerLedger({
      usage: [usage('u1', RAMU, '2026-05-05', 0, 1, { rate: 1 })],
      payments: [payment('p1', RAMU, '2026-05-06', 500)],
    });
    expect(l.months[0]?.status).toBe('payment_only');
    expect(l.totals.creditPaise).toBe(500);
  });

  it('ties: payments at the same instant order by created_at, then id', () => {
    const l = buildFarmerLedger({
      usage: [usage('u1', RAMU, '2026-05-05', 1, 0), usage('u2', RAMU, '2026-06-05', 1, 0)],
      payments: [
        payment('p-2', RAMU, '2026-07-01', 10000, { createdAt: '2026-07-01T00:00:00Z' }),
        payment('p-1', RAMU, '2026-07-01', 10000, { createdAt: '2026-07-01T00:00:00Z' }),
        payment('p-0', RAMU, '2026-07-01', 10000, { createdAt: '2026-07-02T00:00:00Z' }),
      ],
    });
    expect(l.trail.map((t) => [t.paymentId, t.pieces.map((p) => p.monthKey), t.unappliedPaise])).toEqual([
      ['p-1', ['2026-05'], 0],
      ['p-2', ['2026-06'], 0],
      ['p-0', [], 10000],
    ]);
  });

  it('ids compare as plain strings (code units), not locale order', () => {
    const l = buildFarmerLedger({
      usage: [usage('u1', RAMU, '2026-05-05', 1, 0)],
      payments: [payment('b', RAMU, '2026-07-01', 5000), payment('B', RAMU, '2026-07-01', 5000)],
    });
    expect(l.trail.map((t) => t.paymentId)).toEqual(['B', 'b']);
  });

  it('running ledger: usage before payment at the same instant; balance may go negative', () => {
    const l = buildFarmerLedger({
      usage: [usage('u1', RAMU, '2026-05-05T10:00', 1, 0)],
      payments: [payment('p1', RAMU, '2026-05-05T10:00', 30000), payment('p0', RAMU, '2026-05-01', 5000)],
    });
    expect(l.rows.map((r) => [r.kind, r.id, r.amountPaise, r.balancePaise])).toEqual([
      ['payment', 'p0', 5000, -5000],
      ['usage', 'u1', 10000, 5000],
      ['payment', 'p1', 30000, -25000],
    ]);
    expect(l.rows[1]?.totalMinutes).toBe(60);
    expect(l.rows[0]?.totalMinutes).toBeNull();
    expect(l.rows[1]?.monthKey).toBe('2026-05');
  });

  it('cutoff is inclusive to the millisecond', () => {
    const u = [usage('u1', RAMU, '2026-05-31T23:59:59.999+05:30', 1, 0)];
    expect(buildFarmerLedger({ usage: u, payments: [] }, { cutoffMs: endOfIstDayMs('2026-05-31') }).totals.chargesPaise).toBe(
      10000,
    );
    expect(
      buildFarmerLedger({ usage: u, payments: [] }, { cutoffMs: endOfIstDayMs('2026-05-31') - 1 }).totals.chargesPaise,
    ).toBe(0);
  });

  it('accepts microsecond timestamps and DB-style +00:00 offsets', () => {
    const l = buildFarmerLedger({
      usage: [{ ...usage('u1', RAMU, '2026-05-05', 1, 0), used_at: '2026-05-31T18:30:00.000001+00:00' }],
      payments: [],
    });
    expect(l.months[0]?.monthKey).toBe('2026-06');
  });
});

describe('buildFarmerLedger: rejects bad input (C1, C5, C6)', () => {
  const base = usage('u1', RAMU, '2026-05-05', 1, 0);
  const bad: [string, LedgerUsage][] = [
    ['total_minutes mismatch', { ...base, total_minutes: 61 }],
    ['total_minutes null', { ...base, total_minutes: null }],
    ['naive used_at', { ...base, used_at: '2026-05-05T10:00:00' }],
    ['date-only used_at', { ...base, used_at: '2026-05-05' }],
    ['naive created_at', { ...base, created_at: '2026-05-05T10:00:00' }],
    ['minutes 60', { ...base, hours: 0, minutes: 60, total_minutes: 60 }],
    ['negative hours', { ...base, hours: -1, minutes: 120, total_minutes: 60 }],
    ['fractional rate', { ...base, rate_paise: 100.5 }],
    ['zero rate', { ...base, rate_paise: 0 }],
    ['zero time', { ...base, hours: 0, minutes: 0, total_minutes: 0 }],
    ['unsafe rate', { ...base, rate_paise: Number.MAX_SAFE_INTEGER }],
    ['empty id', { ...base, id: '' }],
  ];
  it.each(bad)('usage: %s', (_label, row) => {
    expect(() => buildFarmerLedger({ usage: [row], payments: [] })).toThrow(LedgerInputError);
  });

  it.each([
    ['zero amount', 0],
    ['negative amount', -100],
    ['fractional amount', 10.5],
    ['unsafe amount', Number.MAX_SAFE_INTEGER + 2],
  ])('payment: %s', (_label, amount) => {
    expect(() =>
      buildFarmerLedger({ usage: [], payments: [{ ...payment('p1', RAMU, '2026-05-05', 1), amount_paise: amount }] }),
    ).toThrow(LedgerInputError);
  });

  it('rows of two farmers never mix in one ledger', () => {
    expect(() =>
      buildFarmerLedger({ usage: [usage('u1', RAMU, '2026-05-05', 1, 0)], payments: [payment('p1', 'farmer-b', '2026-05-06', 100)] }),
    ).toThrow(LedgerInputError);
  });

  it('duplicate live ids are rejected', () => {
    expect(() =>
      buildFarmerLedger({ usage: [], payments: [payment('p1', RAMU, '2026-05-05', 100), payment('p1', RAMU, '2026-05-06', 100)] }),
    ).toThrow(LedgerInputError);
  });

  it('sums beyond the safe-integer range are rejected', () => {
    const big = 4_000_000_000_000_000;
    expect(() =>
      buildFarmerLedger({
        usage: [],
        payments: [payment('p1', RAMU, '2026-05-05', big), payment('p2', RAMU, '2026-05-06', big), payment('p3', RAMU, '2026-05-07', big)],
      }),
    ).toThrow(LedgerInputError);
  });

  it.each([1.5, Number.NaN, -1])('invalid cutoffMs %d', (cutoffMs) => {
    expect(() => buildFarmerLedger({ usage: [], payments: [] }, { cutoffMs })).toThrow(LedgerInputError);
  });
});
