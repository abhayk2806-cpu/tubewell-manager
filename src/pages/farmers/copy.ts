// Every user-visible Hinglish string of the Kisan (Farmers) screen lives here, so wording can
// change in one place. Copy never computes figures (.claude/rules/ui-copy-hinglish.md).
import { FARMER_MOBILE_MAX, FARMER_NAME_MAX, FARMER_NOTES_MAX } from '@/lib/data';
import type { DataErrorKind, FarmerValidationCode } from '@/lib/data';

export type FarmerSegment = 'active' | 'disabled' | 'deleted';

export const FARMERS_COPY = {
  pageTitle: 'Kisan',
  addButton: 'Naya Kisan',
  segmentsLabel: 'Kaun se kisan dikhayein',
  segments: { active: 'Chalu', disabled: 'Band', deleted: 'Deleted' } satisfies Record<FarmerSegment, string>,
  searchLabel: 'Kisan dhundo',
  searchPlaceholder: 'Naam ya mobile likho',
  loading: 'Kisan load ho rahe hain...',
  loadError: 'Kisan ki list load nahi ho payi.',
  retry: 'Dobara try karo',
  refreshFailed: 'Save ho gaya, par list refresh nahi ho payi.',
  empty: {
    active: "Abhi koi chalu kisan nahi hai. 'Naya Kisan' dabao.",
    disabled: 'Koi band kisan nahi hai.',
    deleted: 'Koi deleted kisan nahi hai.',
  } satisfies Record<FarmerSegment, string>,
  noSearchResults: 'Is naam ya mobile ka koi kisan nahi mila.',
  disabledBadge: 'Band',
  deletedOn: (dateKey: string) => `Delete hua: ${dateKey}`,
  actions: {
    edit: 'Edit',
    disable: 'Band karo',
    enable: 'Chalu karo',
    delete: 'Delete',
    restore: 'Wapas lao',
  },
  form: {
    addTitle: 'Kisan Add karo',
    editTitle: 'Kisan Edit karo',
    description: 'Naam zaroori hai. Mobile aur notes chahein to bharo.',
    name: 'Naam',
    mobile: 'Mobile (optional)',
    notes: 'Notes (optional)',
    save: 'Save karo',
    saving: 'Save ho raha hai...',
    cancel: 'Rehne do',
  },
  duplicate: {
    heading: 'Is naam ka kisan pehle se hai:',
    hint: 'Do kisan ka ek hi naam ho sakta hai. Galti se dobara to nahi bana rahe?',
    saveAnyway: 'Phir bhi save karo',
    changeName: 'Naam badlo',
  },
  deleteDialog: {
    title: (name: string) => `${name} ko delete karein?`,
    body: 'Iska pani aur paisa ka saara hisaab safe rahega. Wapas laane par sab wapas aa jayega.',
    confirm: 'Haan, delete karo',
    cancel: 'Rehne do',
  },
  restoreDialog: {
    title: (name: string) => `${name} ko wapas layein?`,
    body: 'Is naam ka kisan pehle se list mein hai:',
    confirm: 'Phir bhi wapas lao',
    cancel: 'Rehne do',
  },
  done: {
    created: (name: string) => `${name} add ho gaya.`,
    updated: (name: string) => `${name} save ho gaya.`,
    disabled: (name: string) => `${name} band ho gaya. 'Band' mein milega.`,
    enabled: (name: string) => `${name} chalu ho gaya.`,
    deleted: (name: string) => `${name} delete ho gaya. 'Deleted' mein milega.`,
    restored: (name: string) => `${name} wapas aa gaya.`,
  },
} as const;

/** Status words shown next to a matching farmer in the duplicate warning. */
export const FARMER_STATE_TEXT = { active: 'Chalu', disabled: 'Band' } as const;

export const FARMER_VALIDATION_TEXT: Record<FarmerValidationCode, string> = {
  name_required: 'Naam bharo.',
  name_too_long: `Naam ${FARMER_NAME_MAX} akshar se lamba nahi ho sakta.`,
  mobile_invalid: `Mobile mein kam se kam ek number ho; sirf number, space, + aur - chalenge (zyada se zyada ${FARMER_MOBILE_MAX}).`,
  notes_too_long: `Notes ${FARMER_NOTES_MAX} akshar se lambe nahi ho sakte.`,
};

export const DATA_ERROR_TEXT: Record<DataErrorKind, string> = {
  network: 'Internet nahi mil raha. Connection check karke dobara try karo.',
  permission: 'Iski permission nahi hai. Logout karke dobara login karo.',
  constraint: 'Kuch galat bhara hai. Form check karke dobara try karo.',
  not_found: 'Yeh kisan nahi mila. List refresh karke dobara dekho.',
  unknown: 'Kuch gadbad ho gayi. Dobara try karo.',
};
