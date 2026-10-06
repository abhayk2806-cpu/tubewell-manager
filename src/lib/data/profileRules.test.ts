import { describe, expect, it } from 'vitest';
import {
  PROFILE_PAGE_SIZE,
  buildFarmerProfile,
  findProfileFarmer,
  nextShownCount,
  toProfileBalance,
  visiblePart,
} from './profileRules';
import { buildPaymentPreview } from './paymentRules';
import { farmerRow, paymentRow, usageRow } from './test-support/fakeSupabase';

// Worked numbers: one 3 h 35 min entry at 100/hour = 35833 paise (fictional farmer ids).
const entry = usageRow({ id: 'u-1', farmer_id: 'f-1', used_at: '2026-10-02T04:30:00+00:00', hours: 3, minutes: 35 });
const p100 = paymentRow({ id: 'p-100', farmer_id: 'f-1', paid_at: '2026-10-05T05:30:00+00:00', amount_paise: 10000, note: 'pehla' });
const p200 = paymentRow({ id: 'p-200', farmer_id: 'f-1', paid_at: '2026-10-06T05:30:00+00:00', amount_paise: 20000 });
const p300 = paymentRow({ id: 'p-300', farmer_id: 'f-1', paid_at: '2026-10-06T05:30:00+00:00', amount_paise: 30000 });
const otherUsage = usageRow({ id: 'u-x', farmer_id: 'f-2', used_at: '2026-10-02T04:30:00+00:00', hours: 9, minutes: 0 });
const otherPayment = paymentRow({ id: 'p-x', farmer_id: 'f-2', paid_at: '2026-10-05T05:30:00+00:00', amount_paise: 99900 });
const deletedUsage = usageRow({ id: 'u-d', farmer_id: 'f-1', used_at: '2026-10-03T04:30:00+00:00', hours: 5, minutes: 0, deleted_at: '2026-10-04T00:00:00+00:00' });
const deletedPayment = paymentRow({ id: 'p-d', farmer_id: 'f-1', paid_at: '2026-10-03T05:30:00+00:00', amount_paise: 77700, deleted_at: '2026-10-04T00:00:00+00:00' });

function profileOf(usageRows: Parameters<typeof buildFarmerProfile>[0]['usageRows'], paymentRows: Parameters<typeof buildFarmerProfile>[0]['paymentRows']) {
  const result = buildFarmerProfile({ farmerId: 'f-1', usageRows, paymentRows });
  if (!result.ok) throw new Error('expected a profile');
  return result.profile;
}

describe('buildFarmerProfile (worked numbers)', () => {
  it('payments 100 + 200: charges 358.33, paid 300.00, baaki 58.33, credit 0.00; one Partial month', () => {
    const p = profileOf([entry, otherUsage, deletedUsage], [p100, p200, otherPayment, deletedPayment]);
    expect([p.totals.chargesPaise, p.totals.totalPaidPaise, p.totals.outstandingPaise, p.totals.creditPaise]).toEqual([35833, 30000, 5833, 0]);
    expect(p.months).toHaveLength(1);
    expect(p.months[0]).toMatchObject({ monthKey: '2026-10', status: 'partial', remainingPaise: 5833, chargePaise: 35833, paidPaise: 30000, hours: 3, minutes: 35 });
    expect(p.payments.map((x) => [x.row.id, x.pieces, x.unappliedPaise])).toEqual([
      ['p-200', [{ monthKey: '2026-10', amountPaise: 20000 }], 0],
      ['p-100', [{ monthKey: '2026-10', amountPaise: 10000 }], 0],
    ]);
    expect(p.payments[1]?.row.note).toBe('pehla');
    expect(p.usage.map((x) => [x.row.id, x.amountPaise, x.row.hours, x.row.minutes, x.row.rate_paise])).toEqual([['u-1', 35833, 3, 35, 10000]]);
  });

  it('payments 100 + 300: second trail 258.33 + Advance/Credit 41.67; baaki 0.00, credit 41.67', () => {
    const p = profileOf([entry], [p100, p300]);
    expect([p.totals.outstandingPaise, p.totals.creditPaise]).toEqual([0, 4167]);
    const second = p.payments.find((x) => x.row.id === 'p-300');
    expect(second?.pieces).toEqual([{ monthKey: '2026-10', amountPaise: 25833 }]);
    expect(second?.unappliedPaise).toBe(4167);
    expect(p.months[0]?.status).toBe('settled');
  });

  it('ledger newest first with running balance kinds: baaki 358.33, baaki 258.33, advance 41.67', () => {
    const p = profileOf([entry], [p100, p300]);
    expect(p.ledger.map((l) => [l.kind, l.id, l.amountPaise, l.balance])).toEqual([
      ['payment', 'p-300', 30000, { kind: 'advance', amountPaise: 4167 }],
      ['payment', 'p-100', 10000, { kind: 'baaki', amountPaise: 25833 }],
      ['usage', 'u-1', 35833, { kind: 'baaki', amountPaise: 35833 }],
    ]);
    expect(p.ledger[2]?.totalMinutes).toBe(215);
  });

  it('a zero running balance has kind zero', () => {
    const exact = paymentRow({ id: 'p-x2', farmer_id: 'f-1', paid_at: '2026-10-05T05:30:00+00:00', amount_paise: 35833 });
    expect(profileOf([entry], [exact]).ledger[0]?.balance).toEqual({ kind: 'zero', amountPaise: 0 });
  });

  it('a payment-only month has status payment_only; months newest first; hours/minutes from totalMinutes', () => {
    const septPayment = paymentRow({ id: 'p-sep', farmer_id: 'f-1', paid_at: '2026-09-10T05:30:00+00:00', amount_paise: 5000 });
    const hour = usageRow({ id: 'u-h', farmer_id: 'f-1', used_at: '2026-10-03T04:30:00+00:00', hours: 1, minutes: 0 });
    const p = profileOf([entry, hour], [septPayment]);
    expect(p.months.map((m) => [m.monthKey, m.status, m.hours, m.minutes, m.cashPaise])).toEqual([
      ['2026-10', 'partial', 4, 35, 0],
      ['2026-09', 'payment_only', 0, 0, 5000],
    ]);
    const onlyHour = profileOf([hour], []);
    expect([onlyHour.months[0]?.hours, onlyHour.months[0]?.minutes]).toEqual([1, 0]);
  });

  it('soft-deleted rows and other farmers are ignored', () => {
    const p = profileOf([entry, otherUsage, deletedUsage], [otherPayment, deletedPayment]);
    expect([p.totals.chargesPaise, p.totals.totalPaidPaise, p.totals.usageCount, p.totals.paymentCount]).toEqual([35833, 0, 1, 0]);
    expect(p.usage.map((x) => x.row.id)).toEqual(['u-1']);
    expect(p.payments).toEqual([]);
  });

  it('bad data (total_minutes null or inconsistent) gives ok: false, never a throw', () => {
    expect(buildFarmerProfile({ farmerId: 'f-1', usageRows: [{ ...entry, total_minutes: null }], paymentRows: [] })).toEqual({ ok: false });
    expect(buildFarmerProfile({ farmerId: 'f-1', usageRows: [{ ...entry, total_minutes: 216 }], paymentRows: [] })).toEqual({ ok: false });
    // Another farmer's bad row does not affect this profile.
    expect(buildFarmerProfile({ farmerId: 'f-1', usageRows: [entry, { ...otherUsage, total_minutes: null }], paymentRows: [] }).ok).toBe(true);
  });

  it('one engine, one answer: totals equal the Paisa preview "current" totals for the same rows', () => {
    const usageRows = [entry, otherUsage, deletedUsage];
    const paymentRows = [p100, p300, otherPayment, deletedPayment];
    const preview = buildPaymentPreview({ farmerId: 'f-1', usageRows, paymentRows });
    if (!preview.ok || preview.kind !== 'current') throw new Error('expected current totals');
    expect(profileOf(usageRows, paymentRows).totals).toEqual(preview.current);
    const withInput = buildPaymentPreview({
      farmerId: 'f-1',
      input: { farmer_id: 'f-1', paid_at: '2026-10-06T14:00:00+05:30', amount_paise: 100, note: null },
      usageRows,
      paymentRows,
    });
    if (!withInput.ok || withInput.kind !== 'preview') throw new Error('expected a preview');
    expect(profileOf(usageRows, paymentRows).totals).toEqual(withInput.preview.before.totals);
  });
});

describe('toProfileBalance', () => {
  it.each([
    [35833, { kind: 'baaki', amountPaise: 35833 }],
    [-4167, { kind: 'advance', amountPaise: 4167 }],
    [0, { kind: 'zero', amountPaise: 0 }],
    [-0, { kind: 'zero', amountPaise: 0 }],
  ])('%i -> %j', (balance, expected) => {
    expect(toProfileBalance(balance)).toEqual(expected);
  });
});

describe('findProfileFarmer', () => {
  const farmers = [
    farmerRow({ id: 'a', name: 'Chalu Test' }),
    farmerRow({ id: 'b', name: 'Band Test', is_disabled: true }),
    farmerRow({ id: 'd', name: 'Gone Test', deleted_at: '2026-10-01T00:00:00+00:00' }),
  ];
  it('active, disabled, deleted and unknown', () => {
    expect(findProfileFarmer(farmers, 'a').kind).toBe('active');
    expect(findProfileFarmer(farmers, 'b').kind).toBe('disabled');
    expect(findProfileFarmer(farmers, 'd')).toEqual({ kind: 'not_found' });
    expect(findProfileFarmer(farmers, 'zzz')).toEqual({ kind: 'not_found' });
  });
});

describe('paging: first 30, then 30 more', () => {
  const rows = Array.from({ length: 75 }, (_, i) => i);
  it('page size is 30', () => {
    expect(PROFILE_PAGE_SIZE).toBe(30);
  });
  it('visiblePart and nextShownCount', () => {
    expect(visiblePart(rows, PROFILE_PAGE_SIZE)).toEqual({ visible: rows.slice(0, 30), hidden: 45 });
    expect(nextShownCount(75, 30)).toBe(60);
    expect(nextShownCount(75, 60)).toBe(75);
    expect(visiblePart(rows, 75).hidden).toBe(0);
    expect(visiblePart([1, 2], PROFILE_PAGE_SIZE)).toEqual({ visible: [1, 2], hidden: 0 });
    expect(nextShownCount(2, 30)).toBe(2);
  });
});
