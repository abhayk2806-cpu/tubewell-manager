// Every user-visible Hinglish string of the Dashboard lives here. Copy never computes figures
// (.claude/rules/ui-copy-hinglish.md): amounts arrive as text from formatRupees. Baaki (outstanding)
// and Advance / Credit are always two separate figures (L8, E18); "Cash Mila" is cash received in
// the period (L10), never "Charge Clear".
import type { DataErrorKind } from '@/lib/data';
import type { DashboardView } from '@/lib/ledger';
import { monthLabel } from '../shared/monthLabel';

export const DASHBOARD_COPY = {
  pageTitle: 'Dashboard',
  loading: 'Dashboard load ho raha hai...',
  loadError: 'Dashboard load nahi ho paya.',
  retry: 'Dobara try karo',
  refreshFailed: 'Save ho gaya, par dashboard refresh nahi ho paya.',
  badData: 'Kuch data galat lag raha hai, isliye hisaab nahi dikha sakte. Kuch bhi apne aap theek nahi kiya gaya.',
  addUsage: 'Pani add',
  addPayment: 'Paisa add',
  noFarmers: 'Abhi koi Chalu kisan nahi.',
  addFarmerLink: 'Kisan add karo',
  period: {
    label: 'Kaunsa samay',
    options: { all: 'Abhi tak', month: 'Mahina', year: 'Saal' } satisfies Record<DashboardView['kind'], string>,
    monthPicker: 'Mahina chuno',
    yearPicker: 'Saal chuno',
    monthBreakdown: 'Is mahine ka kisan-wise hisaab',
    monthLabel,
  },
  /** One sentence on what the period means (D1, L11). */
  explain: {
    all: 'Abhi tak ka poora hisaab. Baaki aur Advance / Credit aaj tak ke hain.',
    month: (monthKey: string) =>
      `${monthLabel(monthKey)} mein bana charge aur mila cash. Baaki aur Advance / Credit ${monthLabel(monthKey)} ke aakhir tak ke hain.`,
    year: (yearKey: string) =>
      `Saal ${yearKey} mein bana charge aur mila cash. Baaki aur Advance / Credit ${yearKey} ke aakhir tak ke hain.`,
  },
  noActivity: 'Is samay mein koi pani entry ya payment nahi.',
  tiles: {
    heading: 'Hisaab',
    charges: 'Charge (pani)',
    cash: 'Cash Mila',
    outstanding: 'Baaki',
    credit: 'Advance / Credit',
  },
  summary: {
    baaki: (count: number, name: string, amountText: string) => `${count} kisan ka baaki hai. Sabse zyada: ${name} ${amountText}.`,
    noBaaki: 'Kisi kisan ka baaki nahi.',
    credit: (count: number) => `${count} kisan ke paas Advance / Credit hai.`,
  },
  chart: {
    heading: 'Mahine ke hisaab',
    hint: 'Kisi mahine par dabao, us mahine ka hisaab dikhega.',
    legendCharge: 'Charge',
    legendCash: 'Cash Mila',
    empty: 'Abhi koi mahina nahi (na pani entry, na payment).',
    column: (monthKey: string, chargeText: string, cashText: string) =>
      `${monthLabel(monthKey)}: Charge ${chargeText}, Cash Mila ${cashText}. Is mahine ka hisaab dikhao.`,
    tableCaption: 'Mahine ke hisaab (table)',
    month: 'Mahina',
    allMonths: 'Saare mahine',
    monthLabel,
  },
  farmers: {
    heading: 'Kisan',
    searchLabel: 'Kisan dhundo',
    searchPlaceholder: 'Naam likho',
    count: (shown: number, total: number) => `${shown} / ${total} kisan`,
    noResult: 'Is naam ka koi kisan nahi mila.',
    openProfile: (name: string) => `${name} ka hisaab kholo`,
    baaki: 'Baaki',
    credit: 'Advance / Credit',
    charges: 'Charge',
    cash: 'Cash Mila',
    payment: 'Paisa',
    usage: 'Pani',
    paymentFor: (name: string) => `${name}: Paisa add`,
    usageFor: (name: string) => `${name}: Pani add`,
  },
  recent: {
    heading: 'Haal ki entries',
    empty: 'Abhi tak koi entry ya payment nahi.',
    usage: 'Pani entry',
    payment: 'Paisa mila',
    when: (dateKey: string, timeKey: string) => `${dateKey}, ${timeKey}`,
    openProfile: (name: string) => `${name} ka hisaab kholo`,
  },
  band: {
    heading: 'Band kisan',
    text: (count: number, baakiText: string, creditText: string) =>
      `${count} Band kisan ka hisaab baaki hai: Baaki ${baakiText}, Advance / Credit ${creditText}. Yeh upar ke total mein shamil nahi hai.`,
    link: 'Kisan list dekho',
  },
} as const;

export const DASHBOARD_DATA_ERROR_TEXT: Record<DataErrorKind, string> = {
  network: 'Internet nahi mil raha. Connection check karke dobara try karo.',
  permission: 'Iski permission nahi hai. Logout karke dobara login karo.',
  constraint: 'Kuch galat bhara hai. Dobara try karo.',
  not_found: 'Yeh data nahi mila. Dobara load karke dekho.',
  unknown: 'Kuch gadbad ho gayi. Dobara try karo.',
};
