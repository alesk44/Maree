const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SUPABASE_KEY = "sb_publishable_local_unconfigured";

export type SupabaseClientSettings = {
  url: string;
  publishableKey: string;
  usingSafeLocalFallback: boolean;
};

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Supabase is deliberately restricted to the local CLI endpoint in this app.
 * A remote URL from an env file must never silently connect a preview to a
 * shared or production project.
 */
export function resolveSupabaseClientSettings(
  configuredUrl: string | undefined,
  configuredPublishableKey: string | undefined,
): SupabaseClientSettings {
  const key = configuredPublishableKey?.trim();
  try {
    const url = new URL(configuredUrl?.trim() ?? "");
    if (url.protocol === "http:" && isLoopback(url.hostname) && !url.username && !url.password && !url.search && !url.hash) {
      return {
        url: url.origin,
        publishableKey: key || LOCAL_SUPABASE_KEY,
        usingSafeLocalFallback: false,
      };
    }
  } catch {
    // Missing or invalid configuration falls back to the local-only endpoint.
  }

  return {
    url: LOCAL_SUPABASE_URL,
    publishableKey: LOCAL_SUPABASE_KEY,
    usingSafeLocalFallback: true,
  };
}
