import type { ReactNode } from 'react';
import { AlertTriangle, Download, FileSpreadsheet } from 'lucide-react';
import { BACKUP_TABLES } from '@/lib/backup';
import type { BackupCounts, BackupDiff, BackupFile, BackupProblem, BackupReminder } from '@/lib/backup';
import { formatRupees, istDateKey, istTimeKey, parseInstantMs } from '@/lib/ledger';
import type { BackupReadErrorKind, RestoreErrorKind, RestoreMode, RestoreReport, Verification } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MONEY_TONE, NOTICE_TONE, TONE } from '@/components/tone';
import { cn } from '@/lib/utils';
import { BACKUP_COPY } from './copy';

// Every figure below comes from the backup modules / data layer and is shown with formatRupees.
// No arithmetic here; Baaki and Advance / Credit stay separate (L8, E18).

const R = BACKUP_COPY.restore;

export type CsvKind = 'farmers' | 'usage' | 'payments' | 'months';
const CSV_KINDS: readonly CsvKind[] = ['farmers', 'usage', 'payments', 'months'];

export type ExportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'done'; readonly counts: BackupCounts }
  | { readonly kind: 'failed'; readonly reason: BackupReadErrorKind };

export type SafetyState = ExportState;

export type RunState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'failed'; readonly reason: RestoreErrorKind }
  | {
      readonly kind: 'done';
      readonly report: RestoreReport;
      readonly check: { readonly kind: 'checking' } | { readonly kind: 'failed' } | { readonly kind: 'checked'; readonly verification: Verification };
    };

export interface Notice {
  readonly tone: 'success' | 'error';
  readonly text: string;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function NoticeLine({ notice, testId }: { notice: Notice | null; testId?: string }) {
  if (notice === null) return null;
  return (
    <p
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        notice.tone === 'success' ? TONE[NOTICE_TONE.success].notice : 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
      data-testid={testId}
    >
      {notice.text}
    </p>
  );
}

function exportNotice(state: ExportState, done: (c: BackupCounts) => string, failed: string): Notice | null {
  if (state.kind === 'done') return { tone: 'success', text: done(state.counts) };
  if (state.kind === 'failed') return { tone: 'error', text: `${failed} ${BACKUP_COPY.readError[state.reason]}` };
  return null;
}

export function ReminderBox({ reminder }: { reminder: BackupReminder }) {
  const c = BACKUP_COPY.reminder;
  const warn = reminder.kind !== 'ok';
  const text = reminder.kind === 'never' ? c.never : reminder.days === 0 ? c.today : c.daysAgo(reminder.days);
  return (
    <section aria-labelledby="backup-reminder" className="space-y-2">
      <h2 id="backup-reminder" className="sr-only">
        {c.heading}
      </h2>
      <div
        className={cn('rounded-md border px-3 py-2 text-sm', warn ? TONE[NOTICE_TONE.warning].notice : 'bg-card')}
        data-testid="backup-reminder"
      >
        <p className="font-medium">
          {text}
          {reminder.kind === 'old' && ` ${c.old}`}
        </p>
        <p className={warn ? undefined : 'text-muted-foreground'}>{c.note}</p>
      </div>
      <p className="text-sm text-muted-foreground">{c.sensitive}</p>
    </section>
  );
}

export function JsonExportCard({ state, disabled, onExport }: { state: ExportState; disabled: boolean; onExport(): void }) {
  const c = BACKUP_COPY.json;
  return (
    <Section id="backup-json" title={c.heading}>
      <p className="text-sm text-muted-foreground">{c.text}</p>
      <Button className="h-11 w-full" disabled={disabled || state.kind === 'running'} onClick={onExport}>
        <Download aria-hidden="true" />
        {state.kind === 'running' ? c.running : c.button}
      </Button>
      <div aria-live="polite" role="status">
        <NoticeLine notice={exportNotice(state, c.done, c.failed)} testId="json-result" />
      </div>
    </Section>
  );
}

export function CsvCard({ disabled, notice, onExport }: { disabled: boolean; notice: Notice | null; onExport(kind: CsvKind): void }) {
  const c = BACKUP_COPY.csv;
  return (
    <Section id="backup-csv" title={c.heading}>
      <p className="text-sm text-muted-foreground">{c.text}</p>
      <div className="grid grid-cols-2 gap-2">
        {CSV_KINDS.map((kind) => (
          <Button key={kind} variant="outline" className="h-11" disabled={disabled} onClick={() => onExport(kind)}>
            <FileSpreadsheet aria-hidden="true" />
            {c[kind]}
          </Button>
        ))}
      </div>
      <div aria-live="polite" role="status">
        <NoticeLine notice={notice} testId="csv-result" />
      </div>
    </Section>
  );
}

export function FilePicker({ disabled, onChoose }: { disabled: boolean; onChoose(file: File): void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="backup-file">{R.chooseLabel}</Label>
      <Input
        id="backup-file"
        type="file"
        accept="application/json,.json"
        disabled={disabled}
        className="h-11 text-base md:text-base"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file !== undefined) onChoose(file);
        }}
      />
    </div>
  );
}

export function ProblemList({ problems }: { problems: readonly BackupProblem[] }) {
  return (
    <div role="alert" className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="file-problems">
      <p className="font-medium">{R.invalid}</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {problems.map((p, i) => (
          <li key={i}>{R.problem(p)}</li>
        ))}
      </ul>
    </div>
  );
}

function Figure({ label, paise, tone, testId }: { label: string; paise: number; tone: keyof typeof TONE; testId: string }) {
  return (
    <div className={cn('rounded-md border bg-card p-2', TONE[tone].bar)} data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('font-semibold', TONE[tone].text)}>{formatRupees(paise)}</dd>
    </div>
  );
}

export function Preview({ file, diff }: { file: BackupFile; diff: BackupDiff | null }) {
  const ms = parseInstantMs(file.exported_at);
  const t = R.totals;
  const cols = R.compareCols;
  return (
    <section aria-labelledby="backup-preview" className={cn('space-y-2 rounded-md border p-3 text-sm', TONE.info.soft)} data-testid="backup-preview">
      <h3 id="backup-preview" className="font-semibold">
        {R.previewHeading}
      </h3>
      <p>{R.fileDate(istDateKey(ms), istTimeKey(ms))}</p>
      <p data-testid="preview-counts">{BACKUP_COPY.counts(file.counts)}</p>
      <dl className="grid grid-cols-2 gap-2">
        <Figure testId="preview-charges" label={t.charges} paise={file.summary.charges_paise} tone={MONEY_TONE.charge} />
        <Figure testId="preview-cash" label={t.cash} paise={file.summary.cash_paise} tone={MONEY_TONE.cash} />
        <Figure testId="preview-outstanding" label={t.outstanding} paise={file.summary.outstanding_paise} tone={MONEY_TONE.outstanding} />
        <Figure testId="preview-credit" label={t.credit} paise={file.summary.credit_paise} tone={MONEY_TONE.credit} />
      </dl>
      {diff !== null && (
        <div className="space-y-1">
          <p className="font-medium">{R.compareHeading}</p>
          <ul className="space-y-1" aria-label={R.compareHeading}>
            {BACKUP_TABLES.map((table) => (
              <li key={table} className="rounded-md border bg-card px-2 py-1" data-testid={`diff-${table}`}>
                <span className="font-medium">{BACKUP_COPY.tables[table]}: </span>
                {cols.new} {diff[table].new}, {cols.changed} {diff[table].changed}, {cols.same} {diff[table].same}, {cols.onlyCurrent}{' '}
                {diff[table].onlyCurrent}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ModeChooser({ mode, disabled, onChange }: { mode: RestoreMode; disabled: boolean; onChange(mode: RestoreMode): void }) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">{R.modeLabel}</legend>
      <div role="group" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(['merge', 'replace'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onChange(m)}
            className={cn(
              'h-11 rounded-md px-2 text-sm font-medium transition-colors',
              mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {R[m]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function MergeConfirm({ disabled, onConfirm }: { disabled: boolean; onConfirm(): void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">{R.mergeText}</p>
      <Button className="h-11 w-full" disabled={disabled} onClick={onConfirm}>
        {R.mergeButton}
      </Button>
    </div>
  );
}

export function ReplaceConfirm({
  lost,
  safety,
  typed,
  busy,
  canReplace,
  onSafety,
  onType,
  onConfirm,
}: {
  lost: number;
  safety: SafetyState;
  typed: string;
  busy: boolean;
  canReplace: boolean;
  onSafety(): void;
  onType(text: string): void;
  onConfirm(): void;
}) {
  return (
    <div className="space-y-3">
      <div role="alert" className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <p className="flex items-center gap-2 font-semibold">
          <AlertTriangle size={16} aria-hidden="true" />
          {R.replaceWarning}
        </p>
        <p data-testid="replace-lost">{R.replaceText(lost)}</p>
      </div>
      <Button variant="outline" className="h-11 w-full" disabled={busy || safety.kind === 'running' || safety.kind === 'done'} onClick={onSafety}>
        <Download aria-hidden="true" />
        {safety.kind === 'running' ? R.safetyRunning : R.safetyButton}
      </Button>
      <div aria-live="polite" role="status">
        <NoticeLine
          notice={safety.kind === 'failed' ? { tone: 'error', text: `${R.safetyFailed} ${BACKUP_COPY.readError[safety.reason]}` } : exportNotice(safety, R.safetyDone, '')}
          testId="safety-result"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="replace-word">{R.typeLabel}</Label>
        <Input
          id="replace-word"
          value={typed}
          autoComplete="off"
          autoCapitalize="characters"
          disabled={safety.kind !== 'done' || busy}
          onChange={(e) => onType(e.target.value)}
          className="h-11 text-base md:text-base"
        />
      </div>
      <Button variant="destructive" className="h-11 w-full" disabled={!canReplace} onClick={onConfirm}>
        {R.replaceButton}
      </Button>
    </div>
  );
}

export function RunResult({ run }: { run: RunState }) {
  if (run.kind === 'idle') return null;
  if (run.kind === 'running') return <p className="text-sm text-muted-foreground">{R.running}</p>;
  if (run.kind === 'failed') {
    return (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="restore-failed">
        {R.failed} {BACKUP_COPY.restoreError[run.reason]}
      </p>
    );
  }
  const { report, check } = run;
  return (
    <div className="space-y-2 text-sm" data-testid="restore-report">
      <p className="font-semibold">{R.reportHeading}</p>
      <ul className="space-y-0.5">
        <li>{R.report(R.deleted, report.deleted)}</li>
        <li>{R.report(R.inserted, report.inserted)}</li>
        <li>{R.report(R.updated, report.updated)}</li>
      </ul>
      {check.kind === 'checking' && <p className="text-muted-foreground">{R.verifying}</p>}
      {check.kind === 'failed' && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive" data-testid="restore-verify">
          {R.verifyFailed}
        </p>
      )}
      {check.kind === 'checked' &&
        (check.verification.verified ? (
          <p className={cn('rounded-md border px-3 py-2 font-medium', TONE[NOTICE_TONE.success].notice)} data-testid="restore-verify">
            {report.mode === 'replace' ? R.verified : R.verifiedMerge}
          </p>
        ) : (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive" data-testid="restore-verify">
            {R.mismatch(
              check.verification.counts,
              R.totalsText(
                formatRupees(check.verification.summary.charges_paise),
                formatRupees(check.verification.summary.cash_paise),
                formatRupees(check.verification.summary.outstanding_paise),
                formatRupees(check.verification.summary.credit_paise),
              ),
            )}
          </p>
        ))}
    </div>
  );
}
