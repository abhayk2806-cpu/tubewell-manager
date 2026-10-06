import { describe, expect, it } from 'vitest';
import {
  buildPaymentInput,
  buildPaymentPreview,
  classifyPayments,
  describePaymentWarnings,
  filterPayments,
  listPaymentMonths,
  newPaymentForm,
  paymentFormFromRow,
  paymentInputCodes,
} from './paymentRules';
import type { PaymentForm } from './paymentRules';
import { paymentRow, usageRow } from './test-support/fakeSupabase';

const NOW = { dateKey: '2026-10-06', timeKey: '14:05', monthKey: '2026-10' };
const good: PaymentForm = { farmerId: 'f-1', date: '2026-10-06', time: '11:00', amount: '100', note: '' };
const NBSP = String.fromCharCode(0xa0);
const DEVANAGARI_PA = String.fromCharCode(0x092a);

describe('newPaymentForm and paymentFormFromRow', () => {
  it('a new form starts at the current IST moment with an EMPTY amount', () => {
    expect(newPaymentForm(NOW)).toEqual({ farmerId: '', date: '2026-10-06', time: '14:05', amount: '', note: '' });
  });

  it('an edit form shows the stored payment in IST with the amount in rupees', () => {
    const row = paymentRow({ id: 'p', farmer_id: 'f-1', paid_at: '2026-10-05T20:00:00+00:00', amount_paise: 30000, note: 'naqad' });
    expect(paymentFormFromRow(row)).toEqual({ farmerId: 'f-1', date: '2026-10-06', time: '01:30', amount: '300.00', note: 'naqad' });
  });
});

describe('buildPaymentInput', () => {
  it('happy path: trims, +05:30 ISO, integer paise, note trimmed (empty note -> null)', () => {
    expect(buildPaymentInput({ ...good, farmerId: ' f-1 ', amount: ' 100.5 ', note: `  ${NBSP}ek hafte ka\t ` })).toEqual({
      ok: true,
      input: { farmer_id: 'f-1', paid_at: '2026-10-06T11:00:00+05:30', amount_paise: 10050, note: 'ek hafte ka' },
    });
    expect(buildPaymentInput({ ...good, note: `\t${NBSP}\n` })).toMatchObject({ ok: true, input: { note: null } });
  });

  it.each([
    [{ amount: '' }, ['amount_required']],
    [{ amount: '   ' }, ['amount_required']],
    [{ amount: '0' }, ['amount_not_positive']],
    [{ amount: '-1' }, ['amount_invalid']],
    [{ amount: '1,000' }, ['amount_invalid']],
    [{ amount: 'abc' }, ['amount_invalid']],
    [{ amount: '100.555' }, ['amount_invalid']],
    [{ farmerId: '' }, ['farmer_required']],
    [{ date: '' }, ['time_required']],
    [{ time: '' }, ['time_required']],
    [{ date: '2026-02-30' }, ['time_invalid']],
    [{ time: '24:00' }, ['time_invalid']],
    [{ note: 'n'.repeat(201) }, ['note_too_long']],
    [{ note: DEVANAGARI_PA.repeat(201) }, ['note_too_long']],
    [{ farmerId: '', amount: 'x', note: 'n'.repeat(201) }, ['farmer_required', 'amount_invalid', 'note_too_long']],
  ] as const)('%j -> %j', (patch, codes) => {
    expect(buildPaymentInput({ ...good, ...patch })).toEqual({ ok: false, codes });
  });

  it('note boundary: exactly 200 characters (also Devanagari) is fine', () => {
    expect(buildPaymentInput({ ...good, note: 'n'.repeat(200) }).ok).toBe(true);
    expect(buildPaymentInput({ ...good, note: DEVANAGARI_PA.repeat(200) }).ok).toBe(true);
  });

  it('the default new form is not valid until an amount and a farmer are entered', () => {
    expect(buildPaymentInput(newPaymentForm(NOW))).toEqual({ ok: false, codes: ['farmer_required', 'amount_required'] });
  });

  it('paymentInputCodes checks built values the same way', () => {
    const input = { farmer_id: 'f-1', paid_at: '2026-10-06T11:00:00+05:30', amount_paise: 100, note: null };
    expect(paymentInputCodes(input)).toEqual([]);
    expect(paymentInputCodes({ ...input, amount_paise: 0, note: 'n'.repeat(201) })).toEqual(['amount_not_positive', 'note_too_long']);
  });
});

describe('describePaymentWarnings', () => {
  const input = { farmer_id: 'f-1', paid_at: '2026-10-06T11:00:00+05:30', amount_paise: 10000, note: null };
  const sameDay = paymentRow({ id: 'p-1', farmer_id: 'f-1', paid_at: '2026-10-06T02:00:00+00:00', amount_paise: 10000 });

  it('duplicate: same farmer, amount and IST day', () => {
    expect(describePaymentWarnings(input, [sameDay], NOW)).toEqual([{ kind: 'duplicate', matches: [sameDay] }]);
    expect(describePaymentWarnings({ ...input, amount_paise: 10001 }, [sameDay], NOW)).toEqual([]);
    expect(describePaymentWarnings({ ...input, farmer_id: 'f-2' }, [sameDay], NOW)).toEqual([]);
  });

  it('excludeId skips the payment itself', () => {
    expect(describePaymentWarnings(input, [sameDay], NOW, { excludeId: 'p-1' })).toEqual([]);
  });

  it('future_date when the IST date is after today', () => {
    expect(describePaymentWarnings({ ...input, paid_at: '2026-10-06T23:59:00+05:30' }, [], NOW)).toEqual([]);
    expect(describePaymentWarnings({ ...input, paid_at: '2026-10-07T00:00:00+05:30' }, [], NOW)).toEqual([{ kind: 'future_date' }]);
  });

  it('an unchanged edit does not warn again; a changed amount does', () => {
    const original = paymentRow({ id: 'p-2', farmer_id: 'f-1', paid_at: '2026-10-08T04:00:00+00:00', amount_paise: 5000 });
    const twin = paymentRow({ id: 'p-3', farmer_id: 'f-1', paid_at: '2026-10-08T06:00:00+00:00', amount_paise: 5000 });
    const edited = { farmer_id: 'f-1', paid_at: '2026-10-08T12:00:00+05:30', amount_paise: 5000, note: 'badla' };
    expect(describePaymentWarnings(edited, [original, twin], NOW, { excludeId: 'p-2', original })).toEqual([]);
    const twin2 = paymentRow({ id: 'p-4', farmer_id: 'f-1', paid_at: '2026-10-08T06:00:00+00:00', amount_paise: 6000 });
    expect(describePaymentWarnings({ ...edited, amount_paise: 6000 }, [original, twin2], NOW, { excludeId: 'p-2', original })).toEqual([
      { kind: 'duplicate', matches: [twin2] },
    ]);
  });

  it('never throws on bad timestamps', () => {
    expect(describePaymentWarnings({ ...input, paid_at: 'nope' }, [{ ...sameDay, paid_at: 'x' }], NOW)).toEqual([]);
  });
});

describe('buildPaymentPreview (worked numbers; one 3h35 entry at 100/hour = 35833 paise)', () => {
  const entry = usageRow({ id: 'u-1', farmer_id: 'f-1', used_at: '2026-10-02T04:30:00+00:00', hours: 3, minutes: 35 });
  const otherFarmerEntry = usageRow({ id: 'u-x', farmer_id: 'f-2', used_at: '2026-10-02T04:30:00+00:00', hours: 9, minutes: 0 });
  const deletedEntry = usageRow({ id: 'u-d', farmer_id: 'f-1', used_at: '2026-10-03T04:30:00+00:00', hours: 5, minutes: 0, deleted_at: '2026-10-04T00:00:00+00:00' });
  const usageRows = [entry, otherFarmerEntry, deletedEntry];
  const p1 = paymentRow({ id: 'p-1', farmer_id: 'f-1', paid_at: '2026-10-05T05:30:00+00:00', amount_paise: 10000 });
  const p2 = paymentRow({ id: 'p-2', farmer_id: 'f-1', paid_at: '2026-10-06T05:30:00+00:00', amount_paise: 30000 });
  const otherPayment = paymentRow({ id: 'p-x', farmer_id: 'f-2', paid_at: '2026-10-05T05:30:00+00:00', amount_paise: 99999 });
  const input = (amount: number) => ({ farmer_id: 'f-1', paid_at: '2026-10-06T14:05:00+05:30', amount_paise: amount, note: null });

  it('without input: the current totals of that farmer only (other farmers and deleted rows ignored)', () => {
    const result = buildPaymentPreview({ farmerId: 'f-1', usageRows, paymentRows: [otherPayment] });
    expect(result).toMatchObject({ ok: true, kind: 'current', current: { chargesPaise: 35833, outstandingPaise: 35833, creditPaise: 0 } });
  });

  it('(a) first payment of 100.00: before 35833 / 0, piece 2026-10 10000, after 25833 / 0', () => {
    const result = buildPaymentPreview({ farmerId: 'f-1', input: input(10000), usageRows, paymentRows: [otherPayment] });
    if (!result.ok || result.kind !== 'preview') throw new Error('expected a preview');
    const p = result.preview;
    expect([p.before.totals.outstandingPaise, p.before.totals.creditPaise]).toEqual([35833, 0]);
    expect(p.pieces).toEqual([{ monthKey: '2026-10', amountPaise: 10000 }]);
    expect(p.unappliedPaise).toBe(0);
    expect([p.after.totals.outstandingPaise, p.after.totals.creditPaise, p.creditCreatedPaise]).toEqual([25833, 0, 0]);
  });

  it('(b) second payment of 300.00: piece 25833 + Advance/Credit 4167; after 0 / 4167; credit created 4167', () => {
    const result = buildPaymentPreview({ farmerId: 'f-1', input: input(30000), usageRows, paymentRows: [p1, otherPayment] });
    if (!result.ok || result.kind !== 'preview') throw new Error('expected a preview');
    const p = result.preview;
    expect(p.pieces).toEqual([{ monthKey: '2026-10', amountPaise: 25833 }]);
    expect(p.unappliedPaise).toBe(4167);
    expect([p.after.totals.outstandingPaise, p.after.totals.creditPaise, p.creditCreatedPaise]).toEqual([0, 4167, 4167]);
  });

  it('(c) editing the 300.00 payment to 200.00: before 0 / 4167, after 5833 / 0', () => {
    const result = buildPaymentPreview({
      farmerId: 'f-1',
      input: input(20000),
      usageRows,
      paymentRows: [p1, p2, otherPayment],
      replacesPaymentId: 'p-2',
    });
    if (!result.ok || result.kind !== 'preview') throw new Error('expected a preview');
    const p = result.preview;
    expect([p.before.totals.outstandingPaise, p.before.totals.creditPaise]).toEqual([0, 4167]);
    expect([p.after.totals.outstandingPaise, p.after.totals.creditPaise, p.creditCreatedPaise]).toEqual([5833, 0, 0]);
    expect(p.pieces).toEqual([{ monthKey: '2026-10', amountPaise: 20000 }]);
  });

  it('bad data (null total_minutes) or a deleted replaced payment gives ok: false, never a throw', () => {
    const broken = { ...entry, total_minutes: null };
    expect(buildPaymentPreview({ farmerId: 'f-1', usageRows: [broken], paymentRows: [] })).toEqual({ ok: false });
    expect(buildPaymentPreview({ farmerId: 'f-1', input: input(100), usageRows: [broken], paymentRows: [] })).toEqual({ ok: false });
    const gone = { ...p2, deleted_at: '2026-10-06T08:00:00+00:00' };
    expect(
      buildPaymentPreview({ farmerId: 'f-1', input: input(100), usageRows, paymentRows: [p1, gone], replacesPaymentId: 'p-2' }),
    ).toEqual({ ok: false });
  });
});

describe('classify, filter and months', () => {
  const rows = [
    paymentRow({ id: 'a', farmer_id: 'f-1', paid_at: '2026-10-01T04:00:00+00:00', amount_paise: 100 }),
    paymentRow({ id: 'b', farmer_id: 'f-2', paid_at: '2026-10-05T04:00:00+00:00', amount_paise: 100 }),
    paymentRow({ id: 'c', farmer_id: 'f-1', paid_at: '2026-09-15T04:00:00+00:00', amount_paise: 100, deleted_at: '2026-10-02T00:00:00+00:00' }),
    // 2026-10-31T19:00Z is 2026-11-01 00:30 IST: IST month 2026-11.
    paymentRow({ id: 'd', farmer_id: 'f-2', paid_at: '2026-10-31T19:00:00Z', amount_paise: 100 }),
    paymentRow({ id: 'e', farmer_id: 'f-1', paid_at: '2026-10-05T04:00:00+00:00', amount_paise: 200 }),
  ];

  it('classifyPayments splits on deleted_at, newest first then id', () => {
    const lists = classifyPayments(rows);
    expect(lists.live.map((r) => r.id)).toEqual(['d', 'b', 'e', 'a']);
    expect(lists.deleted.map((r) => r.id)).toEqual(['c']);
  });

  it('filterPayments by farmer and IST month (midnight boundary)', () => {
    expect(filterPayments(rows, { monthKey: '2026-11' }).map((r) => r.id)).toEqual(['d']);
    expect(filterPayments(rows, { farmerId: 'f-1', monthKey: '2026-10' }).map((r) => r.id)).toEqual(['a', 'e']);
    expect(filterPayments(rows, {})).toHaveLength(5);
  });

  it('listPaymentMonths: distinct months plus the current month, newest first', () => {
    expect(listPaymentMonths(rows, '2026-10')).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(listPaymentMonths([], '2026-12')).toEqual(['2026-12']);
  });
});
