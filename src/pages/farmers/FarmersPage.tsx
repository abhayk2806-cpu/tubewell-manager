import { useState } from 'react';
import { Plus } from 'lucide-react';
import { findDuplicateFarmerNames, matchesFarmerSearch } from '@/lib/data';
import type { FarmerRow } from '@/lib/data';
import { useFarmers, type MutationResult } from '@/hooks/useFarmers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { DATA_ERROR_TEXT, FARMERS_COPY, type FarmerSegment } from './copy';
import { FarmerFormDialog } from './FarmerFormDialog';
import { FarmerListItem } from './FarmerListItem';

const SEGMENTS: readonly FarmerSegment[] = ['active', 'disabled', 'deleted'];

type Notice = { readonly tone: 'success' | 'error'; readonly text: string };
type FormState = { readonly farmer: FarmerRow | null } | null;
type RestoreState = { readonly farmer: FarmerRow; readonly matches: FarmerRow[] } | null;

/** Kisan screen: Chalu / Band / Deleted lists, search, add, edit, disable, soft delete and restore. */
export function FarmersPage() {
  const farmers = useFarmers();
  const [segment, setSegment] = useState<FarmerSegment>('active');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState>(null);
  const [deleteTarget, setDeleteTarget] = useState<FarmerRow | null>(null);
  const [restoreState, setRestoreState] = useState<RestoreState>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const busy = farmers.pending !== null;

  const report = (result: MutationResult, success: (name: string) => string) => {
    setNotice(result.ok ? { tone: 'success', text: success(result.farmer.name) } : { tone: 'error', text: DATA_ERROR_TEXT[result.error.kind] });
  };

  const handleSetDisabled = async (farmer: FarmerRow, disabled: boolean) => {
    setNotice(null);
    report(await farmers.setDisabled(farmer.id, disabled), disabled ? FARMERS_COPY.done.disabled : FARMERS_COPY.done.enabled);
  };

  const confirmDelete = async () => {
    if (deleteTarget === null) return;
    setNotice(null);
    const result = await farmers.remove(deleteTarget.id);
    setDeleteTarget(null);
    report(result, FARMERS_COPY.done.deleted);
  };

  const doRestore = async (farmer: FarmerRow) => {
    setNotice(null);
    const result = await farmers.restore(farmer.id);
    setRestoreState(null);
    report(result, FARMERS_COPY.done.restored);
  };

  const handleRestore = (farmer: FarmerRow) => {
    const matches = findDuplicateFarmerNames(farmer.name, farmers.all, { excludeId: farmer.id });
    if (matches.length > 0) setRestoreState({ farmer, matches });
    else void doRestore(farmer);
  };

  const visible = farmers.lists[segment].filter((f) => matchesFarmerSearch(f, search));

  return (
    <section aria-labelledby="farmers-title" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 id="farmers-title" className="text-xl font-semibold">
          {FARMERS_COPY.pageTitle}
        </h1>
        <Button
          className="h-11"
          disabled={busy || farmers.status !== 'ready'}
          onClick={() => {
            setNotice(null);
            setForm({ farmer: null });
          }}
        >
          <Plus aria-hidden="true" />
          {FARMERS_COPY.addButton}
        </Button>
      </div>

      <div aria-live="polite" role="status">
        {notice && (
          <p
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              notice.tone === 'success' ? 'border-primary/30 bg-accent text-accent-foreground' : 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            {notice.text}
          </p>
        )}
        {farmers.refreshFailed && farmers.status === 'ready' && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{FARMERS_COPY.refreshFailed}</span>
            <Button variant="outline" className="h-11" disabled={busy} onClick={() => void farmers.retryRefresh()}>
              {FARMERS_COPY.retry}
            </Button>
          </div>
        )}
      </div>

      {farmers.status === 'loading' && <p className="text-sm text-muted-foreground">{FARMERS_COPY.loading}</p>}

      {farmers.status === 'error' && (
        <div role="alert" className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="text-destructive">{FARMERS_COPY.loadError}</p>
          {farmers.error && <p className="text-destructive">{DATA_ERROR_TEXT[farmers.error.kind]}</p>}
          <Button variant="outline" className="h-11" onClick={() => void farmers.reload()}>
            {FARMERS_COPY.retry}
          </Button>
        </div>
      )}

      {farmers.status === 'ready' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="farmer-search">{FARMERS_COPY.searchLabel}</Label>
            <Input
              id="farmer-search"
              type="search"
              value={search}
              placeholder={FARMERS_COPY.searchPlaceholder}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 text-base md:text-base"
            />
          </div>

          <div role="group" aria-label={FARMERS_COPY.segmentsLabel} className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
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
                {FARMERS_COPY.segments[s]} ({farmers.lists[s].length})
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              {farmers.lists[segment].length === 0 ? FARMERS_COPY.empty[segment] : FARMERS_COPY.noSearchResults}
            </p>
          ) : (
            <ul aria-label={FARMERS_COPY.segments[segment]} className="space-y-2">
              {visible.map((f) => (
                <FarmerListItem
                  key={f.id}
                  farmer={f}
                  segment={segment}
                  busy={busy}
                  onEdit={(farmer) => {
                    setNotice(null);
                    setForm({ farmer });
                  }}
                  onSetDisabled={(farmer, disabled) => void handleSetDisabled(farmer, disabled)}
                  onDelete={setDeleteTarget}
                  onRestore={handleRestore}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {form !== null && (
        <FarmerFormDialog
          key={form.farmer?.id ?? 'new'}
          farmer={form.farmer}
          allFarmers={farmers.all}
          saving={farmers.pending?.kind === 'create' || farmers.pending?.kind === 'update'}
          onSave={(values) => (form.farmer === null ? farmers.create(values) : farmers.update(form.farmer, values))}
          onSaved={(saved) => {
            setNotice({
              tone: 'success',
              text: form.farmer === null ? FARMERS_COPY.done.created(saved.name) : FARMERS_COPY.done.updated(saved.name),
            });
            if (form.farmer === null) setSegment('active');
            setForm(null);
          }}
          onClose={() => setForm(null)}
        />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && !busy && setDeleteTarget(null)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget ? FARMERS_COPY.deleteDialog.title(deleteTarget.name) : ''}</AlertDialogTitle>
            <AlertDialogDescription>{FARMERS_COPY.deleteDialog.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11" disabled={busy}>
              {FARMERS_COPY.deleteDialog.cancel}
            </AlertDialogCancel>
            <Button variant="destructive" className="h-11" disabled={busy} onClick={() => void confirmDelete()}>
              {FARMERS_COPY.deleteDialog.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restoreState !== null} onOpenChange={(open) => !open && !busy && setRestoreState(null)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{restoreState ? FARMERS_COPY.restoreDialog.title(restoreState.farmer.name) : ''}</AlertDialogTitle>
            <AlertDialogDescription>{FARMERS_COPY.restoreDialog.body}</AlertDialogDescription>
          </AlertDialogHeader>
          {restoreState && (
            <ul className="list-disc pl-5 text-sm">
              {restoreState.matches.map((d) => (
                <li key={d.id}>
                  {d.name}
                  {d.mobile ? ` (${d.mobile})` : ''}
                </li>
              ))}
            </ul>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11" disabled={busy}>
              {FARMERS_COPY.restoreDialog.cancel}
            </AlertDialogCancel>
            <Button className="h-11" disabled={busy} onClick={() => restoreState && void doRestore(restoreState.farmer)}>
              {FARMERS_COPY.restoreDialog.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
