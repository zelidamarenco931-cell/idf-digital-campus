import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://ykiukumpnacztruvvxdk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_UjlXTjWDhUk5eMvkgG2I2g_EcKVXujd";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  }
});