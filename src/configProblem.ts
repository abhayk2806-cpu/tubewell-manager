import { parseConfig } from '@/lib/config';

type EnvSource = Parameters<typeof parseConfig>[0];

/** Which config variables are missing or invalid, by NAME only (values are never returned). */
export interface ConfigProblem {
  missing: string[];
  invalid: string[];
}

const NAMES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const;

/**
 * null when `parseConfig` (the one validator, D14) accepts the env; otherwise the names to fix.
 * parseConfig fails only for an empty variable or a URL that is not a valid https:// URL.
 */
export function configProblem(env: EnvSource): ConfigProblem | null {
  try {
    parseConfig(env);
    return null;
  } catch {
    const missing = NAMES.filter((name) => {
      const value = env[name];
      return typeof value !== 'string' || value.trim() === '';
    });
    return { missing, invalid: missing.length === 0 ? ['VITE_SUPABASE_URL'] : [] };
  }
}
