// Every user-visible Hinglish string of the Kisan ka Hisaab (farmer profile) screen lives here.
// Copy never computes figures (.claude/rules/ui-copy-hinglish.md). Outstanding ("Abhi baaki") and
// credit ("Advance / Credit") are always two separate figures (E18). "Charge Clear" (paid_i) and
// "Cash Mila" (payments dated in the month) are different concepts and are never mixed (L10).
import type { DataErrorKind, ProfileBalance } from '@/lib/data';
import type { MonthStatus } from '@/lib/ledger';
import { monthLabel } from '../shared/monthLabel';

export const PROFILE_COPY = {
  pageTitle: 'Kisan ka Hisaab',
  back: 'Kisan list par wapas',
  loading: 'Hisaab load ho raha hai...',
  loadError: 'Hisaab load nahi ho paya.',
  retry: 'Dobara try karo',
  refreshFailed: 'Save ho gaya, par hisaab refresh nahi ho paya.',
  notFound: 'Kisan nahi mila.',
  notFoundHint: 'Yeh kisan list mein nahi hai (shayad delete ho gaya hai).',
  badData: 'Is kisan ke data mein kuch gadbad lag rahi hai, isliye hisaab nahi dikha sakte. Kuch bhi apne aap theek nahi kiya gaya.',
  bandBadge: 'Band',
  creditBadge: (amountText: string) => `Advance / Credit: ${amountText}`,
  addUsage: 'Pani add',
  addPayment: 'Paisa add',
  totals: {
    heading: 'Kul hisaab',
    charges: 'Total charge',
    paid: 'Total mila',
    outstanding: 'Abhi baaki',
    credit: 'Advance / Credit',
  },
  months: {
    heading: 'Mahine ke hisaab',
    empty: 'Abhi koi mahina nahi (na pani entry, na payment).',
    label: monthLabel,
    time: 'Samay',
    duration: (hours: number, minutes: number) => `${hours} ghante ${minutes} minute`,
    charge: 'Charge',
    chargeClear: 'Charge Clear',
    remaining: 'Baaki',
    cash: 'Cash Mila (is mahine)',
  },
  payments: {
    heading: (count: number) => `Payments (${count})`,
    empty: 'Abhi tak koi payment nahi.',
    trail: 'Kahan laga',
    advance: 'Advance / Credit',
  },
  usage: {
    heading: (count: number) => `Pani entries (${count})`,
    empty: 'Abhi tak koi pani entry nahi.',
    duration: (hours: number, minutes: number) => `${hours} ghante ${minutes} minute`,
    ratePerHour: (rateText: string) => `${rateText}/ghanta`,
  },
  ledger: {
    heading: (count: number) => `Hisaab ki line (${count})`,
    empty: 'Abhi koi line nahi.',
    usage: 'Pani entry',
    payment: 'Paisa mila',
  },
  when: (dateKey: string, timeKey: string) => `${dateKey}, ${timeKey}`,
  showMore: (hidden: number) => `Aur dikhao (${hidden} aur)`,
} as const;

/** Month status words (D3): a charge-0 month with cash shows "Sirf Payment". */
export const MONTH_STATUS_TEXT: Record<MonthStatus, string> = {
  settled: 'Settled',
  partial: 'Partial',
  unpaid: 'Unpaid',
  payment_only: 'Sirf Payment',
};

/** The running balance after a ledger line, from its kind and absolute amount (never a sign in the UI). */
export const BALANCE_TEXT: Record<ProfileBalance['kind'], (amountText: string) => string> = {
  baaki: (amountText) => `Baaki ${amountText}`,
  advance: (amountText) => `Advance ${amountText}`,
  zero: () => 'Barabar',
};

export const PROFILE_DATA_ERROR_TEXT: Record<DataErrorKind, string> = {
  network: 'Internet nahi mil raha. Connection check karke dobara try karo.',
  permission: 'Iski permission nahi hai. Logout karke dobara login karo.',
  constraint: 'Kuch galat bhara hai. Dobara try karo.',
  not_found: 'Yeh data nahi mila. Dobara load karke dekho.',
  unknown: 'Kuch gadbad ho gayi. Dobara try karo.',
};
