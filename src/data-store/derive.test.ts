import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { buildDashboardScreen, buildFarmerBalances, buildFarmerProfile, buildMonthsScreen, buildPaymentTrails } from '@/lib/data';
import { scenario } from '@/lib/verification/generate';
import { PLAIN_DERIVE, createDerive } from './derive';

const NOW = { dateKey: '2026-10-06', timeKey: '10:00', monthKey: '2026-10' };

describe('createDerive (memoized screen derivations)', () => {
  it.each([3, 17, 42, 99])('seed %i: every memoized result equals the plain builder', (seed) => {
    const s = scenario(seed);
    const req = { farmers: s.farmers, usageRows: s.usage, paymentRows: s.payments };
    const d = createDerive();
    expect(d.dashboardScreen({ ...req, view: { kind: 'all' }, now: NOW })).toEqual(buildDashboardScreen({ ...req, view: { kind: 'all' }, now: NOW }));
    expect(d.monthsScreen(req)).toEqual(buildMonthsScreen(req));
    expect(d.farmerBalances(req)).toEqual(buildFarmerBalances(req));
    expect(d.paymentTrails(req)).toEqual(buildPaymentTrails(req));
    for (const f of s.farmers) {
      const p = { farmerId: f.id, usageRows: s.usage, paymentRows: s.payments };
      expect(d.farmerProfile(p)).toEqual(buildFarmerProfile(p));
    }
  });

  it('the same row arrays give the remembered result; a new array computes again', () => {
    const s = scenario(7);
    const req = { farmers: s.farmers, usageRows: s.usage, paymentRows: s.payments };
    const d = createDerive();
    const first = d.monthsScreen(req);
    expect(d.monthsScreen({ ...req })).toBe(first);
    expect(d.monthsScreen({ ...req, usageRows: [...s.usage] })).not.toBe(first);
  });

  it('dashboard: remembered per view and day; another view or day computes its own', () => {
    const s = scenario(11);
    const req = { farmers: s.farmers, usageRows: s.usage, paymentRows: s.payments };
    const d = createDerive();
    const all = d.dashboardScreen({ ...req, view: { kind: 'all' }, now: NOW });
    expect(d.dashboardScreen({ ...req, view: { kind: 'all' }, now: { ...NOW, timeKey: '23:59' } })).toBe(all);
    const month = d.dashboardScreen({ ...req, view: { kind: 'month', monthKey: '2026-10' }, now: NOW });
    expect(month).not.toBe(all);
    expect(month).toEqual(buildDashboardScreen({ ...req, view: { kind: 'month', monthKey: '2026-10' }, now: NOW }));
    const nextMonth = { dateKey: '2026-11-01', timeKey: '00:01', monthKey: '2026-11' };
    expect(d.dashboardScreen({ ...req, view: { kind: 'all' }, now: nextMonth })).toEqual(buildDashboardScreen({ ...req, view: { kind: 'all' }, now: nextMonth }));
  });

  it('profile: remembered per farmer', () => {
    const s = scenario(5);
    const d = createDerive();
    const [a, b] = s.farmers;
    if (a === undefined || b === undefined) return;
    const pa = d.farmerProfile({ farmerId: a.id, usageRows: s.usage, paymentRows: s.payments });
    expect(d.farmerProfile({ farmerId: a.id, usageRows: s.usage, paymentRows: s.payments })).toBe(pa);
    expect(d.farmerProfile({ farmerId: b.id, usageRows: s.usage, paymentRows: s.payments })).toEqual(
      buildFarmerProfile({ farmerId: b.id, usageRows: s.usage, paymentRows: s.payments }),
    );
  });

  it('clear() forgets every remembered result', () => {
    const s = scenario(8);
    const req = { farmers: s.farmers, usageRows: s.usage, paymentRows: s.payments };
    const d = createDerive();
    const first = d.farmerBalances(req);
    d.clear();
    expect(d.farmerBalances(req)).not.toBe(first);
  });

  it('PLAIN_DERIVE is the builders themselves', () => {
    expect(PLAIN_DERIVE.dashboardScreen).toBe(buildDashboardScreen);
    expect(PLAIN_DERIVE.farmerProfile).toBe(buildFarmerProfile);
  });
});
