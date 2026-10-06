import { formatRupees, istDateKey, istTimeKey, parseInstantMs } from '@/lib/ledger';
import type { PaymentRow, PaymentTrailView } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { ENTRY_KIND_TONE, MONEY_TONE, TONE } from '@/components/tone';
import { cn } from '@/lib/utils';
import { PAYMENTS_COPY, type PaymentSegment } from './copy';

const ACTIONS = PAYMENTS_COPY.actions;

export interface PaymentListItemProps {
  readonly payment: PaymentRow;
  readonly farmerName: string;
  readonly segment: PaymentSegment;
  /** The engine allocation trail of a live payment (buildPaymentTrails, D32); undefined while usage loads. */
  readonly trail?: PaymentTrailView;
  /** True while any change is being saved: every button is disabled (no double submit). */
  readonly busy: boolean;
  onEdit(payment: PaymentRow): void;
  onDelete(payment: PaymentRow): void;
  onRestore(payment: PaymentRow): void;
}

/** One payment: farmer, IST date and time, amount, note and the actions of its segment. */
export function PaymentListItem({ payment, farmerName, segment, trail, busy, onEdit, onDelete, onRestore }: PaymentListItemProps) {
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
      {segment === 'live' && trail !== undefined && (
        <div className="mt-2" data-testid={`trail-${payment.id}`}>
          <p className="text-xs font-medium text-muted-foreground">{PAYMENTS_COPY.trail.heading}</p>
          {trail.ok ? (
            <dl className="space-y-0.5 text-sm">
              {trail.pieces.map((piece) => (
                <div key={piece.monthKey} className="flex flex-wrap items-baseline justify-between gap-x-2" data-testid={`trail-${payment.id}-${piece.monthKey}`}>
                  <dt className="text-muted-foreground">{PAYMENTS_COPY.monthLabel(piece.monthKey)}</dt>
                  <dd className={cn('font-medium', TONE[MONEY_TONE.cash].text)}>{formatRupees(piece.amountPaise)}</dd>
                </div>
              ))}
              {trail.unappliedPaise > 0 && (
                <div className="flex flex-wrap items-baseline justify-between gap-x-2" data-testid={`trail-${payment.id}-advance`}>
                  <dt className="text-muted-foreground">{PAYMENTS_COPY.trail.advance}</dt>
                  <dd className={cn('font-medium', TONE[MONEY_TONE.credit].text)}>{formatRupees(trail.unappliedPaise)}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{PAYMENTS_COPY.trail.badData}</p>
          )}
        </div>
      )}
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
