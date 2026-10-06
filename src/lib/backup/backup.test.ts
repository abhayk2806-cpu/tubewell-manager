import { describe, expect, it } from 'vitest';
import {
  BACKUP_REMINDER_DAYS,
  MAX_PROBLEMS,
  MAX_RESTORE_BYTES,
  backupFileName,
  backupReminder,
  buildBackupFile,
  csvCell,
  csvFileName,
  diffBackup,
  farmersCsv,
  monthsCsv,
  parseBackupText,
  paymentsCsv,
  sameSummary,
  toCsv,
  usageCsv,
  validateBackup,
} from './index';
import type { BackupFile, CsvLabels } from './index';
import { EXPORTED_AT, IDS, WORKED_SUMMARY, farmer, payment, usage, workedRows } from './test-support/fixture';

const BOM = String.fromCharCode(0xfeff);
const now = { dateKey: '2026-10-06', timeKey: '14:05', monthKey: '2026-10' };

function workedFile(): BackupFile {
  return buildBackupFile(workedRows(), EXPORTED_AT);
}

/** The file as JSON text and back, like a downloaded and re-chosen file. */
function asJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function problemsOf(value: unknown) {
  const result = validateBackup(value);
  if (result.ok) throw new Error('expected problems');
  return result.problems;
}

describe('buildBackupFile', () => {
  it('worked numbers: counts 5/4/4, engine All Time totals kept separate, soft-deleted rows included', () => {
    const file = workedFile();
    expect(file.format).toBe('tubewell-hisab-backup');
    expect(file.version).toBe(1);
    expect(file.exported_at).toBe(EXPORTED_AT);
    expect(file.counts).toEqual({ farmers: 5, usage_entries: 4, payments: 4 });
    expect(file.summary).toEqual(WORKED_SUMMARY);
    expect(file.usage_entries.find((u) => u.id === IDS.uBholuDeleted)?.deleted_at).toBe('2026-10-06T06:00:00+00:00');
  });

  it('keeps only the stored columns (no total_minutes or later database columns)', () => {
    const rows = workedRows();
    const withExtra = { ...rows, usage_entries: rows.usage_entries.map((u) => ({ ...u, total_minutes: u.hours * 60 + u.minutes, extra: 1 })) };
    const file = buildBackupFile(withExtra, EXPORTED_AT);
    expect(Object.keys(file.usage_entries[0] ?? {})).toEqual([
      'id', 'farmer_id', 'used_at', 'hours', 'minutes', 'rate_paise', 'created_at', 'created_by', 'updated_at', 'updated_by', 'deleted_at', 'deleted_by',
    ]);
  });

  it('sameSummary compares field by field', () => {
    expect(sameSummary(WORKED_SUMMARY, { ...WORKED_SUMMARY })).toBe(true);
    // Moving 50.00 from credit to outstanding keeps the "netted" total but is a different summary.
    expect(sameSummary(WORKED_SUMMARY, { ...WORKED_SUMMARY, outstanding_paise: 30833, credit_paise: 0 })).toBe(false);
  });
});

describe('validateBackup', () => {
  it('a valid file passes and the round trip gives identical rows (soft-deleted rows still deleted)', () => {
    const file = workedFile();
    const result = validateBackup(asJson(file));
    expect(result).toEqual({ ok: true, file });
    if (!result.ok) return;
    expect(buildBackupFile(result.file, EXPORTED_AT)).toEqual(file);
  });

  it('format and version are checked first; an old app file gets its own message', () => {
    expect(problemsOf({ ...workedFile(), format: 'other' })).toEqual([{ code: 'wrong_format' }]);
    expect(problemsOf({ ...workedFile(), version: 2 })).toEqual([{ code: 'wrong_version' }]);
    expect(problemsOf({ version: '2.2', farmers: [], usage_entries: [], payments: [], month_closings: [] })).toEqual([{ code: 'old_app_file' }]);
    expect(problemsOf([1, 2])).toEqual([{ code: 'not_object' }]);
  });

  it('top level: unknown table, missing table, bad counts, bad summary, bad exported_at', () => {
    const file = asJson(workedFile()) as Record<string, unknown>;
    expect(problemsOf({ ...file, month_closings: [] })).toEqual([{ code: 'unknown_table', field: 'month_closings' }]);
    const noPayments = Object.fromEntries(Object.entries(file).filter(([key]) => key !== 'payments'));
    expect(problemsOf(noPayments)).toEqual([{ code: 'missing_table', table: 'payments' }]);
    expect(problemsOf({ ...file, summary: { charges_paise: 1 } })).toEqual([{ code: 'bad_summary', field: 'summary' }]);
    expect(problemsOf({ ...file, exported_at: '2026-10-06 14:05' })).toEqual([{ code: 'bad_exported_at', field: 'exported_at' }]);
  });

  it('count mismatch, duplicate id, orphan farmer_id, with table and 1-based row numbers', () => {
    const file = asJson(workedFile()) as BackupFile;
    expect(problemsOf({ ...file, counts: { ...file.counts, payments: 5 } })).toEqual([{ code: 'count_mismatch', table: 'payments' }]);
    const dup = { ...file, payments: [...file.payments.slice(0, 3), { ...file.payments[3], id: IDS.pAsha1 }] };
    expect(problemsOf(dup)).toEqual([{ code: 'duplicate_id', table: 'payments', row: 4, field: 'id' }]);
    const orphan = { ...file, usage_entries: file.usage_entries.map((u, i) => (i === 1 ? { ...u, farmer_id: 'deadbeef-0000-4000-8000-000000000000' } : u)) };
    expect(problemsOf(orphan)).toEqual([{ code: 'orphan_farmer', table: 'usage_entries', row: 2, field: 'farmer_id' }]);
  });

  it('naive timestamps, ranges, types and total_minutes', () => {
    const file = asJson(workedFile()) as BackupFile;
    const editUsage = (i: number, patch: object) => ({ ...file, usage_entries: file.usage_entries.map((u, j) => (j === i ? { ...u, ...patch } : u)) });
    expect(problemsOf(editUsage(0, { used_at: '2026-09-10T10:00:00' }))).toEqual([{ code: 'bad_timestamp', table: 'usage_entries', row: 1, field: 'used_at' }]);
    expect(problemsOf(editUsage(0, { minutes: 60 }))).toEqual([{ code: 'out_of_range', table: 'usage_entries', row: 1, field: 'minutes' }]);
    expect(problemsOf(editUsage(0, { hours: 0, minutes: 0 }))).toEqual([{ code: 'out_of_range', table: 'usage_entries', row: 1, field: 'minutes' }]);
    expect(problemsOf(editUsage(0, { rate_paise: 1.5 }))).toEqual([{ code: 'bad_number', table: 'usage_entries', row: 1, field: 'rate_paise' }]);
    expect(problemsOf(editUsage(0, { total_minutes: 200 }))).toEqual([{ code: 'total_minutes_mismatch', table: 'usage_entries', row: 1, field: 'total_minutes' }]);
    expect(validateBackup(editUsage(0, { total_minutes: 215 })).ok).toBe(true);
    const badPayment = { ...file, payments: file.payments.map((p, j) => (j === 2 ? { ...p, amount_paise: 0 } : p)) };
    expect(problemsOf(badPayment)).toEqual([{ code: 'out_of_range', table: 'payments', row: 3, field: 'amount_paise' }]);
    const blankName = { ...file, farmers: file.farmers.map((f, j) => (j === 0 ? { ...f, name: '   ' } : f)) };
    expect(problemsOf(blankName)).toEqual([{ code: 'out_of_range', table: 'farmers', row: 1, field: 'name' }]);
    const badFlag = { ...file, farmers: file.farmers.map((f, j) => (j === 0 ? { ...f, is_disabled: 'no' } : f)) };
    expect(problemsOf(badFlag)).toEqual([{ code: 'bad_boolean', table: 'farmers', row: 1, field: 'is_disabled' }]);
  });

  it(`reports at most ${MAX_PROBLEMS} problems`, () => {
    const file = asJson(workedFile()) as BackupFile;
    const many = { ...file, payments: file.payments.map((p) => ({ ...p, amount_paise: -1, paid_at: 'kal', note: 5 })) };
    expect(problemsOf(many)).toHaveLength(MAX_PROBLEMS);
  });

  it('a damaged or edited file: the recomputed engine totals differ from the summary', () => {
    const file = asJson(workedFile()) as BackupFile;
    const edited = { ...file, payments: file.payments.map((p, j) => (j === 0 ? { ...p, amount_paise: 15000 } : p)) };
    expect(problemsOf(edited)).toEqual([{ code: 'summary_mismatch' }]);
  });

  it('unknown row fields are dropped (only stored columns are restored)', () => {
    const file = asJson(workedFile()) as BackupFile;
    const extra = { ...file, farmers: file.farmers.map((f) => ({ ...f, colour: 'red' })) };
    const result = validateBackup(extra);
    expect(result.ok && Object.keys(result.file.farmers[0] ?? {})).not.toContain('colour');
  });

  it('parseBackupText: size limit first, then JSON, then validation', () => {
    expect(parseBackupText('{}', MAX_RESTORE_BYTES + 1)).toEqual({ ok: false, problems: [{ code: 'too_large' }] });
    expect(parseBackupText('{not json', 9)).toEqual({ ok: false, problems: [{ code: 'not_json' }] });
    const text = JSON.stringify(workedFile());
    expect(parseBackupText(text, text.length).ok).toBe(true);
  });
});

describe('diffBackup', () => {
  it('new, changed, same and only-in-current per table (a changed, a deleted and a restored row)', () => {
    const file = workedRows();
    const current = workedRows();
    const changedName = { ...current.farmers[0]!, name: 'Asha Changed' };
    const restoredFarmer = { ...current.farmers[4]!, deleted_at: null, deleted_by: null };
    const newFarmer = farmer('66666666-6666-4666-8666-666666666666', 'Naya Test');
    const deletedPayment = { ...current.payments[0]!, deleted_at: '2026-10-07T00:00:00+00:00' };
    const extraUsage = usage('a1000000-0000-4000-8000-000000000009', IDS.asha, '2026-10-06T04:30:00+00:00', 1, 0);
    const d = diffBackup(file, {
      farmers: [changedName, current.farmers[1]!, current.farmers[2]!, current.farmers[3]!, restoredFarmer, newFarmer],
      usage_entries: [...current.usage_entries.slice(1), extraUsage],
      payments: [deletedPayment, ...current.payments.slice(1)],
    });
    expect(d.farmers).toEqual({ fileRows: 5, currentRows: 6, new: 0, changed: 2, same: 3, onlyCurrent: 1 });
    expect(d.usage_entries).toEqual({ fileRows: 4, currentRows: 4, new: 1, changed: 0, same: 3, onlyCurrent: 1 });
    expect(d.payments).toEqual({ fileRows: 4, currentRows: 4, new: 0, changed: 1, same: 3, onlyCurrent: 0 });
  });

  it('the same instant in another spelling is not a change', () => {
    const file = workedRows();
    const current = { ...file, payments: file.payments.map((p, i) => (i === 0 ? { ...p, paid_at: '2026-10-02T10:00:00+05:30' } : p)) };
    expect(diffBackup(file, current).payments.changed).toBe(0);
  });
});

const labels: CsvLabels = {
  farmers: ['Naam', 'Mobile', 'Charge', 'Cash Mila', 'Baaki', 'Advance / Credit'],
  usage: ['Tarikh', 'Samay', 'Kisan', 'Ghante', 'Minute', 'Rate', 'Rakam'],
  payments: ['Tarikh', 'Samay', 'Kisan', 'Rakam', 'Note'],
  months: ['Mahina', 'Ghante', 'Minute', 'Charge', 'Charge Clear', 'Baaki', 'Cash Mila', 'Status'],
  status: { settled: 'Settled', partial: 'Partial', unpaid: 'Unpaid', payment_only: 'Sirf Payment' },
  unknownFarmer: 'Pata nahi',
};

function csvInput() {
  const rows = workedRows();
  return { farmers: rows.farmers, usageRows: rows.usage_entries.map((u) => ({ ...u, total_minutes: u.hours * 60 + u.minutes })), paymentRows: rows.payments };
}

function lines(text: string): string[] {
  return text.split('\r\n');
}

describe('CSV', () => {
  it('cells: quoting of commas, quotes and line breaks; formula starts neutralised', () => {
    expect(csvCell('Asha')).toBe('Asha');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+x')).toBe("'+x");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('@x')).toBe("'@x");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('=A1,B1')).toBe(`"'=A1,B1"`);
  });

  it('a CSV starts with a BOM and ends every line with CRLF', () => {
    const text = toCsv([['a', 'b'], ['1', '2']]);
    expect(text.startsWith(BOM)).toBe(true);
    expect(text).toBe(`${BOM}a,b\r\n1,2\r\n`);
  });

  it('Kisan-wise: active farmers, highest Baaki first, plain decimals', () => {
    const result = farmersCsv(csvInput(), labels, now);
    if (!result.ok) throw new Error('expected CSV');
    expect(lines(result.text.slice(1))).toEqual([
      'Naam,Mobile,Charge,Cash Mila,Baaki,Advance / Credit',
      'Bholu Test,,200.00,0.00,200.00,0.00',
      'Asha Test,90000 11111,358.33,300.00,58.33,0.00',
      'Chhotu Test,,0.00,50.00,0.00,50.00',
      '',
    ]);
  });

  it('Pani entries: live rows only, IST date and time, engine amount', () => {
    const result = usageCsv(csvInput(), labels);
    if (!result.ok) throw new Error('expected CSV');
    expect(lines(result.text.slice(1))).toEqual([
      'Tarikh,Samay,Kisan,Ghante,Minute,Rate,Rakam',
      '2026-10-05,10:00,Bholu Test,2,0,100.00,200.00',
      '2026-10-04,10:00,Dinu Test,1,0,100.00,100.00',
      '2026-09-10,10:00,Asha Test,3,35,100.00,358.33',
      '',
    ]);
  });

  it('Payments: live rows only, notes kept and neutralised when they start like a formula', () => {
    const input = csvInput();
    const withFormula = { ...input, paymentRows: [...input.paymentRows, payment('b2000000-0000-4000-8000-000000000009', IDS.chhotu, '2026-10-06T04:30:00+00:00', 100, { note: '=HYPERLINK("x")' })] };
    const result = paymentsCsv(withFormula, labels);
    if (!result.ok) throw new Error('expected CSV');
    expect(lines(result.text.slice(1))).toEqual([
      'Tarikh,Samay,Kisan,Rakam,Note',
      `2026-10-06,10:00,Chhotu Test,1.00,"'=HYPERLINK(""x"")"`,
      '2026-10-03,10:00,Asha Test,200.00,',
      '2026-10-02,10:00,Asha Test,100.00,pehla',
      '2026-08-12,10:00,Chhotu Test,50.00,',
      '',
    ]);
  });

  it('Mahine: newest first with the status words', () => {
    const result = monthsCsv(csvInput(), labels);
    if (!result.ok) throw new Error('expected CSV');
    expect(lines(result.text.slice(1))).toEqual([
      'Mahina,Ghante,Minute,Charge,Charge Clear,Baaki,Cash Mila,Status',
      '2026-10,2,0,200.00,0.00,200.00,300.00,Unpaid',
      '2026-09,3,35,358.33,300.00,58.33,0.00,Partial',
      '2026-08,0,0,0.00,0.00,0.00,50.00,Sirf Payment',
      '',
    ]);
  });

  it('bad data gives { ok: false } instead of a guessed CSV', () => {
    const input = csvInput();
    const bad = { ...input, usageRows: input.usageRows.map((u) => ({ ...u, total_minutes: null })) };
    expect(farmersCsv(bad, labels, now)).toEqual({ ok: false });
    expect(usageCsv(bad, labels)).toEqual({ ok: false });
    expect(monthsCsv(bad, labels)).toEqual({ ok: false });
  });
});

describe('reminder and file names', () => {
  it('never, today, 6 days (ok) and 7 days (old)', () => {
    expect(backupReminder(null, now)).toEqual({ kind: 'never', days: null });
    expect(backupReminder('kal', now)).toEqual({ kind: 'never', days: null });
    expect(backupReminder('2026-10-06T03:00:00.000Z', now)).toEqual({ kind: 'ok', days: 0 });
    expect(backupReminder('2026-09-30T08:00:00.000Z', now)).toEqual({ kind: 'ok', days: 6 });
    expect(backupReminder('2026-09-29T08:00:00.000Z', now)).toEqual({ kind: 'old', days: BACKUP_REMINDER_DAYS });
    expect(backupReminder('2026-10-09T08:00:00.000Z', now)).toEqual({ kind: 'ok', days: 0 });
  });

  it('counts IST calendar days: 23:50 IST yesterday is 1 day at 00:05 IST today', () => {
    const justAfterMidnight = { dateKey: '2026-10-06', timeKey: '00:05' };
    expect(backupReminder('2026-10-05T18:20:00.000Z', justAfterMidnight)).toEqual({ kind: 'ok', days: 1 });
    expect(backupReminder('2026-10-05T18:40:00.000Z', justAfterMidnight)).toEqual({ kind: 'ok', days: 0 });
  });

  it('file names from the IST moment', () => {
    expect(backupFileName(now)).toBe('tubewell-backup-2026-10-06-1405.json');
    expect(csvFileName('kisan', now)).toBe('tubewell-kisan-2026-10-06-1405.csv');
  });
});
