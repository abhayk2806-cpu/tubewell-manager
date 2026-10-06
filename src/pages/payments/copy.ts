// Every user-visible Hinglish string of the Paisa (payments) screen lives here, so wording can
// change in one place. Copy never computes figures (.claude/rules/ui-copy-hinglish.md).
// Outstanding ("baaki") and credit ("Advance / Credit") are always two separate lines (E18).
import type { DataErrorKind, PaymentFormCode } from '@/lib/data';
import { monthLabel } from '../shared/monthLabel';

export type PaymentSegment = 'live' | 'deleted';

export const PAYMENTS_COPY = {
  pageTitle: 'Paisa',
  addButton: 'Naya Payment',
  segmentsLabel: 'Kaun se payment dikhayein',
  segments: { live: 'Payments', deleted: 'Deleted' } satisfies Record<PaymentSegment, string>,
  farmerFilter: 'Kisan',
  allFarmers: 'Sabhi kisan',
  monthFilter: 'Mahina',
  allMonths: 'Sabhi mahine',
  bandSuffix: ' (Band)',
  deletedSuffix: ' (Deleted)',
  monthLabel,
  loading: 'Payments load ho rahe hain...',
  loadError: 'Payments load nahi ho paye.',
  retry: 'Dobara try karo',
  refreshFailed: 'Save ho gaya, par list refresh nahi ho payi.',
  empty: {
    live: "Abhi koi payment nahi hai. 'Naya Payment' dabao.",
    deleted: 'Koi deleted payment nahi hai.',
  } satisfies Record<PaymentSegment, string>,
  noFilterResults: 'In filters ke liye koi payment nahi mila.',
  unknownFarmer: 'Kisan nahi mila',
  when: (dateKey: string, timeKey: string) => `${dateKey}, ${timeKey}`,
  deletedOn: (dateKey: string) => `Delete hua: ${dateKey}`,
  actions: { edit: 'Edit', delete: 'Delete', restore: 'Wapas lao' },
  form: {
    addTitle: 'Paisa Add karo',
    editTitle: 'Payment badlo',
    description: 'Kisan, tarikh, samay aur kitna paisa mila, bharo.',
    farmer: 'Kisan',
    chooseFarmer: 'Kisan chuno',
    farmerLocked: 'Payment ka kisan badla nahi ja sakta.',
    date: 'Tarikh',
    time: 'Samay',
    amount: 'Rakam (rupaye)',
    note: 'Note (optional)',
    save: 'Save karo',
    saving: 'Save ho raha hai...',
    cancel: 'Rehne do',
  },
  preview: {
    heading: 'Hisaab (live)',
    chooseFarmer: 'Kisan chuno, to uska hisaab yahan dikhega.',
    loading: 'Hisaab load ho raha hai...',
    usageFailed: 'Pani entries load nahi hui, isliye abhi hisaab nahi dikh sakta. Payment phir bhi save ho sakta hai.',
    badData: 'Is kisan ke data mein gadbad hai, isliye hisaab nahi ban paya. Abhi save nahi kar sakte.',
    current: 'Abhi ka hisaab',
    before: 'Pehle',
    after: 'Baad mein',
    afterPayment: 'Payment ke baad',
    outstanding: 'Abhi baaki',
    outstandingAfter: 'Baaki',
    credit: 'Advance / Credit',
    nowValue: (amountText: string) => `(abhi ${amountText})`,
    pieces: 'Is payment se',
    creditCreated: (amountText: string) => `Is payment se naya Advance / Credit: ${amountText}`,
  },
  warnings: {
    heading: 'Dhyan dein:',
    duplicate: 'Is kisan ka isi din, itni hi rakam ka payment pehle se hai:',
    future_date: 'Yeh tarikh aaj ke baad ki hai.',
    saveAnyway: 'Phir bhi save karo',
    goBack: 'Wapas jao, badlo',
  },
  deleteDialog: {
    title: 'Yeh payment delete karein?',
    body: "Payment 'Deleted' mein chala jayega aur wahan se wapas laaya ja sakta hai. Kisan ka baaki / advance badal sakta hai, kyunki hisaab hamesha bache hue payments se dobara banta hai.",
    confirm: 'Haan, delete karo',
    cancel: 'Rehne do',
  },
  done: {
    created: 'Payment save ho gaya.',
    updated: 'Payment badal diya gaya.',
    deleted: "Payment delete ho gaya. 'Deleted' mein milega.",
    restored: 'Payment wapas aa gaya.',
  },
} as const;

export const PAYMENT_CODE_TEXT: Record<PaymentFormCode, string> = {
  farmer_required: 'Kisan chuno.',
  time_required: 'Tarikh aur samay dono bharo.',
  time_invalid: 'Yeh tarikh ya samay sahi nahi hai.',
  amount_required: 'Rakam bharo.',
  amount_not_integer: 'Rakam mein zyada se zyada 2 decimal ho sakte hain.',
  amount_negative: 'Rakam minus mein nahi ho sakti.',
  amount_not_positive: 'Rakam 0 se zyada honi chahiye.',
  amount_invalid: 'Rakam aise likho: 500 ya 500.50 (comma ya minus nahi).',
  note_too_long: 'Note 200 akshar se lamba nahi ho sakta.',
};

export const PAYMENT_DATA_ERROR_TEXT: Record<DataErrorKind, string> = {
  network: 'Internet nahi mil raha. Connection check karke dobara try karo.',
  permission: 'Iski permission nahi hai. Logout karke dobara login karo.',
  constraint: 'Kuch galat bhara hai (ya kisan ab list mein nahi hai). Form check karke dobara try karo.',
  not_found: 'Yeh payment nahi mila. List refresh karke dobara dekho.',
  unknown: 'Kuch gadbad ho gayi. Dobara try karo.',
};
