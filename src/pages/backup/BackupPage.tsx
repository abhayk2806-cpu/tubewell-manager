import { useState } from 'react';
import {
  backupFileName,
  backupReminder,
  csvFileName,
  diffBackup,
  farmersCsv,
  monthsCsv,
  parseBackupText,
  paymentsCsv,
  rowsOnlyInCurrent,
  usageCsv,
} from '@/lib/backup';
import type { BackupFile, BackupProblem } from '@/lib/backup';
import { currentIstMoment, exportBackup, restoreBackup, verifyRestore } from '@/lib/data';
import type { ExportResult, RestoreMode } from '@/lib/data';
import { useFarmers } from '@/hooks/useFarmers';
import { usePayments } from '@/hooks/usePayments';
import { useUsage } from '@/hooks/useUsage';
import { Button } from '@/components/ui/button';
import { downloadText, readLastBackup, storeLastBackup } from './browser';
import { BACKUP_COPY } from './copy';
import {
  CsvCard,
  FilePicker,
  JsonExportCard,
  MergeConfirm,
  ModeChooser,
  Preview,
  ProblemList,
  ReminderBox,
  ReplaceConfirm,
  RunResult,
} from './BackupSections';
import type { CsvKind, ExportState, Notice, RunState, SafetyState } from './BackupSections';

type Chosen =
  | null
  | { readonly kind: 'reading' }
  | { readonly kind: 'invalid'; readonly problems: readonly BackupProblem[] }
  | { readonly kind: 'valid'; readonly file: BackupFile };

const CSV_BUILDERS = { usage: usageCsv, payments: paymentsCsv, months: monthsCsv } as const;
const CSV_FILE_KIND: Record<CsvKind, string> = { farmers: 'kisan-hisaab', usage: 'pani-entries', payments: 'payments', months: 'mahine' };

/**
 * Backup (D31): reminder, JSON backup, CSV exports, and restore (choose file -> validate -> preview
 * -> Merge or Replace -> report -> verification). The file is built and checked by src/lib/backup;
 * reads, the restore call and the verification go through the data layer. No arithmetic here.
 */
export function BackupPage() {
  const farmers = useFarmers();
  const usage = useUsage();
  const payments = usePayments();
  const [lastBackup, setLastBackup] = useState<string | null>(readLastBackup);
  const [exportState, setExportState] = useState<ExportState>({ kind: 'idle' });
  const [csvNotice, setCsvNotice] = useState<Notice | null>(null);
  const [chosen, setChosen] = useState<Chosen>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [safety, setSafety] = useState<SafetyState>({ kind: 'idle' });
  const [typed, setTyped] = useState('');
  const [run, setRun] = useState<RunState>({ kind: 'idle' });

  const statuses = [farmers.status, usage.status, payments.status];
  const status = statuses.includes('error') ? 'error' : statuses.includes('loading') ? 'loading' : 'ready';
  const firstError = farmers.error ?? usage.error ?? payments.error;
  const restoring = run.kind === 'running';

  /** Reads everything, downloads the JSON file and remembers the time. Never a partial file. */
  const downloadBackup = async (): Promise<ExportResult> => {
    const result = await exportBackup();
    if (result.ok) {
      downloadText(backupFileName(currentIstMoment()), JSON.stringify(result.file, null, 2), 'application/json');
      storeLastBackup(result.file.exported_at);
      setLastBackup(result.file.exported_at);
    }
    return result;
  };

  const runExport = async () => {
    setExportState({ kind: 'running' });
    const result = await downloadBackup();
    setExportState(result.ok ? { kind: 'done', counts: result.file.counts } : { kind: 'failed', reason: result.kind });
  };

  const runCsv = (kind: CsvKind) => {
    const input = { farmers: farmers.all, usageRows: usage.all, paymentRows: payments.all };
    const now = currentIstMoment();
    const result = kind === 'farmers' ? farmersCsv(input, BACKUP_COPY.csvLabels, now) : CSV_BUILDERS[kind](input, BACKUP_COPY.csvLabels);
    if (!result.ok) {
      setCsvNotice({ tone: 'error', text: BACKUP_COPY.csv.badData });
      return;
    }
    downloadText(csvFileName(CSV_FILE_KIND[kind], now), result.text, 'text/csv;charset=utf-8');
    setCsvNotice({ tone: 'success', text: BACKUP_COPY.csv.done(BACKUP_COPY.csv[kind]) });
  };

  const resetRestore = () => {
    setSafety({ kind: 'idle' });
    setTyped('');
    setRun({ kind: 'idle' });
  };

  const chooseFile = async (file: File) => {
    resetRestore();
    setChosen({ kind: 'reading' });
    const result = parseBackupText(await file.text(), file.size);
    setChosen(result.ok ? { kind: 'valid', file: result.file } : { kind: 'invalid', problems: result.problems });
  };

  const runSafety = async () => {
    setSafety({ kind: 'running' });
    const result = await downloadBackup();
    setSafety(result.ok ? { kind: 'done', counts: result.file.counts } : { kind: 'failed', reason: result.kind });
  };

  const runRestore = async (file: BackupFile) => {
    if (restoring) return;
    setRun({ kind: 'running' });
    const result = await restoreBackup(file, mode);
    if (!result.ok) {
      setRun({ kind: 'failed', reason: result.kind });
      return;
    }
    setRun({ kind: 'done', report: result.report, check: { kind: 'checking' } });
    const checked = await verifyRestore(file, mode);
    setRun({
      kind: 'done',
      report: result.report,
      check: checked.ok ? { kind: 'checked', verification: checked.verification } : { kind: 'failed' },
    });
    // Every screen reads these lists: reload them so the restored data shows everywhere.
    void farmers.reload();
    void usage.reload();
    void payments.reload();
  };

  const valid = chosen?.kind === 'valid' ? chosen.file : null;
  const diff = valid !== null && status === 'ready' ? diffBackup(valid, { farmers: farmers.all, usage_entries: usage.all, payments: payments.all }) : null;
  const finished = run.kind === 'done';
  const canReplace = safety.kind === 'done' && typed === BACKUP_COPY.restore.typeWord && !restoring && !finished && diff !== null;

  return (
    <section aria-labelledby="backup-title" className="space-y-5">
      <h1 id="backup-title" className="text-xl font-semibold">
        {BACKUP_COPY.pageTitle}
      </h1>

      <ReminderBox reminder={backupReminder(lastBackup, currentIstMoment())} />

      <JsonExportCard state={exportState} disabled={restoring} onExport={() => void runExport()} />

      {status === 'loading' && <p className="text-sm text-muted-foreground">{BACKUP_COPY.loading}</p>}
      {status === 'error' && (
        <div role="alert" className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="text-destructive">{BACKUP_COPY.loadError}</p>
          {firstError && <p className="text-destructive">{BACKUP_COPY.readError[firstError.kind]}</p>}
          <Button
            variant="outline"
            className="h-11"
            onClick={() => {
              if (farmers.status === 'error') void farmers.reload();
              if (usage.status === 'error') void usage.reload();
              if (payments.status === 'error') void payments.reload();
            }}
          >
            {BACKUP_COPY.retry}
          </Button>
        </div>
      )}

      <CsvCard disabled={status !== 'ready' || restoring} notice={csvNotice} onExport={runCsv} />

      <section aria-labelledby="backup-restore" className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
        <h2 id="backup-restore" className="text-lg font-semibold">
          {BACKUP_COPY.restore.heading}
        </h2>
        <FilePicker disabled={restoring} onChoose={(file) => void chooseFile(file)} />
        {chosen?.kind === 'reading' && <p className="text-sm text-muted-foreground">{BACKUP_COPY.restore.reading}</p>}
        {chosen?.kind === 'invalid' && <ProblemList problems={chosen.problems} />}
        {valid !== null && (
          <>
            <Preview file={valid} diff={diff} />
            <ModeChooser
              mode={mode}
              disabled={restoring || finished}
              onChange={(m) => {
                setMode(m);
                resetRestore();
              }}
            />
            {mode === 'merge' ? (
              <MergeConfirm disabled={restoring || finished || diff === null} onConfirm={() => void runRestore(valid)} />
            ) : (
              <ReplaceConfirm
                lost={diff === null ? 0 : rowsOnlyInCurrent(diff)}
                safety={safety}
                typed={typed}
                busy={restoring || finished}
                canReplace={canReplace}
                onSafety={() => void runSafety()}
                onType={setTyped}
                onConfirm={() => void runRestore(valid)}
              />
            )}
            <div aria-live="polite" role="status">
              <RunResult run={run} />
            </div>
          </>
        )}
      </section>
    </section>
  );
}
