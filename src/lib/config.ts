// Parses and validates the public env vars the app needs (decision D14).
// Pure: takes the env object, returns typed config or throws one clear error.

export interface AppConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

type EnvSource = Record<string, string | boolean | undefined>;

export function parseConfig(env: EnvSource): AppConfig {
  const read = (name: string): string => {
    const value = env[name];
    return typeof value === 'string' ? value.trim() : '';
  };

  const supabaseUrl = read('VITE_SUPABASE_URL');
  const supabasePublishableKey = read('VITE_SUPABASE_PUBLISHABLE_KEY');

  const missing = [
    !supabaseUrl && 'VITE_SUPABASE_URL',
    !supabasePublishableKey && 'VITE_SUPABASE_PUBLISHABLE_KEY',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variable(s): ${missing.join(', ')}. Copy .env.example to .env and fill them in.`,
    );
  }

  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error(`VITE_SUPABASE_URL is not a valid URL: "${supabaseUrl}".`);
  }
  if (url.protocol !== 'https:') {
    throw new Error('VITE_SUPABASE_URL must use https://.');
  }

  return { supabaseUrl: url.origin, supabasePublishableKey };
}
