// Hinglish copy of the config-error screen (Phase 10A fix 1): shown instead of a blank page when a
// Netlify / .env variable is missing or wrong. Only variable NAMES are ever shown, never values.
export const CONFIG_ERROR_COPY = {
  title: 'App shuru nahi ho paya.',
  body: 'Supabase se judne ki setting adhoori ya galat hai.',
  missing: 'Yeh variable nahi mila:',
  invalid: 'Yeh variable galat hai (https:// se shuru hona chahiye):',
  hint: 'Netlify mein Environment variables check karo, phir dobara deploy karo.',
  retry: 'Dobara try karo',
} as const;
