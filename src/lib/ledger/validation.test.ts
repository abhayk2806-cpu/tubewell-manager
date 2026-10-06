import { describe, expect, it } from 'vitest';
import { validatePaymentInput, validateUsageInput } from './index';

const goodUsage = {
  farmer_id: 'farmer-ramu',
  used_at: '2026-05-10T10:00:00+05:30',
  hours: 3,
  minutes: 35,
  rate_paise: 10000,
};

const goodPayment = { farmer_id: 'farmer-ramu', paid_at: '2026-09-10T10:00:00+05:30', amount_paise: 50000 };

describe('validateUsageInput (L18, D6)', () => {
  it('accepts a valid entry, including 0 hours or 0 minutes', () => {
    expect(validateUsageInput(goodUsage)).toEqual([]);
    expect(validateUsageInput({ ...goodUsage, hours: 0, minutes: 1 })).toEqual([]);
    expect(validateUsageInput({ ...goodUsage, hours: 2, minutes: 0 })).toEqual([]);
  });

  it.each([
    [{ farmer_id: '' }, ['farmer_required']],
    [{ farmer_id: '   ' }, ['farmer_required']],
    [{ farmer_id: null }, ['farmer_required']],
    [{ used_at: '' }, ['time_required']],
    [{ used_at: undefined }, ['time_required']],
    [{ used_at: '2026-05-10T10:00' }, ['time_invalid']],
    [{ used_at: '2026-05-10' }, ['time_invalid']],
    [{ hours: null }, ['hours_required']],
    [{ hours: -1 }, ['hours_negative']],
    [{ hours: 1.5 }, ['hours_not_integer']],
    [{ hours: Number.NaN }, ['hours_not_integer']],
    [{ minutes: undefined }, ['minutes_required']],
    [{ minutes: -1 }, ['minutes_negative']],
    [{ minutes: 60 }, ['minutes_out_of_range']],
    [{ minutes: 2.5 }, ['minutes_not_integer']],
    [{ hours: 0, minutes: 0 }, ['duration_zero']],
    [{ rate_paise: null }, ['rate_required']],
    [{ rate_paise: 0 }, ['rate_not_positive']],
    [{ rate_paise: -10000 }, ['rate_negative']],
    [{ rate_paise: 100.5 }, ['rate_not_integer']],
    [{ hours: 1_000_000_000, rate_paise: 1_000_000_000 }, ['amount_too_large']],
  ])('%j -> %j', (patch, codes) => {
    expect(validateUsageInput({ ...goodUsage, ...patch })).toEqual(codes);
  });

  it('reports several problems in a fixed field order and never throws', () => {
    expect(validateUsageInput({ farmer_id: '', used_at: 'x', hours: -1, minutes: 99, rate_paise: 0 })).toEqual([
      'farmer_required',
      'time_invalid',
      'hours_negative',
      'minutes_out_of_range',
      'rate_not_positive',
    ]);
  });
});

describe('validatePaymentInput (L18)', () => {
  it('accepts a valid payment', () => {
    expect(validatePaymentInput(goodPayment)).toEqual([]);
  });

  it.each([
    [{ farmer_id: '' }, ['farmer_required']],
    [{ paid_at: null }, ['time_required']],
    [{ paid_at: '2026-09-10' }, ['time_invalid']],
    [{ amount_paise: undefined }, ['amount_required']],
    [{ amount_paise: 0 }, ['amount_not_positive']],
    [{ amount_paise: -5 }, ['amount_negative']],
    [{ amount_paise: 10.5 }, ['amount_not_integer']],
    [{ amount_paise: Number.MAX_SAFE_INTEGER + 2 }, ['amount_not_integer']],
  ])('%j -> %j', (patch, codes) => {
    expect(validatePaymentInput({ ...goodPayment, ...patch })).toEqual(codes);
  });
});
