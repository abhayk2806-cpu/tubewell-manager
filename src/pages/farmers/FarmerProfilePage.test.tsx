import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
// Stubbed clock: "now" is 2026-10-06 14:05 IST. A test may move the moment to check that a dialog
// takes a fresh one when it opens (C-2).
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
import { FarmerProfilePage } from './FarmerProfilePage';

// Fictional farmers only.
const ramu = farmerRow({ id: 'r', name: 'Ramu Test', mobile: '91111 22222', notes: 'khet 4' });
const band = farmerRow({ id: 'b', name: 'Band Test', is_disabled: true });
const gone = farmerRow({ id: 'g', name: 'Gone Test', deleted_at: '2026-10-01T00:00:00+00:00' });

// Worked numbers: one 3 h 35 min entry at 100/hour = 35833 paise.
const entry = usageRow({ id: 'u1', farmer_id: 'r', used_at: '2026-10-02T04:30:00+00:00', hours: 3, minutes: 35 });
const p100 = paymentRow({ id: 'p100', farmer_id: 'r', paid_at: '2026-10-05T05:30:00+00:00', amount_paise: 10000, note: 'pehla' });
const p200 = paymentRow({ id: 'p200', farmer_id: 'r', paid_at: '2026-10-06T05:30:00+00:00', amount_paise: 20000 });
const p300 = paymentRow({ id: 'p300', farmer_id: 'r', paid_at: '2026-10-06T05:30:00+00:00', amount_paise: 30000 });

const R = String.fromCharCode(0x20b9);

function renderAt(id: string) {
  render(
    <MemoryRouter initialEntries={[`/farmers/${id}`]}>
      <Routes>
        <Route path="/farmers/:id" element={<FarmerProfilePage />} />
        <Route path="/farmers" element={<p>Kisan list screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function renderReady(id = 'r') {
  renderAt(id);
  await screen.findByRole('heading', { level: 2, name: 'Kul hisaab' });
}

function value(testId: string, scope: HTMLElement = document.body) {
  return within(scope).getByTestId(testId).querySelector('dd')?.textContent ?? '';
}

beforeEach(() => {
  clock.moment = PAGE_LOAD_MOMENT;
  for (const api of [farmerApi, usageApi, paymentApi]) Object.values(api).forEach((fn) => fn.mockReset());
  farmerApi.listFarmers.mockResolvedValue([ramu, band, gone]);
  usageApi.listUsage.mockResolvedValue([entry]);
  paymentApi.listPayments.mockResolvedValue([p100, p200]);
});

describe('FarmerProfilePage figures', () => {
  it('payments 100 + 200: totals, Partial month, trails, usage and ledger, all from the engine', async () => {
    renderAt('r');
    expect(screen.getByText('Hisaab load ho raha hai...')).toBeInTheDocument();
    await screen.findByRole('heading', { level: 2, name: 'Kul hisaab' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ramu Test');
    expect(screen.getByText('91111 22222')).toBeInTheDocument();
    expect(screen.getByText('khet 4')).toBeInTheDocument();

    expect(value('total-charges')).toBe(`${R}358.33`);
    expect(value('total-paid')).toBe(`${R}300.00`);
    expect(value('total-outstanding')).toBe(`${R}58.33`);
    expect(value('total-credit')).toBe(`${R}0.00`);
    expect(screen.queryByTestId('profile-credit-badge')).not.toBeInTheDocument();

    const month = screen.getByTestId('month-2026-10');
    expect(within(month).getByText('Oct 2026')).toBeInTheDocument();
    expect(within(month).getByTestId('month-status')).toHaveTextContent('Partial');
    expect(within(month).getByText('3 ghante 35 minute')).toBeInTheDocument();
    expect(value('month-charge', month)).toBe(`${R}358.33`);
    expect(value('month-paid', month)).toBe(`${R}300.00`);
    expect(value('month-remaining', month)).toBe(`${R}58.33`);
    expect(value('month-cash', month)).toBe(`${R}300.00`);

    const first = screen.getByTestId('payment-p100');
    expect(within(first).getByText('2026-10-05, 11:00')).toBeInTheDocument();
    expect(within(first).getByText('pehla')).toBeInTheDocument();
    expect(value('trail-2026-10', first)).toBe(`${R}100.00`);
    expect(value('trail-2026-10', screen.getByTestId('payment-p200'))).toBe(`${R}200.00`);
    expect(screen.queryByTestId('trail-advance')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Payments (2)' })).toBeInTheDocument();

    const usage = screen.getByTestId('usage-u1');
    expect(within(usage).getByText('2026-10-02, 10:00')).toBeInTheDocument();
    expect(within(usage).getByText(`${R}358.33`)).toBeInTheDocument();
    expect(within(usage).getByText(`3 ghante 35 minute · ${R}100.00/ghanta`)).toBeInTheDocument();

    expect(screen.getAllByTestId('ledger-balance').map((e) => e.textContent)).toEqual([
      `Baaki ${R}58.33`,
      `Baaki ${R}258.33`,
      `Baaki ${R}358.33`,
    ]);
  });

  it('payments 100 + 300: Advance / Credit badge, trail remainder 41.67, ledger ends in Advance; never a netted figure', async () => {
    paymentApi.listPayments.mockResolvedValue([p100, p300]);
    await renderReady();
    expect(screen.getByTestId('profile-credit-badge')).toHaveTextContent(`Advance / Credit: ${R}41.67`);
    expect(value('total-outstanding')).toBe(`${R}0.00`);
    expect(value('total-credit')).toBe(`${R}41.67`);
    expect(screen.getByTestId('total-outstanding')).not.toBe(screen.getByTestId('total-credit'));
    const second = screen.getByTestId('payment-p300');
    expect(value('trail-2026-10', second)).toBe(`${R}258.33`);
    expect(value('trail-advance', second)).toBe(`${R}41.67`);
    expect(within(screen.getByTestId('trail-advance')).getByText('Advance / Credit')).toBeInTheDocument();
    expect(screen.getAllByTestId('ledger-balance').map((e) => e.textContent)).toEqual([
      `Advance ${R}41.67`,
      `Baaki ${R}258.33`,
      `Baaki ${R}358.33`,
    ]);
    expect(screen.getByTestId('month-status')).toHaveTextContent('Settled');
    // outstanding - credit would be -41.67: no element shows a negative or netted amount (E18).
    expect(document.body).not.toHaveTextContent(`-${R}`);
  });

  it('a payment-only month shows "Sirf Payment" with its cash; the over-payment shows as Advance in the ledger', async () => {
    const exact = paymentRow({ id: 'px', farmer_id: 'r', paid_at: '2026-10-05T05:30:00+00:00', amount_paise: 35833 });
    const sept = paymentRow({ id: 'ps', farmer_id: 'r', paid_at: '2026-09-10T05:30:00+00:00', amount_paise: 5000 });
    paymentApi.listPayments.mockResolvedValue([exact, sept]);
    await renderReady();
    expect(within(screen.getByTestId('month-2026-09')).getByTestId('month-status')).toHaveTextContent('Sirf Payment');
    expect(value('month-cash', screen.getByTestId('month-2026-09'))).toBe(`${R}50.00`);
    const balances = screen.getAllByTestId('ledger-balance').map((e) => e.textContent);
    expect(balances).toContain(`Advance ${R}50.00`);
  });

  it('zero balance shows Barabar', async () => {
    const exact = paymentRow({ id: 'px', farmer_id: 'r', paid_at: '2026-10-05T05:30:00+00:00', amount_paise: 35833 });
    paymentApi.listPayments.mockResolvedValue([exact]);
    await renderReady();
    expect(screen.getAllByTestId('ledger-balance')[0]).toHaveTextContent('Barabar');
  });

  it('empty sections for a farmer without rows', async () => {
    usageApi.listUsage.mockResolvedValue([]);
    paymentApi.listPayments.mockResolvedValue([]);
    await renderReady();
    expect(screen.getByText('Abhi tak koi payment nahi.')).toBeInTheDocument();
    expect(screen.getByText('Abhi tak koi pani entry nahi.')).toBeInTheDocument();
    expect(screen.getByText('Abhi koi mahina nahi (na pani entry, na payment).')).toBeInTheDocument();
    expect(value('total-outstanding')).toBe(`${R}0.00`);
  });
});

describe('FarmerProfilePage states', () => {
  it('a Band farmer opens with the badge and without the shortcut buttons', async () => {
    usageApi.listUsage.mockResolvedValue([]);
    paymentApi.listPayments.mockResolvedValue([]);
    await renderReady('b');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Band Test');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Band');
    expect(screen.queryByRole('button', { name: 'Pani add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Paisa add' })).not.toBeInTheDocument();
  });

  it.each(['g', 'unknown-id'])('"%s" shows Kisan nahi mila with a link back', async (id) => {
    renderAt(id);
    expect(await screen.findByText('Kisan nahi mila.')).toBeInTheDocument();
    expect(screen.queryByTestId('total-charges')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Kisan list par wapas' }));
    expect(await screen.findByText('Kisan list screen')).toBeInTheDocument();
  });

  it('bad data shows a plain message and hides the figures', async () => {
    usageApi.listUsage.mockResolvedValue([{ ...entry, total_minutes: null }]);
    renderAt('r');
    expect(await screen.findByText(/Is kisan ke data mein kuch gadbad lag rahi hai/)).toBeInTheDocument();
    expect(screen.queryByTestId('total-charges')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mahine ke hisaab' })).not.toBeInTheDocument();
  });

  it('load error shows the reason and retries', async () => {
    paymentApi.listPayments.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    renderAt('r');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Hisaab load nahi ho paya.');
    expect(alert).toHaveTextContent('Internet nahi mil raha.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Dobara try karo' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Kul hisaab' })).toBeInTheDocument();
  });

  it('"Aur dikhao" shows 30 more each time (usage and ledger)', async () => {
    const many = Array.from({ length: 35 }, (_, i) =>
      usageRow({ id: `m${String(i).padStart(2, '0')}`, farmer_id: 'r', used_at: `2026-10-0${1 + (i % 5)}T0${i % 10}:00:00+00:00`, hours: 1, minutes: 0 }),
    );
    usageApi.listUsage.mockResolvedValue(many);
    paymentApi.listPayments.mockResolvedValue([]);
    await renderReady();
    const usageSection = screen.getByRole('heading', { name: 'Pani entries (35)' }).closest('section') as HTMLElement;
    expect(within(usageSection).getAllByTestId(/^usage-/)).toHaveLength(30);
    fireEvent.click(within(usageSection).getByRole('button', { name: 'Aur dikhao (5 aur)' }));
    expect(within(usageSection).getAllByTestId(/^usage-/)).toHaveLength(35);
    expect(within(usageSection).queryByRole('button', { name: /Aur dikhao/ })).not.toBeInTheDocument();
    const ledgerSection = screen.getByRole('heading', { name: 'Hisaab ki line (35)' }).closest('section') as HTMLElement;
    expect(within(ledgerSection).getAllByTestId('ledger-balance')).toHaveLength(30);
    expect(within(ledgerSection).getByRole('button', { name: 'Aur dikhao (5 aur)' })).toBeInTheDocument();
  });
});

describe('FarmerProfilePage shortcuts', () => {
  it('"Pani add" opens the Pani dialog with this farmer pre-selected and confirms the save', async () => {
    await renderReady();
    usageApi.createUsage.mockResolvedValue(usageRow({ id: 'u2', farmer_id: 'r', used_at: '2026-10-06T08:35:00+00:00', hours: 1, minutes: 0 }));
    fireEvent.click(screen.getByRole('button', { name: 'Pani add' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Kisan')).toHaveValue('r');
    fireEvent.change(within(dialog).getByLabelText('Ghante'), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(usageApi.createUsage).toHaveBeenCalledWith(expect.objectContaining({ farmer_id: 'r', hours: 1, minutes: 0 }));
    expect(screen.getByRole('status')).toHaveTextContent('Pani entry save ho gayi.');
  });

  it('"Paisa add" opens the Paisa dialog with this farmer and its live preview', async () => {
    paymentApi.listPayments.mockResolvedValue([]);
    await renderReady();
    paymentApi.createPayment.mockResolvedValue(p100);
    fireEvent.click(screen.getByRole('button', { name: 'Paisa add' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Kisan')).toHaveValue('r');
    expect(within(dialog).getByTestId('preview-current-outstanding').querySelector('dd')?.textContent).toBe(`${R}358.33`);
    fireEvent.change(within(dialog).getByLabelText('Rakam (rupaye)'), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(paymentApi.createPayment).toHaveBeenCalledWith(expect.objectContaining({ farmer_id: 'r', amount_paise: 10000 }));
    expect(screen.getByRole('status')).toHaveTextContent('Payment save ho gaya.');
  });

  it('saved but the refresh failed: figures stay, one line with retry', async () => {
    await renderReady();
    usageApi.createUsage.mockResolvedValue(usageRow({ id: 'u2', farmer_id: 'r', used_at: '2026-10-06T08:35:00+00:00', hours: 1, minutes: 0 }));
    usageApi.listUsage.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Pani add' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Ghante'), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Save ho gaya, par hisaab refresh nahi ho paya.'));
    expect(value('total-charges')).toBe(`${R}358.33`);
  });

  it.each(['Pani add', 'Paisa add'])('"%s" takes the IST moment of opening, not of page load (C-2)', async (button) => {
    paymentApi.listPayments.mockResolvedValue([]);
    await renderReady();
    clock.moment = { dateKey: '2026-10-07', timeKey: '00:10', monthKey: '2026-10' };
    fireEvent.click(screen.getByRole('button', { name: button }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Tarikh')).toHaveValue('2026-10-07');
    expect(within(dialog).getByLabelText('Samay')).toHaveValue('00:10');
  });
});
