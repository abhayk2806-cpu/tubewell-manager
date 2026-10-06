import { useState, type ReactNode } from 'react';
import { formatRupees, istDateKey, istTimeKey, parseInstantMs } from '@/lib/ledger';
import { PROFILE_PAGE_SIZE, nextShownCount, visiblePart } from '@/lib/data';
import type { PaymentRow, ProfileLedgerLine, ProfileMonth, ProfilePayment, ProfileUsage, UsageRow } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { BALANCE_TEXT, MONTH_STATUS_TEXT, PROFILE_COPY } from './profileCopy';

// Every figure below is an engine field from buildFarmerProfile, shown with formatRupees.
// No arithmetic happens here (L17, E18).

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{text}</p>;
}

function Line({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2" data-testid={testId}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/** "First 30, then 30 more": the visible rows plus an "Aur dikhao" button while rows are hidden. */
function Paged<T>({ rows, render }: { rows: readonly T[]; render: (visible: T[]) => ReactNode }) {
  const [shown, setShown] = useState(PROFILE_PAGE_SIZE);
  const { visible, hidden } = visiblePart(rows, shown);
  return (
    <>
      {render(visible)}
      {hidden > 0 && (
        <Button variant="outline" className="h-11 w-full" onClick={() => setShown((s) => nextShownCount(rows.length, s))}>
          {PROFILE_COPY.showMore(hidden)}
        </Button>
      )}
    </>
  );
}

function when(iso: string): string {
  const ms = parseInstantMs(iso);
  return PROFILE_COPY.when(istDateKey(ms), istTimeKey(ms));
}

export function MonthCards({ months }: { months: readonly ProfileMonth[] }) {
  const c = PROFILE_COPY.months;
  return (
    <Section id="profile-months" title={c.heading}>
      {months.length === 0 ? (
        <Empty text={c.empty} />
      ) : (
        <ul className="space-y-2">
          {months.map((m) => (
            <li key={m.monthKey} className="rounded-lg border bg-card p-3 shadow-sm" data-testid={`month-${m.monthKey}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-medium">{c.label(m.monthKey)}</p>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium" data-testid="month-status">
                  {MONTH_STATUS_TEXT[m.status]}
                </span>
              </div>
              <dl className="space-y-1 text-sm">
                <Line label={c.time} value={c.duration(m.hours, m.minutes)} />
                <Line label={c.charge} value={formatRupees(m.chargePaise)} testId="month-charge" />
                <Line label={c.chargeClear} value={formatRupees(m.paidPaise)} testId="month-paid" />
                <Line label={c.remaining} value={formatRupees(m.remainingPaise)} testId="month-remaining" />
                <Line label={c.cash} value={formatRupees(m.cashPaise)} testId="month-cash" />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function PaymentHistory({ payments }: { payments: readonly ProfilePayment<PaymentRow>[] }) {
  const c = PROFILE_COPY.payments;
  return (
    <Section id="profile-payments" title={c.heading(payments.length)}>
      {payments.length === 0 ? (
        <Empty text={c.empty} />
      ) : (
        <Paged
          rows={payments}
          render={(visible) => (
            <ul className="space-y-2" aria-label={c.heading(payments.length)}>
              {visible.map((p) => (
                <li key={p.row.id} className="rounded-lg border bg-card p-3 shadow-sm" data-testid={`payment-${p.row.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">{when(p.row.paid_at)}</p>
                      {p.row.note && <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{p.row.note}</p>}
                    </div>
                    <p className="shrink-0 font-semibold">{formatRupees(p.row.amount_paise)}</p>
                  </div>
                  <p className="mt-2 text-xs font-medium text-muted-foreground">{c.trail}</p>
                  <dl className="space-y-0.5 text-sm">
                    {p.pieces.map((piece) => (
                      <Line
                        key={piece.monthKey}
                        label={PROFILE_COPY.months.label(piece.monthKey)}
                        value={formatRupees(piece.amountPaise)}
                        testId={`trail-${piece.monthKey}`}
                      />
                    ))}
                    {p.unappliedPaise > 0 && <Line label={c.advance} value={formatRupees(p.unappliedPaise)} testId="trail-advance" />}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        />
      )}
    </Section>
  );
}

export function UsageHistory({ usage }: { usage: readonly ProfileUsage<UsageRow>[] }) {
  const c = PROFILE_COPY.usage;
  return (
    <Section id="profile-usage" title={c.heading(usage.length)}>
      {usage.length === 0 ? (
        <Empty text={c.empty} />
      ) : (
        <Paged
          rows={usage}
          render={(visible) => (
            <ul className="space-y-2" aria-label={c.heading(usage.length)}>
              {visible.map((u) => (
                <li key={u.row.id} className="flex items-start justify-between gap-2 rounded-lg border bg-card p-3 shadow-sm" data-testid={`usage-${u.row.id}`}>
                  <div className="min-w-0 text-sm">
                    <p className="text-muted-foreground">{when(u.row.used_at)}</p>
                    <p>
                      {c.duration(u.row.hours, u.row.minutes)} · {c.ratePerHour(formatRupees(u.row.rate_paise))}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">{formatRupees(u.amountPaise)}</p>
                </li>
              ))}
            </ul>
          )}
        />
      )}
    </Section>
  );
}

export function LedgerLines({ ledger }: { ledger: readonly ProfileLedgerLine[] }) {
  const c = PROFILE_COPY.ledger;
  return (
    <Section id="profile-ledger" title={c.heading(ledger.length)}>
      {ledger.length === 0 ? (
        <Empty text={c.empty} />
      ) : (
        <Paged
          rows={ledger}
          render={(visible) => (
            <ul className="divide-y rounded-lg border bg-card" aria-label={c.heading(ledger.length)}>
              {visible.map((line) => (
                <li key={`${line.kind}-${line.id}`} className="flex items-start justify-between gap-2 p-3 text-sm" data-testid={`ledger-${line.id}`}>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {line.kind === 'usage' ? c.usage : c.payment}: {formatRupees(line.amountPaise)}
                    </p>
                    <p className="text-muted-foreground">{PROFILE_COPY.when(istDateKey(line.atMs), istTimeKey(line.atMs))}</p>
                  </div>
                  <p className="shrink-0 font-medium" data-testid="ledger-balance">
                    {BALANCE_TEXT[line.balance.kind](formatRupees(line.balance.amountPaise))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        />
      )}
    </Section>
  );
}
