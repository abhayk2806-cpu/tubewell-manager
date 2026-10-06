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

import { DataError } from '@/lib/data';
import { farmerRow, usageRow } from '@/lib/data/test-support/fakeSupabase';
import { UsagePage } from './UsagePage';

// Fictional farmers only.
const ramu = farmerRow({ id: 'r', name: 'Ramu Test' });
const shyam = farmerRow({ id: 's', name: 'Shyam Test' });
const band = farmerRow({ id: 'b', name: 'Band Test', is_disabled: true });
const gone = farmerRow({ id: 'g', name: 'Gone Test', deleted_at: '2026-10-01T00:00:00+00:00' });

const u1 = usageRow({ id: 'u1', farmer_id: 'r', used_at: '2026-10-06T04:00:00+00:00', hours: 3, minutes: 35 }); // 09:30 IST
const u2 = usageRow({ id: 'u2', farmer_id: 's', used_at: '2026-10-02T04:00:00+00:00', hours: 1, minutes: 0 });
const u3 = usageRow({ id: 'u3', farmer_id: 'r', used_at: '2026-09-20T04:00:00+00:00', hours: 2, minutes: 0 });
const u4 = usageRow({ id: 'u4', farmer_id: 'b', used_at: '2026-10-03T04:00:00+00:00', hours: 0, minutes: 30 });
// Deleted at 2026-10-05T20:00Z = 2026-10-06 01:30 IST.
const u5 = usageRow({ id: 'u5', farmer_id: 's', used_at: '2026-10-04T04:00:00+00:00', hours: 1, minutes: 0, deleted_at: '2026-10-05T20:00:00+00:00' });

const R = String.fromCharCode(0x20b9);

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function renderReady() {
  render(<UsagePage />);
  await screen.findByRole('button', { name: /^Entries \(/ });
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
  fireEvent.click(screen.getByRole('button', { name: 'Naya Pani Entry' }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  Object.values(farmerApi).forEach((fn) => fn.mockReset());
  Object.values(usageApi).forEach((fn) => fn.mockReset());
  farmerApi.listFarmers.mockResolvedValue([ramu, shyam, band, gone]);
  usageApi.listUsage.mockResolvedValue([u1, u2, u3, u4, u5]);
});

describe('UsagePage', () => {
  it('opens on the current IST month with counts, newest first, with IST time and amounts', async () => {
    render(<UsagePage />);
    expect(screen.getByText('Entries load ho rahi hain...')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Entries (3)' });
    expect(screen.getByRole('button', { name: 'Deleted (1)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mahina')).toHaveValue('2026-10');
    expect(items().map((li) => li.querySelector('p')?.textContent)).toEqual(['Ramu Test', 'Band Test', 'Shyam Test']);
    const first = row('Ramu Test');
    expect(first.getByText('2026-10-06, 09:30')).toBeInTheDocument();
    expect(first.getByText(`3 ghante 35 minute · ${R}100.00/ghanta`)).toBeInTheDocument();
    expect(first.getByText(`${R}358.33`)).toBeInTheDocument();
    expect(screen.queryByText('2026-09-20, 09:30')).not.toBeInTheDocument();
  });

  it('farmer and month filters apply to the list and both counts', async () => {
    await renderReady();
    const monthOptions = within(screen.getByLabelText('Mahina')).getAllByRole('option').map((o) => o.textContent);
    expect(monthOptions).toEqual(['Oct 2026', 'Sep 2026', 'Sabhi mahine']);
    const farmerOptions = within(screen.getByLabelText('Kisan')).getAllByRole('option').map((o) => o.textContent);
    expect(farmerOptions).toEqual(['Sabhi kisan', 'Band Test (Band)', 'Ramu Test', 'Shyam Test']);

    change('Kisan', 'r');
    expect(screen.getByRole('button', { name: 'Entries (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deleted (0)' })).toBeInTheDocument();
    change('Mahina', 'all');
    expect(screen.getByRole('button', { name: 'Entries (2)' })).toBeInTheDocument();
    expect(screen.getByText('2026-09-20, 09:30')).toBeInTheDocument();
    change('Kisan', 's');
    expect(screen.getByRole('button', { name: 'Deleted (1)' })).toBeInTheDocument();
  });

  it('empty states: nothing at all, and nothing for these filters', async () => {
    usageApi.listUsage.mockResolvedValue([]);
    await renderReady();
    expect(screen.getByText("Abhi koi pani entry nahi hai. 'Naya Pani Entry' dabao.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deleted (0)' }));
    expect(screen.getByText('Koi deleted entry nahi hai.')).toBeInTheDocument();
  });

  it('empty for these filters', async () => {
    await renderReady();
    change('Mahina', '2026-09');
    change('Kisan', 's');
    expect(screen.getByText('In filters ke liye koi entry nahi mili.')).toBeInTheDocument();
  });

  it('add: defaults, active farmers only, field errors, live amount and save', async () => {
    await renderReady();
    const created = usageRow({ id: 'u9', farmer_id: 's', used_at: '2026-10-06T08:35:00+00:00', hours: 2, minutes: 0 });
    usageApi.createUsage.mockResolvedValue(created);
    const dialog = await openAdd();
    expect(within(dialog).getByText('Pani Entry karo')).toBeInTheDocument();
    const farmerSelect = within(dialog).getByLabelText('Kisan');
    expect(within(farmerSelect).getAllByRole('option').map((o) => o.textContent)).toEqual(['Kisan chuno', 'Ramu Test', 'Shyam Test']);
    expect(screen.getByLabelText('Tarikh')).toHaveValue('2026-10-06');
    expect(screen.getByLabelText('Samay')).toHaveValue('14:05');
    expect(screen.getByLabelText('Ghante')).toHaveValue('0');
    expect(screen.getByLabelText('Minute')).toHaveValue('0');
    expect(screen.getByLabelText('Rate (rupaye per ghanta)')).toHaveValue('100');
    expect(screen.queryByTestId('usage-amount')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    expect(within(dialog).getByText('Kisan chuno.')).toBeInTheDocument();
    expect(within(dialog).getByText('Ghante ya minute mein se kuch to bharo.')).toBeInTheDocument();
    expect(usageApi.createUsage).not.toHaveBeenCalled();

    fireEvent.change(farmerSelect, { target: { value: 's' } });
    change('Ghante', '2');
    expect(screen.getByTestId('usage-amount')).toHaveTextContent(`Rakam: ${R}200.00`);
    change('Minute', '15');
    expect(screen.getByTestId('usage-amount')).toHaveTextContent(`Rakam: ${R}225.00`);
    change('Minute', '0');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(usageApi.createUsage).toHaveBeenCalledWith({
      farmer_id: 's',
      used_at: '2026-10-06T14:05:00+05:30',
      hours: 2,
      minutes: 0,
      rate_paise: 10000,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Pani entry save ho gayi.');
  });

  it('add: bad rate text and a cleared hours field show their own messages', async () => {
    await renderReady();
    const dialog = await openAdd();
    change('Ghante', '');
    change('Rate (rupaye per ghanta)', '1,000');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    expect(within(dialog).getByText('Ghante bharo (0 bhi chalega).')).toBeInTheDocument();
    expect(within(dialog).getByText('Rate aise likho: 100 ya 100.50 (comma ya minus nahi).')).toBeInTheDocument();
    expect(screen.getByLabelText('Rate (rupaye per ghanta)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('duplicate warning: "Wapas jao, badlo" goes back; "Phir bhi save karo" saves', async () => {
    await renderReady();
    usageApi.createUsage.mockResolvedValue(u1);
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: 'r' } });
    change('Ghante', '3');
    change('Minute', '35');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    let warning = within(dialog).getByRole('alert');
    expect(warning).toHaveTextContent('isi din, itne hi ghante-minute ki entry pehle se hai');
    expect(warning).toHaveTextContent('09:30 - 3 ghante 35 minute');
    fireEvent.click(within(warning).getByRole('button', { name: 'Wapas jao, badlo' }));
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(usageApi.createUsage).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    warning = within(dialog).getByRole('alert');
    fireEvent.click(within(warning).getByRole('button', { name: 'Phir bhi save karo' }));
    await waitFor(() => expect(usageApi.createUsage).toHaveBeenCalledTimes(1));
  });

  it('long duration and future date warnings never block', async () => {
    await renderReady();
    usageApi.createUsage.mockResolvedValue(u1);
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: 's' } });
    change('Ghante', '25');
    change('Tarikh', '2026-10-07');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    const warning = within(dialog).getByRole('alert');
    expect(warning).toHaveTextContent('Is entry ka kul samay 24 ghante se zyada hai.');
    expect(warning).toHaveTextContent('Yeh tarikh aaj ke baad ki hai.');
    fireEvent.click(within(warning).getByRole('button', { name: 'Phir bhi save karo' }));
    await waitFor(() =>
      expect(usageApi.createUsage).toHaveBeenCalledWith(expect.objectContaining({ hours: 25, used_at: '2026-10-07T14:05:00+05:30' })),
    );
  });

  it('edit: prefilled in IST with the rate in rupees; saving the own entry does not warn', async () => {
    await renderReady();
    usageApi.updateUsage.mockResolvedValue({ ...u1, rate_paise: 12000 });
    fireEvent.click(row('Ramu Test').getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Pani Entry badlo')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Kisan')).toHaveValue('r');
    expect(screen.getByLabelText('Tarikh')).toHaveValue('2026-10-06');
    expect(screen.getByLabelText('Samay')).toHaveValue('09:30');
    expect(screen.getByLabelText('Ghante')).toHaveValue('3');
    expect(screen.getByLabelText('Minute')).toHaveValue('35');
    expect(screen.getByLabelText('Rate (rupaye per ghanta)')).toHaveValue('100.00');
    change('Rate (rupaye per ghanta)', '120');
    expect(screen.getByTestId('usage-amount')).toHaveTextContent(`Rakam: ${R}430.00`);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(usageApi.updateUsage).toHaveBeenCalledWith(u1, {
      farmer_id: 'r',
      used_at: '2026-10-06T09:30:00+05:30',
      hours: 3,
      minutes: 35,
      rate_paise: 12000,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Entry badal di gayi.');
  });

  it("edit: an entry of a Band farmer still shows that farmer", async () => {
    await renderReady();
    fireEvent.click(row('Band Test').getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText('Kisan');
    expect(select).toHaveValue('b');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Kisan chuno',
      'Band Test (Band)',
      'Ramu Test',
      'Shyam Test',
    ]);
  });

  it('delete asks first; cancel keeps it, confirm soft-deletes', async () => {
    await renderReady();
    fireEvent.click(row('Shyam Test').getByRole('button', { name: 'Delete' }));
    let confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent("Entry 'Deleted' mein chali jayegi aur wahan se wapas laayi ja sakti hai.");
    fireEvent.click(within(confirm).getByRole('button', { name: 'Rehne do' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(usageApi.softDeleteUsage).not.toHaveBeenCalled();

    usageApi.softDeleteUsage.mockResolvedValue({ ...u2, deleted_at: '2026-10-06T08:35:00+00:00' });
    fireEvent.click(row('Shyam Test').getByRole('button', { name: 'Delete' }));
    confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Haan, delete karo' }));
    await waitFor(() => expect(usageApi.softDeleteUsage).toHaveBeenCalledWith('u2'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Entry delete ho gayi. 'Deleted' mein milegi."));
  });

  it('Recently Deleted shows the IST delete date and restores', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Deleted (1)' }));
    expect(row('Shyam Test').getByText('Delete hua: 2026-10-06')).toBeInTheDocument();
    usageApi.restoreUsage.mockResolvedValue({ ...u5, deleted_at: null });
    fireEvent.click(row('Shyam Test').getByRole('button', { name: 'Wapas lao' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Entry wapas aa gayi.'));
    expect(usageApi.restoreUsage).toHaveBeenCalledWith('u5');
  });

  it('load error shows the reason and retries', async () => {
    usageApi.listUsage.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    render(<UsagePage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Pani entries load nahi ho payi.');
    expect(alert).toHaveTextContent('Internet nahi mil raha.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Dobara try karo' }));
    await screen.findByRole('button', { name: 'Entries (3)' });
  });

  it('a row whose amount cannot be computed puts the page into an error state, never a guess', async () => {
    usageApi.listUsage.mockResolvedValue([u1, { ...u2, total_minutes: null }]);
    render(<UsagePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ek entry ka data theek nahi hai');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Naya Pani Entry' })).toBeDisabled();
  });

  it('saved but the reload failed: list stays with a retry line', async () => {
    await renderReady();
    usageApi.restoreUsage.mockResolvedValue({ ...u5, deleted_at: null });
    usageApi.listUsage.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Deleted (1)' }));
    fireEvent.click(row('Shyam Test').getByRole('button', { name: 'Wapas lao' }));
    const status = screen.getByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Save ho gaya, par list refresh nahi ho payi.'));
    expect(items()).toHaveLength(1);
  });

  it('no double submit: save disabled while pending', async () => {
    await renderReady();
    const save = deferred<typeof u1>();
    usageApi.createUsage.mockReturnValue(save.promise);
    const dialog = await openAdd();
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: 's' } });
    change('Ghante', '1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    const saving = await within(dialog).findByRole('button', { name: 'Save ho raha hai...' });
    expect(saving).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Ghante').closest('form') as HTMLFormElement);
    expect(usageApi.createUsage).toHaveBeenCalledTimes(1);
    save.resolve(u1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
