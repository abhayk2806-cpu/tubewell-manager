import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
// Stubbed clock: "now" is 2026-10-06 14:05 IST. A test may move the moment (C-2).
const PAGE_LOAD_MOMENT = { dateKey: '2026-10-06', timeKey: '14:05', monthKey: '2026-10' };
const clock = vi.hoisted(() => ({ moment: { dateKey: '2026-10-06', timeKey: '14:05', monthKey: '2026-10' } }));
vi.mock('@/lib/data/clock', () => ({
  nowIso: () => '2026-10-06T08:35:00.000Z',
  currentIstMoment: () => clock.moment,
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
import { DashboardPage } from './DashboardPage';

// Fictional farmers. Worked numbers (rate 100/hour): A 358.33 charge, paid 100 + 200 (baaki 58.33);
// B 200.00 charge, no payment (baaki 200.00); C only a payment of 50.00 (credit 50.00).
const asha = farmerRow({ id: 'a', name: 'Asha Test' });
const bholu = farmerRow({ id: 'b', name: 'Bholu Test' });
const chhotu = farmerRow({ id: 'c', name: 'Chhotu Test' });
const band = farmerRow({ id: 'd', name: 'Band Test', is_disabled: true });
const gone = farmerRow({ id: 'e', name: 'Gone Test', deleted_at: '2026-10-01T00:00:00+00:00' });

const aUse = usageRow({ id: 'ua', farmer_id: 'a', used_at: '2026-10-02T04:30:00+00:00', hours: 3, minutes: 35 });
const aPay100 = paymentRow({ id: 'pa1', farmer_id: 'a', paid_at: '2026-10-05T05:30:00+00:00', amount_paise: 10000 });
const aPay200 = paymentRow({ id: 'pa2', farmer_id: 'a', paid_at: '2026-10-06T05:30:00+00:00', amount_paise: 20000 });
const bUse = usageRow({ id: 'ub', farmer_id: 'b', used_at: '2026-09-20T04:30:00+00:00', hours: 2, minutes: 0 });
const cPay = paymentRow({ id: 'pc', farmer_id: 'c', paid_at: '2026-08-10T05:30:00+00:00', amount_paise: 5000 });
const dUse = usageRow({ id: 'ud', farmer_id: 'd', used_at: '2026-10-03T04:30:00+00:00', hours: 1, minutes: 0 });
const eUse = usageRow({ id: 'ue', farmer_id: 'e', used_at: '2026-10-04T04:30:00+00:00', hours: 9, minutes: 0 });

const R = String.fromCharCode(0x20b9);

async function renderReady() {
  render(<DashboardPage />, { wrapper: MemoryRouter });
  await screen.findByRole('heading', { level: 2, name: 'Hisaab' });
}

function value(testId: string, scope: HTMLElement = document.body) {
  return within(scope).getByTestId(testId).querySelector('dd')?.textContent ?? '';
}

function tiles() {
  return ['dash-charges', 'dash-cash', 'dash-outstanding', 'dash-credit'].map((id) => value(id));
}

function farmerItems() {
  const list = screen.getByRole('list', { name: 'Kisan' });
  return within(list).getAllByRole('listitem');
}

beforeEach(() => {
  for (const api of [farmerApi, usageApi, paymentApi]) Object.values(api).forEach((fn) => fn.mockReset());
  clock.moment = PAGE_LOAD_MOMENT;
  farmerApi.listFarmers.mockResolvedValue([asha, bholu, chhotu, band, gone]);
  usageApi.listUsage.mockResolvedValue([aUse, bUse, dUse, eUse]);
  paymentApi.listPayments.mockResolvedValue([aPay100, aPay200, cPay]);
});

describe('DashboardPage figures', () => {
  it('All Time: the four separate figures, the explanation and the summary', async () => {
    await renderReady();
    expect(screen.getByRole('button', { name: 'Abhi tak' })).toHaveAttribute('aria-pressed', 'true');
    expect(tiles()).toEqual([`${R}558.33`, `${R}350.00`, `${R}258.33`, `${R}50.00`]);
    expect(screen.getByTestId('period-explain')).toHaveTextContent('aaj tak');
    expect(screen.getByTestId('dash-summary')).toHaveTextContent(
      `2 kisan ka baaki hai. Sabse zyada: Bholu Test ${R}200.00.1 kisan ke paas Advance / Credit hai.`,
    );
  });

  it('outstanding and credit are separate elements; no netted figure is shown anywhere (E18)', async () => {
    await renderReady();
    expect(screen.getByTestId('dash-outstanding')).not.toBe(screen.getByTestId('dash-credit'));
    expect(screen.queryByText(new RegExp(`${R}208\\.33`))).not.toBeInTheDocument();
  });

  it('Mahina: current month first, then another month from the picker', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Mahina' }));
    expect(screen.getByLabelText('Mahina chuno')).toHaveValue('2026-10');
    expect(screen.getByTestId('period-explain')).toHaveTextContent('Oct 2026 mein bana charge aur mila cash');
    expect(tiles()).toEqual([`${R}358.33`, `${R}300.00`, `${R}258.33`, `${R}50.00`]);
    fireEvent.change(screen.getByLabelText('Mahina chuno'), { target: { value: '2026-09' } });
    expect(tiles()).toEqual([`${R}200.00`, `${R}0.00`, `${R}200.00`, `${R}50.00`]);
    // Period views also show each farmer's charge and cash of the period.
    const bholuRow = screen.getByTestId('farmer-b');
    expect(value('row-charges', bholuRow)).toBe(`${R}200.00`);
    expect(value('row-cash', bholuRow)).toBe(`${R}0.00`);
  });

  it('Saal: the current year, same as All Time here', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Saal' }));
    expect(screen.getByLabelText('Saal chuno')).toHaveValue('2026');
    expect(screen.getByTestId('period-explain')).toHaveTextContent('Saal 2026');
    expect(tiles()).toEqual([`${R}558.33`, `${R}350.00`, `${R}258.33`, `${R}50.00`]);
  });

  it('a payment-only month and an empty-activity note', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Mahina' }));
    fireEvent.change(screen.getByLabelText('Mahina chuno'), { target: { value: '2026-08' } });
    expect(tiles()).toEqual([`${R}0.00`, `${R}50.00`, `${R}0.00`, `${R}50.00`]);
    expect(screen.getByTestId('dash-summary')).toHaveTextContent('Kisi kisan ka baaki nahi.');
    expect(screen.queryByText('Is samay mein koi pani entry ya payment nahi.')).not.toBeInTheDocument();
  });
});

describe('DashboardPage chart', () => {
  it('shows the months with data, oldest first, with readable labels and a table alternative', async () => {
    await renderReady();
    const columns = within(screen.getByTestId('chart-columns')).getAllByRole('button');
    expect(columns.map((b) => b.getAttribute('data-testid'))).toEqual(['chart-2026-08', 'chart-2026-09', 'chart-2026-10']);
    expect(columns[2]).toHaveAccessibleName(`Oct 2026: Charge ${R}358.33, Cash Mila ${R}300.00. Is mahine ka hisaab dikhao.`);
    expect(screen.getByRole('table', { name: 'Mahine ke hisaab (table)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Saare mahine/ })).toHaveAttribute('href', '/months');
  });

  it('pressing a month column switches to that month', async () => {
    await renderReady();
    fireEvent.click(screen.getByTestId('chart-2026-09'));
    expect(screen.getByRole('button', { name: 'Mahina' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Mahina chuno')).toHaveValue('2026-09');
    expect(screen.getByTestId('chart-2026-09')).toHaveAttribute('aria-pressed', 'true');
    expect(value('dash-charges')).toBe(`${R}200.00`);
  });
});

describe('DashboardPage farmer list', () => {
  it('active farmers only, highest baaki first; credit only when above zero', async () => {
    await renderReady();
    expect(farmerItems().map((li) => within(li).getAllByRole('link')[0]?.textContent)).toEqual(['Bholu Test', 'Asha Test', 'Chhotu Test']);
    expect(value('row-baaki', screen.getByTestId('farmer-a'))).toBe(`${R}58.33`);
    expect(within(screen.getByTestId('farmer-a')).queryByTestId('row-credit')).not.toBeInTheDocument();
    expect(value('row-credit', screen.getByTestId('farmer-c'))).toBe(`${R}50.00`);
    expect(value('row-baaki', screen.getByTestId('farmer-c'))).toBe(`${R}0.00`);
    expect(within(screen.getByTestId('farmer-a')).queryByTestId('row-charges')).not.toBeInTheDocument();
  });

  it('search filters by name and shows the count; no result has a message', async () => {
    await renderReady();
    expect(screen.getByTestId('farmer-count')).toHaveTextContent('3 / 3 kisan');
    fireEvent.change(screen.getByLabelText('Kisan dhundo'), { target: { value: '  asha ' } });
    expect(farmerItems()).toHaveLength(1);
    expect(screen.getByTestId('farmer-count')).toHaveTextContent('1 / 3 kisan');
    fireEvent.change(screen.getByLabelText('Kisan dhundo'), { target: { value: 'xyz' } });
    expect(screen.getByText('Is naam ka koi kisan nahi mila.')).toBeInTheDocument();
    expect(screen.getByTestId('farmer-count')).toHaveTextContent('0 / 3 kisan');
  });

  it('the name links to the farmer profile', async () => {
    await renderReady();
    expect(within(screen.getByTestId('farmer-a')).getByRole('link', { name: 'Asha Test ka hisaab kholo' })).toHaveAttribute('href', '/farmers/a');
  });

  it('row shortcuts open the dialogs with that farmer pre-selected', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Asha Test: Paisa add' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Kisan')).toHaveValue('a');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rehne do' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Bholu Test: Pani add' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Kisan')).toHaveValue('b');
  });
});

describe('DashboardPage quick buttons', () => {
  it('"Pani add" opens without a farmer, saves, confirms, and the figures update', async () => {
    await renderReady();
    const created = usageRow({ id: 'u9', farmer_id: 'c', used_at: '2026-10-06T08:35:00+00:00', hours: 1, minutes: 0 });
    usageApi.createUsage.mockResolvedValue(created);
    fireEvent.click(screen.getByRole('button', { name: 'Pani add' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Kisan')).toHaveValue('');
    usageApi.listUsage.mockResolvedValue([aUse, bUse, dUse, eUse, created]);
    fireEvent.change(within(dialog).getByLabelText('Kisan'), { target: { value: 'c' } });
    fireEvent.change(within(dialog).getByLabelText('Ghante'), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Pani entry save ho gayi.');
    await waitFor(() => expect(value('dash-charges')).toBe(`${R}658.33`));
  });

  it('"Paisa add" opens without a farmer and takes the moment of opening (C-2)', async () => {
    await renderReady();
    clock.moment = { dateKey: '2026-10-07', timeKey: '00:10', monthKey: '2026-10' };
    fireEvent.click(screen.getByRole('button', { name: 'Paisa add' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Kisan')).toHaveValue('');
    expect(within(dialog).getByLabelText('Tarikh')).toHaveValue('2026-10-07');
    expect(within(dialog).getByLabelText('Samay')).toHaveValue('00:10');
  });
});

describe('DashboardPage recent activity and Band note', () => {
  it('recent: newest first, active farmers only, links to the profile', async () => {
    await renderReady();
    const list = screen.getByRole('list', { name: 'Haal ki entries' });
    expect(within(list).getAllByRole('listitem').map((li) => li.getAttribute('data-testid'))).toEqual([
      'recent-pa2',
      'recent-pa1',
      'recent-ua',
      'recent-ub',
      'recent-pc',
    ]);
    const first = screen.getByTestId('recent-pa2');
    expect(first).toHaveTextContent('Paisa mila · 2026-10-06, 11:00');
    expect(first).toHaveTextContent(`${R}200.00`);
    expect(within(first).getByRole('link', { name: 'Asha Test ka hisaab kholo' })).toHaveAttribute('href', '/farmers/a');
  });

  it('Band note: shown with the Band balances, kept out of the totals', async () => {
    await renderReady();
    const note = screen.getByTestId('band-note');
    expect(note).toHaveTextContent(`1 Band kisan ka hisaab baaki hai: Baaki ${R}100.00, Advance / Credit ${R}0.00.`);
    expect(within(note).getByRole('link', { name: /Kisan list dekho/ })).toHaveAttribute('href', '/farmers');
    expect(value('dash-charges')).toBe(`${R}558.33`);
  });

  it('no Band note when no Band farmer has a balance', async () => {
    usageApi.listUsage.mockResolvedValue([aUse, bUse]);
    await renderReady();
    expect(screen.queryByTestId('band-note')).not.toBeInTheDocument();
  });
});

describe('DashboardPage states', () => {
  it('bad data: one plain message instead of figures', async () => {
    const bad = usageRow({ id: 'bad', farmer_id: 'a', used_at: '2026-10-02T04:30:00+00:00', hours: 1, minutes: 0, total_minutes: null });
    usageApi.listUsage.mockResolvedValue([aUse, bad]);
    render(<DashboardPage />, { wrapper: MemoryRouter });
    expect(await screen.findByRole('alert')).toHaveTextContent('Kuch data galat lag raha hai');
    expect(screen.queryByTestId('dash-charges')).not.toBeInTheDocument();
  });

  it('no active farmers: a message with a link to Kisan', async () => {
    farmerApi.listFarmers.mockResolvedValue([gone]);
    usageApi.listUsage.mockResolvedValue([]);
    paymentApi.listPayments.mockResolvedValue([]);
    render(<DashboardPage />, { wrapper: MemoryRouter });
    expect(await screen.findByText('Abhi koi Chalu kisan nahi.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kisan add karo' })).toHaveAttribute('href', '/farmers');
    expect(screen.queryByTestId('dash-charges')).not.toBeInTheDocument();
  });

  it('farmers without any entry: zeros, the no-activity note and empty sections', async () => {
    usageApi.listUsage.mockResolvedValue([]);
    paymentApi.listPayments.mockResolvedValue([]);
    await renderReady();
    expect(tiles()).toEqual([`${R}0.00`, `${R}0.00`, `${R}0.00`, `${R}0.00`]);
    expect(screen.getByText('Is samay mein koi pani entry ya payment nahi.')).toBeInTheDocument();
    expect(screen.getByText('Abhi koi mahina nahi (na pani entry, na payment).')).toBeInTheDocument();
    expect(screen.getByText('Abhi tak koi entry ya payment nahi.')).toBeInTheDocument();
  });

  it('load error shows the reason and retries', async () => {
    usageApi.listUsage.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    render(<DashboardPage />, { wrapper: MemoryRouter });
    expect(await screen.findByText('Dashboard load nahi ho paya.')).toBeInTheDocument();
    expect(screen.getByText('Internet nahi mil raha. Connection check karke dobara try karo.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dobara try karo' }));
    await screen.findByRole('heading', { level: 2, name: 'Hisaab' });
  });

  it('saved but the refresh failed: figures stay, one line with retry', async () => {
    await renderReady();
    usageApi.createUsage.mockResolvedValue(usageRow({ id: 'u9', farmer_id: 'a', used_at: '2026-10-06T08:35:00+00:00', hours: 1, minutes: 0 }));
    usageApi.listUsage.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Asha Test: Pani add' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Ghante'), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Save ho gaya, par dashboard refresh nahi ho paya.'));
    expect(value('dash-charges')).toBe(`${R}558.33`);
  });
});
