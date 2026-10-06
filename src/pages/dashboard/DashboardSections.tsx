import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Droplets, Wallet } from 'lucide-react';
import { formatRupees, istDateKey, istTimeKey } from '@/lib/ledger';
import type { Dashboard, DashboardView } from '@/lib/ledger';
import { filterDashboardRows } from '@/lib/data';
import type { BandNote, ChartMonth, DashboardRow, DashboardSummary, DashboardTime, PeriodOptions, RecentItem } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ENTRY_KIND_TONE, MONEY_TONE, TONE, type Tone } from '@/components/tone';
import { cn } from '@/lib/utils';
import { DASHBOARD_COPY } from './copy';

// Every figure below is an engine field (via buildDashboardScreen), shown with formatRupees.
// No arithmetic, no money sorting and no netting happens here (L8, L11, E18).

const KINDS: readonly DashboardView['kind'][] = ['all', 'month', 'year'];

const selectClass =
  'flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function Section({ id, title, children, action }: { id: string; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PeriodSelector({
  view,
  options,
  onSelectKind,
  onChange,
}: {
  view: DashboardView;
  options: PeriodOptions;
  onSelectKind(kind: DashboardView['kind']): void;
  onChange(view: DashboardView): void;
}) {
  const c = DASHBOARD_COPY.period;
  return (
    <div className="space-y-2">
      <div role="group" aria-label={c.label} className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={view.kind === kind}
            onClick={() => onSelectKind(kind)}
            className={cn(
              'h-11 rounded-md px-2 text-sm font-medium transition-colors',
              view.kind === kind ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {c.options[kind]}
          </button>
        ))}
      </div>
      {view.kind === 'month' && (
        <div className="space-y-1.5">
          <Label htmlFor="dashboard-month">{c.monthPicker}</Label>
          <select
            id="dashboard-month"
            value={view.monthKey}
            onChange={(e) => onChange({ kind: 'month', monthKey: e.target.value })}
            className={selectClass}
          >
            {options.months.map((m) => (
              <option key={m} value={m}>
                {c.monthLabel(m)}
              </option>
            ))}
          </select>
          <Link to={`/months?month=${view.monthKey}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
            {c.monthBreakdown}
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
      )}
      {view.kind === 'year' && (
        <div className="space-y-1.5">
          <Label htmlFor="dashboard-year">{c.yearPicker}</Label>
          <select id="dashboard-year" value={view.yearKey} onChange={(e) => onChange({ kind: 'year', yearKey: e.target.value })} className={selectClass}>
            {options.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="text-sm text-muted-foreground" data-testid="period-explain">
        {view.kind === 'all'
          ? DASHBOARD_COPY.explain.all
          : view.kind === 'month'
            ? DASHBOARD_COPY.explain.month(view.monthKey)
            : DASHBOARD_COPY.explain.year(view.yearKey)}
      </p>
    </div>
  );
}

function Tile({ label, paise, tone, testId }: { label: string; paise: number; tone: Tone; testId: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-3', TONE[tone].bar)} data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-lg font-semibold', TONE[tone].text)}>{formatRupees(paise)}</dd>
    </div>
  );
}

function TextTile({ label, value, tone, testId }: { label: string; value: string; tone: Tone; testId: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-3', TONE[tone].bar)} data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-lg font-semibold', tone === 'info' ? undefined : TONE[tone].text)}>{value}</dd>
    </div>
  );
}

export function Tiles({
  dashboard,
  summary,
  periodHasActivity,
  time,
  activeFarmerCount,
}: {
  dashboard: Dashboard;
  summary: DashboardSummary;
  periodHasActivity: boolean;
  time: DashboardTime;
  activeFarmerCount: number;
}) {
  const c = DASHBOARD_COPY.tiles;
  const s = DASHBOARD_COPY.summary;
  return (
    <Section id="dashboard-totals" title={c.heading}>
      <dl className="grid grid-cols-2 gap-2">
        <Tile testId="dash-charges" label={c.charges} paise={dashboard.chargesCreatedPaise} tone={MONEY_TONE.charge} />
        <Tile testId="dash-cash" label={c.cash} paise={dashboard.cashReceivedPaise} tone={MONEY_TONE.cash} />
        <Tile testId="dash-outstanding" label={c.outstanding} paise={dashboard.outstandingPaise} tone={MONEY_TONE.outstanding} />
        <Tile testId="dash-credit" label={c.credit} paise={dashboard.creditPaise} tone={MONEY_TONE.credit} />
      </dl>
      <dl className="grid grid-cols-2 gap-2">
        <TextTile testId="dash-time" label={c.time} value={c.duration(time.hours, time.minutes)} tone={MONEY_TONE.charge} />
        <TextTile testId="dash-farmers" label={c.farmers} value={String(activeFarmerCount)} tone="info" />
      </dl>
      {!periodHasActivity && <p className="text-sm text-muted-foreground">{DASHBOARD_COPY.noActivity}</p>}
      <div className="space-y-0.5 text-sm" data-testid="dash-summary">
        <p className={summary.top === null ? TONE.muted.text : TONE[MONEY_TONE.outstanding].text}>
          {summary.top === null ? s.noBaaki : s.baaki(summary.baakiCount, summary.top.name, formatRupees(summary.top.outstandingPaise))}
        </p>
        {summary.creditCount > 0 && <p className={TONE[MONEY_TONE.credit].text}>{s.credit(summary.creditCount)}</p>}
      </div>
    </Section>
  );
}

export function MonthChart({ chart, selectedMonthKey, onSelectMonth }: { chart: readonly ChartMonth[]; selectedMonthKey: string | null; onSelectMonth(monthKey: string): void }) {
  const c = DASHBOARD_COPY.chart;
  return (
    <Section
      id="dashboard-chart"
      title={c.heading}
      action={
        <Link to="/months" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
          {c.allMonths}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      }
    >
      {chart.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{c.empty}</p>
      ) : (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={`${c.legendCharge}, ${c.legendCash}`}>
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('size-2.5 rounded-sm', TONE[MONEY_TONE.charge].dot)} />
              <span className={TONE[MONEY_TONE.charge].text}>{c.legendCharge}</span>
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('size-2.5 rounded-sm', TONE[MONEY_TONE.cash].dot)} />
              <span className={TONE[MONEY_TONE.cash].text}>{c.legendCash}</span>
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">{c.hint}</p>
          <div className="grid grid-cols-6 gap-1" data-testid="chart-columns">
            {chart.map((m) => {
              const selected = m.monthKey === selectedMonthKey;
              return (
                <button
                  key={m.monthKey}
                  type="button"
                  aria-pressed={selected}
                  aria-label={c.column(m.monthKey, formatRupees(m.chargePaise), formatRupees(m.cashPaise))}
                  onClick={() => onSelectMonth(m.monthKey)}
                  data-testid={`chart-${m.monthKey}`}
                  className={cn(
                    'flex min-h-11 min-w-11 flex-col items-stretch gap-1 rounded-md border border-transparent p-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    selected ? 'border-primary/30 bg-accent' : 'hover:bg-muted',
                  )}
                >
                  <span aria-hidden="true" className="flex h-24 items-end justify-center gap-0.5">
                    <span className={cn('w-2.5 rounded-t-sm', TONE[MONEY_TONE.charge].dot)} style={{ height: `${m.chargePercent}%` }} />
                    <span className={cn('w-2.5 rounded-t-sm', TONE[MONEY_TONE.cash].dot)} style={{ height: `${m.cashPercent}%` }} />
                  </span>
                  <span aria-hidden="true" className={cn('break-words text-center text-[11px] leading-tight', selected ? 'font-semibold' : 'text-muted-foreground')}>
                    {c.monthLabel(m.monthKey)}
                  </span>
                </button>
              );
            })}
          </div>
          <table className="sr-only">
            <caption>{c.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{c.month}</th>
                <th scope="col">{c.legendCharge}</th>
                <th scope="col">{c.legendCash}</th>
              </tr>
            </thead>
            <tbody>
              {chart.map((m) => (
                <tr key={m.monthKey}>
                  <th scope="row">{c.monthLabel(m.monthKey)}</th>
                  <td>{formatRupees(m.chargePaise)}</td>
                  <td>{formatRupees(m.cashPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function Amount({ label, paise, tone, testId }: { label: string; paise: number; tone: Tone; testId: string }) {
  return (
    <div className="flex items-baseline gap-1" data-testid={testId}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium', TONE[tone].text)}>{formatRupees(paise)}</dd>
    </div>
  );
}

export function FarmerList({
  rows,
  view,
  query,
  onQueryChange,
  busy,
  onAddPayment,
  onAddUsage,
}: {
  rows: readonly DashboardRow[];
  view: DashboardView;
  query: string;
  onQueryChange(query: string): void;
  busy: boolean;
  onAddPayment(farmerId: string): void;
  onAddUsage(farmerId: string): void;
}) {
  const c = DASHBOARD_COPY.farmers;
  const visible = filterDashboardRows(rows, query);
  return (
    <Section id="dashboard-farmers" title={c.heading}>
      <div className="space-y-1.5">
        <Label htmlFor="dashboard-search">{c.searchLabel}</Label>
        <Input
          id="dashboard-search"
          type="search"
          value={query}
          placeholder={c.searchPlaceholder}
          onChange={(e) => onQueryChange(e.target.value)}
          className="h-11 text-base md:text-base"
        />
        <p className="text-xs text-muted-foreground" aria-live="polite" data-testid="farmer-count">
          {c.count(visible.length, rows.length)}
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{c.noResult}</p>
      ) : (
        <ul className="space-y-2" aria-label={c.heading}>
          {visible.map((r) => (
            <li key={r.farmerId} className="rounded-lg border bg-card p-3 shadow-sm" data-testid={`farmer-${r.farmerId}`}>
              <Link
                to={`/farmers/${r.farmerId}`}
                aria-label={c.openProfile(r.name)}
                className="-mx-1 flex min-h-11 items-center justify-between gap-2 rounded-md px-1 font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span className="break-words">{r.name}</span>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-muted-foreground" />
              </Link>
              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Amount testId="row-baaki" label={c.baaki} paise={r.outstandingPaise} tone={r.outstandingPaise > 0 ? MONEY_TONE.outstanding : 'muted'} />
                {r.creditPaise > 0 && <Amount testId="row-credit" label={c.credit} paise={r.creditPaise} tone={MONEY_TONE.credit} />}
                {view.kind !== 'all' && <Amount testId="row-charges" label={c.charges} paise={r.chargesCreatedPaise} tone={MONEY_TONE.charge} />}
                {view.kind !== 'all' && <Amount testId="row-cash" label={c.cash} paise={r.cashReceivedPaise} tone={MONEY_TONE.cash} />}
              </dl>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="outline" className="h-11 min-w-11" disabled={busy} aria-label={c.paymentFor(r.name)} onClick={() => onAddPayment(r.farmerId)}>
                  <Wallet aria-hidden="true" className={TONE[MONEY_TONE.cash].text} />
                  {c.payment}
                </Button>
                <Button variant="outline" className="h-11 min-w-11" disabled={busy} aria-label={c.usageFor(r.name)} onClick={() => onAddUsage(r.farmerId)}>
                  <Droplets aria-hidden="true" className={TONE[MONEY_TONE.charge].text} />
                  {c.usage}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function RecentActivity({ items }: { items: readonly RecentItem[] }) {
  const c = DASHBOARD_COPY.recent;
  return (
    <Section id="dashboard-recent" title={c.heading}>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{c.empty}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card" aria-label={c.heading}>
          {items.map((item) => {
            const tone = TONE[ENTRY_KIND_TONE[item.kind]];
            return (
              <li key={`${item.kind}-${item.id}`} className="flex items-start justify-between gap-2 p-3 text-sm" data-testid={`recent-${item.id}`}>
                <div className="flex min-w-0 items-start gap-2">
                  <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0 rounded-full', tone.dot)} />
                  <div className="min-w-0">
                    <Link
                      to={`/farmers/${item.farmerId}`}
                      aria-label={c.openProfile(item.farmerName)}
                      className="inline-flex min-h-11 items-center break-words font-medium text-primary"
                    >
                      {item.farmerName}
                    </Link>
                    <p className="text-muted-foreground">
                      {item.kind === 'usage' ? c.usage : c.payment} · {c.when(istDateKey(item.atMs), istTimeKey(item.atMs))}
                    </p>
                  </div>
                </div>
                <p className={cn('shrink-0 font-semibold', tone.text)}>{formatRupees(item.amountPaise)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export function BandNoteBox({ band }: { band: BandNote }) {
  const c = DASHBOARD_COPY.band;
  return (
    <section aria-labelledby="dashboard-band" className={cn('space-y-1 rounded-md border px-3 py-2 text-sm', TONE.muted.notice)} data-testid="band-note">
      <h2 id="dashboard-band" className="font-medium">
        {c.heading}
      </h2>
      <p>{c.text(band.farmerCount, formatRupees(band.outstandingPaise), formatRupees(band.creditPaise))}</p>
      <Link to="/farmers" className="inline-flex min-h-11 items-center gap-1 font-medium text-primary">
        {c.link}
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
