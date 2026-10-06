import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
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
import { MonthsPage } from './MonthsPage';

// Fictional farmers and the worked numbers (rate 100/hour): A 3 h 35 min in Sep, payments 100 + 200
// in Oct; B 2 h 00 min in Oct; C only a payment of 50 in Aug. One more entry in 2025 for the filter.
const asha = farmerRow({ id: 'a', name: 'Asha Test' });
const bholu = farmerRow({ id: 'b', name: 'Bholu Test' });
const chhotu = farmerRow({ id: 'c', name: 'Chhotu Test' });
const band = farmerRow({ id: 'd', name: 'Band Test', is_disabled: true });
const gone = farmerRow({ id: 'e', name: 'Gone Test', deleted_at: '2026-10-01T00:00:00+00:00' });

const aUse = usageRow({ id: 'ua', farmer_id: 'a', used_at: '2026-09-10T04:30:00+00:00', hours: 3, minutes: 35 });
const aPay1 = paymentRow({ id: 'pa1', farmer_id: 'a', paid_at: '2026-10-02T04:30:00+00:00', amount_paise: 10000 });
const aPay2 = paymentRow({ id: 'pa2', farmer_id: 'a', paid_at: '2026-10-03T04:30:00+00:00', amount_paise: 20000 });
const bUse = usageRow({ id: 'ub', farmer_id: 'b', used_at: '2026-10-05T04:30:00+00:00', hours: 2, minutes: 0 });
const cPay = paymentRow({ id: 'pc', farmer_id: 'c', paid_at: '2026-08-12T04:30:00+00:00', amount_paise: 5000 });
const dUse = usageRow({ id: 'ud', farmer_id: 'd', used_at: '2026-07-03T04:30:00+00:00', hours: 4, minutes: 0 });
const old = usageRow({ id: 'u25', farmer_id: 'c', used_at: '2025-11-03T04:30:00+00:00', hours: 1, minutes: 0 });
const oldPay = paymentRow({ id: 'p25', farmer_id: 'c', paid_at: '2025-11-04T04:30:00+00:00', amount_paise: 10000 });

const R = String.fromCharCode(0x20b9);

async function renderReady(path = '/months') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <MonthsPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Mahine' });
  await screen.findByLabelText('Saal');
}

function value(testId: string, scope: HTMLElement) {
  return within(scope).getByTestId(testId).querySelector('dd')?.textContent ?? '';
}

function card(monthKey: string) {
  return screen.getByTestId(`month-${monthKey}`);
}

function monthKeys() {
  return within(screen.getByRole('region', { name: 'Har mahina' }))
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-testid'))
    .filter((id) => id?.startsWith('month-'));
}

beforeEach(() => {
  for (const api of [farmerApi, usageApi, paymentApi]) Object.values(api).forEach((fn) => fn.mockReset());
  farmerApi.listFarmers.mockResolvedValue([asha, bholu, chhotu, band, gone]);
  usageApi.listUsage.mockResolvedValue([aUse, bUse, dUse, old]);
  paymentApi.listPayments.mockResolvedValue([aPay1, aPay2, cPay, oldPay]);
});

describe('MonthsPage list', () => {
  it('newest first with the exact figures, words and counts; Band farmers never appear', async () => {
    await renderReady();
    expect(monthKeys()).toEqual(['month-2026-10', 'month-2026-09', 'month-2026-08', 'month-2025-11']);
    const oct = card('2026-10');
    expect(within(oct).getByRole('heading', { name: 'Oct 2026' })).toBeInTheDocument();
    expect(['month-time', 'month-charge', 'month-paid', 'month-remaining', 'month-cash'].map((id) => value(id, oct))).toEqual([
      '2 ghante 0 minute',
      `${R}200.00`,
      `${R}0.00`,
      `${R}200.00`,
      `${R}300.00`,
    ]);
    expect(within(oct).getByTestId('month-status')).toHaveTextContent('Unpaid');
    expect(within(oct).getByTestId('month-counts')).toHaveTextContent('1 entry, 2 payment');
    const sep = card('2026-09');
    expect(['month-time', 'month-charge', 'month-paid', 'month-remaining', 'month-cash'].map((id) => value(id, sep))).toEqual([
      '3 ghante 35 minute',
      `${R}358.33`,
      `${R}300.00`,
      `${R}58.33`,
      `${R}0.00`,
    ]);
    expect(within(sep).getByTestId('month-status')).toHaveTextContent('Partial');
    expect(screen.queryByTestId('month-2026-07')).not.toBeInTheDocument();
  });

  it('status by word and tone; "Sirf Payment" for a payment-only month; Baaki muted at zero', async () => {
    await renderReady();
    const aug = card('2026-08');
    const badge = within(aug).getByTestId('month-status');
    expect(badge).toHaveTextContent('Sirf Payment');
    expect(badge).toHaveClass('text-tone-credit');
    expect(within(card('2026-10')).getByTestId('month-status')).toHaveClass('text-tone-due');
    expect(within(card('2026-09')).getByTestId('month-status')).toHaveClass('text-tone-caution');
    expect(within(aug).getByTestId('month-remaining').querySelector('dd')).toHaveClass('text-muted-foreground');
    expect(within(card('2026-10')).getByTestId('month-remaining').querySelector('dd')).toHaveClass('text-tone-due');
    expect(within(aug).getByTestId('month-cash').querySelector('dd')).toHaveClass('text-tone-cash');
  });

  it('explains the four figures once, incl. Unpaid with Cash Mila', async () => {
    await renderReady();
    const explain = screen.getByRole('region', { name: 'Yeh figures kya batate hain' });
    expect(explain).toHaveTextContent('baad ke mahine ka payment bhi lag sakta hai');
    expect(explain).toHaveTextContent('kabhi "Unpaid" ke saath bhi Cash Mila dikhta hai');
  });
});

describe('MonthsPage year filter and strip', () => {
  it('all years by default; the strip has time, Charge and Cash Mila (no Baaki) and links to the Dashboard', async () => {
    await renderReady();
    expect(screen.getByLabelText('Saal')).toHaveValue('all');
    const strip = screen.getByTestId('months-strip');
    expect(within(strip).getByRole('heading', { name: 'Sabhi mahino ka jod' })).toBeInTheDocument();
    expect([value('strip-time', strip), value('strip-charge', strip), value('strip-cash', strip)]).toEqual([
      '6 ghante 35 minute',
      `${R}658.33`,
      `${R}450.00`,
    ]);
    expect(within(strip).getByRole('link', { name: /Dashboard kholo/ })).toHaveAttribute('href', '/');
  });

  it('year 2026 narrows the list and the strip to the worked numbers', async () => {
    await renderReady();
    expect(within(screen.getByLabelText('Saal')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sabhi saal', '2026', '2025']);
    fireEvent.change(screen.getByLabelText('Saal'), { target: { value: '2026' } });
    expect(monthKeys()).toEqual(['month-2026-10', 'month-2026-09', 'month-2026-08']);
    const strip = screen.getByTestId('months-strip');
    expect(within(strip).getByRole('heading', { name: 'Saal 2026 ka jod' })).toBeInTheDocument();
    expect([value('strip-charge', strip), value('strip-cash', strip)]).toEqual([`${R}558.33`, `${R}350.00`]);
    fireEvent.change(screen.getByLabelText('Saal'), { target: { value: 'all' } });
    expect(monthKeys()).toHaveLength(4);
  });
});

describe('MonthsPage breakdown', () => {
  it('cards start closed; the button opens the farmer-wise list (B before A) with links', async () => {
    await renderReady();
    const oct = card('2026-10');
    const button = within(oct).getByRole('button', { name: 'Kisan-wise dekho (2)' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).not.toBeNull();
    fireEvent.click(button);
    expect(within(oct).getByRole('button', { name: 'Band karo' })).toHaveAttribute('aria-expanded', 'true');
    const list = within(oct).getByRole('list', { name: 'Oct 2026: kisan-wise' });
    expect(within(list).getAllByRole('listitem').map((li) => li.getAttribute('data-testid'))).toEqual(['breakdown-b', 'breakdown-a']);
    const a = within(list).getByTestId('breakdown-a');
    expect(within(a).getByTestId('month-status')).toHaveTextContent('Sirf Payment');
    expect(value('month-cash', a)).toBe(`${R}300.00`);
    expect(value('month-charge', a)).toBe(`${R}0.00`);
    expect(within(a).getByRole('link', { name: 'Asha Test ka hisaab kholo' })).toHaveAttribute('href', '/farmers/a');
    fireEvent.click(within(oct).getByRole('button', { name: 'Band karo' }));
    expect(within(oct).queryByRole('list', { name: 'Oct 2026: kisan-wise' })).not.toBeInTheDocument();
  });

  it('several months can be open at once', async () => {
    await renderReady();
    fireEvent.click(within(card('2026-10')).getByRole('button', { name: /Kisan-wise dekho/ }));
    fireEvent.click(within(card('2026-09')).getByRole('button', { name: /Kisan-wise dekho/ }));
    expect(within(card('2026-10')).getByRole('list', { name: 'Oct 2026: kisan-wise' })).toBeInTheDocument();
    expect(within(card('2026-09')).getAllByTestId(/^breakdown-/).map((li) => li.getAttribute('data-testid'))).toEqual(['breakdown-a']);
  });

  it('more than 30 farmers: the first 30, then "Aur dikhao"', async () => {
    const many = Array.from({ length: 32 }, (_, i) => farmerRow({ id: `f${String(i).padStart(2, '0')}`, name: `Kisan ${String(i).padStart(2, '0')}` }));
    const uses = many.map((f, i) => usageRow({ id: `u${i}`, farmer_id: f.id, used_at: '2026-10-02T04:30:00+00:00', hours: 1, minutes: 0 }));
    farmerApi.listFarmers.mockResolvedValue(many);
    usageApi.listUsage.mockResolvedValue(uses);
    paymentApi.listPayments.mockResolvedValue([]);
    await renderReady();
    fireEvent.click(within(card('2026-10')).getByRole('button', { name: 'Kisan-wise dekho (32)' }));
    expect(within(card('2026-10')).getAllByTestId(/^breakdown-/)).toHaveLength(30);
    fireEvent.click(within(card('2026-10')).getByRole('button', { name: 'Aur dikhao (2 aur)' }));
    expect(within(card('2026-10')).getAllByTestId(/^breakdown-/)).toHaveLength(32);
  });
});

describe('MonthsPage deep link', () => {
  it('?month=2025-11 opens that month and sets its year', async () => {
    await renderReady('/months?month=2025-11');
    expect(screen.getByLabelText('Saal')).toHaveValue('2025');
    expect(monthKeys()).toEqual(['month-2025-11']);
    expect(within(card('2025-11')).getByRole('button', { name: 'Band karo' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(card('2025-11')).getByTestId('breakdown-c')).toBeInTheDocument();
  });

  it.each(['2026-07', '2026-13', 'kal'])('an unknown or invalid month (%s) is ignored silently', async (value) => {
    await renderReady(`/months?month=${value}`);
    expect(screen.getByLabelText('Saal')).toHaveValue('all');
    expect(monthKeys()).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Band karo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('MonthsPage states', () => {
  it('bad data: one plain message instead of figures', async () => {
    usageApi.listUsage.mockResolvedValue([usageRow({ id: 'bad', farmer_id: 'a', used_at: '2026-10-02T04:30:00+00:00', hours: 1, minutes: 0, total_minutes: null })]);
    render(<MonthsPage />, { wrapper: MemoryRouter });
    expect(await screen.findByRole('alert')).toHaveTextContent('Kuch data galat lag raha hai');
    expect(screen.queryByTestId('months-strip')).not.toBeInTheDocument();
  });

  it('no active farmer: a message with a link to Kisan', async () => {
    farmerApi.listFarmers.mockResolvedValue([band, gone]);
    render(<MonthsPage />, { wrapper: MemoryRouter });
    expect(await screen.findByText('Abhi koi Chalu kisan nahi.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kisan add karo' })).toHaveAttribute('href', '/farmers');
  });

  it('no month yet', async () => {
    usageApi.listUsage.mockResolvedValue([]);
    paymentApi.listPayments.mockResolvedValue([]);
    render(<MonthsPage />, { wrapper: MemoryRouter });
    expect(await screen.findByText('Abhi koi mahina nahi (na pani entry, na payment).')).toBeInTheDocument();
  });

  it('load error shows the reason and retries', async () => {
    paymentApi.listPayments.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    render(<MonthsPage />, { wrapper: MemoryRouter });
    expect(await screen.findByText('Mahine load nahi ho paye.')).toBeInTheDocument();
    expect(screen.getByText('Internet nahi mil raha. Connection check karke dobara try karo.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dobara try karo' }));
    expect(await screen.findByLabelText('Saal')).toBeInTheDocument();
  });
});
