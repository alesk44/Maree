import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseClientSettings } from "@/lib/supabase-config";

// Client-side requests are restricted to the local Supabase CLI endpoint.
// Remote project URLs are rejected until an isolated non-production backend is
// explicitly designed and reviewed; never add a service_role key here.
const settings = resolveSupabaseClientSettings(
  import.meta.env["VITE_SUPABASE_URL"],
  import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
);

export const supabase = createClient(settings.url, settings.publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
