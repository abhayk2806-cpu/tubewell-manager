// Phase 9: scale (paging beyond 1,000 rows through the data-layer reads) and the backup round trip
// (export -> JSON -> validate -> restore Merge / Replace -> figures equal the oracle), all in memory
// with a mocked Supabase client. Nothing touches a real database.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// An in-memory store behind a range-aware fake of supabase-js (select * order id range).
const db = vi.hoisted(() => ({
  tables: { farmers: [] as Record<string, unknown>[], usage_entries: [] as Record<string, unknown>[], payments: [] as Record<string, unknown>[] },
  rangeCalls: { farmers: 0, usage_entries: 0, payments: 0 } as Record<string, number>,
  rpcCalls: 0,
}));
vi.mock('@/lib/supabase', () => {
  const from = (table: 'farmers' | 'usage_entries' | 'payments') => {
    const builder = {
      select: () => builder,
      order: () => builder,
      range: (lo: number, hi: number) => {
        db.rangeCalls[table] = (db.rangeCalls[table] ?? 0) + 1;
        const rows = [...db.tables[table]].sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
        return Promise.resolve({ data: rows.slice(lo, hi + 1), error: null, status: 200 });
      },
    };
    return builder;
  };
  // The restore function's semantics (migration 007): merge = upsert by id; replace = exactly the file.
  const rpc = (name: string, args: { p_payload: Record<string, Record<string, unknown>[]>; p_mode: 'merge' | 'replace' }) => {
    db.rpcCalls += 1;
    if (name !== 'restore_backup') return Promise.resolve({ data: null, error: { code: '42883', message: 'no function' }, status: 404 });
    const report = { mode: args.p_mode, deleted: { payments: 0, usage_entries: 0, farmers: 0 }, inserted: { farmers: 0, usage_entries: 0, payments: 0 }, updated: { farmers: 0, usage_entries: 0, payments: 0 } };
    for (const t of ['payments', 'usage_entries', 'farmers'] as const) {
      if (args.p_mode === 'replace') {
        report.deleted[t] = db.tables[t].length;
        db.tables[t] = [];
      }
    }
    for (const t of ['farmers', 'usage_entries', 'payments'] as const) {
      for (const row of args.p_payload[t] ?? []) {
        const stored = t === 'usage_entries' ? { ...row, total_minutes: Number(row.hours) * 60 + Number(row.minutes) } : { ...row };
        const at = db.tables[t].findIndex((r) => r.id === row.id);
        if (at === -1) {
          db.tables[t].push(stored);
          report.inserted[t] += 1;
        } else {
          db.tables[t][at] = stored;
          report.updated[t] += 1;
        }
      }
    }
    return Promise.resolve({ data: report, error: null, status: 200 });
  };
  return { supabase: { from, rpc } };
});

import { buildDashboardScreen, buildFarmerBalances, buildFarmerProfile, buildMonthsScreen, buildPaymentTrails, exportBackup, listFarmers, listPayments, listUsage, restoreBackup, verifyRestore } from '@/lib/data';
import type { FarmerRow, PaymentRow, UsageRow } from '@/lib/data';
import { parseBackupText } from '@/lib/backup';
import { monthShape, n } from './compare';
import { int, pick, rngFor, scenario } from './generate';
import { vAllMonths, vBalances, vDashboard, vFarmer, vTrails } from './oracle';

const NOW = { dateKey: '2028-04-15', timeKey: '10:00', monthKey: '2028-04' };

/** Real rows have uuid ids (the backup validator checks them): give each generated id a stable uuid. */
function withUuids(sc: { farmers: FarmerRow[]; usage: UsageRow[]; payments: PaymentRow[] }, salt: number) {
  const ids = new Map<string, string>();
  const uuid = (id: string) => {
    let v = ids.get(id);
    if (v === undefined) {
      v = `${String(salt).padStart(8, '0')}-0000-4000-8000-${String(ids.size).padStart(12, '0')}`;
      ids.set(id, v);
    }
    return v;
  };
  return {
    farmers: sc.farmers.map((r) => ({ ...r, id: uuid(r.id) })),
    usage: sc.usage.map((r) => ({ ...r, id: uuid(r.id), farmer_id: uuid(r.farmer_id) })),
    payments: sc.payments.map((r) => ({ ...r, id: uuid(r.id), farmer_id: uuid(r.farmer_id) })),
  };
}

function load(rows: { farmers: FarmerRow[]; usage: UsageRow[]; payments: PaymentRow[] }): void {
  db.tables.farmers = rows.farmers.map((r) => ({ ...r }));
  db.tables.usage_entries = rows.usage.map((r) => ({ ...r }));
  db.tables.payments = rows.payments.map((r) => ({ ...r }));
}

/** Every figure the screens show, from data-layer reads, compared with the oracle on `expected`. */
async function expectFiguresEqualOracle(expected: { farmers: FarmerRow[]; usage: UsageRow[]; payments: PaymentRow[] }, label: string): Promise<void> {
  const farmers = await listFarmers();
  const usage = await listUsage();
  const payments = await listPayments();
  const input = { farmers: expected.farmers, usage: expected.usage, payments: expected.payments };
  const dash = buildDashboardScreen({ farmers, usageRows: usage, paymentRows: payments, view: { kind: 'all' }, now: NOW });
  if (!dash.ok) throw new Error(`${label}: dashboard not ok`);
  const want = vDashboard(input, { kind: 'all' });
  expect([dash.screen.dashboard.chargesCreatedPaise, dash.screen.dashboard.cashReceivedPaise, dash.screen.dashboard.outstandingPaise, dash.screen.dashboard.creditPaise], label).toEqual([
    n(want.charges),
    n(want.cash),
    n(want.outstanding),
    n(want.credit),
  ]);
  expect([dash.screen.time.totalMinutes, dash.screen.activeFarmerCount], label).toEqual([want.minutes, want.activeCount]);
  expect(dash.screen.rows.map((r) => [r.farmerId, r.outstandingPaise, r.creditPaise]), label).toEqual(want.rows.map((r) => [r.farmerId, n(r.outstanding), n(r.credit)]));
  const months = buildMonthsScreen({ farmers, usageRows: usage, paymentRows: payments });
  if (!months.ok) throw new Error(`${label}: months not ok`);
  expect(months.screen.months.map((m) => [m.monthKey, m.chargePaise, m.paidPaise, m.remainingPaise, m.cashPaise, m.status]), label).toEqual(
    [...vAllMonths(input)].reverse().map(monthShape).map((m) => [m.monthKey, m.chargePaise, m.paidPaise, m.remainingPaise, m.cashPaise, m.status]),
  );
  const balances = buildFarmerBalances({ farmers, usageRows: usage, paymentRows: payments });
  for (const [id, b] of vBalances(input)) expect(balances.get(id), `${label} ${id}`).toEqual({ ok: true, outstandingPaise: n(b.outstanding), creditPaise: n(b.credit) });
  const trails = buildPaymentTrails({ usageRows: usage, paymentRows: payments });
  expect(trails.size, label).toBe(vTrails(input).size);
  for (const f of farmers) {
    const p = buildFarmerProfile({ farmerId: f.id, usageRows: usage, paymentRows: payments });
    if (!p.ok) throw new Error(`${label}: profile not ok`);
    const v = vFarmer(
      expected.usage.filter((r) => r.farmer_id === f.id),
      expected.payments.filter((r) => r.farmer_id === f.id),
    );
    expect([p.profile.totals.outstandingPaise, p.profile.totals.creditPaise, p.profile.time.totalMinutes], `${label} profile ${f.id}`).toEqual([n(v.outstanding), n(v.credit), v.minutes]);
  }
}

beforeEach(() => {
  db.rangeCalls = { farmers: 0, usage_entries: 0, payments: 0 };
  db.rpcCalls = 0;
});

describe('scale: 30 farmers, 3,000 usage rows, 1,500 payments through the paged data-layer reads', () => {
  it('every figure equals the oracle; reads page beyond 1,000 rows; no quadratic blow-up', async () => {
    const rng = rngFor(424242);
    const farmers: FarmerRow[] = Array.from({ length: 30 }, (_, i) => ({
      id: `big-f-${String(i).padStart(2, '0')}`,
      name: `Kisan ${String(i).padStart(2, '0')}`,
      mobile: null,
      notes: null,
      is_disabled: i % 10 === 7,
      created_at: '2025-10-01T00:00:00Z',
      created_by: null,
      updated_at: '2025-10-01T00:00:00Z',
      updated_by: null,
      deleted_at: i % 10 === 9 ? '2028-05-01T00:00:00Z' : null,
      deleted_by: null,
    }));
    const start = Date.parse('2025-11-01T00:00:00Z');
    const when = () => new Date(start + int(rng, 0, 880 * 24 * 60) * 60_000).toISOString();
    const usage: UsageRow[] = Array.from({ length: 3000 }, (_, i) => {
      const hours = int(rng, 0, 12);
      const minutes = hours === 0 ? int(rng, 1, 59) : int(rng, 0, 59);
      return {
        id: `big-u-${String(i).padStart(5, '0')}`,
        farmer_id: pick(rng, farmers).id,
        used_at: when(),
        hours,
        minutes,
        total_minutes: hours * 60 + minutes,
        rate_paise: pick(rng, [10000, 9999, 12345, 1]),
        created_at: '2026-01-01T00:00:00Z',
        created_by: null,
        updated_at: '2026-01-01T00:00:00Z',
        updated_by: null,
        deleted_at: rng() < 0.05 ? '2028-05-01T00:00:00Z' : null,
        deleted_by: null,
      };
    });
    const payments: PaymentRow[] = Array.from({ length: 1500 }, (_, i) => ({
      id: `big-p-${String(i).padStart(5, '0')}`,
      farmer_id: pick(rng, farmers).id,
      paid_at: when(),
      amount_paise: int(rng, 1, 200_000),
      note: null,
      created_at: '2026-01-01T00:00:00Z',
      created_by: null,
      updated_at: '2026-01-01T00:00:00Z',
      updated_by: null,
      deleted_at: rng() < 0.05 ? '2028-05-01T00:00:00Z' : null,
      deleted_by: null,
    }));
    load({ farmers, usage, payments });

    const t0 = performance.now();
    await expectFiguresEqualOracle({ farmers, usage, payments }, 'scale');
    const ms = performance.now() - t0;
    console.info(`[phase9] scale: 30 farmers, 3000 usage, 1500 payments, reads + screens + oracle in ${Math.round(ms)} ms`);
    // 3,000 rows = 3 full pages + an empty page; 1,500 = 2 pages + an empty page (twice: once per read).
    expect(db.rangeCalls.usage_entries).toBe(4);
    expect(db.rangeCalls.payments).toBe(3);
    expect(ms).toBeLessThan(20_000);
  });
});

describe('backup round trip (in memory)', () => {
  it.each([9100, 9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108, 9109])('seed %i: export -> JSON -> validate -> Merge into an empty store and Replace -> figures equal the oracle', async (seed) => {
    const s = withUuids(scenario(seed), seed);
    load(s);
    const exported = await exportBackup();
    if (!exported.ok) throw new Error(`seed ${seed}: export failed ${exported.kind}`);
    expect(exported.file.counts, `seed ${seed}`).toEqual({ farmers: s.farmers.length, usage_entries: s.usage.length, payments: s.payments.length });
    const text = JSON.stringify(exported.file, null, 2);
    const parsed = parseBackupText(text, text.length);
    if (!parsed.ok) throw new Error(`seed ${seed}: ${JSON.stringify(parsed.problems)}`);

    // Merge into an empty store.
    load({ farmers: [], usage: [], payments: [] });
    const merged = await restoreBackup(parsed.file, 'merge');
    expect(merged.ok && merged.report.inserted, `seed ${seed}`).toEqual({ farmers: s.farmers.length, usage_entries: s.usage.length, payments: s.payments.length });
    await expectFiguresEqualOracle(s, `seed ${seed} merge`);
    const vMerge = await verifyRestore(parsed.file, 'merge');
    expect(vMerge.ok && vMerge.verification.verified, `seed ${seed}`).toBe(true);

    // Replace a different store: afterwards it is exactly the file again.
    load(withUuids(scenario(seed + 500), seed + 500));
    const replaced = await restoreBackup(parsed.file, 'replace');
    expect(replaced.ok, `seed ${seed}`).toBe(true);
    await expectFiguresEqualOracle(s, `seed ${seed} replace`);
    const vReplace = await verifyRestore(parsed.file, 'replace');
    expect(vReplace.ok && vReplace.verification.verified, `seed ${seed}`).toBe(true);
    // Soft-deleted rows came back still deleted.
    expect(db.tables.payments.filter((r) => r.deleted_at !== null).length, `seed ${seed}`).toBe(s.payments.filter((r) => r.deleted_at !== null).length);
    expect(db.rpcCalls, `seed ${seed}: one call per restore`).toBe(2);
  });

  it('an old app file (the repo\'s v2.2 test shape) is rejected before any restore call', () => {
    const text = JSON.stringify({ version: '2.2', farmers: [], usage_entries: [], payments: [], month_closings: [] });
    expect(parseBackupText(text, text.length)).toEqual({ ok: false, problems: [{ code: 'old_app_file' }] });
    expect(db.rpcCalls).toBe(0);
  });
});
