// Every user-visible Hinglish string of the Backup screen (and the Dashboard backup note) lives here.
// Copy never computes figures: amounts arrive as text from formatRupees. Baaki and Advance / Credit
// are always two separate figures (L8, E18).
import type { BackupProblem, BackupProblemCode, BackupTable, CsvLabels } from '@/lib/backup';
import type { BackupReadErrorKind, RestoreErrorKind } from '@/lib/data';
import { MONTH_STATUS_TEXT } from '../farmers/profileCopy';

const TABLE_LABEL: Record<BackupTable, string> = {
  farmers: 'Kisan',
  usage_entries: 'Pani entries',
  payments: 'Payments',
};

const PROBLEM_TEXT: Record<BackupProblemCode, string> = {
  too_large: 'File 10 MB se badi hai. Itni badi file restore nahi ho sakti.',
  not_json: 'Yeh JSON file nahi lagti (shayad galat file chuni hai).',
  not_object: 'File ka format samajh nahi aaya.',
  old_app_file: 'Yeh purane app ki backup file hai. Naye app mein yeh import nahi hoti.',
  wrong_format: 'Yeh Tubewell Hisaab ki backup file nahi hai.',
  wrong_version: 'Yeh backup file kisi aur version ki hai. App update karke try karo.',
  bad_exported_at: 'Backup ka samay theek nahi likha hai.',
  unknown_table: 'File mein ek anjaan hissa hai',
  missing_table: 'File mein yeh hissa nahi hai',
  bad_counts: 'File mein ginti (counts) theek nahi hai.',
  count_mismatch: 'Ginti aur rows ki sankhya match nahi karti',
  bad_row: 'Row theek nahi hai',
  bad_id: 'ID theek nahi hai',
  duplicate_id: 'Same ID do baar hai',
  orphan_farmer: 'Yeh row aise kisan ki hai jo file mein nahi hai',
  bad_timestamp: 'Tarikh/samay theek nahi hai (zone ke saath hona chahiye)',
  bad_number: 'Sankhya theek nahi hai',
  out_of_range: 'Value had se bahar hai',
  bad_text: 'Text theek nahi hai',
  bad_boolean: 'Haan/na value theek nahi hai',
  total_minutes_mismatch: 'Kul minute, ghante aur minute se match nahi karte',
  bad_summary: 'File ka hisaab (summary) theek nahi hai.',
  bad_data: 'File ke data mein kuch gadbad hai, hisaab nahi ban paya.',
  summary_mismatch: 'File kharab hai ya badli gayi hai: andar ka hisaab file ke likhe hisaab se match nahi karta.',
};

/** One problem line: where it is (table, row, field) and what is wrong. */
function problemLine(p: BackupProblem): string {
  const where = [p.table ? TABLE_LABEL[p.table] : null, p.row ? `row ${p.row}` : null, p.field ?? null].filter((x) => x !== null);
  return where.length > 0 ? `${where.join(', ')}: ${PROBLEM_TEXT[p.code]}` : PROBLEM_TEXT[p.code];
}

const READ_ERROR_TEXT: Record<BackupReadErrorKind, string> = {
  network: 'Internet nahi mil raha. Connection check karke dobara try karo.',
  permission: 'Iski permission nahi hai. Logout karke dobara login karo.',
  constraint: 'Data padhte waqt gadbad hui. Dobara try karo.',
  not_found: 'Data nahi mila. Dobara try karo.',
  unknown: 'Kuch gadbad ho gayi. Dobara try karo.',
  bad_data: 'Database ke data mein kuch gadbad lag rahi hai, isliye file nahi bani. Kuch bhi apne aap theek nahi kiya gaya.',
};

const RESTORE_ERROR_TEXT: Record<RestoreErrorKind, string> = {
  not_owner: 'Sirf owner restore kar sakta hai. Logout karke dobara login karo.',
  invalid_payload: 'Database ne file ko theek nahi maana.',
  network: 'Internet nahi mil raha. Restore nahi hua.',
  constraint: 'File ka data database ke niyam se match nahi karta (jaise kisi row ka kisan nahi mila).',
  unknown: 'Kuch gadbad ho gayi. Restore nahi hua.',
};

const counts = (c: Record<BackupTable, number>) =>
  `${TABLE_LABEL.farmers} ${c.farmers}, ${TABLE_LABEL.usage_entries} ${c.usage_entries}, ${TABLE_LABEL.payments} ${c.payments}`;

export const BACKUP_COPY = {
  pageTitle: 'Backup',
  loading: 'Data load ho raha hai...',
  loadError: 'Abhi ka data load nahi ho paya.',
  retry: 'Dobara try karo',
  tables: TABLE_LABEL,
  counts,
  reminder: {
    heading: 'Pichla backup',
    never: 'Abhi tak koi backup nahi liya.',
    today: 'Pichla backup: aaj.',
    daysAgo: (days: number) => `Pichla backup: ${days} din pehle.`,
    old: 'Naya backup le lo.',
    note: 'Yeh yaad sirf isi browser / phone mein rehti hai. Download hui file ko kisi safe jagah rakho (doosre phone, computer ya Drive mein), kyunki app ko pata nahi chalta file kahan gayi.',
    sensitive: 'Backup aur CSV files mein saara hisaab hota hai aur yeh encrypted nahi hoti. Inhe sambhal ke rakho.',
  },
  json: {
    heading: 'Poora backup (JSON)',
    text: 'Saara data ek file mein: saare kisan, pani entries aur payments, delete kiye hue bhi. Isi file se restore hota hai.',
    button: 'Backup download karo',
    running: 'Backup ban raha hai...',
    done: (c: Record<BackupTable, number>) => `Backup download ho gaya: ${counts(c)}.`,
    failed: 'Backup nahi bana.',
  },
  csv: {
    heading: 'Excel ke liye (CSV)',
    text: 'Padhne aur print karne ke liye. Yeh files restore nahi hoti.',
    farmers: 'Kisan-wise hisaab',
    usage: 'Pani entries',
    payments: 'Payments',
    months: 'Mahine',
    done: (name: string) => `${name} CSV download ho gayi.`,
    badData: 'Data mein kuch gadbad hai, isliye CSV nahi bani.',
    notReady: 'Data abhi load nahi hua.',
  },
  csvLabels: {
    farmers: ['Naam', 'Mobile', 'Charge', 'Cash Mila', 'Baaki', 'Advance / Credit'],
    usage: ['Tarikh', 'Samay', 'Kisan', 'Ghante', 'Minute', 'Rate (per ghanta)', 'Rakam'],
    payments: ['Tarikh', 'Samay', 'Kisan', 'Rakam', 'Note'],
    months: ['Mahina', 'Ghante', 'Minute', 'Charge', 'Charge Clear', 'Baaki', 'Cash Mila (is mahine)', 'Status'],
    status: MONTH_STATUS_TEXT,
    unknownFarmer: '(kisan nahi mila)',
  } satisfies CsvLabels,
  restore: {
    heading: 'Restore (backup wapas lao)',
    chooseLabel: 'Backup file chuno (.json)',
    reading: 'File padh rahe hain...',
    invalid: 'Yeh file restore nahi ho sakti:',
    problem: problemLine,
    previewHeading: 'File mein kya hai',
    fileDate: (dateKey: string, timeKey: string) => `Backup ka samay: ${dateKey}, ${timeKey}`,
    totals: {
      charges: 'Charge',
      cash: 'Cash Mila',
      outstanding: 'Baaki',
      credit: 'Advance / Credit',
    },
    compareHeading: 'Abhi ke data se tulna',
    compareCols: { table: 'Hissa', new: 'Naye', changed: 'Badle', same: 'Same', onlyCurrent: 'Sirf abhi ke data mein' },
    modeLabel: 'Kaise restore karein?',
    merge: 'Merge',
    mergeText:
      'Kuch bhi delete nahi hoga. File ki rows jud jaayengi, aur backup ke baad badli hui rows wapas file wali ho jaayengi. Jo rows sirf abhi ke data mein hain, woh rahengi.',
    replace: 'Replace',
    replaceText: (lost: number) =>
      `Abhi ka data bilkul file jaisa ho jaayega. Abhi ki ${lost} rows file mein nahi hain, woh hamesha ke liye hat jaayengi.`,
    replaceWarning: 'Dhyan do: Replace abhi ka saara data hata kar file ka data daalta hai. Yeh wapas nahi hota (sirf safety backup se).',
    mergeButton: 'Haan, merge karo',
    safetyButton: '1. Pehle abhi ka safety backup download karo',
    safetyRunning: 'Safety backup ban raha hai...',
    safetyDone: (c: Record<BackupTable, number>) => `Safety backup download ho gaya: ${counts(c)}.`,
    safetyFailed: 'Safety backup nahi bana, isliye Replace roka gaya. Kuch nahi badla.',
    typeLabel: '2. Pakka karne ke liye likho: REPLACE',
    typeWord: 'REPLACE',
    replaceButton: '3. Replace karo',
    running: 'Restore ho raha hai, ruko...',
    failed: 'Restore nahi hua, kuch nahi badla.',
    reportHeading: 'Restore ho gaya',
    report: (label: string, c: Record<BackupTable, number>) => `${label}: ${counts(c)}`,
    deleted: 'Hataye',
    inserted: 'Jode',
    updated: 'Badle',
    verifying: 'Jaanch ho rahi hai...',
    verified: 'Verified: database ab file jaisa hai.',
    verifiedMerge: 'Verified: file ki saari rows database mein hain.',
    mismatch: (c: Record<BackupTable, number>, totalsText: string) =>
      `Jaanch mein farak mila. Database mein ab ${counts(c)}; hisaab ${totalsText}. Backup file ke saath dobara try karo.`,
    verifyFailed: 'Restore ho gaya, par jaanch nahi ho payi. Page refresh karke figures dekho.',
    totalsText: (charges: string, cash: string, outstanding: string, credit: string) =>
      `Charge ${charges}, Cash Mila ${cash}, Baaki ${outstanding}, Advance / Credit ${credit}`,
  },
  readError: READ_ERROR_TEXT,
  restoreError: RESTORE_ERROR_TEXT,
  dashboardNote: {
    never: 'Abhi tak koi backup nahi liya.',
    old: (days: number) => `Pichla backup ${days} din pehle liya tha.`,
    link: 'Backup lo',
  },
} as const;
