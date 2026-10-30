import { createClient } from "@supabase/supabase-js";

// These are public browser settings only. Never put a service_role key in client code.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://lhdsvhxszjpzduyzlgpl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_aWgThnbZVePixYlki3TchA_vKfLo3be";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
