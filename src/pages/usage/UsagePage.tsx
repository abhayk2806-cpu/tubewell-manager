import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { currentIstMoment, filterUsage, listUsageMonths, sortFarmersByName, usageAmountPaise } from '@/lib/data';
import type { FarmerRow, IstMoment, UsageRow } from '@/lib/data';
import { useFarmers } from '@/hooks/useFarmers';
import { useUsage, type UsageMutationResult } from '@/hooks/useUsage';
import { Button } from '@/components/ui/button';
import { NOTICE_TONE, TONE } from '@/components/tone';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { USAGE_COPY, USAGE_DATA_ERROR_TEXT, type UsageSegment } from './copy';
import { UsageFormDialog } from './UsageFormDialog';
import { UsageListItem } from './UsageListItem';

const SEGMENTS: readonly UsageSegment[] = ['live', 'deleted'];
const ALL = 'all';

type Notice = { readonly tone: 'success' | 'error'; readonly text: string };
/** The open form and the IST moment taken when it was opened (date / time defaults, future-date check). */
type FormState = { readonly entry: UsageRow | null; readonly now: IstMoment } | null;

const selectClass =
  'flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Pani Entry screen: entries and Recently Deleted, farmer and month filters, add, edit, delete, restore. */
export function UsagePage() {
  const usage = useUsage();
  const farmers = useFarmers();
  const [now] = useState(currentIstMoment);
  const [segment, setSegment] = useState<UsageSegment>('live');
  const [farmerFilter, setFarmerFilter] = useState<string>(ALL);
  const [monthFilter, setMonthFilter] = useState<string>(now.monthKey);
  const [form, setForm] = useState<FormState>(null);
  const [deleteTarget, setDeleteTarget] = useState<UsageRow | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const busy = usage.pending !== null;

  // Amounts come only from usageAmountPaise; a row it cannot compute puts the page into the error state.
  const amounts = useMemo(() => {
    try {
      return new Map(usage.all.map((row) => [row.id, usageAmountPaise(row)]));
    } catch {
      return null;
    }
  }, [usage.all]);

  const farmersById = useMemo(() => new Map(farmers.all.map((f) => [f.id, f])), [farmers.all]);
  const filterFarmers = useMemo(
    () => sortFarmersByName([...farmers.lists.active, ...farmers.lists.disabled]),
    [farmers.lists],
  );
  const months = useMemo(() => listUsageMonths(usage.all, now.monthKey), [usage.all, now.monthKey]);

  const filter = {
    farmerId: farmerFilter === ALL ? undefined : farmerFilter,
    monthKey: monthFilter === ALL ? undefined : monthFilter,
  };
  const shown = { live: filterUsage(usage.live, filter), deleted: filterUsage(usage.deleted, filter) };
  const visible = shown[segment];

  const status =
    usage.status === 'error' || farmers.status === 'error'
      ? 'error'
      : usage.status === 'loading' || farmers.status === 'loading'
        ? 'loading'
        : 'ready';

  const report = (result: UsageMutationResult, success: string) => {
    setNotice(result.ok ? { tone: 'success', text: success } : { tone: 'error', text: USAGE_DATA_ERROR_TEXT[result.error.kind] });
  };

  const retryLoad = () => {
    if (usage.status === 'error') void usage.reload();
    if (farmers.status === 'error') void farmers.reload();
  };

  const confirmDelete = async () => {
    if (deleteTarget === null) return;
    setNotice(null);
    const result = await usage.remove(deleteTarget.id);
    setDeleteTarget(null);
    report(result, USAGE_COPY.done.deleted);
  };

  const restore = async (entry: UsageRow) => {
    setNotice(null);
    report(await usage.restore(entry.id), USAGE_COPY.done.restored);
  };

  const farmerName = (id: string) => farmersById.get(id)?.name ?? USAGE_COPY.unknownFarmer;
  const farmerLabel = (f: FarmerRow) => (f.is_disabled ? `${f.name}${USAGE_COPY.bandSuffix}` : f.name);

  return (
    <section aria-labelledby="usage-title" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 id="usage-title" className="text-xl font-semibold">
          {USAGE_COPY.pageTitle}
        </h1>
        <Button
          className="h-11"
          disabled={busy || status !== 'ready' || amounts === null}
          onClick={() => {
            setNotice(null);
            setForm({ entry: null, now: currentIstMoment() });
          }}
        >
          <Plus aria-hidden="true" />
          {USAGE_COPY.addButton}
        </Button>
      </div>

      <div aria-live="polite" role="status">
        {notice && (
          <p
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              notice.tone === 'success' ? TONE[NOTICE_TONE.success].notice : 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            {notice.text}
          </p>
        )}
        {usage.refreshFailed && status === 'ready' && (
          <div className={cn('mt-2 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm', TONE[NOTICE_TONE.refreshFailed].notice)}>
            <span>{USAGE_COPY.refreshFailed}</span>
            <Button variant="outline" className="h-11" disabled={busy} onClick={() => void usage.retryRefresh()}>
              {USAGE_COPY.retry}
            </Button>
          </div>
        )}
      </div>

      {status === 'loading' && <p className="text-sm text-muted-foreground">{USAGE_COPY.loading}</p>}

      {status === 'error' && (
        <div role="alert" className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="text-destructive">{USAGE_COPY.loadError}</p>
          {(usage.error ?? farmers.error) && (
            <p className="text-destructive">{USAGE_DATA_ERROR_TEXT[(usage.error ?? farmers.error)?.kind ?? 'unknown']}</p>
          )}
          <Button variant="outline" className="h-11" onClick={retryLoad}>
            {USAGE_COPY.retry}
          </Button>
        </div>
      )}

      {status === 'ready' && amounts === null && (
        <div role="alert" className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="text-destructive">{USAGE_COPY.badData}</p>
          <Button variant="outline" className="h-11" onClick={() => void usage.reload()}>
            {USAGE_COPY.retry}
          </Button>
        </div>
      )}

      {status === 'ready' && amounts !== null && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="usage-filter-farmer">{USAGE_COPY.farmerFilter}</Label>
              <select id="usage-filter-farmer" value={farmerFilter} onChange={(e) => setFarmerFilter(e.target.value)} className={selectClass}>
                <option value={ALL}>{USAGE_COPY.allFarmers}</option>
                {filterFarmers.map((f) => (
                  <option key={f.id} value={f.id}>
                    {farmerLabel(f)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="usage-filter-month">{USAGE_COPY.monthFilter}</Label>
              <select id="usage-filter-month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={selectClass}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {USAGE_COPY.monthLabel(m)}
                  </option>
                ))}
                <option value={ALL}>{USAGE_COPY.allMonths}</option>
              </select>
            </div>
          </div>

          <div role="group" aria-label={USAGE_COPY.segmentsLabel} className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {SEGMENTS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={segment === s}
                onClick={() => setSegment(s)}
                className={cn(
                  'h-11 rounded-md px-2 text-sm font-medium transition-colors',
                  segment === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {USAGE_COPY.segments[s]} ({shown[s].length})
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              {usage[segment].length === 0 ? USAGE_COPY.empty[segment] : USAGE_COPY.noFilterResults}
            </p>
          ) : (
            <ul aria-label={USAGE_COPY.segments[segment]} className="space-y-2">
              {visible.map((entry) => (
                <UsageListItem
                  key={entry.id}
                  entry={entry}
                  farmerName={farmerName(entry.farmer_id)}
                  amountPaise={amounts.get(entry.id) ?? 0}
                  segment={segment}
                  busy={busy}
                  onEdit={(e) => {
                    setNotice(null);
                    setForm({ entry: e, now: currentIstMoment() });
                  }}
                  onDelete={setDeleteTarget}
                  onRestore={(e) => void restore(e)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {form !== null && (
        <UsageFormDialog
          key={form.entry?.id ?? 'new'}
          entry={form.entry}
          activeFarmers={farmers.lists.active}
          allFarmers={farmers.all}
          allUsage={usage.all}
          now={form.now}
          saving={usage.pending?.kind === 'create' || usage.pending?.kind === 'update'}
          onSave={(input) => (form.entry === null ? usage.create(input) : usage.update(form.entry, input))}
          onSaved={() => {
            setNotice({ tone: 'success', text: form.entry === null ? USAGE_COPY.done.created : USAGE_COPY.done.updated });
            setSegment('live');
            setForm(null);
          }}
          onClose={() => setForm(null)}
        />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && !busy && setDeleteTarget(null)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{USAGE_COPY.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{USAGE_COPY.deleteDialog.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11" disabled={busy}>
              {USAGE_COPY.deleteDialog.cancel}
            </AlertDialogCancel>
            <Button variant="destructive" className="h-11" disabled={busy} onClick={() => void confirmDelete()}>
              {USAGE_COPY.deleteDialog.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
