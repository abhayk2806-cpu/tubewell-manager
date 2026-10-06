import type { ReactNode } from 'react';
import { formatRupees } from '@/lib/ledger';
import type { PaymentPreviewResult } from '@/lib/data';
import { MONEY_TONE, TONE, type Tone } from '@/components/tone';
import { cn } from '@/lib/utils';
import { PAYMENTS_COPY } from './copy';

const COPY = PAYMENTS_COPY.preview;

/** What the form can show in the preview area. */
export type PaymentPreviewState =
  | { readonly kind: 'no_farmer' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'usage_failed' }
  | { readonly kind: 'result'; readonly result: PaymentPreviewResult };

export interface PaymentPreviewPanelProps {
  readonly state: PaymentPreviewState;
  /** Editing an existing payment: label the blocks "Pehle" / "Baad mein". */
  readonly editing: boolean;
}

function Figure({ testId, label, paise, tone, extra }: { testId: string; label: string; paise: number; tone: Tone; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2" data-testid={testId}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium', TONE[tone].text)}>
        {formatRupees(paise)}
        {extra}
      </dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-medium">{title}</p>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

/**
 * The live FIFO preview of the payment form (L16). Every figure is an engine field shown with
 * formatRupees: no arithmetic here, and outstanding and credit are always separate lines (E18).
 */
export function PaymentPreviewPanel({ state, editing }: PaymentPreviewPanelProps) {
  let body: ReactNode;
  if (state.kind === 'no_farmer') body = <p className="text-muted-foreground">{COPY.chooseFarmer}</p>;
  else if (state.kind === 'loading') body = <p className="text-muted-foreground">{COPY.loading}</p>;
  else if (state.kind === 'usage_failed') body = <p className="text-destructive">{COPY.usageFailed}</p>;
  else if (!state.result.ok) body = <p className="text-destructive">{COPY.badData}</p>;
  else if (state.result.kind === 'current') {
    const current = state.result.current;
    body = (
      <Block title={COPY.current}>
        <Figure testId="preview-current-outstanding" label={COPY.outstanding} paise={current.outstandingPaise} tone={MONEY_TONE.outstanding} />
        <Figure testId="preview-current-credit" label={COPY.credit} paise={current.creditPaise} tone={MONEY_TONE.credit} />
      </Block>
    );
  } else {
    const p = state.result.preview;
    const before = p.before.totals;
    const after = p.after.totals;
    body = (
      <>
        <Block title={editing ? COPY.before : COPY.current}>
          <Figure testId="preview-before-outstanding" label={COPY.outstanding} paise={before.outstandingPaise} tone={MONEY_TONE.outstanding} />
          <Figure testId="preview-before-credit" label={COPY.credit} paise={before.creditPaise} tone={MONEY_TONE.credit} />
        </Block>
        <Block title={COPY.pieces}>
          {p.pieces.map((piece) => (
            <Figure
              key={piece.monthKey}
              testId={`preview-piece-${piece.monthKey}`}
              label={PAYMENTS_COPY.monthLabel(piece.monthKey)}
              paise={piece.amountPaise}
              tone={MONEY_TONE.cash}
            />
          ))}
          {p.unappliedPaise > 0 && <Figure testId="preview-unapplied" label={COPY.credit} paise={p.unappliedPaise} tone={MONEY_TONE.credit} />}
        </Block>
        <Block title={editing ? COPY.after : COPY.afterPayment}>
          <Figure
            testId="preview-after-outstanding"
            label={COPY.outstandingAfter}
            paise={after.outstandingPaise}
            tone={MONEY_TONE.outstanding}
            extra={editing ? null : <span className="ml-1 text-xs text-muted-foreground">{COPY.nowValue(formatRupees(before.outstandingPaise))}</span>}
          />
          <Figure
            testId="preview-after-credit"
            label={COPY.credit}
            paise={after.creditPaise}
            tone={MONEY_TONE.credit}
            extra={editing ? null : <span className="ml-1 text-xs text-muted-foreground">{COPY.nowValue(formatRupees(before.creditPaise))}</span>}
          />
        </Block>
        {p.creditCreatedPaise > 0 && (
          <p className={cn('font-medium', TONE[MONEY_TONE.credit].text)} data-testid="preview-credit-created">
            {COPY.creditCreated(formatRupees(p.creditCreatedPaise))}
          </p>
        )}
      </>
    );
  }

  return (
    <section aria-label={COPY.heading} className="space-y-3 rounded-md border bg-muted/40 p-3 text-sm" data-testid="payment-preview">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{COPY.heading}</p>
      {body}
    </section>
  );
}
