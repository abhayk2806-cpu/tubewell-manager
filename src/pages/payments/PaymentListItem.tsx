import { formatRupees, istDateKey, istTimeKey, parseInstantMs } from '@/lib/ledger';
import type { PaymentRow } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { ENTRY_KIND_TONE, TONE } from '@/components/tone';
import { cn } from '@/lib/utils';
import { PAYMENTS_COPY, type PaymentSegment } from './copy';

const ACTIONS = PAYMENTS_COPY.actions;

export interface PaymentListItemProps {
  readonly payment: PaymentRow;
  readonly farmerName: string;
  readonly segment: PaymentSegment;
  /** True while any change is being saved: every button is disabled (no double submit). */
  readonly busy: boolean;
  onEdit(payment: PaymentRow): void;
  onDelete(payment: PaymentRow): void;
  onRestore(payment: PaymentRow): void;
}

/** One payment: farmer, IST date and time, amount, note and the actions of its segment. */
export function PaymentListItem({ payment, farmerName, segment, busy, onEdit, onDelete, onRestore }: PaymentListItemProps) {
  const paidMs = parseInstantMs(payment.paid_at);
  const buttonClass = 'h-11 min-w-11';
  // Entry type colour (D28); a deleted row is muted.
  const tone = segment === 'deleted' ? TONE.muted : TONE[ENTRY_KIND_TONE.payment];
  return (
    <li className={cn('rounded-lg border bg-card p-3 shadow-sm', tone.bar)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-medium">{farmerName}</p>
          <p className="text-sm text-muted-foreground">{PAYMENTS_COPY.when(istDateKey(paidMs), istTimeKey(paidMs))}</p>
          {payment.note && <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{payment.note}</p>}
          {segment === 'deleted' && payment.deleted_at !== null && (
            <p className="text-sm text-muted-foreground">{PAYMENTS_COPY.deletedOn(istDateKey(parseInstantMs(payment.deleted_at)))}</p>
          )}
        </div>
        <p className={cn('shrink-0 font-semibold', tone.text)}>{formatRupees(payment.amount_paise)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {segment === 'deleted' ? (
          <Button variant="outline" className={buttonClass} disabled={busy} onClick={() => onRestore(payment)}>
            {ACTIONS.restore}
          </Button>
        ) : (
          <>
            <Button variant="outline" className={buttonClass} disabled={busy} onClick={() => onEdit(payment)}>
              {ACTIONS.edit}
            </Button>
            <Button variant="outline" className={`${buttonClass} text-destructive`} disabled={busy} onClick={() => onDelete(payment)}>
              {ACTIONS.delete}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
