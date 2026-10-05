import { createClient } from '@supabase/supabase-js';
import { parseConfig } from '@/lib/config';
import type { Database } from '@/types/database';

const config = parseConfig(import.meta.env);

export const supabase = createClient<Database>(config.supabaseUrl, config.supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
