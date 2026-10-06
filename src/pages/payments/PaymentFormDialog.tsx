import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { formatRupees, istTimeKey, paiseToDecimalString, parseInstantMs } from '@/lib/ledger';
import {
  buildFarmerBalances,
  buildPaymentInput,
  buildPaymentPreview,
  describePaymentWarnings,
  matchesFarmerSearch,
  newPaymentForm,
  paymentFormFromRow,
} from '@/lib/data';
import type {
  FarmerRow,
  IstMoment,
  PaymentForm,
  PaymentFormCode,
  PaymentInput,
  PaymentRow,
  PaymentWarning,
  UsageRow,
} from '@/lib/data';
import type { LoadStatus } from '@/hooks/useRowStore';
import type { PaymentMutationResult } from '@/hooks/usePayments';
import { Button } from '@/components/ui/button';
import { NOTICE_TONE, TONE } from '@/components/tone';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PAYMENT_CODE_TEXT, PAYMENT_DATA_ERROR_TEXT, PAYMENTS_COPY } from './copy';
import { PaymentPreviewPanel, type PaymentPreviewState } from './PaymentPreviewPanel';

const COPY = PAYMENTS_COPY.form;

type Area = 'farmer' | 'when' | 'amount' | 'note';

const AREA_OF: Record<PaymentFormCode, Area> = {
  farmer_required: 'farmer',
  time_required: 'when',
  time_invalid: 'when',
  amount_required: 'amount',
  amount_not_integer: 'amount',
  amount_negative: 'amount',
  amount_not_positive: 'amount',
  amount_invalid: 'amount',
  note_too_long: 'note',
};

export interface PaymentFormDialogProps {
  /** null = new payment; a row = edit that payment (its farmer is read-only). */
  readonly payment: PaymentRow | null;
  /** Chalu farmers: the only ones offered for a new payment. */
  readonly activeFarmers: readonly FarmerRow[];
  /** Every farmer row, for the name of an edited payment's farmer. */
  readonly allFarmers: readonly FarmerRow[];
  /** Every payment row, for the preview and the duplicate warning. */
  readonly allPayments: readonly PaymentRow[];
  /** Every usage row, for the preview. */
  readonly usageRows: readonly UsageRow[];
  readonly usageStatus: LoadStatus;
  readonly now: IstMoment;
  /** New entry only: the farmer pre-selected in the picker (still changeable). Ignored when editing. */
  readonly initialFarmerId?: string;
  readonly saving: boolean;
  onSave(input: PaymentInput): Promise<PaymentMutationResult>;
  onSaved(payment: PaymentRow): void;
  onClose(): void;
}

/** Add / edit a payment with a live FIFO preview from the engine (L16). Warnings never block (L14). */
export function PaymentFormDialog(props: PaymentFormDialogProps) {
  const { payment, activeFarmers, allFarmers, allPayments, usageRows, usageStatus, now, initialFarmerId, saving, onSave, onSaved, onClose } = props;
  const [form, setForm] = useState<PaymentForm>(() => (payment === null ? newPaymentForm(now, initialFarmerId) : paymentFormFromRow(payment)));
  const [showErrors, setShowErrors] = useState(false);
  const [warnings, setWarnings] = useState<PaymentWarning<PaymentRow>[]>([]);
  const [saveError, setSaveError] = useState('');
  const [farmerQuery, setFarmerQuery] = useState('');

  const built = buildPaymentInput(form);

  // Current position of every farmer, from the engine (D32): picker labels and "Pura X bharo".
  const balances = useMemo(
    () => (usageStatus === 'ready' ? buildFarmerBalances({ farmers: allFarmers, usageRows, paymentRows: allPayments }) : undefined),
    [usageStatus, allFarmers, usageRows, allPayments],
  );
  const optionLabel = (f: FarmerRow): string => {
    const b = balances?.get(f.id);
    if (b === undefined || !b.ok) return f.name;
    if (b.outstandingPaise > 0) return COPY.optionBaaki(f.name, formatRupees(b.outstandingPaise));
    if (b.creditPaise > 0) return COPY.optionAdvance(f.name, formatRupees(b.creditPaise));
    return COPY.optionClear(f.name);
  };
  const shownFarmers = activeFarmers.filter((f) => f.id === form.farmerId || matchesFarmerSearch(f, farmerQuery));
  const noMatch = farmerQuery.trim() !== '' && !activeFarmers.some((f) => matchesFarmerSearch(f, farmerQuery));
  const chosen = payment === null && form.farmerId !== '' ? balances?.get(form.farmerId) : undefined;
  const fullOutstanding = chosen !== undefined && chosen.ok && chosen.outstandingPaise > 0 ? chosen.outstandingPaise : null;
  const codes = built.ok ? [] : built.codes;

  // The preview state, straight from the data layer (which calls the engine); nothing computed here.
  let preview: PaymentPreviewState;
  if (form.farmerId === '') preview = { kind: 'no_farmer' };
  else if (usageStatus === 'loading') preview = { kind: 'loading' };
  else if (usageStatus === 'error') preview = { kind: 'usage_failed' };
  else {
    preview = {
      kind: 'result',
      result: buildPaymentPreview({
        farmerId: form.farmerId,
        input: built.ok ? built.input : undefined,
        usageRows,
        paymentRows: allPayments,
        replacesPaymentId: payment?.id,
      }),
    };
  }
  const badData = preview.kind === 'result' && !preview.result.ok;

  const ownFarmer = payment === null ? undefined : allFarmers.find((f) => f.id === payment.farmer_id);
  const ownFarmerLabel =
    payment === null
      ? ''
      : `${ownFarmer?.name ?? PAYMENTS_COPY.unknownFarmer}${
          ownFarmer?.deleted_at ? PAYMENTS_COPY.deletedSuffix : ownFarmer?.is_disabled ? PAYMENTS_COPY.bandSuffix : ''
        }`;

  const change = (field: keyof PaymentForm, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setWarnings([]);
  };

  const save = async (input: PaymentInput) => {
    setSaveError('');
    const result = await onSave(input);
    if (result.ok) onSaved(result.payment);
    else setSaveError(PAYMENT_DATA_ERROR_TEXT[result.error.kind]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || badData) return;
    setShowErrors(true);
    if (!built.ok) return;
    const found = describePaymentWarnings(built.input, allPayments, now, {
      excludeId: payment?.id,
      original: payment ?? undefined,
    });
    if (found.length > 0) {
      setWarnings(found);
      return;
    }
    await save(built.input);
  };

  const errorsFor = (area: Area): ReactNode => {
    if (!showErrors) return null;
    const own = codes.filter((c) => AREA_OF[c] === area);
    return own.length === 0 ? null : (
      <div id={`payment-${area}-error`} className="space-y-0.5">
        {own.map((c) => (
          <p key={c} className="text-sm text-destructive">
            {PAYMENT_CODE_TEXT[c]}
          </p>
        ))}
      </div>
    );
  };
  const invalid = (area: Area) => showErrors && codes.some((c) => AREA_OF[c] === area);
  const describedBy = (area: Area) => (invalid(area) ? `payment-${area}-error` : undefined);
  const fieldClass = 'h-11 text-base md:text-base';

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle>{payment === null ? COPY.addTitle : COPY.editTitle}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {payment === null && (
            <div className="space-y-1.5">
              <Label htmlFor="payment-farmer-search">{COPY.search}</Label>
              <Input
                id="payment-farmer-search"
                type="search"
                autoComplete="off"
                value={farmerQuery}
                onChange={(e) => setFarmerQuery(e.target.value)}
                className={fieldClass}
              />
              {noMatch && <p className="text-sm text-muted-foreground">{COPY.noSearchResults}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="payment-farmer">{COPY.farmer}</Label>
            {payment === null ? (
              <select
                id="payment-farmer"
                value={form.farmerId}
                onChange={(e) => change('farmerId', e.target.value)}
                aria-invalid={invalid('farmer')}
                aria-describedby={describedBy('farmer')}
                className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{COPY.chooseFarmer}</option>
                {shownFarmers.map((f) => (
                  <option key={f.id} value={f.id}>
                    {optionLabel(f)}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <Input id="payment-farmer" value={ownFarmerLabel} readOnly aria-describedby="payment-farmer-locked" className={fieldClass} />
                <p id="payment-farmer-locked" className="text-xs text-muted-foreground">
                  {COPY.farmerLocked}
                </p>
              </>
            )}
            {errorsFor('farmer')}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="payment-date">{COPY.date}</Label>
              <Input
                id="payment-date"
                type="date"
                value={form.date}
                onChange={(e) => change('date', e.target.value)}
                aria-invalid={invalid('when')}
                aria-describedby={describedBy('when')}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-time">{COPY.time}</Label>
              <Input
                id="payment-time"
                type="time"
                value={form.time}
                onChange={(e) => change('time', e.target.value)}
                aria-invalid={invalid('when')}
                aria-describedby={describedBy('when')}
                className={fieldClass}
              />
            </div>
          </div>
          {errorsFor('when')}

          <div className="space-y-1.5">
            <Label htmlFor="payment-amount">{COPY.amount}</Label>
            <Input
              id="payment-amount"
              inputMode="decimal"
              autoComplete="off"
              value={form.amount}
              onChange={(e) => change('amount', e.target.value)}
              aria-invalid={invalid('amount')}
              aria-describedby={describedBy('amount')}
              className={fieldClass}
            />
            {fullOutstanding !== null && (
              <Button type="button" variant="outline" className="h-11" onClick={() => change('amount', paiseToDecimalString(fullOutstanding))}>
                {COPY.fillOutstanding(formatRupees(fullOutstanding))}
              </Button>
            )}
            {errorsFor('amount')}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-note">{COPY.note}</Label>
            <textarea
              id="payment-note"
              value={form.note}
              onChange={(e) => change('note', e.target.value)}
              rows={2}
              aria-invalid={invalid('note')}
              aria-describedby={describedBy('note')}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {errorsFor('note')}
          </div>

          <PaymentPreviewPanel state={preview} editing={payment !== null} />

          {warnings.length > 0 && (
            <div role="alert" className={cn('space-y-2 rounded-md border px-3 py-2 text-sm', TONE[NOTICE_TONE.warning].notice)}>
              <p className="font-medium">{PAYMENTS_COPY.warnings.heading}</p>
              <ul className="list-disc space-y-1 pl-5">
                {warnings.map((w) => (
                  <li key={w.kind}>
                    {PAYMENTS_COPY.warnings[w.kind]}
                    {w.kind === 'duplicate' && (
                      <ul className="list-[circle] pl-5">
                        {w.matches.map((m) => (
                          <li key={m.id}>
                            {istTimeKey(parseInstantMs(m.paid_at))} - {formatRupees(m.amount_paise)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-11" disabled={saving} onClick={() => built.ok && void save(built.input)}>
                  {PAYMENTS_COPY.warnings.saveAnyway}
                </Button>
                <Button type="button" variant="outline" className="h-11" disabled={saving} onClick={() => setWarnings([])}>
                  {PAYMENTS_COPY.warnings.goBack}
                </Button>
              </div>
            </div>
          )}

          {saveError && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {saveError}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="h-11" disabled={saving} onClick={onClose}>
              {COPY.cancel}
            </Button>
            {warnings.length === 0 && (
              <Button type="submit" className="h-11" disabled={saving || badData}>
                {saving ? COPY.saving : COPY.save}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
