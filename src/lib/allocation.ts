import type { UsageEntry } from '@/types';

// ============================================================================
// Entry-level payment allocation (DERIVED — never stored)
// ============================================================================
//
// Given the usage entries of a farmer for a single month and the TOTAL amount
// that farmer has paid FOR that month (sum of payments where for_month=month,
// including any multi-month group rows — payment_group_id stays out of the math),
// this computes which entries are paid / partially paid / unpaid.
//
// Design decisions (see CLAUDE.md + PROJECT_STATUS.md 2026-05-29):
//   - Allocation unit is MONEY (₹), NOT hours. rate_per_hour is stored per-entry,
//     so two entries in the same month can have different rates. We distribute the
//     paid rupees across entries; each entry's "paid minutes" is then derived from
//     THAT entry's own rate. This stays correct even with mixed rates.
//   - Fill order is FIFO: oldest entry (by date) first.
//   - Purely derived from (entries, totalPaid). Nothing is written to the DB.
//     This keeps the sacred row-wise `for_month` due math untouched and makes the
//     breakdown self-correcting when entries/payments are edited or deleted.
//   - Overpayment beyond total usage is reported as `leftoverPaid` and otherwise
//     ignored — consistent with the existing ₹0-due cap.
// ============================================================================

export type EntryPaidStatus = 'paid' | 'partial' | 'unpaid';

export interface EntryAllocation {
  entry: UsageEntry;
  paidAmount: number;   // ₹ of this entry covered by payments
  dueAmount: number;    // ₹ still outstanding on this entry
  paidMinutes: number;  // minutes of this entry covered (derived from the entry's own rate)
  status: EntryPaidStatus;
}

export interface MonthAllocation {
  entries: EntryAllocation[]; // oldest-first
  totalUsage: number;         // Σ entry.amount
  totalPaid: number;          // the pool that was distributed (raw, uncapped)
  leftoverPaid: number;       // paid beyond total usage (overpayment), >= 0
  totalDue: number;           // max(0, totalUsage - totalPaid)
}

// Tiny epsilon so floating-point rupees (NUMERIC(10,2)) compare cleanly.
const EPS = 0.005;

/**
 * Distribute `totalPaidForMonth` rupees across `entries` (oldest-first) and
 * return a per-entry paid/partial/unpaid breakdown. Pure function — no I/O.
 */
export function allocateMonth(
  entries: UsageEntry[],
  totalPaidForMonth: number,
): MonthAllocation {
  // FIFO: oldest entry first. Deterministic tie-break by created_at then id.
  const sorted = [...entries].sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    if (ta !== tb) return ta - tb;
    const ca = new Date(a.created_at || 0).getTime();
    const cb = new Date(b.created_at || 0).getTime();
    if (ca !== cb) return ca - cb;
    return (a.id || '').localeCompare(b.id || '');
  });

  let pool = Math.max(0, Number(totalPaidForMonth) || 0);
  let totalUsage = 0;

  const allocated: EntryAllocation[] = sorted.map((e) => {
    const amount = Number(e.amount || 0);
    totalUsage += amount;

    const paidAmount = Math.min(pool, amount);
    pool -= paidAmount;
    const dueAmount = Math.max(0, amount - paidAmount);

    const rate = Number(e.rate_per_hour || 0);
    const entryMinutes = Number(e.total_minutes || 0);
    let paidMinutes = rate > 0 ? Math.round((paidAmount / rate) * 60) : 0;
    if (paidMinutes > entryMinutes) paidMinutes = entryMinutes;

    let status: EntryPaidStatus;
    if (paidAmount >= amount - EPS) {
      status = 'paid';
      paidMinutes = entryMinutes; // fully paid → show the entry's full duration, no rounding gap
    } else if (paidAmount > EPS) {
      status = 'partial';
    } else {
      status = 'unpaid';
      paidMinutes = 0;
    }

    return { entry: e, paidAmount, dueAmount, paidMinutes, status };
  });

  const totalPaid = Math.max(0, Number(totalPaidForMonth) || 0);
  return {
    entries: allocated,
    totalUsage,
    totalPaid,
    leftoverPaid: pool, // whatever remained after covering every entry
    totalDue: Math.max(0, totalUsage - totalPaid),
  };
}

/** Render a minutes count as "1h 30m" / "45m" / "2h". */
export function formatMinutes(totalMinutes: number): string {
  const t = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
