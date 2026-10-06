// The ONLY place in the app that reads the clock. It exists because the audit trigger
// (migration 002) does not set deleted_at: the client sends it on soft delete. Tests stub it.
import { istDateKey, istMonthKey, istTimeKey, parseInstantMs } from '@/lib/ledger';

export function nowIso(): string {
  return new Date().toISOString();
}

/** The current moment as IST keys (date, time, month), for form defaults and the default month filter. */
export function currentIstMoment(): { dateKey: string; timeKey: string; monthKey: string } {
  const ms = parseInstantMs(nowIso());
  return { dateKey: istDateKey(ms), timeKey: istTimeKey(ms), monthKey: istMonthKey(ms) };
}
