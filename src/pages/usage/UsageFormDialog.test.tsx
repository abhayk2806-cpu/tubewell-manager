import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { farmerRow, usageRow } from '@/lib/data/test-support/fakeSupabase';
import { UsageFormDialog } from './UsageFormDialog';

const ramu = farmerRow({ id: 'r', name: 'Ramu Test' });
const shyam = farmerRow({ id: 's', name: 'Shyam Test' });
const NOW = { dateKey: '2026-10-06', timeKey: '14:05', monthKey: '2026-10' };

function renderDialog(props: Partial<Parameters<typeof UsageFormDialog>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue({ ok: true, entry: usageRow({ id: 'u', farmer_id: 'r', used_at: '2026-10-06T08:35:00Z', hours: 1, minutes: 0 }) });
  const onSaved = vi.fn();
  render(
    <UsageFormDialog
      entry={null}
      activeFarmers={[ramu, shyam]}
      allFarmers={[ramu, shyam]}
      allUsage={[]}
      now={NOW}
      saving={false}
      onSave={onSave}
      onSaved={onSaved}
      onClose={vi.fn()}
      {...props}
    />,
  );
  return { onSave, onSaved };
}

describe('UsageFormDialog initialFarmerId', () => {
  it('without it, a new entry starts with no farmer (unchanged behaviour)', () => {
    renderDialog();
    expect(within(screen.getByRole('dialog')).getByLabelText('Kisan')).toHaveValue('');
  });

  it('a new entry starts with the given farmer pre-selected, still changeable, and saves for that farmer', async () => {
    const { onSave } = renderDialog({ initialFarmerId: 's' });
    const select = within(screen.getByRole('dialog')).getByLabelText('Kisan');
    expect(select).toHaveValue('s');
    fireEvent.change(screen.getByLabelText('Ghante'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ farmer_id: 's', hours: 1 })));
    fireEvent.change(select, { target: { value: 'r' } });
    expect(select).toHaveValue('r');
  });

  it('is ignored when editing', () => {
    const entry = usageRow({ id: 'u1', farmer_id: 'r', used_at: '2026-10-06T04:00:00Z', hours: 2, minutes: 0 });
    renderDialog({ entry, initialFarmerId: 's' });
    expect(within(screen.getByRole('dialog')).getByLabelText('Kisan')).toHaveValue('r');
  });
});
