import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const api = vi.hoisted(() => ({
  listPayments: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  softDeletePayment: vi.fn(),
  restorePayment: vi.fn(),
}));
vi.mock('@/lib/data/payments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/payments')>()),
  ...api,
}));

import { DataError } from '@/lib/data';
import { paymentRow } from '@/lib/data/test-support/fakeSupabase';
import { usePayments } from './usePayments';

const older = paymentRow({ id: 'p-1', farmer_id: 'f-1', paid_at: '2026-10-01T04:00:00+00:00', amount_paise: 10000 });
const newer = paymentRow({ id: 'p-2', farmer_id: 'f-1', paid_at: '2026-10-05T04:00:00+00:00', amount_paise: 30000 });
const gone = paymentRow({ id: 'p-3', farmer_id: 'f-1', paid_at: '2026-10-03T04:00:00+00:00', amount_paise: 500, deleted_at: '2026-10-06T00:00:00+00:00' });
const input = { farmer_id: 'f-1', paid_at: '2026-10-06T11:00:00+05:30', amount_paise: 10000, note: null };

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listPayments.mockResolvedValue([older, gone, newer]);
});

describe('usePayments', () => {
  it('loads, then splits live (newest first) and deleted', async () => {
    const { result } = renderHook(() => usePayments());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.live.map((r) => r.id)).toEqual(['p-2', 'p-1']);
    expect(result.current.deleted.map((r) => r.id)).toEqual(['p-3']);
    expect(result.current.all).toHaveLength(3);
  });

  it('initial load error, then reload recovers', async () => {
    api.listPayments.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    const { result } = renderHook(() => usePayments());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.kind).toBe('network');
    await act(() => result.current.reload());
    expect(result.current.status).toBe('ready');
  });

  it('pending while saving, one mutation at a time, reload after success', async () => {
    const { result } = renderHook(() => usePayments());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const save = deferred<typeof older>();
    api.createPayment.mockReturnValue(save.promise);
    let first: Promise<unknown> = Promise.resolve();
    let second: unknown;
    await act(async () => {
      first = result.current.create(input);
      second = await result.current.create(input);
    });
    expect(second).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(result.current.pending).toEqual({ kind: 'create', paymentId: null });
    const created = paymentRow({ id: 'p-4', farmer_id: 'f-1', paid_at: '2026-10-06T05:30:00+00:00', amount_paise: 10000 });
    api.listPayments.mockResolvedValue([older, gone, newer, created]);
    let outcome: unknown;
    await act(async () => {
      save.resolve(created);
      outcome = await first;
    });
    expect(outcome).toEqual({ ok: true, payment: created });
    expect(api.createPayment).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBeNull();
    expect(result.current.live.map((r) => r.id)).toEqual(['p-4', 'p-2', 'p-1']);
  });

  it('saved but the reload failed: keeps rows, ok result, refreshFailed; retry clears it', async () => {
    const { result } = renderHook(() => usePayments());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    api.softDeletePayment.mockResolvedValue({ ...newer, deleted_at: '2026-10-06T10:00:00+00:00' });
    api.listPayments.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.remove('p-2');
    });
    expect(outcome).toMatchObject({ ok: true });
    expect([result.current.status, result.current.refreshFailed]).toEqual(['ready', true]);
    expect(result.current.live.map((r) => r.id)).toEqual(['p-2', 'p-1']);
    await act(() => result.current.retryRefresh());
    expect(result.current.refreshFailed).toBe(false);
  });

  it('a failed mutation returns the DataError; update and restore call the data layer', async () => {
    const { result } = renderHook(() => usePayments());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    api.updatePayment.mockRejectedValue(new DataError('constraint', 'farmer_locked', 'locked'));
    api.restorePayment.mockResolvedValue({ ...gone, deleted_at: null });
    let failed: unknown;
    await act(async () => {
      failed = await result.current.update(older, input);
      await result.current.restore('p-3');
    });
    expect(failed).toMatchObject({ ok: false, error: { kind: 'constraint' } });
    expect(api.updatePayment).toHaveBeenCalledWith(older, input);
    expect(api.restorePayment).toHaveBeenCalledWith('p-3');
  });
});
