// Phase 9: the independent oracle against every screen's data function: the Dashboard for All Time
// and EVERY month and year with data (c), the Mahine screen and buildAllFarmersMonths (d), the CSV
// exports (g), and the cross-screen equality Kisan = Profile = Dashboard All Time = sum of Mahine.
import { afterAll, describe, expect, it } from 'vitest';
import { buildAllFarmersMonths, parseRupeesToPaise } from '@/lib/ledger';
import type { DashboardView } from '@/lib/ledger';
import { buildDashboardScreen, buildFarmerBalances, buildFarmerProfile, buildMonthsScreen } from '@/lib/data';
import { farmersCsv, monthsCsv } from '@/lib/backup';
import type { CsvLabels } from '@/lib/backup';
import { SEEDS, count, monthShape, n, tally } from './compare';
import { scenario } from './generate';
import type { Scenario } from './generate';
import { vAllMonths, vBalances, vDashboard, vPeriods } from './oracle';

const NOW = { dateKey: '2028-04-15', timeKey: '10:00', monthKey: '2028-04' };
const LABELS: CsvLabels = {
  farmers: ['Naam', 'Mobile', 'Charge', 'Cash Mila', 'Baaki', 'Advance / Credit'],
  usage: ['Tarikh', 'Samay', 'Kisan', 'Ghante', 'Minute', 'Rate', 'Rakam'],
  payments: ['Tarikh', 'Samay', 'Kisan', 'Rakam', 'Note'],
  months: ['Mahina', 'Ghante', 'Minute', 'Charge', 'Charge Clear', 'Baaki', 'Cash Mila', 'Status'],
  status: { settled: 'Settled', partial: 'Partial', unpaid: 'Unpaid', payment_only: 'Sirf Payment' },
  unknownFarmer: '?',
};

const input = (s: Scenario) => ({ farmers: s.farmers, usage: s.usage, payments: s.payments });

function screen(s: Scenario, view: DashboardView) {
  const r = buildDashboardScreen({ farmers: s.farmers, usageRows: s.usage, paymentRows: s.payments, view, now: NOW });
  if (!r.ok) throw new Error(`seed ${s.seed}: dashboard not ok`);
  return r.screen;
}

/** CSV body lines without the BOM and header. */
function csvLines(text: string): string[][] {
  return text
    .slice(1)
    .split('\r\n')
    .slice(1)
    .filter((l) => l !== '')
    .map((l) => l.split(','));
}

afterAll(() => {
  console.info(`[phase9] screen comparisons: ${JSON.stringify(tally)}`);
});

describe('oracle vs the screen data functions over seeded scenarios', () => {
  it.each(SEEDS)('seed %i: (c) Dashboard for All Time, every month and every year with data', (seed) => {
    const s = scenario(seed);
    const periods = vPeriods(input(s));
    const views: DashboardView[] = [
      { kind: 'all' },
      ...periods.months.map((monthKey) => ({ kind: 'month' as const, monthKey })),
      ...periods.years.map((yearKey) => ({ kind: 'year' as const, yearKey })),
    ];
    for (const view of views) {
      const got = screen(s, view);
      const want = vDashboard(input(s), view);
      const label = `seed ${seed} view ${JSON.stringify(view)}`;
      expect(
        [got.dashboard.chargesCreatedPaise, got.dashboard.cashReceivedPaise, got.dashboard.outstandingPaise, got.dashboard.creditPaise],
        label,
      ).toEqual([n(want.charges), n(want.cash), n(want.outstanding), n(want.credit)]);
      expect([got.time.totalMinutes, got.activeFarmerCount, got.dashboard.activeFarmerCount], label).toEqual([want.minutes, want.activeCount, want.activeCount]);
      expect(
        got.rows.map((r) => [r.farmerId, r.chargesCreatedPaise, r.cashReceivedPaise, r.outstandingPaise, r.creditPaise]),
        `${label} rows (order too)`,
      ).toEqual(want.rows.map((r) => [r.farmerId, n(r.charges), n(r.cash), n(r.outstanding), n(r.credit)]));
      count('c.dashboard.views');
    }
  });

  it.each(SEEDS)('seed %i: (d) Mahine screen and buildAllFarmersMonths', (seed) => {
    const s = scenario(seed);
    const want = vAllMonths(input(s)).map(monthShape);
    expect(buildAllFarmersMonths(input(s)).map((m) => ({ ...m })), `seed ${seed}`).toEqual(want);
    const r = buildMonthsScreen({ farmers: s.farmers, usageRows: s.usage, paymentRows: s.payments });
    expect(r.ok, `seed ${seed}`).toBe(true);
    if (!r.ok) return;
    expect(
      r.screen.months.map((m) => ({ monthKey: m.monthKey, totalMinutes: m.totalMinutes, chargePaise: m.chargePaise, paidPaise: m.paidPaise, remainingPaise: m.remainingPaise, cashPaise: m.cashPaise, status: m.status, entryCount: m.entryCount, paymentCount: m.paymentCount })),
      `seed ${seed} newest first`,
    ).toEqual([...want].reverse());
    count('d.months', want.length);
  });

  it.each(SEEDS)('seed %i: (g) CSV export totals equal the screen totals', (seed) => {
    const s = scenario(seed);
    const csvInput = { farmers: s.farmers, usageRows: s.usage, paymentRows: s.payments };
    const farmers = farmersCsv(csvInput, LABELS, NOW);
    expect(farmers.ok, `seed ${seed}`).toBe(true);
    if (!farmers.ok) return;
    const all = screen(s, { kind: 'all' });
    const lines = csvLines(farmers.text);
    expect(lines.length, `seed ${seed}`).toBe(all.rows.length);
    lines.forEach((cells, i) => {
      const row = all.rows[i]!;
      expect(cells.slice(2).map(parseRupeesToPaise), `seed ${seed} csv row ${i}`).toEqual([
        row.chargesCreatedPaise,
        row.cashReceivedPaise,
        row.outstandingPaise,
        row.creditPaise,
      ]);
    });
    const months = monthsCsv(csvInput, LABELS);
    const screenMonths = buildMonthsScreen(csvInput);
    expect(months.ok && screenMonths.ok, `seed ${seed}`).toBe(true);
    if (!months.ok || !screenMonths.ok) return;
    const mLines = csvLines(months.text);
    expect(
      mLines.map((c) => [c[0], Number(c[1]) * 60 + Number(c[2]), ...c.slice(3, 7).map(parseRupeesToPaise), c[7]]),
      `seed ${seed} months csv`,
    ).toEqual(screenMonths.screen.months.map((m) => [m.monthKey, m.totalMinutes, m.chargePaise, m.paidPaise, m.remainingPaise, m.cashPaise, LABELS.status[m.status]]));
    count('g.csv', lines.length + mLines.length);
  });

  it.each(SEEDS)('seed %i: cross-screen: Kisan = Profile = Dashboard All Time = sum of Mahine rows, every active farmer', (seed) => {
    const s = scenario(seed);
    const kisan = buildFarmerBalances({ farmers: s.farmers, usageRows: s.usage, paymentRows: s.payments });
    const dash = screen(s, { kind: 'all' });
    const months = buildMonthsScreen({ farmers: s.farmers, usageRows: s.usage, paymentRows: s.payments });
    if (!months.ok) throw new Error(`seed ${seed}: months not ok`);
    const oracle = vBalances(input(s));
    for (const f of s.farmers.filter((x) => x.deleted_at === null && !x.is_disabled)) {
      const profile = buildFarmerProfile({ farmerId: f.id, usageRows: s.usage, paymentRows: s.payments });
      if (!profile.ok) throw new Error(`seed ${seed}: profile not ok`);
      const row = dash.rows.find((r) => r.farmerId === f.id)!;
      const monthRows = months.screen.months.flatMap((m) => m.farmers.filter((x) => x.farmerId === f.id));
      const mahineBaaki = monthRows.reduce((sum, m) => sum + m.remainingPaise, 0);
      const want = oracle.get(f.id)!;
      const label = `seed ${seed} farmer ${f.id}`;
      expect(kisan.get(f.id), label).toEqual({ ok: true, outstandingPaise: n(want.outstanding), creditPaise: n(want.credit) });
      expect([profile.profile.totals.outstandingPaise, profile.profile.totals.creditPaise], label).toEqual([n(want.outstanding), n(want.credit)]);
      expect([row.outstandingPaise, row.creditPaise], label).toEqual([n(want.outstanding), n(want.credit)]);
      expect(mahineBaaki, label).toBe(n(want.outstanding));
      count('cross-screen');
    }
  });
});
