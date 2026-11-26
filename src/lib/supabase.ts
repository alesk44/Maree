import { createClient } from "@supabase/supabase-js";

// These are public browser settings only. Never put a service_role key in client code.
const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"];
const SUPABASE_PUBLISHABLE_KEY = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

if (typeof SUPABASE_URL !== "string" || !SUPABASE_URL.trim() || typeof SUPABASE_PUBLISHABLE_KEY !== "string" || !SUPABASE_PUBLISHABLE_KEY.trim()) {
  throw new Error("Supabase is not configured for this environment.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
