// Test-only fake of a supabase-js query builder. Every chained call is recorded and the chain
// resolves to the given result, like a real PostgREST builder. It never touches the network.
import type { FarmerRow } from '../farmers';
import type { UsageRow } from '../usage';
import type { PaymentRow } from '../payments';

export interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface FakeQuery {
  readonly query: unknown;
  readonly calls: RecordedCall[];
}

export interface FakeResult {
  readonly data: unknown;
  readonly error: unknown;
  readonly status?: number;
}

export function fakeQuery(result: FakeResult): FakeQuery {
  const calls: RecordedCall[] = [];
  const query: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: (value: FakeResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
            Promise.resolve(result).then(onFulfilled, onRejected);
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return query;
        };
      },
    },
  );
  return { query, calls };
}

/** A fictional usage row with every column; total_minutes follows hours and minutes unless overridden. */
export function usageRow(
  overrides: Partial<UsageRow> & Pick<UsageRow, 'id' | 'farmer_id' | 'used_at' | 'hours' | 'minutes'>,
): UsageRow {
  return {
    total_minutes: overrides.hours * 60 + overrides.minutes,
    rate_paise: 10000,
    created_at: '2026-10-01T04:30:00+00:00',
    created_by: null,
    updated_at: '2026-10-01T04:30:00+00:00',
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

/** A fictional payment row with every column. */
export function paymentRow(
  overrides: Partial<PaymentRow> & Pick<PaymentRow, 'id' | 'farmer_id' | 'paid_at' | 'amount_paise'>,
): PaymentRow {
  return {
    note: null,
    created_at: '2026-10-01T04:30:00+00:00',
    created_by: null,
    updated_at: '2026-10-01T04:30:00+00:00',
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

/** A fictional farmer row with every column, for data-layer and UI tests. */
export function farmerRow(overrides: Partial<FarmerRow> & Pick<FarmerRow, 'id' | 'name'>): FarmerRow {
  return {
    mobile: null,
    notes: null,
    is_disabled: false,
    created_at: '2026-10-01T04:30:00+00:00',
    created_by: null,
    updated_at: '2026-10-01T04:30:00+00:00',
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}
