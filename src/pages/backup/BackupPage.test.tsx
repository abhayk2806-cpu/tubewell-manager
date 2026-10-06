import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
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
// Browser helpers: downloads are recorded; the "last backup" storage lives in memory.
const browser = vi.hoisted(() => ({ downloadText: vi.fn(), stored: { value: null as string | null } }));
vi.mock('./browser', () => ({
  downloadText: browser.downloadText,
  readLastBackup: () => browser.stored.value,
  storeLastBackup: (iso: string) => {
    browser.stored.value = iso;
  },
}));

import { DataError } from '@/lib/data';
import { buildBackupFile } from '@/lib/backup';
import { EXPORTED_AT, IDS, payment, workedRows } from '@/lib/backup/test-support/fixture';
import { BackupPage } from './BackupPage';

const R = String.fromCharCode(0xfeff);
const RUPEE = String.fromCharCode(0x20b9);

function dbRows() {
  const rows = workedRows();
  return { ...rows, usage_entries: rows.usage_entries.map((u) => ({ ...u, total_minutes: u.hours * 60 + u.minutes })) };
}

function serveDb(rows = dbRows()) {
  farmerApi.listFarmers.mockResolvedValue(rows.farmers);
  usageApi.listUsage.mockResolvedValue(rows.usage_entries);
  paymentApi.listPayments.mockResolvedValue(rows.payments);
}

const extraPayment = payment('b2000000-0000-4000-8000-000000000099', IDS.asha, '2026-10-06T06:00:00+00:00', 1000);
const fileText = (value: unknown = buildBackupFile(workedRows(), EXPORTED_AT)) => JSON.stringify(value);

const report = (mode: 'merge' | 'replace') => ({
  mode,
  deleted: mode === 'replace' ? { payments: 5, usage_entries: 4, farmers: 5 } : { payments: 0, usage_entries: 0, farmers: 0 },
  inserted: mode === 'replace' ? { farmers: 5, usage_entries: 4, payments: 4 } : { farmers: 0, usage_entries: 0, payments: 0 },
  updated: { farmers: 0, usage_entries: 0, payments: 0 },
});

async function renderReady() {
  render(<BackupPage />, { wrapper: MemoryRouter });
  await waitFor(() => expect(screen.getByRole('button', { name: /Kisan-wise hisaab/ })).toBeEnabled());
}

async function choose(text: string) {
  const file = new File([text], 'backup.json', { type: 'application/json' });
  fireEvent.change(screen.getByLabelText('Backup file chuno (.json)'), { target: { files: [file] } });
}

async function chooseValidFile() {
  await choose(fileText());
  await screen.findByTestId('backup-preview');
}

function downloadedNames(): string[] {
  return browser.downloadText.mock.calls.map((c) => c[0] as string);
}

beforeEach(() => {
  for (const api of [farmerApi, usageApi, paymentApi]) Object.values(api).forEach((fn) => fn.mockReset());
  rpc.mockReset();
  browser.downloadText.mockReset();
  browser.stored.value = null;
  // The current data: the file's rows plus one payment added after the backup.
  const rows = dbRows();
  serveDb({ ...rows, payments: [...rows.payments, extraPayment] });
});

describe('BackupPage reminder', () => {
  it('never: a caution note with the words, and the "this browser only" hint', async () => {
    await renderReady();
    const box = screen.getByTestId('backup-reminder');
    expect(box).toHaveTextContent('Abhi tak koi backup nahi liya.');
    expect(box).toHaveTextContent('sirf isi browser / phone mein');
    expect(box).toHaveClass('text-tone-caution');
  });

  it('today and old', async () => {
    browser.stored.value = '2026-10-06T03:00:00.000Z';
    const { unmount } = render(<BackupPage />, { wrapper: MemoryRouter });
    expect(screen.getByTestId('backup-reminder')).toHaveTextContent('Pichla backup: aaj.');
    expect(screen.getByTestId('backup-reminder')).not.toHaveClass('text-tone-caution');
    unmount();
    browser.stored.value = '2026-09-25T03:00:00.000Z';
    render(<BackupPage />, { wrapper: MemoryRouter });
    expect(screen.getByTestId('backup-reminder')).toHaveTextContent('Pichla backup: 11 din pehle. Naya backup le lo.');
    expect(screen.getByTestId('backup-reminder')).toHaveClass('text-tone-caution');
  });
});

describe('BackupPage JSON and CSV export', () => {
  it('export downloads the file, shows the counts and stores the time', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Backup download karo' }));
    expect(await screen.findByTestId('json-result')).toHaveTextContent('Backup download ho gaya: Kisan 5, Pani entries 4, Payments 5.');
    const [name, text, type] = browser.downloadText.mock.calls[0] as [string, string, string];
    expect([name, type]).toEqual(['tubewell-backup-2026-10-06-1405.json', 'application/json']);
    expect(JSON.parse(text)).toMatchObject({ format: 'tubewell-hisab-backup', version: 1, counts: { farmers: 5, usage_entries: 4, payments: 5 } });
    expect(browser.stored.value).toBe('2026-10-06T08:35:00.000Z');
    expect(screen.getByTestId('backup-reminder')).toHaveTextContent('Pichla backup: aaj.');
  });

  it('a failed export shows the error, downloads nothing and stores no time', async () => {
    await renderReady();
    usageApi.listUsage.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Backup download karo' }));
    expect(await screen.findByTestId('json-result')).toHaveTextContent('Backup nahi bana. Internet nahi mil raha.');
    expect(browser.downloadText).not.toHaveBeenCalled();
    expect(browser.stored.value).toBeNull();
  });

  it('the four CSV buttons download Excel files with a BOM', async () => {
    await renderReady();
    for (const label of ['Kisan-wise hisaab', 'Pani entries', 'Payments', 'Mahine']) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(screen.getByTestId('csv-result')).toHaveTextContent(`${label} CSV download ho gayi.`);
    }
    expect(downloadedNames()).toEqual([
      'tubewell-kisan-hisaab-2026-10-06-1405.csv',
      'tubewell-pani-entries-2026-10-06-1405.csv',
      'tubewell-payments-2026-10-06-1405.csv',
      'tubewell-mahine-2026-10-06-1405.csv',
    ]);
    const kisan = browser.downloadText.mock.calls[0]?.[1] as string;
    expect(kisan.startsWith(`${R}Naam,Mobile,Charge,Cash Mila,Baaki,Advance / Credit`)).toBe(true);
    expect(browser.downloadText.mock.calls[0]?.[2]).toBe('text/csv;charset=utf-8');
  });
});

describe('BackupPage restore: file and preview', () => {
  it('an invalid file shows the problems and no restore button', async () => {
    await renderReady();
    await choose(JSON.stringify({ version: '2.2', farmers: [] }));
    expect(await screen.findByTestId('file-problems')).toHaveTextContent('purane app ki backup file');
    expect(screen.queryByRole('button', { name: 'Haan, merge karo' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('backup-preview')).not.toBeInTheDocument();
  });

  it('an edited file is rejected before anything touches the database', async () => {
    await renderReady();
    const file = JSON.parse(fileText()) as { payments: { amount_paise: number }[] };
    file.payments[0]!.amount_paise = 15000;
    await choose(JSON.stringify(file));
    expect(await screen.findByTestId('file-problems')).toHaveTextContent('File kharab hai ya badli gayi hai');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a valid file: date, counts, the four separate totals and the comparison with the current data', async () => {
    await renderReady();
    await chooseValidFile();
    const preview = screen.getByTestId('backup-preview');
    expect(preview).toHaveTextContent('Backup ka samay: 2026-10-06, 14:05');
    expect(screen.getByTestId('preview-counts')).toHaveTextContent('Kisan 5, Pani entries 4, Payments 4');
    const value = (id: string) => within(screen.getByTestId(id)).getByRole('definition').textContent;
    expect(['preview-charges', 'preview-cash', 'preview-outstanding', 'preview-credit'].map(value)).toEqual([
      `${RUPEE}558.33`,
      `${RUPEE}350.00`,
      `${RUPEE}258.33`,
      `${RUPEE}50.00`,
    ]);
    expect(screen.getByTestId('diff-payments')).toHaveTextContent('Naye 0, Badle 0, Same 4, Sirf abhi ke data mein 1');
    expect(screen.getByTestId('diff-farmers')).toHaveTextContent('Naye 0, Badle 0, Same 5, Sirf abhi ke data mein 0');
  });
});

describe('BackupPage restore: Merge', () => {
  it('one confirmation, the report, "Verified", and the lists reload', async () => {
    await renderReady();
    await chooseValidFile();
    expect(screen.getByText(/Kuch bhi delete nahi hoga/)).toBeInTheDocument();
    rpc.mockResolvedValue({ data: report('merge'), error: null, status: 200 });
    const listsBefore = farmerApi.listFarmers.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Haan, merge karo' }));
    expect(await screen.findByTestId('restore-verify')).toHaveTextContent('Verified: file ki saari rows database mein hain.');
    expect(screen.getByTestId('restore-report')).toHaveTextContent('Jode: Kisan 0, Pani entries 0, Payments 0');
    expect(rpc).toHaveBeenCalledWith('restore_backup', expect.objectContaining({ p_mode: 'merge' }));
    await waitFor(() => expect(farmerApi.listFarmers.mock.calls.length).toBeGreaterThanOrEqual(listsBefore + 2));
  });

  it('no double submit: the button is disabled while the restore runs', async () => {
    await renderReady();
    await chooseValidFile();
    rpc.mockReturnValue(new Promise(() => {}));
    const button = screen.getByRole('button', { name: 'Haan, merge karo' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('a restore error says nothing changed and never shows success', async () => {
    await renderReady();
    await chooseValidFile();
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'owner only' }, status: 403 });
    fireEvent.click(screen.getByRole('button', { name: 'Haan, merge karo' }));
    expect(await screen.findByTestId('restore-failed')).toHaveTextContent('Restore nahi hua, kuch nahi badla. Sirf owner restore kar sakta hai.');
    expect(screen.queryByTestId('restore-report')).not.toBeInTheDocument();
  });
});

describe('BackupPage restore: Replace', () => {
  async function toReplace() {
    await renderReady();
    await chooseValidFile();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
  }

  it('red warning with the rows that will be lost; safety backup first, then the typed word', async () => {
    await toReplace();
    expect(screen.getByTestId('replace-lost')).toHaveTextContent('Abhi ki 1 rows file mein nahi hain');
    const final = screen.getByRole('button', { name: '3. Replace karo' });
    const word = screen.getByLabelText('2. Pakka karne ke liye likho: REPLACE');
    expect(final).toBeDisabled();
    expect(word).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '1. Pehle abhi ka safety backup download karo' }));
    expect(await screen.findByTestId('safety-result')).toHaveTextContent('Safety backup download ho gaya: Kisan 5, Pani entries 4, Payments 5.');
    expect(downloadedNames()).toEqual(['tubewell-backup-2026-10-06-1405.json']);
    fireEvent.change(word, { target: { value: 'replace' } });
    expect(final).toBeDisabled();
    fireEvent.change(word, { target: { value: 'REPLACE' } });
    expect(final).toBeEnabled();

    rpc.mockResolvedValue({ data: report('replace'), error: null, status: 200 });
    serveDb(); // after Replace the database holds exactly the file
    fireEvent.click(final);
    expect(await screen.findByTestId('restore-verify')).toHaveTextContent('Verified: database ab file jaisa hai.');
    expect(screen.getByTestId('restore-report')).toHaveTextContent('Hataye: Kisan 5, Pani entries 4, Payments 5');
    expect(rpc).toHaveBeenCalledWith('restore_backup', expect.objectContaining({ p_mode: 'replace' }));
  });

  it('a failed safety backup stops Replace: nothing is sent', async () => {
    await toReplace();
    paymentApi.listPayments.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    fireEvent.click(screen.getByRole('button', { name: '1. Pehle abhi ka safety backup download karo' }));
    expect(await screen.findByTestId('safety-result')).toHaveTextContent('Safety backup nahi bana, isliye Replace roka gaya. Kuch nahi badla.');
    expect(screen.getByLabelText('2. Pakka karne ke liye likho: REPLACE')).toBeDisabled();
    expect(screen.getByRole('button', { name: '3. Replace karo' })).toBeDisabled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a verification mismatch shows the numbers in red', async () => {
    await toReplace();
    fireEvent.click(screen.getByRole('button', { name: '1. Pehle abhi ka safety backup download karo' }));
    await screen.findByTestId('safety-result');
    fireEvent.change(screen.getByLabelText('2. Pakka karne ke liye likho: REPLACE'), { target: { value: 'REPLACE' } });
    rpc.mockResolvedValue({ data: report('replace'), error: null, status: 200 });
    fireEvent.click(screen.getByRole('button', { name: '3. Replace karo' }));
    const verify = await screen.findByTestId('restore-verify');
    expect(verify).toHaveTextContent('Jaanch mein farak mila. Database mein ab Kisan 5, Pani entries 4, Payments 5');
    expect(verify).toHaveTextContent(`Baaki ${RUPEE}248.33, Advance / Credit ${RUPEE}50.00`);
  });
});
