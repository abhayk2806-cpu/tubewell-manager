import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Droplets, Wallet } from 'lucide-react';
import { formatRupees } from '@/lib/ledger';
import { buildFarmerProfile, currentIstMoment, findProfileFarmer } from '@/lib/data';
import type { IstMoment } from '@/lib/data';
import { useFarmers } from '@/hooks/useFarmers';
import { usePayments } from '@/hooks/usePayments';
import { useUsage } from '@/hooks/useUsage';
import { Button } from '@/components/ui/button';
import { MONEY_TONE, NOTICE_TONE, TONE, type Tone } from '@/components/tone';
import { cn } from '@/lib/utils';
import { USAGE_COPY } from '../usage/copy';
import { PAYMENTS_COPY } from '../payments/copy';
import { UsageFormDialog } from '../usage/UsageFormDialog';
import { PaymentFormDialog } from '../payments/PaymentFormDialog';
import { PROFILE_COPY, PROFILE_DATA_ERROR_TEXT } from './profileCopy';
import { LedgerLines, MonthCards, PaymentHistory, UsageHistory } from './ProfileSections';

/** The open shortcut dialog and the IST moment taken when it was opened (its date and time defaults). */
type Dialog = { readonly kind: 'usage' | 'payment'; readonly now: IstMoment } | null;

function Figure({ label, paise, testId, tone, highlight = false }: { label: string; paise: number; testId: string; tone: Tone; highlight?: boolean }) {
  return (
    <div className={cn('rounded-lg border bg-card p-3', TONE[tone].bar, highlight && TONE[tone].soft)} data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-lg font-semibold', TONE[tone].text)}>{formatRupees(paise)}</dd>
    </div>
  );
}

/**
 * Kisan ka Hisaab (L17): current totals, month cards, payments with their allocation trail, usage,
 * and the chronological ledger. Every figure comes from ONE buildFarmerLedger call (via
 * buildFarmerProfile); this page does no arithmetic, and outstanding and credit stay separate (E18).
 */
export function FarmerProfilePage() {
  const { id = '' } = useParams();
  const farmers = useFarmers();
  const usage = useUsage();
  const payments = usePayments();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const statuses = [farmers.status, usage.status, payments.status];
  const status = statuses.includes('error') ? 'error' : statuses.includes('loading') ? 'loading' : 'ready';
  const firstError = farmers.error ?? usage.error ?? payments.error;
  const busy = usage.pending !== null || payments.pending !== null;

  const lookup = findProfileFarmer(farmers.all, id);
  const result = useMemo(
    () => buildFarmerProfile({ farmerId: id, usageRows: usage.all, paymentRows: payments.all }),
    [id, usage.all, payments.all],
  );

  const retryLoad = () => {
    if (farmers.status === 'error') void farmers.reload();
    if (usage.status === 'error') void usage.reload();
    if (payments.status === 'error') void payments.reload();
  };
  const retryRefresh = () => {
    if (usage.refreshFailed) void usage.retryRefresh();
    if (payments.refreshFailed) void payments.retryRefresh();
  };

  const backLink = (
    <Link to="/farmers" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
      <ArrowLeft size={16} aria-hidden="true" />
      {PROFILE_COPY.back}
    </Link>
  );

  if (status === 'loading') {
    return (
      <section className="space-y-4">
        {backLink}
        <p className="text-sm text-muted-foreground">{PROFILE_COPY.loading}</p>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="space-y-4">
        {backLink}
        <div role="alert" className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="text-destructive">{PROFILE_COPY.loadError}</p>
          {firstError && <p className="text-destructive">{PROFILE_DATA_ERROR_TEXT[firstError.kind]}</p>}
          <Button variant="outline" className="h-11" onClick={retryLoad}>
            {PROFILE_COPY.retry}
          </Button>
        </div>
      </section>
    );
  }

  if (lookup.kind === 'not_found') {
    return (
      <section className="space-y-4">
        {backLink}
        <div role="alert" className="space-y-1 rounded-md border p-3">
          <h1 className="text-xl font-semibold">{PROFILE_COPY.notFound}</h1>
          <p className="text-sm text-muted-foreground">{PROFILE_COPY.notFoundHint}</p>
        </div>
      </section>
    );
  }

  const farmer = lookup.farmer;
  const active = lookup.kind === 'active';

  return (
    <section aria-labelledby="profile-title" className="space-y-5">
      {backLink}

      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{PROFILE_COPY.pageTitle}</p>
        <h1 id="profile-title" className="flex flex-wrap items-center gap-2 break-words text-xl font-semibold">
          {farmer.name}
          {!active && <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', TONE.muted.badge)}>{PROFILE_COPY.bandBadge}</span>}
        </h1>
        {farmer.mobile && <p className="text-sm text-muted-foreground">{farmer.mobile}</p>}
        {farmer.notes && <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{farmer.notes}</p>}
        {result.ok && result.profile.totals.creditPaise > 0 && (
          <p className={cn('inline-block rounded-full px-3 py-1 text-sm font-medium', TONE[MONEY_TONE.credit].badge)} data-testid="profile-credit-badge">
            {PROFILE_COPY.creditBadge(formatRupees(result.profile.totals.creditPaise))}
          </p>
        )}
      </header>

      {active && (
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11" disabled={busy} onClick={() => { setNotice(null); setDialog({ kind: 'usage', now: currentIstMoment() }); }}>
            <Droplets aria-hidden="true" />
            {PROFILE_COPY.addUsage}
          </Button>
          <Button className="h-11" disabled={busy} onClick={() => { setNotice(null); setDialog({ kind: 'payment', now: currentIstMoment() }); }}>
            <Wallet aria-hidden="true" />
            {PROFILE_COPY.addPayment}
          </Button>
        </div>
      )}

      <div aria-live="polite" role="status">
        {notice && <p className={cn('rounded-md border px-3 py-2 text-sm', TONE[NOTICE_TONE.success].notice)}>{notice}</p>}
        {(usage.refreshFailed || payments.refreshFailed) && (
          <div className={cn('mt-2 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm', TONE[NOTICE_TONE.refreshFailed].notice)}>
            <span>{PROFILE_COPY.refreshFailed}</span>
            <Button variant="outline" className="h-11" disabled={busy} onClick={retryRefresh}>
              {PROFILE_COPY.retry}
            </Button>
          </div>
        )}
      </div>

      {!result.ok ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {PROFILE_COPY.badData}
        </p>
      ) : (
        <>
          <section aria-labelledby="profile-totals" className="space-y-2">
            <h2 id="profile-totals" className="text-lg font-semibold">
              {PROFILE_COPY.totals.heading}
            </h2>
            <dl className="grid grid-cols-2 gap-2">
              <Figure testId="total-charges" label={PROFILE_COPY.totals.charges} paise={result.profile.totals.chargesPaise} tone={MONEY_TONE.charge} />
              <Figure testId="total-paid" label={PROFILE_COPY.totals.paid} paise={result.profile.totals.totalPaidPaise} tone={MONEY_TONE.cash} />
              <Figure testId="total-outstanding" label={PROFILE_COPY.totals.outstanding} paise={result.profile.totals.outstandingPaise} tone={MONEY_TONE.outstanding} />
              <Figure
                testId="total-credit"
                label={PROFILE_COPY.totals.credit}
                paise={result.profile.totals.creditPaise}
                tone={MONEY_TONE.credit}
                highlight={result.profile.totals.creditPaise > 0}
              />
              <div className={cn('col-span-2 rounded-lg border bg-card p-3', TONE[MONEY_TONE.charge].bar)} data-testid="total-time">
                <dt className="text-xs text-muted-foreground">{PROFILE_COPY.totals.time}</dt>
                <dd className={cn('text-lg font-semibold', TONE[MONEY_TONE.charge].text)}>
                  {PROFILE_COPY.months.duration(result.profile.time.hours, result.profile.time.minutes)}
                </dd>
              </div>
            </dl>
          </section>
          <MonthCards months={result.profile.months} />
          <PaymentHistory payments={result.profile.payments} />
          <UsageHistory usage={result.profile.usage} />
          <LedgerLines ledger={result.profile.ledger} />
        </>
      )}

      {dialog?.kind === 'usage' && (
        <UsageFormDialog
          entry={null}
          initialFarmerId={farmer.id}
          activeFarmers={farmers.lists.active}
          allFarmers={farmers.all}
          allUsage={usage.all}
          now={dialog.now}
          saving={usage.pending?.kind === 'create'}
          onSave={(input) => usage.create(input)}
          onSaved={() => {
            setNotice(USAGE_COPY.done.created);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'payment' && (
        <PaymentFormDialog
          payment={null}
          initialFarmerId={farmer.id}
          activeFarmers={farmers.lists.active}
          allFarmers={farmers.all}
          allPayments={payments.all}
          usageRows={usage.all}
          usageStatus={usage.status}
          now={dialog.now}
          saving={payments.pending?.kind === 'create'}
          onSave={(input) => payments.create(input)}
          onSaved={() => {
            setNotice(PAYMENTS_COPY.done.created);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
