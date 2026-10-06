import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { farmerRow, paymentRow, usageRow } from '@/lib/data/test-support/fakeSupabase';
import { PaymentFormDialog } from './PaymentFormDialog';

const ramu = farmerRow({ id: 'r', name: 'Ramu Test' });
const shyam = farmerRow({ id: 's', name: 'Shyam Test' });
const NOW = { dateKey: '2026-10-06', timeKey: '14:05', monthKey: '2026-10' };
const entry = usageRow({ id: 'u1', farmer_id: 's', used_at: '2026-10-02T04:30:00Z', hours: 3, minutes: 35 });
const R = String.fromCharCode(0x20b9);

function renderDialog(props: Partial<Parameters<typeof PaymentFormDialog>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue({ ok: true, payment: paymentRow({ id: 'p', farmer_id: 's', paid_at: '2026-10-06T08:35:00Z', amount_paise: 100 }) });
  render(
    <PaymentFormDialog
      payment={null}
      activeFarmers={[ramu, shyam]}
      allFarmers={[ramu, shyam]}
      allPayments={[]}
      usageRows={[entry]}
      usageStatus="ready"
      now={NOW}
      saving={false}
      onSave={onSave}
      onSaved={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
  return { onSave };
}

describe('PaymentFormDialog initialFarmerId', () => {
  it('without it, a new payment starts with no farmer (unchanged behaviour)', () => {
    renderDialog();
    expect(within(screen.getByRole('dialog')).getByLabelText('Kisan')).toHaveValue('');
    expect(screen.getByText('Kisan chuno, to uska hisaab yahan dikhega.')).toBeInTheDocument();
  });

  it('pre-selects the farmer, shows that farmer\'s preview at once and saves for that farmer', async () => {
    const { onSave } = renderDialog({ initialFarmerId: 's' });
    expect(within(screen.getByRole('dialog')).getByLabelText('Kisan')).toHaveValue('s');
    expect(screen.getByTestId('preview-current-outstanding').querySelector('dd')?.textContent).toBe(`${R}358.33`);
    fireEvent.change(screen.getByLabelText('Rakam (rupaye)'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ farmer_id: 's', amount_paise: 10000 })));
  });

  it('is ignored when editing (the farmer stays the payment\'s own, read-only)', () => {
    const payment = paymentRow({ id: 'p1', farmer_id: 'r', paid_at: '2026-10-05T05:30:00Z', amount_paise: 10000 });
    renderDialog({ payment, allPayments: [payment], initialFarmerId: 's' });
    expect(within(screen.getByRole('dialog')).getByLabelText('Kisan')).toHaveValue('Ramu Test');
  });
});
