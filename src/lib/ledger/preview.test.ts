import { describe, expect, it } from 'vitest';
import { LedgerInputError, endOfIstDayMs, previewPayment } from './index';
import { DELETED_AT, RAMU, e1Payments, e1Usage, ist, payment, usage } from './test-support/fixtures';
import { deepFreeze } from './test-support/random';

function pieces(p: ReturnType<typeof previewPayment>) {
  return p.pieces.map((x) => [x.monthKey, x.amountPaise]);
}

describe('previewPayment (L16)', () => {
  it('E1: a 500.00 payment on the usage only', () => {
    const p = previewPayment(
      { usage: e1Usage(), payments: [] },
      { farmer_id: RAMU, paid_at: ist('2026-09-10'), amount_paise: 50000 },
    );
    expect(pieces(p)).toEqual([['2026-05', 35833], ['2026-06', 14167]]);
    expect(p.before.totals.outstandingPaise).toBe(177500);
    expect(p.after.totals.outstandingPaise).toBe(127500);
    expect(p.unappliedPaise).toBe(0);
    expect(p.creditCreatedPaise).toBe(0);
  });

  it('E3: exact payment gives one piece and no credit', () => {
    const p = previewPayment(
      { usage: [usage('u1', RAMU, '2026-05-05', 2, 0)], payments: [] },
      { farmer_id: RAMU, paid_at: ist('2026-05-25'), amount_paise: 20000 },
    );
    expect(pieces(p)).toEqual([['2026-05', 20000]]);
    expect(p.unappliedPaise).toBe(0);
    expect(p.after.totals.outstandingPaise).toBe(0);
    expect(p.after.totals.creditPaise).toBe(0);
  });

  it('E4: overpayment shows the credit it creates', () => {
    const p = previewPayment(
      { usage: [usage('u1', RAMU, '2026-05-05', 2, 0)], payments: [] },
      { farmer_id: RAMU, paid_at: ist('2026-05-25'), amount_paise: 50000 },
    );
    expect(pieces(p)).toEqual([['2026-05', 20000]]);
    expect(p.unappliedPaise).toBe(30000);
    expect(p.creditCreatedPaise).toBe(30000);
    expect(p.after.totals.creditPaise).toBe(30000);
  });

  it('E10: editing P1 from 500.00 to 300.00 shows before and after', () => {
    const p = previewPayment(
      { usage: e1Usage(), payments: e1Payments() },
      { farmer_id: RAMU, paid_at: ist('2026-09-10'), amount_paise: 30000 },
      { replacesPaymentId: 'p1' },
    );
    expect(p.before.totals.outstandingPaise).toBe(127500);
    expect(p.after.totals.outstandingPaise).toBe(147500);
    expect(pieces(p)).toEqual([['2026-05', 30000]]);
    expect(p.creditCreatedPaise).toBe(0);
  });

  it('a candidate without id and created_at sorts after existing payments at the same instant', () => {
    const input = {
      usage: [usage('u1', RAMU, '2026-05-05', 2, 0), usage('u2', RAMU, '2026-06-05', 2, 0)],
      payments: [payment('zzz', RAMU, '2026-06-20', 20000, { createdAt: '2099-01-01T00:00:00Z' })],
    };
    const p = previewPayment(input, { farmer_id: RAMU, paid_at: ist('2026-06-20'), amount_paise: 20000 });
    expect(pieces(p)).toEqual([['2026-06', 20000]]);
  });

  it('a replaced payment keeps its id and created_at, so its tie order is kept', () => {
    const input = {
      usage: [usage('u1', RAMU, '2026-05-05', 2, 0), usage('u2', RAMU, '2026-06-05', 2, 0)],
      payments: [
        payment('p-b', RAMU, '2026-06-20', 20000, { createdAt: '2026-06-20T12:00:00Z' }),
        payment('p-a', RAMU, '2026-06-20', 20000, { createdAt: '2026-06-20T08:00:00Z' }),
      ],
    };
    const p = previewPayment(input, { farmer_id: RAMU, paid_at: ist('2026-06-20'), amount_paise: 25000 }, {
      replacesPaymentId: 'p-a',
    });
    expect(pieces(p)).toEqual([['2026-05', 20000], ['2026-06', 5000]]);
  });

  it('a candidate beyond the cutoff gets no pieces', () => {
    const p = previewPayment(
      { usage: e1Usage(), payments: [] },
      { farmer_id: RAMU, paid_at: ist('2026-09-10'), amount_paise: 50000 },
      { cutoffMs: endOfIstDayMs('2026-09-09') },
    );
    expect(p.pieces).toEqual([]);
    expect(p.unappliedPaise).toBe(0);
    expect(p.creditCreatedPaise).toBe(0);
    expect(p.after).toEqual(p.before);
  });

  it('does not mutate deep-frozen inputs', () => {
    const input = deepFreeze({ usage: e1Usage(), payments: e1Payments() });
    const candidate = deepFreeze({ farmer_id: RAMU, paid_at: ist('2026-09-11'), amount_paise: 1000 });
    const before = JSON.stringify([input, candidate]);
    previewPayment(input, candidate);
    previewPayment(input, candidate, { replacesPaymentId: 'p1' });
    expect(JSON.stringify([input, candidate])).toBe(before);
  });

  it('an unknown or deleted replacesPaymentId throws', () => {
    const candidate = { farmer_id: RAMU, paid_at: ist('2026-09-10'), amount_paise: 1000 };
    expect(() =>
      previewPayment({ usage: e1Usage(), payments: e1Payments() }, candidate, { replacesPaymentId: 'nope' }),
    ).toThrow(LedgerInputError);
    const deleted = e1Payments().map((p) => ({ ...p, deleted_at: DELETED_AT }));
    expect(() => previewPayment({ usage: e1Usage(), payments: deleted }, candidate, { replacesPaymentId: 'p1' })).toThrow(
      LedgerInputError,
    );
  });

  it('an invalid candidate or another farmer throws', () => {
    const input = { usage: e1Usage(), payments: e1Payments() };
    expect(() => previewPayment(input, { farmer_id: RAMU, paid_at: ist('2026-09-10'), amount_paise: 0 })).toThrow(
      LedgerInputError,
    );
    expect(() => previewPayment(input, { farmer_id: RAMU, paid_at: '2026-09-10', amount_paise: 100 })).toThrow(
      LedgerInputError,
    );
    expect(() =>
      previewPayment(input, { farmer_id: 'farmer-other', paid_at: ist('2026-09-10'), amount_paise: 100 }),
    ).toThrow(LedgerInputError);
    expect(() =>
      previewPayment(input, { id: 'p1', farmer_id: RAMU, paid_at: ist('2026-09-10'), amount_paise: 100 }),
    ).toThrow(LedgerInputError);
  });
});
