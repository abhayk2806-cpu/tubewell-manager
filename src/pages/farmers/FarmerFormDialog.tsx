import { useRef, useState, type FormEvent } from 'react';
import { findDuplicateFarmerNames, normalizeFarmerInput, validateFarmerInput } from '@/lib/data';
import type { FarmerFormValues, FarmerRow, FarmerValidationCode } from '@/lib/data';
import type { MutationResult } from '@/hooks/useFarmers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DATA_ERROR_TEXT, FARMERS_COPY, FARMER_STATE_TEXT, FARMER_VALIDATION_TEXT } from './copy';

const COPY = FARMERS_COPY.form;

type Field = 'name' | 'mobile' | 'notes';

const FIELD_OF: Record<FarmerValidationCode, Field> = {
  name_required: 'name',
  name_too_long: 'name',
  mobile_invalid: 'mobile',
  notes_too_long: 'notes',
};

export interface FarmerFormDialogProps {
  /** null = add a new farmer; a row = edit that farmer. */
  readonly farmer: FarmerRow | null;
  /** Every farmer row, for the duplicate-name warning. */
  readonly allFarmers: readonly FarmerRow[];
  readonly saving: boolean;
  onSave(values: FarmerFormValues): Promise<MutationResult>;
  onSaved(farmer: FarmerRow): void;
  onClose(): void;
}

/** Add / edit form in a dialog. Validation errors sit next to their field; a same-name farmer gives a warning, never a block. */
export function FarmerFormDialog({ farmer, allFarmers, saving, onSave, onSaved, onClose }: FarmerFormDialogProps) {
  const [values, setValues] = useState({
    name: farmer?.name ?? '',
    mobile: farmer?.mobile ?? '',
    notes: farmer?.notes ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, FarmerValidationCode>>>({});
  const [duplicates, setDuplicates] = useState<FarmerRow[]>([]);
  const [saveError, setSaveError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const change = (field: Field, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    if (field === 'name') setDuplicates([]);
  };

  const save = async () => {
    setSaveError('');
    const result = await onSave(values);
    if (result.ok) onSaved(result.farmer);
    else setSaveError(DATA_ERROR_TEXT[result.error.kind]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const input = normalizeFarmerInput(values);
    const codes = validateFarmerInput(input);
    if (codes.length > 0) {
      const next: Partial<Record<Field, FarmerValidationCode>> = {};
      for (const code of codes) next[FIELD_OF[code]] ??= code;
      setErrors(next);
      return;
    }
    // Editing without touching the name does not warn again about an already-known duplicate.
    const nameChanged = farmer === null || normalizeFarmerInput({ name: farmer.name }).name.toLowerCase() !== input.name.toLowerCase();
    const matches = nameChanged ? findDuplicateFarmerNames(input.name, allFarmers, { excludeId: farmer?.id }) : [];
    if (matches.length > 0) {
      setDuplicates(matches);
      return;
    }
    await save();
  };

  const changeName = () => {
    setDuplicates([]);
    nameRef.current?.focus();
  };

  const fieldError = (field: Field) => {
    const code = errors[field];
    return code === undefined ? null : (
      <p id={`farmer-${field}-error`} className="text-sm text-destructive">
        {FARMER_VALIDATION_TEXT[code]}
      </p>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle>{farmer === null ? COPY.addTitle : COPY.editTitle}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="farmer-name">{COPY.name}</Label>
            <Input
              id="farmer-name"
              ref={nameRef}
              value={values.name}
              onChange={(e) => change('name', e.target.value)}
              autoComplete="off"
              aria-invalid={errors.name !== undefined}
              aria-describedby={errors.name !== undefined ? 'farmer-name-error' : undefined}
              className="h-11 text-base md:text-base"
            />
            {fieldError('name')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="farmer-mobile">{COPY.mobile}</Label>
            <Input
              id="farmer-mobile"
              type="tel"
              inputMode="tel"
              value={values.mobile}
              onChange={(e) => change('mobile', e.target.value)}
              autoComplete="off"
              aria-invalid={errors.mobile !== undefined}
              aria-describedby={errors.mobile !== undefined ? 'farmer-mobile-error' : undefined}
              className="h-11 text-base md:text-base"
            />
            {fieldError('mobile')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="farmer-notes">{COPY.notes}</Label>
            <textarea
              id="farmer-notes"
              value={values.notes}
              onChange={(e) => change('notes', e.target.value)}
              rows={3}
              aria-invalid={errors.notes !== undefined}
              aria-describedby={errors.notes !== undefined ? 'farmer-notes-error' : undefined}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {fieldError('notes')}
          </div>

          {duplicates.length > 0 && (
            <div role="alert" className="space-y-2 rounded-md border border-primary/30 bg-accent px-3 py-2 text-sm">
              <p className="font-medium">{FARMERS_COPY.duplicate.heading}</p>
              <ul className="list-disc pl-5">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    {d.name}
                    {d.mobile ? ` (${d.mobile})` : ''} - {d.is_disabled ? FARMER_STATE_TEXT.disabled : FARMER_STATE_TEXT.active}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">{FARMERS_COPY.duplicate.hint}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-11" disabled={saving} onClick={() => void save()}>
                  {FARMERS_COPY.duplicate.saveAnyway}
                </Button>
                <Button type="button" variant="outline" className="h-11" disabled={saving} onClick={changeName}>
                  {FARMERS_COPY.duplicate.changeName}
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
            {duplicates.length === 0 && (
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
