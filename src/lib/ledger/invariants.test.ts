// Property tests over seeded random scenarios, plus agreement with the independent BigInt oracle.
import { describe, expect, it } from 'vitest';
import { buildFarmerLedger, previewPayment } from './index';
import type { FarmerLedger, LedgerPayment, PaymentCandidate } from './index';
import { oracleLedger } from './test-support/oracle';
import type { OracleResult } from './test-support/oracle';
import { deepFreeze, pick, randInt, randomCutoffMs, randomScenario, seeded, shuffled } from './test-support/random';
import type { Scenario } from './test-support/random';

const SCENARIOS = 2500;
const FARMER = 'farmer-x';

function scenarios(seed: number): Scenario[] {
  const rng = seeded(seed);
  const out: Scenario[] = [];
  for (let i = 0; i < SCENARIOS; i += 1) out.push(randomScenario(rng, FARMER, String(i)));
  return out;
}

function checkInvariants(l: FarmerLedger): void {
  const t = l.totals;
  for (const row of l.months) {
    const pieces = l.trail.flatMap((p) => p.pieces).filter((p) => p.monthKey === row.monthKey);
    expect(pieces.reduce((s, p) => s + p.amountPaise, 0)).toBe(row.paidPaise);
    expect(row.paidPaise).toBeLessThanOrEqual(row.chargePaise);
    expect(row.paidPaise).toBeGreaterThanOrEqual(0);
    expect(row.remainingPaise).toBe(row.chargePaise - row.paidPaise);
  }
  for (const p of l.trail) {
    expect(p.pieces.reduce((s, x) => s + x.amountPaise, 0) + p.unappliedPaise).toBe(p.amountPaise);
    for (const piece of p.pieces) expect(piece.amountPaise).toBeGreaterThan(0);
  }
  const allPieces = l.trail.flatMap((p) => p.pieces).reduce((s, x) => s + x.amountPaise, 0);
  const allUnapplied = l.trail.reduce((s, p) => s + p.unappliedPaise, 0);
  expect(allPieces + allUnapplied).toBe(t.totalPaidPaise);
  // Test-only identity; no engine field may carry this netted figure (C9).
  expect(t.outstandingPaise - t.creditPaise).toBe(t.chargesPaise - t.totalPaidPaise);
  expect(t.outstandingPaise).toBeGreaterThanOrEqual(0);
  expect(t.creditPaise).toBeGreaterThanOrEqual(0);
  expect(t.outstandingPaise > 0 && t.creditPaise > 0).toBe(false);
  const last = l.rows.at(-1);
  expect(last === undefined ? 0 : last.balancePaise).toBe(t.chargesPaise - t.totalPaidPaise);
}

function toOracleShape(l: FarmerLedger): OracleResult {
  return {
    months: l.months.map((row) => ({
      monthKey: row.monthKey,
      totalMinutes: BigInt(row.totalMinutes),
      charge: BigInt(row.chargePaise),
      paid: BigInt(row.paidPaise),
      remaining: BigInt(row.remainingPaise),
      cash: BigInt(row.cashPaise),
      status: row.status,
      entryCount: row.entryCount,
      paymentCount: row.paymentCount,
    })),
    trail: l.trail.map((p) => ({
      paymentId: p.paymentId,
      pieces: p.pieces.map((x) => ({ monthKey: x.monthKey, amount: BigInt(x.amountPaise) })),
      unapplied: BigInt(p.unappliedPaise),
    })),
    charges: BigInt(l.totals.chargesPaise),
    totalPaid: BigInt(l.totals.totalPaidPaise),
    outstanding: BigInt(l.totals.outstandingPaise),
    credit: BigInt(l.totals.creditPaise),
    rows: l.rows.map((r) => ({ kind: r.kind, id: r.id, balance: BigInt(r.balancePaise) })),
  };
}

describe(`ledger invariants over ${SCENARIOS} seeded scenarios`, () => {
  const all = scenarios(424242);

  it('scenario mix covers the interesting cases', () => {
    const withCredit = all.filter((s) => buildFarmerLedger(s).totals.creditPaise > 0).length;
    const withDeleted = all.filter((s) => [...s.usage, ...s.payments].some((r) => r.deleted_at !== null)).length;
    const paymentOnly = all.filter((s) => buildFarmerLedger(s).months.some((r) => r.status === 'payment_only')).length;
    const zeroCharge = all.filter((s) =>
      buildFarmerLedger(s).months.some((r) => r.chargePaise === 0 && r.cashPaise === 0),
    ).length;
    expect(withCredit).toBeGreaterThan(100);
    expect(withDeleted).toBeGreaterThan(100);
    expect(paymentOnly).toBeGreaterThan(100);
    expect(zeroCharge).toBeGreaterThan(5);
  });

  it('every scenario satisfies the L6/L7 invariants, current and as-of', () => {
    const rng = seeded(7);
    for (const s of all) {
      checkInvariants(buildFarmerLedger(s));
      checkInvariants(buildFarmerLedger(s, { cutoffMs: randomCutoffMs(rng) }));
    }
  });

  it('the independent BigInt oracle agrees on every scenario (current and as-of)', () => {
    const rng = seeded(11);
    for (const s of all) {
      expect(toOracleShape(buildFarmerLedger(s))).toEqual(oracleLedger(s.usage, s.payments));
      const cutoffMs = randomCutoffMs(rng);
      expect(toOracleShape(buildFarmerLedger(s, { cutoffMs }))).toEqual(oracleLedger(s.usage, s.payments, cutoffMs));
    }
  });

  it('shuffled input gives identical output', () => {
    const rng = seeded(13);
    for (const s of all) {
      const shuffledInput = { usage: shuffled(rng, s.usage), payments: shuffled(rng, s.payments) };
      expect(buildFarmerLedger(shuffledInput)).toEqual(buildFarmerLedger(s));
    }
  });

  it('deep-frozen inputs are accepted and not mutated', () => {
    for (const s of all.slice(0, 500)) {
      const before = JSON.stringify(s);
      const frozen = deepFreeze({ usage: [...s.usage], payments: [...s.payments] });
      buildFarmerLedger(frozen);
      expect(JSON.stringify(frozen)).toBe(before);
    }
  });
});

describe(`previewPayment property over ${SCENARIOS} scenarios`, () => {
  const all = scenarios(99);

  function summary(l: FarmerLedger) {
    return { totals: l.totals, months: l.months };
  }

  it('adding a payment equals buildFarmerLedger on the extended inputs', () => {
    const rng = seeded(17);
    for (const [i, s] of all.entries()) {
      const live = s.payments.filter((p) => p.deleted_at === null);
      const paidAt = live.length > 0 && rng() < 0.3 ? pick(rng, live).paid_at : '2026-03-15T10:00:00+05:30';
      const candidate: PaymentCandidate = {
        id: `cand-${i}`,
        farmer_id: FARMER,
        paid_at: paidAt,
        amount_paise: randInt(rng, 1, 120000),
        created_at: '2026-09-30T00:00:00Z',
      };
      const input = deepFreeze({ usage: [...s.usage], payments: [...s.payments] });
      const preview = previewPayment(input, candidate);
      const extended: LedgerPayment = {
        id: `cand-${i}`,
        farmer_id: FARMER,
        paid_at: candidate.paid_at,
        amount_paise: candidate.amount_paise,
        note: null,
        created_at: '2026-09-30T00:00:00Z',
        deleted_at: null,
      };
      const expected = buildFarmerLedger({ usage: s.usage, payments: [...s.payments, extended] });
      const before = buildFarmerLedger(s);
      expect(preview.before).toEqual(summary(before));
      expect(preview.after).toEqual(summary(expected));
      const trail = expected.trail.find((p) => p.paymentId === `cand-${i}`);
      expect(preview.pieces).toEqual(trail?.pieces);
      expect(preview.unappliedPaise).toBe(trail?.unappliedPaise);
      expect(preview.creditCreatedPaise).toBe(Math.max(0, expected.totals.creditPaise - before.totals.creditPaise));
    }
  });

  it('replacing a payment equals buildFarmerLedger with that row edited (id and created_at kept)', () => {
    const rng = seeded(19);
    let replaced = 0;
    for (const s of all) {
      const live = s.payments.filter((p) => p.deleted_at === null);
      if (live.length === 0) continue;
      const target = pick(rng, live);
      const candidate: PaymentCandidate = {
        farmer_id: FARMER,
        paid_at: rng() < 0.5 ? target.paid_at : '2026-02-01T00:00:00+05:30',
        amount_paise: randInt(rng, 1, 120000),
      };
      const input = deepFreeze({ usage: [...s.usage], payments: [...s.payments] });
      const preview = previewPayment(input, candidate, { replacesPaymentId: target.id });
      const edited = s.payments.map((p) =>
        p.id === target.id ? { ...p, paid_at: candidate.paid_at, amount_paise: candidate.amount_paise } : p,
      );
      const expected = buildFarmerLedger({ usage: s.usage, payments: edited });
      expect(preview.after).toEqual(summary(expected));
      const trail = expected.trail.find((p) => p.paymentId === target.id);
      expect(preview.pieces).toEqual(trail?.pieces);
      expect(preview.unappliedPaise).toBe(trail?.unappliedPaise);
      replaced += 1;
    }
    expect(replaced).toBeGreaterThan(1000);
  });
});
