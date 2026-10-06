// Test-only fixture: the Phase 8 worked numbers with made-up farmers (rate 100 rupees per hour).
// Asha, Bholu, Chhotu active; Dinu disabled; Eku soft-deleted. Usage: Asha 3 h 35 min (358.33),
// Bholu 2 h (200.00), Dinu 1 h (disabled, excluded), a soft-deleted Bholu 5 h entry. Payments: Asha
// 100 + 200, Chhotu 50, a soft-deleted Bholu 70. All Time: charges 558.33, cash 350.00, outstanding
// 258.33, credit 50.00.
import type { BackupFarmer, BackupPayment, BackupRows, BackupUsage } from '../format';

export const IDS = {
  asha: '11111111-1111-4111-8111-111111111111',
  bholu: '22222222-2222-4222-8222-222222222222',
  chhotu: '33333333-3333-4333-8333-333333333333',
  dinu: '44444444-4444-4444-8444-444444444444',
  eku: '55555555-5555-4555-8555-555555555555',
  uAsha: 'a1000000-0000-4000-8000-000000000001',
  uBholu: 'a1000000-0000-4000-8000-000000000002',
  uDinu: 'a1000000-0000-4000-8000-000000000003',
  uBholuDeleted: 'a1000000-0000-4000-8000-000000000004',
  pAsha1: 'b2000000-0000-4000-8000-000000000001',
  pAsha2: 'b2000000-0000-4000-8000-000000000002',
  pChhotu: 'b2000000-0000-4000-8000-000000000003',
  pBholuDeleted: 'b2000000-0000-4000-8000-000000000004',
} as const;

const OWNER = '99999999-9999-4999-8999-999999999999';
const at = '2026-10-01T04:30:00+00:00';

const audit = { created_at: at, created_by: OWNER, updated_at: at, updated_by: OWNER, deleted_at: null, deleted_by: null };

export function farmer(id: string, name: string, extra: Partial<BackupFarmer> = {}): BackupFarmer {
  return { id, name, mobile: null, notes: null, is_disabled: false, ...audit, ...extra };
}

export function usage(id: string, farmerId: string, usedAt: string, hours: number, minutes: number, extra: Partial<BackupUsage> = {}): BackupUsage {
  return { id, farmer_id: farmerId, used_at: usedAt, hours, minutes, rate_paise: 10000, ...audit, ...extra };
}

export function payment(id: string, farmerId: string, paidAt: string, amountPaise: number, extra: Partial<BackupPayment> = {}): BackupPayment {
  return { id, farmer_id: farmerId, paid_at: paidAt, amount_paise: amountPaise, note: null, ...audit, ...extra };
}

const deleted = { deleted_at: '2026-10-06T06:00:00+00:00', deleted_by: OWNER };

export function workedRows(): BackupRows {
  return {
    farmers: [
      farmer(IDS.asha, 'Asha Test', { mobile: '90000 11111' }),
      farmer(IDS.bholu, 'Bholu Test'),
      farmer(IDS.chhotu, 'Chhotu Test', { notes: 'sirf advance' }),
      farmer(IDS.dinu, 'Dinu Test', { is_disabled: true }),
      farmer(IDS.eku, 'Eku Test', deleted),
    ],
    usage_entries: [
      usage(IDS.uAsha, IDS.asha, '2026-09-10T04:30:00+00:00', 3, 35),
      usage(IDS.uBholu, IDS.bholu, '2026-10-05T04:30:00+00:00', 2, 0),
      usage(IDS.uDinu, IDS.dinu, '2026-10-04T04:30:00+00:00', 1, 0),
      usage(IDS.uBholuDeleted, IDS.bholu, '2026-10-06T04:30:00+00:00', 5, 0, deleted),
    ],
    payments: [
      payment(IDS.pAsha1, IDS.asha, '2026-10-02T04:30:00+00:00', 10000, { note: 'pehla' }),
      payment(IDS.pAsha2, IDS.asha, '2026-10-03T04:30:00+00:00', 20000),
      payment(IDS.pChhotu, IDS.chhotu, '2026-08-12T04:30:00+00:00', 5000),
      payment(IDS.pBholuDeleted, IDS.bholu, '2026-10-06T05:00:00+00:00', 7000, deleted),
    ],
  };
}

export const WORKED_SUMMARY = { charges_paise: 55833, cash_paise: 35000, outstanding_paise: 25833, credit_paise: 5000 };
export const EXPORTED_AT = '2026-10-06T08:35:00.000Z';
