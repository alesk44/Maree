import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
      // Ignore malformed optional origins; MAREE_APP_URL is validated below.
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
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return hex(bytes);
};
const hashToken = async (token: string) =>
  hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

Deno.serve(async (req: Request) => {
  const { allowed, headers } = corsHeaders(req);
  if (!allowed) return json(req, { error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAREE_FROM_EMAIL");
  const adminEmail = Deno.env.get("MAREE_ADMIN_EMAIL");
  const configuredAppUrl = Deno.env.get("MAREE_APP_URL");
  if (!resendKey || !from || !adminEmail || !configuredAppUrl) {
    return json(req, { error: "Verification email service is unavailable." }, 503);
  }
  let appUrl: string;
  try {
    const parsed = new URL(configuredAppUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Invalid app origin");
    appUrl = parsed.origin;
  } catch {
    return json(req, { error: "Verification email service is unavailable." }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(req, { error: "Unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(req, { error: "Unauthorized" }, 401);

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
    Object.keys(body).length !== 1 ||
    typeof (body as Record<string, unknown>).request_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test((body as Record<string, string>).request_id)
  ) {
    return json(req, { error: "Invalid request payload" }, 400);
  }
  const requestId = (body as { request_id: string }).request_id;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: row, error: rowError } = await admin.from("verification_requests")
    .select("id,user_id,requested_role,business_name,contact_name,phone,registration_number,evidence_note,created_at")
    .eq("id", requestId).eq("user_id", userData.user.id).maybeSingle();
  if (rowError || !row) return json(req, { error: "Request not found" }, 404);

  const [approveToken, rejectToken] = [randomToken(), randomToken()];
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: tokenError } = await admin.rpc("create_verification_email_action_tokens", {
    p_request_id: row.id,
    p_approved_hash: await hashToken(approveToken),
    p_rejected_hash: await hashToken(rejectToken),
    p_expires_at: expiresAt,
  });
  if (tokenError) return json(req, { error: "Could not prepare secure email actions" }, 500);

  const actionUrl = (token: string, action: string) =>
    `${appUrl}/admin/email-review?token=${encodeURIComponent(token)}&action=${action}`;
  const roleLabel = row.requested_role === "fisher" ? "Pêcheur / Fisher" : "Restaurant";
  const html = `<h2>Nouvelle demande de vérification — Marée Jersey</h2>
    <p><strong>Établissement :</strong> ${escape(row.business_name)}</p>
    <p><strong>Type :</strong> ${roleLabel}</p>
    <p><strong>Contact :</strong> ${escape(row.contact_name)} — ${escape(row.phone)}</p>
    <p><strong>E-mail du compte :</strong> ${escape(userData.user.email ?? "non fourni")}</p>
    <p><strong>Enregistrement :</strong> ${escape(row.registration_number ?? "non indiqué")}</p>
    <p><strong>Informations :</strong><br>${escape(row.evidence_note).replaceAll("\\n", "<br>")}</p>
    <p>Ces liens expirent dans 24 heures et ne peuvent être utilisés qu'une seule fois. Ils ouvrent une page de confirmation : aucune décision n'est prise par le simple chargement du lien.</p>
    <p><a href="${actionUrl(approveToken, "approved")}" style="display:inline-block;background:#16734a;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">✓ APPROUVER LE COMPTE</a></p>
    <p><a href="${actionUrl(rejectToken, "rejected")}" style="display:inline-block;background:#a83232;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">✕ REFUSER LE COMPTE</a></p>
    <p>Ou examinez la demande dans votre espace administrateur.</p>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [adminEmail],
      subject: `Marée Jersey — demande de vérification : ${row.business_name}`,
      html, reply_to: userData.user.email ? [userData.user.email] : undefined,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return json(req, { error: "Email provider rejected the message" }, 502);
  return json(req, { ok: true, email_id: result.id });
});
