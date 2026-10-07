import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatRupees } from '@/lib/ledger';
import type { MonthStatus } from '@/lib/ledger';
import { PROFILE_PAGE_SIZE, nextShownCount, visiblePart } from '@/lib/data';
import type { MonthsFarmerRow, MonthsMonth, MonthsStrip } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MONEY_TONE, MONTH_STATUS_TONE, TONE, type Tone } from '@/components/tone';
import { cn } from '@/lib/utils';
import { MONTHS_COPY } from './copy';
import { monthCardId } from './monthCardId';

// Every figure below is an engine field (via buildMonthsScreen / monthsStrip), shown with
// formatRupees. No arithmetic, no money sorting, no status of our own (L10, L11).

const ALL = 'all';
const M = MONTHS_COPY.month;

const selectClass =
  'flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function Line({ label, value, tone, testId }: { label: string; value: ReactNode; tone?: Tone; testId?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2" data-testid={testId}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium', tone !== undefined && TONE[tone].text)}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: MonthStatus }) {
  return (
    <span className={cn('rounded px-2 py-0.5 text-xs font-medium', TONE[MONTH_STATUS_TONE[status]].badge)} data-testid="month-status">
      {MONTHS_COPY.status[status]}
    </span>
  );
}

/** The four month figures and the time, worded and coloured as on the profile month card. */
function MonthFigures({ m }: { m: MonthsMonth | MonthsFarmerRow }) {
  return (
    <dl className="space-y-1 text-sm">
      <Line label={M.time} value={M.duration(m.hours, m.minutes)} testId="month-time" />
      <Line label={M.charge} value={formatRupees(m.chargePaise)} tone={MONEY_TONE.charge} testId="month-charge" />
      <Line label={M.chargeClear} value={formatRupees(m.paidPaise)} tone={MONEY_TONE.cash} testId="month-paid" />
      <Line
        label={M.remaining}
        value={formatRupees(m.remainingPaise)}
        tone={m.remainingPaise > 0 ? MONEY_TONE.outstanding : 'muted'}
        testId="month-remaining"
      />
      <Line label={M.cash} value={formatRupees(m.cashPaise)} tone={MONEY_TONE.cash} testId="month-cash" />
    </dl>
  );
}

export function Explanation() {
  const c = MONTHS_COPY.explain;
  return (
    <section aria-labelledby="months-explain" className="space-y-1 rounded-lg border bg-card p-3 text-sm">
      <h2 id="months-explain" className="font-semibold">
        {c.heading}
      </h2>
      <dl className="space-y-1">
        {c.terms.map((t) => (
          <div key={t.term}>
            <dt className="inline font-medium">{t.term}: </dt>
            <dd className="inline text-muted-foreground">{t.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function YearFilter({ years, value, onChange }: { years: readonly string[]; value: string | null; onChange(year: string | null): void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="months-year">{MONTHS_COPY.year.label}</Label>
      <select id="months-year" value={value ?? ALL} onChange={(e) => onChange(e.target.value === ALL ? null : e.target.value)} className={selectClass}>
        <option value={ALL}>{MONTHS_COPY.year.all}</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

export function YearStrip({ strip, yearKey }: { strip: MonthsStrip; yearKey: string | null }) {
  const c = MONTHS_COPY.strip;
  return (
    <section aria-labelledby="months-strip" className="space-y-2" data-testid="months-strip">
      <h2 id="months-strip" className="text-lg font-semibold">
        {c.heading(yearKey)}
      </h2>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg border bg-card p-2" data-testid="strip-time">
          <dt className="text-xs text-muted-foreground">{c.time}</dt>
          <dd className="font-semibold">{M.duration(strip.hours, strip.minutes)}</dd>
        </div>
        <div className={cn('rounded-lg border bg-card p-2', TONE[MONEY_TONE.charge].bar)} data-testid="strip-charge">
          <dt className="text-xs text-muted-foreground">{c.charge}</dt>
          <dd className={cn('break-words font-semibold', TONE[MONEY_TONE.charge].text)}>{formatRupees(strip.chargePaise)}</dd>
        </div>
        <div className={cn('rounded-lg border bg-card p-2', TONE[MONEY_TONE.cash].bar)} data-testid="strip-cash">
          <dt className="text-xs text-muted-foreground">{c.cash}</dt>
          <dd className={cn('break-words font-semibold', TONE[MONEY_TONE.cash].text)}>{formatRupees(strip.cashPaise)}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        {c.baakiNote}{' '}
        <Link to="/" className="inline-flex min-h-11 items-center gap-1 font-medium text-primary">
          {c.dashboardLink}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}

function Breakdown({ month }: { month: MonthsMonth }) {
  const [shown, setShown] = useState(PROFILE_PAGE_SIZE);
  const { visible, hidden } = visiblePart(month.farmers, shown);
  return (
    <div className="space-y-2">
      <ul className="space-y-2" aria-label={M.breakdown(month.monthKey)}>
        {visible.map((f) => (
          <li key={f.farmerId} className="rounded-md border p-2" data-testid={`breakdown-${f.farmerId}`}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <Link
                to={`/farmers/${f.farmerId}`}
                aria-label={MONTHS_COPY.farmer.openProfile(f.name)}
                className="inline-flex min-h-11 min-w-0 items-center gap-1 break-words font-medium text-primary"
              >
                {f.name}
                <ChevronRight size={16} aria-hidden="true" className="shrink-0" />
              </Link>
              <StatusBadge status={f.status} />
            </div>
            <MonthFigures m={f} />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <Button variant="outline" className="h-11 w-full" onClick={() => setShown((s) => nextShownCount(month.farmers.length, s))}>
          {MONTHS_COPY.showMore(hidden)}
        </Button>
      )}
    </div>
  );
}

export function MonthCard({ month, open, onToggle }: { month: MonthsMonth; open: boolean; onToggle(): void }) {
  const panelId = `month-${month.monthKey}-farmers`;
  return (
    <li id={monthCardId(month.monthKey)} className="rounded-lg border bg-card p-3 shadow-sm" data-testid={`month-${month.monthKey}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-medium">{M.label(month.monthKey)}</h3>
        <StatusBadge status={month.status} />
      </div>
      <MonthFigures m={month} />
      <p className="mt-1 text-xs text-muted-foreground" data-testid="month-counts">
        {M.counts(month.entryCount, month.paymentCount)}
      </p>
      <Button variant="outline" className="mt-2 h-11 w-full" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        {open ? M.close : M.open(month.farmers.length)}
      </Button>
      <div id={panelId} hidden={!open} className="mt-2">
        {open && <Breakdown month={month} />}
      </div>
    </li>
  );
}
