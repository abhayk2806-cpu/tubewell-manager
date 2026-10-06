import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const api = vi.hoisted(() => ({
  listFarmers: vi.fn(),
  createFarmer: vi.fn(),
  updateFarmer: vi.fn(),
  setFarmerDisabled: vi.fn(),
  softDeleteFarmer: vi.fn(),
  restoreFarmer: vi.fn(),
}));
vi.mock('@/lib/data/farmers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/farmers')>()),
  ...api,
}));

import { DataError } from '@/lib/data';
import { farmerRow } from '@/lib/data/test-support/fakeSupabase';
import { FarmersPage } from './FarmersPage';

// Fictional farmers only.
const amar = farmerRow({ id: 'a', name: 'Amar Test', mobile: '91111 22222' });
const ramu = farmerRow({ id: 'r', name: 'Ramu Test', notes: 'khet number 4' });
const band = farmerRow({ id: 'b', name: 'Band Test', is_disabled: true });
// 2026-10-05T20:00Z is 2026-10-06 01:30 IST: the shown date must be the IST date.
const gone = farmerRow({ id: 'g', name: 'Gone Test', deleted_at: '2026-10-05T20:00:00+00:00' });

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function renderReady() {
  render(<FarmersPage />, { wrapper: MemoryRouter });
  await screen.findByRole('button', { name: /^Chalu \(/ });
}

function list() {
  return screen.getByRole('list');
}

function row(name: string) {
  const item = within(list())
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(name));
  if (!item) throw new Error(`row ${name} not found`);
  return within(item);
}

function openSegment(label: 'Chalu' | 'Band' | 'Deleted') {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} \\(`) }));
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listFarmers.mockResolvedValue([ramu, amar, band, gone]);
});

describe('FarmersPage', () => {
  it('shows loading, then the three segments with counts and the active list sorted by name', async () => {
    render(<FarmersPage />, { wrapper: MemoryRouter });
    expect(screen.getByText('Kisan load ho rahe hain...')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Chalu (2)' });
    expect(screen.getByRole('button', { name: 'Band (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deleted (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chalu (2)' })).toHaveAttribute('aria-pressed', 'true');
    const names = within(list()).getAllByRole('link').map((a) => a.textContent);
    expect(names).toEqual(['Amar Test', 'Ramu Test']);
    expect(screen.getByText('khet number 4')).toBeInTheDocument();
    expect(screen.queryByText(/₹|paise|Baki/)).not.toBeInTheDocument();
  });

  it('searches by name and by mobile, with a no-results message', async () => {
    await renderReady();
    fill('Kisan dhundo', '  RAMU ');
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1);
    fill('Kisan dhundo', '22222');
    expect(row('Amar Test').getByText('91111 22222')).toBeInTheDocument();
    fill('Kisan dhundo', 'nobody');
    expect(screen.getByText('Is naam ya mobile ka koi kisan nahi mila.')).toBeInTheDocument();
  });

  it('shows the empty state of each segment', async () => {
    api.listFarmers.mockResolvedValue([]);
    await renderReady();
    expect(screen.getByText("Abhi koi chalu kisan nahi hai. 'Naya Kisan' dabao.")).toBeInTheDocument();
    openSegment('Band');
    expect(screen.getByText('Koi band kisan nahi hai.')).toBeInTheDocument();
    openSegment('Deleted');
    expect(screen.getByText('Koi deleted kisan nahi hai.')).toBeInTheDocument();
  });

  it('add: validation errors sit next to the fields and nothing is saved', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Naya Kisan' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Kisan Add karo')).toBeInTheDocument();
    fill('Mobile (optional)', 'abc');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    expect(within(dialog).getByText('Naam bharo.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Mobile mein kam se kam ek number ho/)).toBeInTheDocument();
    expect(screen.getByLabelText('Naam')).toHaveAttribute('aria-invalid', 'true');
    expect(api.createFarmer).not.toHaveBeenCalled();
  });

  it('add: saves, closes the dialog and announces success', async () => {
    await renderReady();
    const shyam = farmerRow({ id: 's', name: 'Shyam Test' });
    api.createFarmer.mockResolvedValue(shyam);
    fireEvent.click(screen.getByRole('button', { name: 'Naya Kisan' }));
    await screen.findByRole('dialog');
    fill('Naam', ' Shyam Test ');
    fill('Notes (optional)', 'naya kisan');
    api.listFarmers.mockResolvedValue([ramu, amar, band, gone, shyam]);
    fireEvent.click(screen.getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.createFarmer).toHaveBeenCalledWith({ name: ' Shyam Test ', mobile: '', notes: 'naya kisan' });
    expect(screen.getByRole('status')).toHaveTextContent('Shyam Test add ho gaya.');
    expect(screen.getByRole('button', { name: 'Chalu (3)' })).toBeInTheDocument();
  });

  it('add: a same-name farmer gives a warning with "Naam badlo" and "Phir bhi save karo"', async () => {
    await renderReady();
    api.createFarmer.mockResolvedValue(farmerRow({ id: 'r2', name: 'Ramu Test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Naya Kisan' }));
    const dialog = await screen.findByRole('dialog');
    fill('Naam', '  ramu   TEST ');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    const warning = within(dialog).getByRole('alert');
    expect(warning).toHaveTextContent('Is naam ka kisan pehle se hai:');
    expect(warning).toHaveTextContent('Ramu Test - Chalu');
    expect(api.createFarmer).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Naam badlo' }));
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Naam')).toHaveFocus();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Phir bhi save karo' }));
    await waitFor(() => expect(api.createFarmer).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('edit: prefilled form, saves through updateFarmer with the original row', async () => {
    await renderReady();
    api.updateFarmer.mockResolvedValue({ ...amar, mobile: '93333 44444' });
    fireEvent.click(row('Amar Test').getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Kisan Edit karo')).toBeInTheDocument();
    expect(screen.getByLabelText('Naam')).toHaveValue('Amar Test');
    fill('Mobile (optional)', '93333 44444');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.updateFarmer).toHaveBeenCalledWith(amar, { name: 'Amar Test', mobile: '93333 44444', notes: '' });
    expect(screen.getByRole('status')).toHaveTextContent('Amar Test save ho gaya.');
  });

  it('edit: renaming to another farmer\'s name warns, but the farmer itself does not count', async () => {
    await renderReady();
    fireEvent.click(row('Amar Test').getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    fill('Naam', 'Ramu Test');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Ramu Test');
    fill('Naam', 'AMAR test');
    api.updateFarmer.mockResolvedValue(amar);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    await waitFor(() => expect(api.updateFarmer).toHaveBeenCalledTimes(1));
  });

  it('disable and enable, with success messages', async () => {
    await renderReady();
    api.setFarmerDisabled.mockResolvedValue({ ...amar, is_disabled: true });
    fireEvent.click(row('Amar Test').getByRole('button', { name: 'Band karo' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Amar Test band ho gaya.'));
    expect(api.setFarmerDisabled).toHaveBeenCalledWith('a', true);

    openSegment('Band');
    api.setFarmerDisabled.mockResolvedValue({ ...band, is_disabled: false });
    fireEvent.click(row('Band Test').getByRole('button', { name: 'Chalu karo' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Band Test chalu ho gaya.'));
    expect(api.setFarmerDisabled).toHaveBeenCalledWith('b', false);
  });

  it('delete asks first; cancel does nothing, confirm soft-deletes', async () => {
    await renderReady();
    fireEvent.click(row('Ramu Test').getByRole('button', { name: 'Delete' }));
    let confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Ramu Test ko delete karein?');
    expect(confirm).toHaveTextContent('pani aur paisa ka saara hisaab safe rahega');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Rehne do' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.softDeleteFarmer).not.toHaveBeenCalled();

    api.softDeleteFarmer.mockResolvedValue({ ...ramu, deleted_at: '2026-10-06T10:00:00+00:00' });
    fireEvent.click(row('Ramu Test').getByRole('button', { name: 'Delete' }));
    confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Haan, delete karo' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.softDeleteFarmer).toHaveBeenCalledWith('r');
    expect(screen.getByRole('status')).toHaveTextContent("Ramu Test delete ho gaya. 'Deleted' mein milega.");
  });

  it('Deleted shows the IST delete date; restore without a duplicate runs at once', async () => {
    await renderReady();
    openSegment('Deleted');
    expect(row('Gone Test').getByText('Delete hua: 2026-10-06')).toBeInTheDocument();
    api.restoreFarmer.mockResolvedValue({ ...gone, deleted_at: null });
    fireEvent.click(row('Gone Test').getByRole('button', { name: 'Wapas lao' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Gone Test wapas aa gaya.'));
    expect(api.restoreFarmer).toHaveBeenCalledWith('g');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('restore with a same-name farmer warns first; both choices work', async () => {
    const goneRamu = farmerRow({ id: 'g2', name: 'ramu test', deleted_at: '2026-10-05T20:00:00+00:00' });
    api.listFarmers.mockResolvedValue([ramu, amar, goneRamu]);
    await renderReady();
    openSegment('Deleted');
    fireEvent.click(row('ramu test').getByRole('button', { name: 'Wapas lao' }));
    let warning = await screen.findByRole('alertdialog');
    expect(warning).toHaveTextContent('Is naam ka kisan pehle se list mein hai:');
    expect(warning).toHaveTextContent('Ramu Test');
    fireEvent.click(within(warning).getByRole('button', { name: 'Rehne do' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.restoreFarmer).not.toHaveBeenCalled();

    api.restoreFarmer.mockResolvedValue({ ...goneRamu, deleted_at: null });
    fireEvent.click(row('ramu test').getByRole('button', { name: 'Wapas lao' }));
    warning = await screen.findByRole('alertdialog');
    fireEvent.click(within(warning).getByRole('button', { name: 'Phir bhi wapas lao' }));
    await waitFor(() => expect(api.restoreFarmer).toHaveBeenCalledWith('g2'));
  });

  it('load error shows the reason and a retry button that reloads', async () => {
    api.listFarmers.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    render(<FarmersPage />, { wrapper: MemoryRouter });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kisan ki list load nahi ho payi.');
    expect(alert).toHaveTextContent('Internet nahi mil raha.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Dobara try karo' }));
    await screen.findByRole('button', { name: 'Chalu (2)' });
  });

  it('a mobile without any digit is rejected (D23)', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: 'Naya Kisan' }));
    const dialog = await screen.findByRole('dialog');
    fill('Naam', 'Digit Test');
    fill('Mobile (optional)', '+ -');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    expect(within(dialog).getByText(/Mobile mein kam se kam ek number ho/)).toBeInTheDocument();
    expect(api.createFarmer).not.toHaveBeenCalled();
  });

  it('saved but the reload failed: the list stays, with one line and a retry', async () => {
    await renderReady();
    api.setFarmerDisabled.mockResolvedValue({ ...amar, is_disabled: true });
    api.listFarmers.mockRejectedValueOnce(new DataError('network', null, 'offline'));
    fireEvent.click(row('Amar Test').getByRole('button', { name: 'Band karo' }));
    const status = screen.getByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Save ho gaya, par list refresh nahi ho payi.'));
    expect(status).toHaveTextContent('Amar Test band ho gaya.');
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2);
    api.listFarmers.mockResolvedValue([ramu, { ...amar, is_disabled: true }, band, gone]);
    fireEvent.click(within(status).getByRole('button', { name: 'Dobara try karo' }));
    await waitFor(() => expect(status).not.toHaveTextContent('refresh nahi ho payi'));
    expect(screen.getByRole('button', { name: 'Band (2)' })).toBeInTheDocument();
  });

  it('each Chalu and Band farmer links to its profile; deleted farmers do not; row actions still work', async () => {
    await renderReady();
    expect(screen.getByRole('link', { name: 'Amar Test ka hisaab kholo' })).toHaveAttribute('href', '/farmers/a');
    openSegment('Band');
    expect(screen.getByRole('link', { name: 'Band Test ka hisaab kholo' })).toHaveAttribute('href', '/farmers/b');
    openSegment('Deleted');
    expect(within(list()).queryByRole('link')).not.toBeInTheDocument();
    openSegment('Chalu');
    api.setFarmerDisabled.mockResolvedValue({ ...amar, is_disabled: true });
    fireEvent.click(row('Amar Test').getByRole('button', { name: 'Band karo' }));
    await waitFor(() => expect(api.setFarmerDisabled).toHaveBeenCalledWith('a', true));
  });

  it('a failed change shows a Hinglish error message', async () => {
    await renderReady();
    api.setFarmerDisabled.mockRejectedValue(new DataError('not_found', 'no_rows', 'gone'));
    fireEvent.click(row('Amar Test').getByRole('button', { name: 'Band karo' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Yeh kisan nahi mila. List refresh karke dobara dekho.'),
    );
  });

  it('no double submit: buttons are disabled while a save is pending', async () => {
    await renderReady();
    const save = deferred<typeof amar>();
    api.createFarmer.mockReturnValue(save.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Naya Kisan' }));
    const dialog = await screen.findByRole('dialog');
    fill('Naam', 'Pending Test');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save karo' }));
    const saving = await within(dialog).findByRole('button', { name: 'Save ho raha hai...' });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    fireEvent.submit(screen.getByLabelText('Naam').closest('form') as HTMLFormElement);
    expect(api.createFarmer).toHaveBeenCalledTimes(1);
    // The modal hides the page from the accessibility tree, so query hidden elements here.
    for (const button of screen.getAllByRole('button', { name: /^(Edit|Band karo|Delete)$/, hidden: true })) {
      expect(button).toBeDisabled();
    }
    save.resolve(farmerRow({ id: 'p', name: 'Pending Test' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
