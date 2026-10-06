import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buildMonthsScreen, deepLinkMonth, filterMonthsByYear, monthsStrip } from '@/lib/data';
import { useFarmers } from '@/hooks/useFarmers';
import { usePayments } from '@/hooks/usePayments';
import { useUsage } from '@/hooks/useUsage';
import { Button } from '@/components/ui/button';
import { MONTHS_COPY, MONTHS_DATA_ERROR_TEXT } from './copy';
import { Explanation, MonthCard, YearFilter, YearStrip } from './MonthsSections';

/**
 * Mahine (L11, D30): every month with usage or payments of active farmers, newest first, with a
 * year filter, a year strip and a farmer-wise breakdown per month. Everything comes from
 * buildMonthsScreen (one engine, no arithmetic here). `?month=YYYY-MM` opens that month.
 */
export function MonthsPage() {
  const farmers = useFarmers();
  const usage = useUsage();
  const payments = usePayments();
  const [params] = useSearchParams();
  // undefined = the owner has not chosen yet (the deep link's year, else all years).
  const [yearChoice, setYearChoice] = useState<string | null | undefined>(undefined);
  // Months the owner opened or closed; others follow the deep link (closed by default).
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());

  const statuses = [farmers.status, usage.status, payments.status];
  const status = statuses.includes('error') ? 'error' : statuses.includes('loading') ? 'loading' : 'ready';
  const firstError = farmers.error ?? usage.error ?? payments.error;

  const result = useMemo(
    () => buildMonthsScreen({ farmers: farmers.all, usageRows: usage.all, paymentRows: payments.all }),
    [farmers.all, usage.all, payments.all],
  );

  const retryLoad = () => {
    if (farmers.status === 'error') void farmers.reload();
    if (usage.status === 'error') void usage.reload();
    if (payments.status === 'error') void payments.reload();
  };

  let body;
  if (status === 'loading') {
    body = <p className="text-sm text-muted-foreground">{MONTHS_COPY.loading}</p>;
  } else if (status === 'error') {
    body = (
      <div role="alert" className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
        <p className="text-destructive">{MONTHS_COPY.loadError}</p>
        {firstError && <p className="text-destructive">{MONTHS_DATA_ERROR_TEXT[firstError.kind]}</p>}
        <Button variant="outline" className="h-11" onClick={retryLoad}>
          {MONTHS_COPY.retry}
        </Button>
      </div>
    );
  } else if (!result.ok) {
    body = (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {MONTHS_COPY.badData}
      </p>
    );
  } else if (!result.screen.hasFarmers) {
    body = (
      <div className="space-y-1 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        <p>{MONTHS_COPY.noFarmers}</p>
        <Link to="/farmers" className="inline-flex min-h-11 items-center font-medium text-primary">
          {MONTHS_COPY.addFarmerLink}
        </Link>
      </div>
    );
  } else if (result.screen.months.length === 0) {
    body = <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{MONTHS_COPY.noMonths}</p>;
  } else {
    const s = result.screen;
    const deep = deepLinkMonth(params.get('month'), s.months.map((m) => m.monthKey));
    const year = yearChoice !== undefined ? yearChoice : (deep?.yearKey ?? null);
    const shown = filterMonthsByYear(s.months, year);
    const isOpen = (monthKey: string) => toggled.get(monthKey) ?? monthKey === deep?.monthKey;
    body = (
      <>
        <Explanation />
        <YearFilter years={s.years} value={year} onChange={setYearChoice} />
        {shown.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{MONTHS_COPY.noMonthsInYear(year ?? '')}</p>
        ) : (
          <>
            <YearStrip strip={monthsStrip(shown)} yearKey={year} />
            <section aria-labelledby="months-list" className="space-y-2">
              <h2 id="months-list" className="text-lg font-semibold">
                {MONTHS_COPY.list.heading}
              </h2>
              <ul className="space-y-2">
                {shown.map((m) => (
                  <MonthCard
                    key={m.monthKey}
                    month={m}
                    open={isOpen(m.monthKey)}
                    onToggle={() => setToggled((prev) => new Map(prev).set(m.monthKey, !isOpen(m.monthKey)))}
                  />
                ))}
              </ul>
            </section>
          </>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="months-title" className="space-y-5">
      <h1 id="months-title" className="text-xl font-semibold">
        {MONTHS_COPY.pageTitle}
      </h1>
      {body}
    </section>
  );
}
