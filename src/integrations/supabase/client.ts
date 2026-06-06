import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://ykiukumpnacztruvvxdk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_A6FS7ty3abWwf09WOaBjZg_U0TvsX8D";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  }
});