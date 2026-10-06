import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Droplets, Wallet } from 'lucide-react';
import type { DashboardView } from '@/lib/ledger';
import { buildDashboardScreen, currentIstMoment, periodView } from '@/lib/data';
import type { IstMoment } from '@/lib/data';
import { useFarmers } from '@/hooks/useFarmers';
import { usePayments } from '@/hooks/usePayments';
import { useUsage } from '@/hooks/useUsage';
import { Button } from '@/components/ui/button';
import { NOTICE_TONE, TONE } from '@/components/tone';
import { cn } from '@/lib/utils';
import { USAGE_COPY } from '../usage/copy';
import { PAYMENTS_COPY } from '../payments/copy';
import { UsageFormDialog } from '../usage/UsageFormDialog';
import { PaymentFormDialog } from '../payments/PaymentFormDialog';
import { DASHBOARD_COPY, DASHBOARD_DATA_ERROR_TEXT } from './copy';
import { BandNoteBox, FarmerList, MonthChart, PeriodSelector, RecentActivity, Tiles } from './DashboardSections';

/** The open dialog, its pre-selected farmer (if any) and the IST moment taken when it was opened. */
type Dialog = { readonly kind: 'usage' | 'payment'; readonly farmerId?: string; readonly now: IstMoment } | null;

/**
 * Dashboard (L11, D1, D29): period figures, summary, month chart, farmers sorted by baaki, recent
 * activity and the Band note. Everything comes from buildDashboardScreen (one engine, no arithmetic
 * here); outstanding and credit are always separate figures (L8, E18).
 */
export function DashboardPage() {
  const farmers = useFarmers();
  const usage = useUsage();
  const payments = usePayments();
  const [now] = useState(currentIstMoment);
  const [view, setView] = useState<DashboardView>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const statuses = [farmers.status, usage.status, payments.status];
  const status = statuses.includes('error') ? 'error' : statuses.includes('loading') ? 'loading' : 'ready';
  const firstError = farmers.error ?? usage.error ?? payments.error;
  const busy = usage.pending !== null || payments.pending !== null;

  const result = useMemo(
    () => buildDashboardScreen({ farmers: farmers.all, usageRows: usage.all, paymentRows: payments.all, view, now }),
    [farmers.all, usage.all, payments.all, view, now],
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
  const open = (kind: 'usage' | 'payment', farmerId?: string) => {
    setNotice(null);
    setDialog({ kind, farmerId, now: currentIstMoment() });
  };

  const header = (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{DASHBOARD_COPY.pageTitle}</h1>
      <div className="grid grid-cols-2 gap-2">
        <Button className="h-11" disabled={busy || status !== 'ready'} onClick={() => open('usage')}>
          <Droplets aria-hidden="true" />
          {DASHBOARD_COPY.addUsage}
        </Button>
        <Button className="h-11" disabled={busy || status !== 'ready'} onClick={() => open('payment')}>
          <Wallet aria-hidden="true" />
          {DASHBOARD_COPY.addPayment}
        </Button>
      </div>
      <div aria-live="polite" role="status">
        {notice && <p className={cn('rounded-md border px-3 py-2 text-sm', TONE[NOTICE_TONE.success].notice)}>{notice}</p>}
        {(usage.refreshFailed || payments.refreshFailed) && (
          <div className={cn('mt-2 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm', TONE[NOTICE_TONE.refreshFailed].notice)}>
            <span>{DASHBOARD_COPY.refreshFailed}</span>
            <Button variant="outline" className="h-11" disabled={busy} onClick={retryRefresh}>
              {DASHBOARD_COPY.retry}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  let body;
  if (status === 'loading') {
    body = <p className="text-sm text-muted-foreground">{DASHBOARD_COPY.loading}</p>;
  } else if (status === 'error') {
    body = (
      <div role="alert" className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
        <p className="text-destructive">{DASHBOARD_COPY.loadError}</p>
        {firstError && <p className="text-destructive">{DASHBOARD_DATA_ERROR_TEXT[firstError.kind]}</p>}
        <Button variant="outline" className="h-11" onClick={retryLoad}>
          {DASHBOARD_COPY.retry}
        </Button>
      </div>
    );
  } else if (!result.ok) {
    body = (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {DASHBOARD_COPY.badData}
      </p>
    );
  } else {
    const s = result.screen;
    body = (
      <>
        {s.dashboard.activeFarmerCount === 0 ? (
          <div className="space-y-1 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            <p>{DASHBOARD_COPY.noFarmers}</p>
            <Link to="/farmers" className="inline-flex min-h-11 items-center font-medium text-primary">
              {DASHBOARD_COPY.addFarmerLink}
            </Link>
          </div>
        ) : (
          <>
            <PeriodSelector view={view} options={s.periodOptions} onSelectKind={(kind) => setView(periodView(kind, now))} onChange={setView} />
            <Tiles dashboard={s.dashboard} summary={s.summary} periodHasActivity={s.periodHasActivity} />
            <MonthChart
              chart={s.chart}
              selectedMonthKey={view.kind === 'month' ? view.monthKey : null}
              onSelectMonth={(monthKey) => setView({ kind: 'month', monthKey })}
            />
            <FarmerList
              rows={s.rows}
              view={view}
              query={query}
              onQueryChange={setQuery}
              busy={busy}
              onAddPayment={(farmerId) => open('payment', farmerId)}
              onAddUsage={(farmerId) => open('usage', farmerId)}
            />
            <RecentActivity items={s.recent} />
          </>
        )}
        {s.band !== null && <BandNoteBox band={s.band} />}
      </>
    );
  }

  return (
    <section aria-label={DASHBOARD_COPY.pageTitle} className="space-y-5">
      {header}
      {body}

      {dialog?.kind === 'usage' && (
        <UsageFormDialog
          entry={null}
          initialFarmerId={dialog.farmerId}
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
          initialFarmerId={dialog.farmerId}
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
