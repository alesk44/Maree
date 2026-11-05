import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = () => {
  const values = [
    Deno.env.get("MAREE_APP_URL") ?? "",
    ...(Deno.env.get("MAREE_ALLOWED_ORIGINS") ?? "").split(","),
  ];
  const result = new Set<string>();
  for (const value of values.map((entry) => entry.trim()).filter(Boolean)) {
    try {
      const url = new URL(value);
      const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
      if ((url.protocol === "https:" || local) && !url.username && !url.password) result.add(url.origin);
    } catch { /* Ignore malformed optional origins. */ }
  }
  return result;
};

const cors = (req: Request) => {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  });
  const origin = req.headers.get("Origin");
  const allowed = !origin || allowedOrigins().has(origin);
  if (origin && allowed) headers.set("Access-Control-Allow-Origin", origin);
  return { headers, allowed };
};

const json = (req: Request, body: unknown, status = 200) => {
  const { headers, allowed } = cors(req);
  if (!allowed) return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers });
  return new Response(JSON.stringify(body), { status, headers });
};

const readJson = async (response: Response): Promise<Record<string, unknown>> => {
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Fishial returned an invalid response.");
  }
  return value as Record<string, unknown>;
};

Deno.serve(async (req: Request) => {
  const { headers, allowed } = cors(req);
  if (!allowed) return json(req, { error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (req.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json(req, { error: "Content-Type must be application/json" }, 415);
  }

  const bearer = /^Bearer\s+([^\s]+)$/i.exec(req.headers.get("Authorization") ?? "");
  if (!bearer) return json(req, { error: "Sign in is required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const clientId = Deno.env.get("FISHIAL_CLIENT_ID");
  const clientSecret = Deno.env.get("FISHIAL_CLIENT_SECRET");
  if (!supabaseUrl || !anonKey) return json(req, { error: "Authentication service is not configured." }, 503);
  if (!clientId || !clientSecret) {
    return json(req, { error: "Fishial is not enabled. Configure FISHIAL_CLIENT_ID and FISHIAL_CLIENT_SECRET as server secrets." }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(req, { error: "Session is invalid or expired." }, 401);
  const { data: profile, error: profileError } = await userClient
    .from("profiles").select("role").eq("id", userData.user.id).single();
  if (profileError || !profile || !["fisher", "restaurant"].includes(profile.role)) {
    return json(req, { error: "Only an approved fisher or restaurant account can use seafood recognition." }, 403);
  }

  let input: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 5_800_000) {
      return json(req, { error: "Image payload is too large. Use an image under 4 MB." }, 413);
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Invalid request.");
    input = parsed as Record<string, unknown>;
  } catch {
    return json(req, { error: "Invalid JSON payload." }, 400);
  }

  if (Object.keys(input).some((key) => !["imageBase64", "mimeType"].includes(key)) ||
      typeof input.imageBase64 !== "string" || typeof input.mimeType !== "string" ||
      !["image/jpeg", "image/png", "image/webp"].includes(input.mimeType) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.imageBase64) ||
      input.imageBase64.length === 0 || input.imageBase64.length > 5_592_408) {
    return json(req, { error: "Only JPEG, PNG or WEBP images up to 4 MB are accepted." }, 400);
  }

  // Decode and enforce the real byte limit before consuming quota.
  let imageBytes: Uint8Array;
  try {
    imageBytes = Uint8Array.from(atob(input.imageBase64), (char) => char.charCodeAt(0));
  } catch {
    return json(req, { error: "Image data is not valid base64." }, 400);
  }
  if (imageBytes.byteLength === 0 || imageBytes.byteLength > 4 * 1024 * 1024) {
    return json(req, { error: "Image must be between 1 byte and 4 MB." }, 413);
  }

  const { data: quota, error: quotaError } = await userClient.rpc("consume_seafood_recognition_quota");
  if (quotaError || !quota || typeof quota.allowed !== "boolean") {
    console.error("Fishial quota check failed", quotaError?.message ?? "Invalid quota response");
    return json(req, { error: "Recognition is temporarily unavailable. Please try again later." }, 503);
  }
  if (!quota.allowed) {
    const retryAfter = Math.max(1, Math.min(86400, Number(quota.retry_after_seconds) || 60));
    headers.set("Retry-After", String(retryAfter));
    return new Response(JSON.stringify({
      error: "Recognition limit reached. Please try again later.",
      remaining_today: Number(quota.remaining_today) || 0,
      retry_after_seconds: retryAfter,
    }), { status: 429, headers });
  }

  try {
    const authResponse = await fetch("https://api-recognition.fishial.ai/v2/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    });
    if (!authResponse.ok) {
      console.error("Fishial authentication failed", authResponse.status);
      return json(req, { error: "Fishial authentication is temporarily unavailable." }, 502);
    }
    const authPayload = await readJson(authResponse);
    if (typeof authPayload.access_token !== "string" || !authPayload.access_token) {
      return json(req, { error: "Fishial authentication response was invalid." }, 502);
    }

    const recognitionResponse = await fetch("https://api-recognition.fishial.ai/v2/recognize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authPayload.access_token}`,
        "Content-Type": input.mimeType as string,
      },
      body: imageBytes,
      signal: AbortSignal.timeout(30_000),
    });
    if (!recognitionResponse.ok) {
      const providerError = await recognitionResponse.text();
      console.error("Fishial recognition failed", recognitionResponse.status, providerError.slice(0, 300));
      if (recognitionResponse.status === 401) {
        return json(req, { error: "Fishial rejected the temporary access token." }, 502);
      }
      if (recognitionResponse.status === 413) return json(req, { error: "Image is too large for Fishial." }, 413);
      if (recognitionResponse.status === 415 || recognitionResponse.status === 422) {
        return json(req, { error: "Fishial could not process this image. Try a clear JPEG, PNG or WEBP photo." }, 422);
      }
      if (providerError.includes("credits_insufficient")) {
        return json(req, { error: "The Fishial free-plan allowance is unavailable or exhausted." }, 503);
      }
      return json(req, { error: "Fishial recognition is temporarily unavailable." }, 502);
    }

    const result = await readJson(recognitionResponse);
    if (result.ok !== true || !Array.isArray(result.objects) ||
        typeof result.definitions !== "object" || result.definitions === null) {
      return json(req, { error: "Fishial returned an incomplete recognition result." }, 502);
    }

    // Return the provider payload without guessing French names or altering confidence.
    // The application must map species through its curated bilingual Jersey catalogue.
    return json(req, {
      provider: "fishial-v2",
      objects: result.objects.slice(0, 10),
      definitions: result.definitions,
      queryToken: typeof result.queryToken === "string" ? result.queryToken : null,
      requires_human_confirmation: true,
      stored_by_maree: false,
    });
  } catch (error) {
    console.error("Fishial request failed", error instanceof Error ? error.message : "Unknown error");
    return json(req, { error: "Unable to identify this image. Try a clearer photo with one specimen visible." }, 502);
  }
});
