// Live FIFO preview for the payment form (L16): the same ledger on the modified inputs.
import { LedgerInputError } from './errors';
import { ledgerFromRecords } from './ledger';
import { candidateRecord, liveUsageRecords, livePaymentRecords } from './records';
import type { PaymentRecord } from './records';
import type { FarmerLedger, FarmerLedgerInput, LedgerSummary, PaymentCandidate, PaymentPreview, PreviewOptions } from './types';

/** Internal id of a candidate that has none. Real ids are non-empty, so it cannot collide. */
const NEW_CANDIDATE_ID = '';

function summary(ledger: FarmerLedger): LedgerSummary {
  return { totals: ledger.totals, months: ledger.months };
}

/**
 * Ledger before and after adding `candidate`, or after replacing the payment `replacesPaymentId`.
 * A new candidate without created_at sorts after existing payments at the same paid_at; a
 * replacement keeps the replaced payment's id and created_at unless the candidate gives its own.
 */
export function previewPayment(
  input: FarmerLedgerInput,
  candidate: PaymentCandidate,
  options: PreviewOptions = {},
): PaymentPreview {
  const usage = liveUsageRecords(input.usage);
  const payments = livePaymentRecords(input.payments);
  const before = ledgerFromRecords(usage, payments, options.cutoffMs);

  const replacesId = options.replacesPaymentId;
  let afterPayments: PaymentRecord[];
  let candidateId: string;
  if (replacesId === undefined) {
    const record = candidateRecord(candidate, { id: NEW_CANDIDATE_ID, createdMs: Number.POSITIVE_INFINITY });
    afterPayments = [...payments, record];
    candidateId = record.id;
  } else {
    const target = payments.find((p) => p.id === replacesId);
    if (target === undefined) throw new LedgerInputError('replacesPaymentId is not a non-deleted payment of this farmer');
    const record = candidateRecord(candidate, { id: target.id, createdMs: target.createdMs });
    afterPayments = payments.map((p) => (p === target ? record : p));
    candidateId = record.id;
  }
  const after = ledgerFromRecords(usage, afterPayments, options.cutoffMs);

  const own = after.trail.find((t) => t.paymentId === candidateId);
  return {
    before: summary(before),
    after: summary(after),
    pieces: own?.pieces ?? [],
    unappliedPaise: own?.unappliedPaise ?? 0,
    creditCreatedPaise: Math.max(0, after.totals.creditPaise - before.totals.creditPaise),
  };
}
