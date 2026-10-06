import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { currentIstMoment, filterPayments, listPaymentMonths, sortFarmersByName } from '@/lib/data';
import type { FarmerRow, PaymentRow } from '@/lib/data';
import { useFarmers } from '@/hooks/useFarmers';
import { usePayments, type PaymentMutationResult } from '@/hooks/usePayments';
import { useUsage } from '@/hooks/useUsage';
import { Button } from '@/components/ui/button';
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
import { PAYMENT_DATA_ERROR_TEXT, PAYMENTS_COPY, type PaymentSegment } from './copy';
import { PaymentFormDialog } from './PaymentFormDialog';
import { PaymentListItem } from './PaymentListItem';

const SEGMENTS: readonly PaymentSegment[] = ['live', 'deleted'];
const ALL = 'all';

type Notice = { readonly tone: 'success' | 'error'; readonly text: string };
type FormState = { readonly payment: PaymentRow | null } | null;

const selectClass =
  'flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Paisa screen: payments and Recently Deleted, farmer and month filters, add (with live FIFO preview), edit, delete, restore. */
export function PaymentsPage() {
  const payments = usePayments();
  const usage = useUsage();
  const farmers = useFarmers();
  const [now] = useState(currentIstMoment);
  const [segment, setSegment] = useState<PaymentSegment>('live');
  const [farmerFilter, setFarmerFilter] = useState<string>(ALL);
  const [monthFilter, setMonthFilter] = useState<string>(now.monthKey);
  const [form, setForm] = useState<FormState>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentRow | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const busy = payments.pending !== null;

  const farmersById = useMemo(() => new Map(farmers.all.map((f) => [f.id, f])), [farmers.all]);
  const filterFarmers = useMemo(
    () => sortFarmersByName([...farmers.lists.active, ...farmers.lists.disabled]),
    [farmers.lists],
  );
  const months = useMemo(() => listPaymentMonths(payments.all, now.monthKey), [payments.all, now.monthKey]);

  const filter = {
    farmerId: farmerFilter === ALL ? undefined : farmerFilter,
    monthKey: monthFilter === ALL ? undefined : monthFilter,
  };
  const shown = { live: filterPayments(payments.live, filter), deleted: filterPayments(payments.deleted, filter) };
  const visible = shown[segment];

  // Usage rows only feed the form's preview, so their loading or failure never blocks this list.
  const status =
    payments.status === 'error' || farmers.status === 'error'
      ? 'error'
      : payments.status === 'loading' || farmers.status === 'loading'
        ? 'loading'
        : 'ready';

  const report = (result: PaymentMutationResult, success: string) => {
    setNotice(result.ok ? { tone: 'success', text: success } : { tone: 'error', text: PAYMENT_DATA_ERROR_TEXT[result.error.kind] });
  };

  const retryLoad = () => {
    if (payments.status === 'error') void payments.reload();
    if (farmers.status === 'error') void farmers.reload();
  };

  const confirmDelete = async () => {
    if (deleteTarget === null) return;
    setNotice(null);
    const result = await payments.remove(deleteTarget.id);
    setDeleteTarget(null);
    report(result, PAYMENTS_COPY.done.deleted);
  };

  const restore = async (payment: PaymentRow) => {
    setNotice(null);
    report(await payments.restore(payment.id), PAYMENTS_COPY.done.restored);
  };

  const farmerName = (id: string) => farmersById.get(id)?.name ?? PAYMENTS_COPY.unknownFarmer;
  const farmerLabel = (f: FarmerRow) => (f.is_disabled ? `${f.name}${PAYMENTS_COPY.bandSuffix}` : f.name);

  return (
    <section aria-labelledby="payments-title" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 id="payments-title" className="text-xl font-semibold">
          {PAYMENTS_COPY.pageTitle}
        </h1>
        <Button
          className="h-11"
          disabled={busy || status !== 'ready'}
          onClick={() => {
            setNotice(null);
            setForm({ payment: null });
          }}
        >
          <Plus aria-hidden="true" />
          {PAYMENTS_COPY.addButton}
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
        {payments.refreshFailed && status === 'ready' && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{PAYMENTS_COPY.refreshFailed}</span>
            <Button variant="outline" className="h-11" disabled={busy} onClick={() => void payments.retryRefresh()}>
              {PAYMENTS_COPY.retry}
            </Button>
          </div>
        )}
      </div>

      {status === 'loading' && <p className="text-sm text-muted-foreground">{PAYMENTS_COPY.loading}</p>}

      {status === 'error' && (
        <div role="alert" className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="text-destructive">{PAYMENTS_COPY.loadError}</p>
          {(payments.error ?? farmers.error) && (
            <p className="text-destructive">{PAYMENT_DATA_ERROR_TEXT[(payments.error ?? farmers.error)?.kind ?? 'unknown']}</p>
          )}
          <Button variant="outline" className="h-11" onClick={retryLoad}>
            {PAYMENTS_COPY.retry}
          </Button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="payment-filter-farmer">{PAYMENTS_COPY.farmerFilter}</Label>
              <select id="payment-filter-farmer" value={farmerFilter} onChange={(e) => setFarmerFilter(e.target.value)} className={selectClass}>
                <option value={ALL}>{PAYMENTS_COPY.allFarmers}</option>
                {filterFarmers.map((f) => (
                  <option key={f.id} value={f.id}>
                    {farmerLabel(f)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-filter-month">{PAYMENTS_COPY.monthFilter}</Label>
              <select id="payment-filter-month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={selectClass}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENTS_COPY.monthLabel(m)}
                  </option>
                ))}
                <option value={ALL}>{PAYMENTS_COPY.allMonths}</option>
              </select>
            </div>
          </div>

          <div role="group" aria-label={PAYMENTS_COPY.segmentsLabel} className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
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
                {PAYMENTS_COPY.segments[s]} ({shown[s].length})
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              {payments[segment].length === 0 ? PAYMENTS_COPY.empty[segment] : PAYMENTS_COPY.noFilterResults}
            </p>
          ) : (
            <ul aria-label={PAYMENTS_COPY.segments[segment]} className="space-y-2">
              {visible.map((p) => (
                <PaymentListItem
                  key={p.id}
                  payment={p}
                  farmerName={farmerName(p.farmer_id)}
                  segment={segment}
                  busy={busy}
                  onEdit={(row) => {
                    setNotice(null);
                    setForm({ payment: row });
                  }}
                  onDelete={setDeleteTarget}
                  onRestore={(row) => void restore(row)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {form !== null && (
        <PaymentFormDialog
          key={form.payment?.id ?? 'new'}
          payment={form.payment}
          activeFarmers={farmers.lists.active}
          allFarmers={farmers.all}
          allPayments={payments.all}
          usageRows={usage.all}
          usageStatus={usage.status}
          now={now}
          saving={payments.pending?.kind === 'create' || payments.pending?.kind === 'update'}
          onSave={(input) => (form.payment === null ? payments.create(input) : payments.update(form.payment, input))}
          onSaved={() => {
            setNotice({ tone: 'success', text: form.payment === null ? PAYMENTS_COPY.done.created : PAYMENTS_COPY.done.updated });
            setSegment('live');
            setForm(null);
          }}
          onClose={() => setForm(null)}
        />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && !busy && setDeleteTarget(null)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{PAYMENTS_COPY.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{PAYMENTS_COPY.deleteDialog.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11" disabled={busy}>
              {PAYMENTS_COPY.deleteDialog.cancel}
            </AlertDialogCancel>
            <Button variant="destructive" className="h-11" disabled={busy} onClick={() => void confirmDelete()}>
              {PAYMENTS_COPY.deleteDialog.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
