import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseClient() {
  let SUPABASE_URL: string | undefined;
  let SUPABASE_PUBLISHABLE_KEY: string | undefined;

  // SSR (Cloudflare Workers) - process.env ou globalThis
  if (typeof process !== 'undefined' && process.env) {
    SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  }

  // Client-side (Vite)
  if (!SUPABASE_URL && typeof import.meta !== 'undefined') {
    SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;
    SUPABASE_PUBLISHABLE_KEY = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
  }

  // Fallback hardcoded (temporário para testar)
  if (!SUPABASE_URL) {
    SUPABASE_URL = "https://yklukumpnacztruvvxdk.supabase.co";
    SUPABASE_PUBLISHABLE_KEY = "sb_publishable_UjlXTjWDhUk5eMvkgG2I2g_EcKVXujd";
  }

  return createClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    }
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});