import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = () => {
  const configured = [
    Deno.env.get("MAREE_APP_URL") ?? "",
    ...(Deno.env.get("MAREE_ALLOWED_ORIGINS") ?? "").split(","),
  ];
  const origins = new Set<string>();
  for (const value of configured.map((entry) => entry.trim()).filter(Boolean)) {
    try {
      const parsed = new URL(value);
      const localHttp = parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
      if ((parsed.protocol === "https:" || localHttp) && !parsed.username && !parsed.password) {
        origins.add(parsed.origin);
      }
    } catch {
      // Ignore malformed optional origins.
    }
  }
  return origins;
};
const corsHeaders = (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  });
  const allowed = !origin || allowedOrigins().has(origin);
  if (origin && allowed) headers.set("Access-Control-Allow-Origin", origin);
  return { allowed, headers };
};
const json = (req: Request, body: unknown, status = 200) => {
  const { allowed, headers } = corsHeaders(req);
  headers.set("Content-Type", "application/json");
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers });
  }
  return new Response(JSON.stringify(body), { status, headers });
};
const hashToken = async (token: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
};

const decodeJwtPayload = (jwt: string): Record<string, unknown> => {
  const segment = jwt.split(".")[1];
  if (!segment) throw new Error("Invalid access token");
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Invalid access token claims");
  }
  return payload as Record<string, unknown>;
};

Deno.serve(async (req: Request) => {
  const { allowed, headers } = corsHeaders(req);
  if (!allowed) return json(req, { error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  if (req.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json(req, { error: "Content-Type must be application/json" }, 415);
  }
  let body: unknown;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) return json(req, { error: "Request body is too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json(req, { error: "Invalid JSON" }, 400);
  }
  if (
    typeof body !== "object" || body === null || Array.isArray(body) ||
    Object.keys(body).length !== 2 ||
    typeof (body as Record<string, unknown>).token !== "string" ||
    !/^[0-9a-f]{64}$/.test((body as Record<string, string>).token) ||
    !["approved", "rejected"].includes(String((body as Record<string, unknown>).action ?? "")) ||
    Object.keys(body).some((key) => key !== "token" && key !== "action")
  ) {
    return json(req, { error: "Invalid or expired confirmation link" }, 400);
  }
  const payload = body as { token: string; action: "approved" | "rejected" };

  const authorization = req.headers.get("Authorization") ?? "";
  const bearer = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!bearer) {
    return json(req, { error: "Sign in with the administrator account and complete MFA before confirming." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const accessToken = bearer[1];

  // Verify the token cryptographically before trusting its AAL claim.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return json(req, { error: "Administrator session is invalid or expired. Please sign in again." }, 401);
  }

  let claims: Record<string, unknown>;
  try {
    claims = decodeJwtPayload(accessToken);
  } catch {
    return json(req, { error: "Administrator session is invalid. Please sign in again." }, 401);
  }
  if (claims.sub !== userData.user.id || claims.aal !== "aal2") {
    return json(req, { error: "A verified MFA session is required before confirming this decision." }, 403);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isAdmin, error: adminCheckError } = await userClient.rpc("is_current_user_admin");
  if (adminCheckError || isAdmin !== true) {
    return json(req, { error: "Administrator access required." }, 403);
  }

  const { data, error } = await userClient.rpc("review_verification_request_by_email_token", {
    p_token_hash: await hashToken(payload.token),
    p_expected_action: payload.action,
  });
  if (error || (data !== "approved" && data !== "rejected")) {
    return json(req, { error: "Invalid, expired, or already used confirmation link" }, 400);
  }
  if (data !== payload.action) return json(req, { error: "Confirmation action does not match this link" }, 400);
  return json(req, { ok: true, status: data });
});
