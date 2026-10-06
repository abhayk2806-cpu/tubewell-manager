import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
// Stubbed clock: "now" is 2026-10-06 14:05 IST.
vi.mock('@/lib/data/clock', () => ({
  nowIso: () => '2026-10-06T08:35:00.000Z',
  currentIstMoment: () => ({ dateKey: '2026-10-06', timeKey: '14:05', monthKey: '2026-10' }),
}));
const farmerApi = vi.hoisted(() => ({
  listFarmers: vi.fn(),
  createFarmer: vi.fn(),
  updateFarmer: vi.fn(),
  setFarmerDisabled: vi.fn(),
  softDeleteFarmer: vi.fn(),
  restoreFarmer: vi.fn(),
}));
vi.mock('@/lib/data/farmers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/farmers')>()),
  ...farmerApi,
}));
const usageApi = vi.hoisted(() => ({
  listUsage: vi.fn(),
  createUsage: vi.fn(),
  updateUsage: vi.fn(),
  softDeleteUsage: vi.fn(),
  restoreUsage: vi.fn(),
}));
vi.mock('@/lib/data/usage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/usage')>()),
  ...usageApi,
}));
const paymentApi = vi.hoisted(() => ({
  listPayments: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  softDeletePayment: vi.fn(),
  restorePayment: vi.fn(),
}));
vi.mock('@/lib/data/payments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/payments')>()),
  ...paymentApi,
}));

import { DataError } from '@/lib/data';
import { farmerRow, paymentRow, usageRow } from '@/lib/data/test-support/fakeSupabase';
import { PaymentsPage } from './PaymentsPage';

// Fictional farmers only.
const ramu = farmerRow({ id: 'r', name: 'Ramu Test' });
const shyam = farmerRow({ id: 's', name: 'Shyam Test' });
const band = farmerRow({ id: 'b', name: 'Band Test', is_disabled: true });
const gone = farmerRow({ id: 'g', name: 'Gone Test', deleted_at: '2026-10-01T00:00:00+00:00' });

// One 3 h 35 min entry at 100/hour in the current IST month = 35833 paise.
const entry = usageRow({ id: 'u1', farmer_id: 'r', used_at: '2026-10-02T04:30:00+00:00', hours: 3, minutes: 35 });

const pa = paymentRow({ id: 'pa', farmer_id: 'r', paid_at: '2026-10-05T05:30:00+00:00', amount_paise: 10000, note: 'pehla' }); // 11:00 IST
const pb = paymentRow({ id: 'pb', farmer_id: 's', paid_at: '2026-10-03T05:30:00+00:00', amount_paise: 5000 });
const pc = paymentRow({ id: 'pc', farmer_id: 'r', paid_at: '2026-09-20T05:30:00+00:00', amount_paise: 2000 });
const pd = paymentRow({ id: 'pd', farmer_id: 'b', paid_at: '2026-10-04T05:30:00+00:00', amount_paise: 1000 });
// Deleted at 2026-10-05T20:00Z = 2026-10-06 01:30 IST.
const pe = paymentRow({ id: 'pe', farmer_id: 's', paid_at: '2026-10-04T06:30:00+00:00', amount_paise: 700, deleted_at: '2026-10-05T20:00:00+00:00' });

const R = String.fromCharCode(0x20b9);

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function renderReady() {
  render(<PaymentsPage />);
  await screen.findByRole('button', { name: /^Payments \(/ });
}

function items() {
  return within(screen.getByRole('list')).getAllByRole('listitem');
}

function row(text: string) {
  const item = items().find((li) => li.textContent?.includes(text));
  if (!item) throw new Error(`row ${text} not found`);
  return within(item);
}

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function openAdd() {
  fireEvent.click(screen.getByRole('button', { name: 'Naya Payment' }));
  return screen.findByRole('dialog');
}

function figure(testId: string) {
  return screen.getByTestId(testId).querySelector('dd')?.textContent ?? '';
}

beforeEach(() => {
  for (const api of [farmerApi, usageApi, paymentApi]) Object.values(api).forEach((fn) => fn.mockReset());
  farmerApi.listFarmers.mockResolvedValue([ramu, shyam, band, gone]);
  usageApi.listUsage.mockResolvedValue([entry]);
  paymentApi.listPayments.mockResolvedValue([pa, pb, pc, pd, pe]);
});

describe('PaymentsPage list', () => {
  it('opens on the current IST month with counts, newest first, IST time, amount and note', async () => {
    render(<PaymentsPage />);
    expect(screen.getByText('Payments load ho rahe hain...')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Payments (3)' });
    expect(screen.getByRole('button', { name: 'Deleted (1)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mahina')).toHaveValue('2026-10');
    expect(items().map((li) => li.querySelector('p')?.textContent)).toEqual(['Ramu Test', 'Band Test', 'Shyam Test']);
    const first = row('Ramu Test');
    expect(first.getByText('2026-10-05, 11:00')).toBeInTheDocument();
    expect(first.getByText(`${R}100.00`)).toBeInTheDocument();
    expect(first.getByText('pehla')).toBeInTheDocument();
  });

  it('farmer and month filters apply to the list and both counts', async () => {
    await renderReady();
    expect(within(screen.getByLabelText('Mahina')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Oct 2026',
      'Sep 2026',
      'Sabhi mahine',
    ]);
    expect(within(screen.getByLabelText('Kisan')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Sabhi kisan',
      'Band Test (Band)',
      'Ramu Test',
      'Shyam Test',
    ]);
    change('Kisan', 'r');
    expect(screen.getByRole('button', { name: 'Payments (1)' })).toBeInTheDocument();
    change('Mahina', 'all');
    expect(screen.getByRole('button', { name: 'Payments (2)' })).toBeInTheDocument();
    change('Kisan', 's');
    expect(screen.getByRole('button', { name: 'Deleted (1)' })).toBeInTheDocument();
    change('Mahina', '2026-09');
    expect(screen.getByText('In filters ke liye koi payment nahi mila.')).toBeInTheDocument();
  });

  it('empty states per segment', async () => {
    paymentApi.listPayments.mockResolvedValue([]);
    await renderReady();
    expect(screen.getByText("Abhi koi payment nahi hai. 'Naya Payment' dabao.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deleted (0)' }));
    expect(screen.getByText('Koi deleted payment nahi hai.')).toBeInTheDocument();
  });

  it('load error shows the reason and retries', async () => {
    paymentApi.listPayments.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    render(<PaymentsPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Payments load nahi ho paye.');
    expect(alert).toHaveTextContent('Internet nahi mil raha.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Dobara try karo' }));
    await screen.findByRole('button', { name: 'Payments (3)' });
  });

  it('delete asks first (cancel keeps it), confirm soft-deletes; the text says baaki/advance can change', async () => {
    await renderReady();
    fireEvent.click(row('Shyam Test').getByRole('button', { name: 'Delete' }));
    let confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent("Payment 'Deleted' mein chala jayega aur wahan se wapas laaya ja sakta hai.");
    expect(confirm).toHaveTextContent('Kisan ka baaki / advance badal sakta hai');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Rehne do' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(paymentApi.softDeletePayment).not.toHaveBeenCalled();

    paymentApi.softDeletePayment.mockResolvedValue({ ...pb, deleted_at: '2026-10-06T08:35:00+00:00' });
    fireEvent.click(row('Shyam Test').getByRole('button', { name: 'Delete' }));
    confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Haan, delete karo' }));
    await waitFor(() => expect(paymentApi.softDeletePayment).toHaveBeenCalledWith('pb'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Payment delete ho gaya. 'Deleted' mein milega."));
  });

  it('Recently Deleted shows the IST delete date and restores', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Deleted (1)' }));
    expect(row('Shyam Test').getByText('Delete hua: 2026-10-06')).toBeInTheDocument();
    paymentApi.restorePayment.mockResolvedValue({ ...pe, deleted_at: null });
    fireEvent.click(row('Shyam Test').getByRole('button', { name: 'Wapas lao' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Payment wapas aa gaya.'));
    expect(paymentApi.restorePayment).toHaveBeenCalledWith('pe');
  });

  it('saved but the reload failed: the list stays with a retry line', async () => {
    await renderReady();
    paymentApi.restorePayment.mockResolvedValue({ ...pe, deleted_at: null });
    paymentApi.listPayments.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Deleted (1)' }));
    fireEvent.click(row('Shyam Test').getByRole('button', { name: 'Wapas lao' }));
    const status = screen.getByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Save ho gaya, par list refresh nahi ho payi.'));
    expect(items()).toHaveLength(1);
  });
});

describe('PaymentsPage form and live preview', () => {
  it('add: active farmers only, empty amount, field errors', async () => {
    await renderReady();
    const dialog = await openAdd();
    const select = within(dialog).getByLabelText('Kisan');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Kisan chuno', 'Ramu Test', 'Shyam Test']);
    expect(screen.getByLabelText('Tarikh')).toHaveValue('2026-10-06');
    expect(screen.getByLabelText('Samay')).toHaveValue('14:05');
    expect(screen.getByLabelText('Rakam (rupaye)')).toHaveValue('');
    expect(within(dialog).getByText('Kisan chuno, to uska hisaab yahan dikhega.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/mahina|month/i)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    expect(within(dialog).getByText('Kisan chuno.')).toBeInTheDocument();
    expect(within(dialog).getByText('Rakam bharo.')).toBeInTheDocument();
    change('Rakam (rupaye)', '1,000');
    change('Note (optional)', 'n'.repeat(201));
    expect(within(dialog).getByText('Rakam aise likho: 500 ya 500.50 (comma ya minus nahi).')).toBeInTheDocument();
    expect(within(dialog).getByText('Note 200 akshar se lamba nahi ho sakta.')).toBeInTheDocument();
    expect(paymentApi.createPayment).not.toHaveBeenCalled();
  });

  it('(a) first payment of 100.00: current 358.33 / 0.00, piece Oct 2026 100.00, after 258.33 / 0.00; saves', async () => {
    paymentApi.listPayments.mockResolvedValue([]);
    paymentApi.createPayment.mockResolvedValue(pa);
    await renderReady();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: 'r' } });
    expect(figure('preview-current-outstanding')).toBe(`${R}358.33`);
    expect(figure('preview-current-credit')).toBe(`${R}0.00`);

    change('Rakam (rupaye)', '100');
    expect(figure('preview-before-outstanding')).toBe(`${R}358.33`);
    expect(figure('preview-before-credit')).toBe(`${R}0.00`);
    expect(figure('preview-piece-2026-10')).toBe(`${R}100.00`);
    expect(within(screen.getByTestId('preview-piece-2026-10')).getByText('Oct 2026')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-unapplied')).not.toBeInTheDocument();
    expect(figure('preview-after-outstanding')).toContain(`${R}258.33`);
    expect(figure('preview-after-outstanding')).toContain(`(abhi ${R}358.33)`);
    expect(figure('preview-after-credit')).toContain(`${R}0.00`);
    expect(screen.queryByTestId('preview-credit-created')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(paymentApi.createPayment).toHaveBeenCalledWith({
      farmer_id: 'r',
      paid_at: '2026-10-06T14:05:00+05:30',
      amount_paise: 10000,
      note: null,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Payment save ho gaya.');
  });

  it('(b) second payment of 300.00: piece 258.33, Advance / Credit 41.67, after 0.00 / 41.67; never a netted figure', async () => {
    paymentApi.listPayments.mockResolvedValue([pa]);
    await renderReady();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: 'r' } });
    change('Rakam (rupaye)', '300');
    expect(figure('preview-before-outstanding')).toBe(`${R}258.33`);
    expect(figure('preview-piece-2026-10')).toBe(`${R}258.33`);
    expect(figure('preview-unapplied')).toBe(`${R}41.67`);
    expect(within(screen.getByTestId('preview-unapplied')).getByText('Advance / Credit')).toBeInTheDocument();
    expect(figure('preview-after-outstanding')).toContain(`${R}0.00`);
    expect(figure('preview-after-credit')).toContain(`${R}41.67`);
    expect(screen.getByTestId('preview-credit-created')).toHaveTextContent(`Is payment se naya Advance / Credit: ${R}41.67`);
    // Outstanding and credit are separate elements; the netted -41.67 appears nowhere (E18).
    expect(screen.getByTestId('preview-after-outstanding')).not.toBe(screen.getByTestId('preview-after-credit'));
    expect(screen.getByTestId('payment-preview')).not.toHaveTextContent(`-${R}`);
  });

  it('(c) editing the 300.00 payment to 200.00: farmer read-only; Pehle 0.00 / 41.67, Baad mein 58.33 / 0.00', async () => {
    const p2 = paymentRow({ id: 'p2', farmer_id: 'r', paid_at: '2026-10-06T05:30:00+00:00', amount_paise: 30000 });
    paymentApi.listPayments.mockResolvedValue([pa, p2]);
    paymentApi.updatePayment.mockResolvedValue({ ...p2, amount_paise: 20000 });
    await renderReady();
    const editButtons = items().filter((li) => li.textContent?.includes(`${R}300.00`));
    fireEvent.click(within(editButtons[0] as HTMLElement).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Payment badlo')).toBeInTheDocument();
    const farmerField = within(dialog).getByLabelText('Kisan');
    expect(farmerField.tagName).toBe('INPUT');
    expect(farmerField).toHaveAttribute('readonly');
    expect(farmerField).toHaveValue('Ramu Test');
    expect(within(dialog).getByText('Payment ka kisan badla nahi ja sakta.')).toBeInTheDocument();
    expect(screen.getByLabelText('Rakam (rupaye)')).toHaveValue('300.00');
    expect(screen.getByLabelText('Samay')).toHaveValue('11:00');

    expect(within(dialog).getByText('Pehle')).toBeInTheDocument();
    expect(figure('preview-before-outstanding')).toBe(`${R}0.00`);
    expect(figure('preview-before-credit')).toBe(`${R}41.67`);
    change('Rakam (rupaye)', '200');
    expect(within(dialog).getByText('Baad mein')).toBeInTheDocument();
    expect(figure('preview-before-outstanding')).toBe(`${R}0.00`);
    expect(figure('preview-before-credit')).toBe(`${R}41.67`);
    expect(figure('preview-after-outstanding')).toBe(`${R}58.33`);
    expect(figure('preview-after-credit')).toBe(`${R}0.00`);
    expect(screen.queryByTestId('preview-credit-created')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(paymentApi.updatePayment).toHaveBeenCalledWith(p2, {
      farmer_id: 'r',
      paid_at: '2026-10-06T11:00:00+05:30',
      amount_paise: 20000,
      note: null,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Payment badal diya gaya.');
  });

  it('preview unavailable: usage failed to load; the message replaces numbers and Save stays allowed', async () => {
    usageApi.listUsage.mockRejectedValue(new DataError('network', null, 'offline'));
    await renderReady();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: 'r' } });
    expect(within(dialog).getByText(/Pani entries load nahi hui/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save karo' })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rehne do' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('bad data (null total_minutes) shows a message instead of numbers and disables Save', async () => {
    usageApi.listUsage.mockResolvedValue([{ ...entry, total_minutes: null }]);
    await renderReady();
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: 'r' } });
    change('Rakam (rupaye)', '100');
    expect(within(dialog).getByText(/Is kisan ke data mein gadbad hai/)).toBeInTheDocument();
    expect(screen.queryByTestId('preview-after-outstanding')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save karo' })).toBeDisabled();
  });

  it('duplicate warning: "Wapas jao, badlo" goes back; "Phir bhi save karo" saves', async () => {
    await renderReady();
    paymentApi.createPayment.mockResolvedValue(pa);
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: 'r' } });
    change('Tarikh', '2026-10-05');
    change('Rakam (rupaye)', '100');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    let warning = within(dialog).getByRole('alert');
    expect(warning).toHaveTextContent('isi din, itni hi rakam ka payment pehle se hai');
    expect(warning).toHaveTextContent(`11:00 - ${R}100.00`);
    fireEvent.click(within(warning).getByRole('button', { name: 'Wapas jao, badlo' }));
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(paymentApi.createPayment).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    warning = within(dialog).getByRole('alert');
    fireEvent.click(within(warning).getByRole('button', { name: 'Phir bhi save karo' }));
    await waitFor(() => expect(paymentApi.createPayment).toHaveBeenCalledTimes(1));
  });

  it('future date warning never blocks', async () => {
    await renderReady();
    paymentApi.createPayment.mockResolvedValue(pa);
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: 's' } });
    change('Tarikh', '2026-10-07');
    change('Rakam (rupaye)', '50');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    const warning = within(dialog).getByRole('alert');
    expect(warning).toHaveTextContent('Yeh tarikh aaj ke baad ki hai.');
    fireEvent.click(within(warning).getByRole('button', { name: 'Phir bhi save karo' }));
    await waitFor(() =>
      expect(paymentApi.createPayment).toHaveBeenCalledWith(expect.objectContaining({ paid_at: '2026-10-07T14:05:00+05:30', amount_paise: 5000 })),
    );
  });

  it('no double submit: save disabled while pending', async () => {
    await renderReady();
    const save = deferred<typeof pa>();
    paymentApi.createPayment.mockReturnValue(save.promise);
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: 's' } });
    change('Rakam (rupaye)', '75');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    const saving = await within(dialog).findByRole('button', { name: 'Save ho raha hai...' });
    expect(saving).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Rakam (rupaye)').closest('form') as HTMLFormElement);
    expect(paymentApi.createPayment).toHaveBeenCalledTimes(1);
    save.resolve(pa);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
