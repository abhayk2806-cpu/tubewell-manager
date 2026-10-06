import { formatRupees, istDateKey, istTimeKey, parseInstantMs } from '@/lib/ledger';
import type { UsageRow } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { ENTRY_KIND_TONE, TONE } from '@/components/tone';
import { cn } from '@/lib/utils';
import { USAGE_COPY, type UsageSegment } from './copy';

const ACTIONS = USAGE_COPY.actions;

export interface UsageListItemProps {
  readonly entry: UsageRow;
  readonly farmerName: string;
  /** The entry amount in paise, from usageAmountPaise (never computed here). */
  readonly amountPaise: number;
  readonly segment: UsageSegment;
  /** True while any change is being saved: every button is disabled (no double submit). */
  readonly busy: boolean;
  onEdit(entry: UsageRow): void;
  onDelete(entry: UsageRow): void;
  onRestore(entry: UsageRow): void;
}

/** One Pani Entry: farmer, IST date and time, duration, rate, amount and the actions of its segment. */
export function UsageListItem({ entry, farmerName, amountPaise, segment, busy, onEdit, onDelete, onRestore }: UsageListItemProps) {
  const usedMs = parseInstantMs(entry.used_at);
  const buttonClass = 'h-11 min-w-11';
  // Entry type colour (D28); a deleted row is muted.
  const tone = segment === 'deleted' ? TONE.muted : TONE[ENTRY_KIND_TONE.usage];
  return (
    <li className={cn('rounded-lg border bg-card p-3 shadow-sm', tone.bar)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-medium">{farmerName}</p>
          <p className="text-sm text-muted-foreground">{USAGE_COPY.when(istDateKey(usedMs), istTimeKey(usedMs))}</p>
          <p className="text-sm text-muted-foreground">
            {USAGE_COPY.duration(entry.hours, entry.minutes)} · {USAGE_COPY.ratePerHour(formatRupees(entry.rate_paise))}
          </p>
          {segment === 'deleted' && entry.deleted_at !== null && (
            <p className="text-sm text-muted-foreground">{USAGE_COPY.deletedOn(istDateKey(parseInstantMs(entry.deleted_at)))}</p>
          )}
        </div>
        <p className={cn('shrink-0 font-semibold', tone.text)}>{formatRupees(amountPaise)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {segment === 'deleted' ? (
          <Button variant="outline" className={buttonClass} disabled={busy} onClick={() => onRestore(entry)}>
            {ACTIONS.restore}
          </Button>
        ) : (
          <>
            <Button variant="outline" className={buttonClass} disabled={busy} onClick={() => onEdit(entry)}>
              {ACTIONS.edit}
            </Button>
            <Button variant="outline" className={`${buttonClass} text-destructive`} disabled={busy} onClick={() => onDelete(entry)}>
              {ACTIONS.delete}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
