// Every user-visible Hinglish string of the Months (Mahine) screen lives here. Copy never computes
// figures (.claude/rules/ui-copy-hinglish.md). The month words are the profile's, so a month reads
// the same everywhere. "Charge Clear" (paid_i) and "Cash Mila" (payments dated in the month) are
// different concepts and are never mixed (L10); months have no credit figure (L11).
import type { DataErrorKind } from '@/lib/data';
import { MONTH_STATUS_TEXT, PROFILE_COPY } from '../farmers/profileCopy';
import { monthLabel } from '../shared/monthLabel';

const MONTH_WORDS = PROFILE_COPY.months;

export const MONTHS_COPY = {
  pageTitle: 'Mahine',
  loading: 'Mahine load ho rahe hain...',
  loadError: 'Mahine load nahi ho paye.',
  retry: 'Dobara try karo',
  badData: 'Kuch data galat lag raha hai, isliye hisaab nahi dikha sakte. Kuch bhi apne aap theek nahi kiya gaya.',
  noFarmers: 'Abhi koi Chalu kisan nahi.',
  addFarmerLink: 'Kisan add karo',
  noMonths: MONTH_WORDS.empty,
  noMonthsInYear: (yearKey: string) => `Saal ${yearKey} mein koi mahina nahi.`,
  /** One plain explanation of the four month figures (D30 g). */
  explain: {
    heading: 'Yeh figures kya batate hain',
    terms: [
      { term: MONTH_WORDS.charge, text: 'us mahine ka pani ka paisa.' },
      { term: MONTH_WORDS.chargeClear, text: 'us charge mein se ab tak jitna chuka (baad ke mahine ka payment bhi lag sakta hai).' },
      { term: MONTH_WORDS.remaining, text: 'jo abhi bhi baaki hai.' },
      {
        term: MONTH_WORDS.cash,
        text: 'us mahine mein mila paisa. Yeh purane charge mein bhi lag sakta hai, isliye kabhi "Unpaid" ke saath bhi Cash Mila dikhta hai.',
      },
    ],
  },
  year: {
    label: 'Saal',
    all: 'Sabhi saal',
  },
  strip: {
    heading: (yearKey: string | null) => (yearKey === null ? 'Sabhi mahino ka jod' : `Saal ${yearKey} ka jod`),
    time: MONTH_WORDS.time,
    charge: MONTH_WORDS.charge,
    cash: 'Cash Mila',
    baakiNote: 'Saal ke aakhir ka Baaki aur Advance / Credit Dashboard ke "Saal" view mein dikhta hai.',
    dashboardLink: 'Dashboard kholo',
  },
  list: {
    heading: 'Har mahina',
  },
  month: {
    label: monthLabel,
    time: MONTH_WORDS.time,
    duration: MONTH_WORDS.duration,
    charge: MONTH_WORDS.charge,
    chargeClear: MONTH_WORDS.chargeClear,
    remaining: MONTH_WORDS.remaining,
    cash: MONTH_WORDS.cash,
    counts: (entries: number, payments: number) => `${entries} entry, ${payments} payment`,
    open: (farmerCount: number) => `Kisan-wise dekho (${farmerCount})`,
    close: 'Band karo',
    breakdown: (monthKey: string) => `${monthLabel(monthKey)}: kisan-wise`,
  },
  farmer: {
    openProfile: (name: string) => `${name} ka hisaab kholo`,
  },
  status: MONTH_STATUS_TEXT,
  showMore: PROFILE_COPY.showMore,
} as const;

export const MONTHS_DATA_ERROR_TEXT: Record<DataErrorKind, string> = {
  network: 'Internet nahi mil raha. Connection check karke dobara try karo.',
  permission: 'Iski permission nahi hai. Logout karke dobara login karo.',
  constraint: 'Kuch galat bhara hai. Dobara try karo.',
  not_found: 'Yeh data nahi mila. Dobara load karke dekho.',
  unknown: 'Kuch gadbad ho gayi. Dobara try karo.',
};
