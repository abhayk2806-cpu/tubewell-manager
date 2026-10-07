// Phase 9: the independent oracle against the engine (a), the profile (b), balances and trails (e),
// the payment preview (f) and the ledger properties, over 320 seeded scenarios.
import { afterAll, describe, expect, it } from 'vitest';
import { buildFarmerLedger, previewPayment } from '@/lib/ledger';
import type { FarmerLedger, LedgerPayment, LedgerUsage } from '@/lib/ledger';
import { buildFarmerBalances, buildFarmerProfile, buildPaymentTrails } from '@/lib/data';
import { SEEDS, count, monthShape, n, tally, totalsShape, trailShape } from './compare';
import { int, rngFor, scenario, shuffle } from './generate';
import type { Scenario } from './generate';
import { vBalances, vFarmer, vTrails } from './oracle';

const own = (s: Scenario, farmerId: string) => ({
  usage: s.usage.filter((r) => r.farmer_id === farmerId),
  payments: s.payments.filter((r) => r.farmer_id === farmerId),
});

function engineShape(l: FarmerLedger) {
  return {
    months: l.months.map((m) => ({ ...m })),
    totals: { chargesPaise: l.totals.chargesPaise, totalPaidPaise: l.totals.totalPaidPaise, outstandingPaise: l.totals.outstandingPaise, creditPaise: l.totals.creditPaise },
    trail: l.trail.map((t) => ({ paymentId: t.paymentId, pieces: t.pieces.map((p) => ({ ...p })), unappliedPaise: t.unappliedPaise })),
    rows: l.rows.map((r) => ({ kind: r.kind, id: r.id, balance: r.balancePaise })),
  };
}

function oracleShape(usage: readonly LedgerUsage[], payments: readonly LedgerPayment[], cutoffMs?: number) {
  const v = vFarmer(usage, payments, cutoffMs);
  return {
    months: v.months.map(monthShape),
    totals: totalsShape(v),
    trail: v.trail.map(trailShape),
    rows: v.balances.map((b) => ({ kind: b.kind, id: b.id, balance: n(b.balance) })),
  };
}

afterAll(() => {
  console.info(`[phase9] ledger comparisons: ${JSON.stringify(tally)}`);
});

describe('oracle vs engine and data layer over seeded scenarios', () => {
  it.each(SEEDS)('seed %i: (a) buildFarmerLedger, current and as-of, every farmer', (seed) => {
    const s = scenario(seed);
    const rng = rngFor(seed + 1);
    for (const f of s.farmers) {
      const rows = own(s, f.id);
      expect(engineShape(buildFarmerLedger(rows)), `seed ${seed} farmer ${f.id}`).toEqual(oracleShape(rows.usage, rows.payments));
      const cutoff = Date.parse('2025-12-01T00:00:00Z') + int(rng, 0, 900) * 86_400_000;
      expect(engineShape(buildFarmerLedger(rows, { cutoffMs: cutoff })), `seed ${seed} farmer ${f.id} cutoff ${cutoff}`).toEqual(
        oracleShape(rows.usage, rows.payments, cutoff),
      );
      count('a.ledger', 2);
    }
  });

  it.each(SEEDS)('seed %i: (b) buildFarmerProfile incl. total time and running balance', (seed) => {
    const s = scenario(seed);
    for (const f of s.farmers) {
      const rows = own(s, f.id);
      const v = vFarmer(rows.usage, rows.payments);
      const result = buildFarmerProfile({ farmerId: f.id, usageRows: s.usage, paymentRows: s.payments });
      expect(result.ok, `seed ${seed}`).toBe(true);
      if (!result.ok) continue;
      const p = result.profile;
      expect(p.totals, `seed ${seed} farmer ${f.id}`).toMatchObject(totalsShape(v));
      expect(p.time.totalMinutes, `seed ${seed} farmer ${f.id}`).toBe(v.minutes);
      expect(p.months.map((m) => ({ ...monthShape({ ...vMonthFrom(m) }) })), `seed ${seed}`).toEqual([...v.months].reverse().map(monthShape));
      const trails = new Map(v.trail.map((t) => [t.paymentId, trailShape(t)]));
      for (const pay of p.payments) {
        expect({ paymentId: pay.row.id, pieces: pay.pieces.map((x) => ({ ...x })), unappliedPaise: pay.unappliedPaise }, `seed ${seed}`).toEqual(trails.get(pay.row.id));
      }
      const balances = [...v.balances].reverse();
      expect(
        p.ledger.map((l) => [l.id, l.balance.kind, l.balance.amountPaise]),
        `seed ${seed} farmer ${f.id}`,
      ).toEqual(balances.map((b) => [b.id, b.balance > 0n ? 'baaki' : b.balance < 0n ? 'advance' : 'zero', n(b.balance < 0n ? -b.balance : b.balance)]));
      count('b.profile');
    }
  });

  it.each(SEEDS)('seed %i: (e) buildFarmerBalances and buildPaymentTrails', (seed) => {
    const s = scenario(seed);
    const input = { farmers: s.farmers, usage: s.usage, payments: s.payments };
    const balances = buildFarmerBalances({ farmers: s.farmers, usageRows: s.usage, paymentRows: s.payments });
    const expected = vBalances(input);
    expect([...balances.keys()].sort(), `seed ${seed}`).toEqual([...expected.keys()].sort());
    for (const [id, b] of expected) {
      expect(balances.get(id), `seed ${seed} farmer ${id}`).toEqual({ ok: true, outstandingPaise: n(b.outstanding), creditPaise: n(b.credit) });
      count('e.balances');
    }
    const trails = buildPaymentTrails({ usageRows: s.usage, paymentRows: s.payments });
    const vt = vTrails(input);
    expect([...trails.keys()].sort(), `seed ${seed}`).toEqual([...vt.keys()].sort());
    for (const [id, t] of vt) {
      const shaped = trailShape(t);
      expect(trails.get(id), `seed ${seed} payment ${id}`).toEqual({ ok: true, pieces: shaped.pieces, unappliedPaise: shaped.unappliedPaise });
      count('e.trails');
    }
  });

  it.each(SEEDS)('seed %i: (f) previewPayment equals the real recompute (new, edit) and delete recomputes', (seed) => {
    const s = scenario(seed);
    const rng = rngFor(seed + 2);
    for (const f of s.farmers) {
      const rows = own(s, f.id);
      // New payment: the candidate sorts after existing payments at the same instant (L16), like a
      // row created now; the real row gets a created_at after every existing one.
      const paidAt = rng() < 0.5 && rows.payments[0] ? rows.payments[0].paid_at : new Date(Date.parse('2026-03-01T00:00:00Z') + int(rng, 0, 700) * 86_400_000).toISOString();
      const amount = int(rng, 1, 400_000);
      const preview = previewPayment(rows, { farmer_id: f.id, paid_at: paidAt, amount_paise: amount });
      const added: LedgerPayment = { id: 'zz-new', farmer_id: f.id, paid_at: paidAt, amount_paise: amount, note: null, created_at: '2099-01-01T00:00:00Z', deleted_at: null };
      const vAdded = vFarmer(rows.usage, [...rows.payments, added]);
      expect(preview.after.totals, `seed ${seed} farmer ${f.id} new`).toMatchObject(totalsShape(vAdded));
      expect(preview.after.months.map((m) => ({ ...m })), `seed ${seed} farmer ${f.id} new`).toEqual(vAdded.months.map(monthShape));
      const own_ = vAdded.trail.find((t) => t.paymentId === 'zz-new');
      expect({ pieces: preview.pieces.map((x) => ({ ...x })), unappliedPaise: preview.unappliedPaise }, `seed ${seed} new trail`).toEqual({
        pieces: trailShape(own_!).pieces,
        unappliedPaise: n(own_!.unapplied),
      });
      count('f.preview.new');

      const live = rows.payments.filter((p) => p.deleted_at === null);
      if (live.length > 0) {
        const target = live[int(rng, 0, live.length - 1)]!;
        const newAmount = int(rng, 1, 400_000);
        const edit = previewPayment(rows, { farmer_id: f.id, paid_at: target.paid_at, amount_paise: newAmount }, { replacesPaymentId: target.id });
        const edited = rows.payments.map((p) => (p.id === target.id ? { ...p, amount_paise: newAmount } : p));
        const vEdited = vFarmer(rows.usage, edited);
        expect(edit.after.totals, `seed ${seed} farmer ${f.id} edit`).toMatchObject(totalsShape(vEdited));
        expect(edit.after.months.map((m) => ({ ...m })), `seed ${seed} edit`).toEqual(vEdited.months.map(monthShape));
        expect(edit.before.totals, `seed ${seed} edit before`).toMatchObject(totalsShape(vFarmer(rows.usage, rows.payments)));
        count('f.preview.edit');

        // Delete: the app shows no delete preview; the ledger after a soft delete must equal the oracle.
        const deleted = rows.payments.map((p) => (p.id === target.id ? { ...p, deleted_at: '2099-01-01T00:00:00Z' } : p));
        expect(engineShape(buildFarmerLedger({ usage: rows.usage, payments: deleted })), `seed ${seed} delete`).toEqual(oracleShape(rows.usage, deleted));
        count('f.delete');
      }
    }
  });
});

describe('ledger properties over seeded scenarios', () => {
  it.each(SEEDS)('seed %i: order independence, add then remove, split payment, delete then restore, signs', (seed) => {
    const s = scenario(seed);
    const rng = rngFor(seed + 3);
    for (const f of s.farmers) {
      const rows = own(s, f.id);
      const base = buildFarmerLedger(rows);
      // Input order never matters.
      expect(buildFarmerLedger({ usage: shuffle(rng, rows.usage).reverse(), payments: shuffle(rng, rows.payments) }), `seed ${seed} order`).toEqual(base);
      // Adding then removing a payment returns the original figures.
      const extra: LedgerPayment = { id: 'zz-x', farmer_id: f.id, paid_at: '2026-07-07T07:07:07Z', amount_paise: 12345, note: null, created_at: '2026-01-01T00:00:00Z', deleted_at: null };
      expect(buildFarmerLedger({ usage: rows.usage, payments: [...rows.payments, extra] }).totals.totalPaidPaise, `seed ${seed}`).toBe(base.totals.totalPaidPaise + 12345);
      expect(buildFarmerLedger({ usage: rows.usage, payments: [...rows.payments, { ...extra, deleted_at: '2099-01-01T00:00:00Z' }] }), `seed ${seed} add-remove`).toEqual(base);
      // Splitting one payment into two at the same timestamp keeps the months and totals.
      const live = rows.payments.filter((p) => p.deleted_at === null && p.amount_paise >= 2);
      if (live.length > 0) {
        const target = live[0]!;
        const first = Math.floor(target.amount_paise / 2);
        const split = [
          ...rows.payments.filter((p) => p.id !== target.id),
          { ...target, id: `${target.id}-a`, amount_paise: first },
          { ...target, id: `${target.id}-b`, amount_paise: target.amount_paise - first },
        ];
        const after = buildFarmerLedger({ usage: rows.usage, payments: split });
        // Money is unchanged; only the payment counts differ (one row became two).
        const money = (l: FarmerLedger) => [l.months.map((m) => ({ ...m, paymentCount: 0 })), { ...l.totals, paymentCount: 0 }];
        expect(money(after), `seed ${seed} split`).toEqual(money(base));
      }
      // Deleting then restoring any row returns the original figures.
      for (const u of rows.usage.filter((r) => r.deleted_at === null).slice(0, 2)) {
        const del = rows.usage.map((r) => (r.id === u.id ? { ...r, deleted_at: '2099-01-01T00:00:00Z' } : r));
        const restored = del.map((r) => (r.id === u.id ? { ...r, deleted_at: null } : r));
        expect(buildFarmerLedger({ usage: restored, payments: rows.payments }), `seed ${seed} restore`).toEqual(base);
      }
      // Signs: money never negative; outstanding and credit never both above zero.
      const t = base.totals;
      expect([t.chargesPaise, t.totalPaidPaise, t.outstandingPaise, t.creditPaise].every((x) => x >= 0), `seed ${seed}`).toBe(true);
      expect(t.outstandingPaise > 0 && t.creditPaise > 0, `seed ${seed}`).toBe(false);
      for (const m of base.months) expect(m.paidPaise >= 0 && m.remainingPaise >= 0 && m.cashPaise >= 0, `seed ${seed}`).toBe(true);
      count('properties');
    }
  });
});

/** Profile months carry hours / minutes too; compare the engine fields only. */
function vMonthFrom(m: { monthKey: string; totalMinutes: number; chargePaise: number; paidPaise: number; remainingPaise: number; cashPaise: number; status: string; entryCount: number; paymentCount: number }) {
  return {
    monthKey: m.monthKey,
    minutes: m.totalMinutes,
    charge: BigInt(m.chargePaise),
    paid: BigInt(m.paidPaise),
    remaining: BigInt(m.remainingPaise),
    cash: BigInt(m.cashPaise),
    status: m.status as 'settled',
    entries: m.entryCount,
    payments: m.paymentCount,
  };
}
