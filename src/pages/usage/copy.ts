// Every user-visible Hinglish string of the Pani Entry (usage) screen lives here, so wording can
// change in one place. Copy never computes figures (.claude/rules/ui-copy-hinglish.md).
import type { DataErrorKind, UsageFormCode } from '@/lib/data';

export type UsageSegment = 'live' | 'deleted';

const MONTH_NAMES: Record<string, string> = {
  '01': 'Jan',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Apr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Aug',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dec',
};

export const USAGE_COPY = {
  pageTitle: 'Pani Entry',
  addButton: 'Naya Pani Entry',
  segmentsLabel: 'Kaun si entries dikhayein',
  segments: { live: 'Entries', deleted: 'Deleted' } satisfies Record<UsageSegment, string>,
  farmerFilter: 'Kisan',
  allFarmers: 'Sabhi kisan',
  monthFilter: 'Mahina',
  allMonths: 'Sabhi mahine',
  bandSuffix: ' (Band)',
  deletedSuffix: ' (Deleted)',
  /** "2026-10" -> "Oct 2026" (a label lookup only; the month key itself comes from the engine). */
  monthLabel: (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    return `${MONTH_NAMES[month ?? ''] ?? monthKey} ${year ?? ''}`.trim();
  },
  loading: 'Entries load ho rahi hain...',
  loadError: 'Pani entries load nahi ho payi.',
  badData: 'Ek entry ka data theek nahi hai, isliye rakam nahi dikha sakte. Dobara load karke dekho.',
  retry: 'Dobara try karo',
  refreshFailed: 'Save ho gaya, par list refresh nahi ho payi.',
  empty: {
    live: "Abhi koi pani entry nahi hai. 'Naya Pani Entry' dabao.",
    deleted: 'Koi deleted entry nahi hai.',
  } satisfies Record<UsageSegment, string>,
  noFilterResults: 'In filters ke liye koi entry nahi mili.',
  unknownFarmer: 'Kisan nahi mila',
  when: (dateKey: string, timeKey: string) => `${dateKey}, ${timeKey}`,
  duration: (hours: number, minutes: number) => `${hours} ghante ${minutes} minute`,
  ratePerHour: (rateText: string) => `${rateText}/ghanta`,
  amount: (amountText: string) => `Rakam: ${amountText}`,
  deletedOn: (dateKey: string) => `Delete hua: ${dateKey}`,
  actions: { edit: 'Edit', delete: 'Delete', restore: 'Wapas lao' },
  form: {
    addTitle: 'Pani Entry karo',
    editTitle: 'Pani Entry badlo',
    description: 'Kisan, tarikh, samay aur kitni der pani chala, bharo.',
    farmer: 'Kisan',
    chooseFarmer: 'Kisan chuno',
    date: 'Tarikh',
    time: 'Samay',
    hours: 'Ghante',
    minutes: 'Minute',
    rate: 'Rate (rupaye per ghanta)',
    save: 'Save karo',
    saving: 'Save ho raha hai...',
    cancel: 'Rehne do',
  },
  warnings: {
    heading: 'Dhyan dein:',
    duplicate: 'Is kisan ki isi din, itne hi ghante-minute ki entry pehle se hai:',
    long_duration: 'Is entry mein 24 ghante se zyada hai.',
    future_date: 'Yeh tarikh aaj ke baad ki hai.',
    saveAnyway: 'Phir bhi save karo',
    goBack: 'Wapas jao, badlo',
  },
  deleteDialog: {
    title: 'Yeh entry delete karein?',
    body: "Entry 'Deleted' mein chali jayegi aur wahan se wapas laayi ja sakti hai. Aur kuch nahi badlega.",
    confirm: 'Haan, delete karo',
    cancel: 'Rehne do',
  },
  done: {
    created: 'Pani entry save ho gayi.',
    updated: 'Entry badal di gayi.',
    deleted: "Entry delete ho gayi. 'Deleted' mein milegi.",
    restored: 'Entry wapas aa gayi.',
  },
} as const;

export const USAGE_CODE_TEXT: Record<UsageFormCode, string> = {
  farmer_required: 'Kisan chuno.',
  time_required: 'Tarikh aur samay dono bharo.',
  time_invalid: 'Yeh tarikh ya samay sahi nahi hai.',
  hours_required: 'Ghante bharo (0 bhi chalega).',
  hours_not_integer: 'Ghante mein sirf poora number likho.',
  hours_negative: 'Ghante minus mein nahi ho sakte.',
  minutes_required: 'Minute bharo (0 bhi chalega).',
  minutes_not_integer: 'Minute mein sirf poora number likho.',
  minutes_negative: 'Minute minus mein nahi ho sakte.',
  minutes_out_of_range: 'Minute 0 se 59 tak hi ho sakte hain.',
  duration_zero: 'Ghante ya minute mein se kuch to bharo.',
  rate_required: 'Rate bharo.',
  rate_not_integer: 'Rate mein zyada se zyada 2 decimal ho sakte hain.',
  rate_negative: 'Rate minus mein nahi ho sakta.',
  rate_not_positive: 'Rate 0 se zyada hona chahiye.',
  rate_invalid: 'Rate aise likho: 100 ya 100.50 (comma ya minus nahi).',
  amount_too_large: 'Itni badi rakam nahi ho sakti. Ghante aur rate check karo.',
};

export const USAGE_DATA_ERROR_TEXT: Record<DataErrorKind, string> = {
  network: 'Internet nahi mil raha. Connection check karke dobara try karo.',
  permission: 'Iski permission nahi hai. Logout karke dobara login karo.',
  constraint: 'Kuch galat bhara hai (ya kisan ab list mein nahi hai). Form check karke dobara try karo.',
  not_found: 'Yeh entry nahi mili. List refresh karke dobara dekho.',
  unknown: 'Kuch gadbad ho gayi. Dobara try karo.',
};
