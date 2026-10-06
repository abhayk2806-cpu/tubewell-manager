import { useState, type FormEvent, type ReactNode } from 'react';
import { formatRupees, istTimeKey, parseInstantMs } from '@/lib/ledger';
import {
  buildUsageInput,
  describeUsageWarnings,
  newUsageForm,
  usageFormFromRow,
  usageInputAmountPaise,
} from '@/lib/data';
import type { FarmerRow, IstMoment, UsageForm, UsageFormCode, UsageInput, UsageRow, UsageWarning } from '@/lib/data';
import type { UsageMutationResult } from '@/hooks/useUsage';
import { Button } from '@/components/ui/button';
import { MONEY_TONE, NOTICE_TONE, TONE } from '@/components/tone';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { USAGE_CODE_TEXT, USAGE_COPY, USAGE_DATA_ERROR_TEXT } from './copy';

const COPY = USAGE_COPY.form;

type Area = 'farmer' | 'when' | 'hours' | 'minutes' | 'duration' | 'rate';

const AREA_OF: Record<UsageFormCode, Area> = {
  farmer_required: 'farmer',
  time_required: 'when',
  time_invalid: 'when',
  hours_required: 'hours',
  hours_not_integer: 'hours',
  hours_negative: 'hours',
  minutes_required: 'minutes',
  minutes_not_integer: 'minutes',
  minutes_negative: 'minutes',
  minutes_out_of_range: 'minutes',
  duration_zero: 'duration',
  amount_too_large: 'duration',
  rate_required: 'rate',
  rate_not_integer: 'rate',
  rate_negative: 'rate',
  rate_not_positive: 'rate',
  rate_invalid: 'rate',
};

export interface UsageFormDialogProps {
  /** null = new entry; a row = edit that entry. */
  readonly entry: UsageRow | null;
  /** Chalu farmers: the only ones offered for a new entry. */
  readonly activeFarmers: readonly FarmerRow[];
  /** Every farmer row, to show an edited entry's own farmer even if it is now Band or Deleted. */
  readonly allFarmers: readonly FarmerRow[];
  /** Every usage row, for the duplicate warning. */
  readonly allUsage: readonly UsageRow[];
  readonly now: IstMoment;
  /** New entry only: the farmer pre-selected in the picker (still changeable). Ignored when editing. */
  readonly initialFarmerId?: string;
  readonly saving: boolean;
  onSave(input: UsageInput): Promise<UsageMutationResult>;
  onSaved(entry: UsageRow): void;
  onClose(): void;
}

/** Add / edit a Pani Entry. Errors sit next to their fields; warnings never block (L14). */
export function UsageFormDialog({ entry, activeFarmers, allFarmers, allUsage, now, initialFarmerId, saving, onSave, onSaved, onClose }: UsageFormDialogProps) {
  const [form, setForm] = useState<UsageForm>(() => (entry === null ? newUsageForm(now, initialFarmerId) : usageFormFromRow(entry)));
  const [showErrors, setShowErrors] = useState(false);
  const [warnings, setWarnings] = useState<UsageWarning<UsageRow>[]>([]);
  const [saveError, setSaveError] = useState('');

  const built = buildUsageInput(form);
  const codes = built.ok ? [] : built.codes;
  const amountText = built.ok ? formatRupees(usageInputAmountPaise(built.input)) : null;

  // Chalu farmers, plus (when editing) the entry's own farmer even if it is now Band or Deleted.
  const options = activeFarmers.map((f) => ({ id: f.id, label: f.name }));
  if (entry !== null && !options.some((o) => o.id === entry.farmer_id)) {
    const own = allFarmers.find((f) => f.id === entry.farmer_id);
    const suffix = own?.deleted_at ? USAGE_COPY.deletedSuffix : own?.is_disabled ? USAGE_COPY.bandSuffix : '';
    options.unshift({ id: entry.farmer_id, label: `${own?.name ?? USAGE_COPY.unknownFarmer}${suffix}` });
  }

  const change = (field: keyof UsageForm, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setWarnings([]);
  };

  const save = async (input: UsageInput) => {
    setSaveError('');
    const result = await onSave(input);
    if (result.ok) onSaved(result.entry);
    else setSaveError(USAGE_DATA_ERROR_TEXT[result.error.kind]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setShowErrors(true);
    if (!built.ok) return;
    const found = describeUsageWarnings(built.input, allUsage, now, {
      excludeId: entry?.id,
      original: entry ?? undefined,
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
      <div id={`usage-${area}-error`} className="space-y-0.5">
        {own.map((c) => (
          <p key={c} className="text-sm text-destructive">
            {USAGE_CODE_TEXT[c]}
          </p>
        ))}
      </div>
    );
  };

  const invalid = (area: Area) => showErrors && codes.some((c) => AREA_OF[c] === area);
  const describedBy = (area: Area) => (invalid(area) ? `usage-${area}-error` : undefined);
  const fieldClass = 'h-11 text-base md:text-base';

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle>{entry === null ? COPY.addTitle : COPY.editTitle}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="usage-farmer">{COPY.farmer}</Label>
            <select
              id="usage-farmer"
              value={form.farmerId}
              onChange={(e) => change('farmerId', e.target.value)}
              aria-invalid={invalid('farmer')}
              aria-describedby={describedBy('farmer')}
              className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">{COPY.chooseFarmer}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {errorsFor('farmer')}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="usage-date">{COPY.date}</Label>
              <Input
                id="usage-date"
                type="date"
                value={form.date}
                onChange={(e) => change('date', e.target.value)}
                aria-invalid={invalid('when')}
                aria-describedby={describedBy('when')}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="usage-time">{COPY.time}</Label>
              <Input
                id="usage-time"
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="usage-hours">{COPY.hours}</Label>
              <Input
                id="usage-hours"
                inputMode="numeric"
                autoComplete="off"
                value={form.hours}
                onChange={(e) => change('hours', e.target.value)}
                aria-invalid={invalid('hours') || invalid('duration')}
                aria-describedby={describedBy('hours') ?? describedBy('duration')}
                className={fieldClass}
              />
              {errorsFor('hours')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="usage-minutes">{COPY.minutes}</Label>
              <Input
                id="usage-minutes"
                inputMode="numeric"
                autoComplete="off"
                value={form.minutes}
                onChange={(e) => change('minutes', e.target.value)}
                aria-invalid={invalid('minutes') || invalid('duration')}
                aria-describedby={describedBy('minutes') ?? describedBy('duration')}
                className={fieldClass}
              />
              {errorsFor('minutes')}
            </div>
          </div>
          {errorsFor('duration')}

          <div className="space-y-1.5">
            <Label htmlFor="usage-rate">{COPY.rate}</Label>
            <Input
              id="usage-rate"
              inputMode="decimal"
              autoComplete="off"
              value={form.rate}
              onChange={(e) => change('rate', e.target.value)}
              aria-invalid={invalid('rate')}
              aria-describedby={describedBy('rate')}
              className={fieldClass}
            />
            {errorsFor('rate')}
          </div>

          {amountText !== null && (
            <p className={cn('rounded-md px-3 py-2 text-base font-medium', TONE[MONEY_TONE.charge].badge)} data-testid="usage-amount">
              {USAGE_COPY.amount(amountText)}
            </p>
          )}

          {warnings.length > 0 && (
            <div role="alert" className={cn('space-y-2 rounded-md border px-3 py-2 text-sm', TONE[NOTICE_TONE.warning].notice)}>
              <p className="font-medium">{USAGE_COPY.warnings.heading}</p>
              <ul className="list-disc space-y-1 pl-5">
                {warnings.map((w) => (
                  <li key={w.kind}>
                    {USAGE_COPY.warnings[w.kind]}
                    {w.kind === 'duplicate' && (
                      <ul className="list-[circle] pl-5">
                        {w.matches.map((m) => (
                          <li key={m.id}>
                            {istTimeKey(parseInstantMs(m.used_at))} - {USAGE_COPY.duration(m.hours, m.minutes)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-11" disabled={saving} onClick={() => built.ok && void save(built.input)}>
                  {USAGE_COPY.warnings.saveAnyway}
                </Button>
                <Button type="button" variant="outline" className="h-11" disabled={saving} onClick={() => setWarnings([])}>
                  {USAGE_COPY.warnings.goBack}
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
              <Button type="submit" className="h-11" disabled={saving}>
                {saving ? COPY.saving : COPY.save}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
