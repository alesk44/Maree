import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return hex(bytes);
};
const hashToken = async (token: string) =>
  hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAREE_FROM_EMAIL");
  const adminEmail = Deno.env.get("MAREE_ADMIN_EMAIL");
  const configuredAppUrl = Deno.env.get("MAREE_APP_URL");
  if (!resendKey || !from || !adminEmail || !configuredAppUrl) {
    return json({ error: "Verification email is not configured. Add RESEND_API_KEY, MAREE_FROM_EMAIL, MAREE_ADMIN_EMAIL and MAREE_APP_URL secrets." }, 503);
  }
  let appUrl: string;
  try {
    const parsed = new URL(configuredAppUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Invalid app origin");
    appUrl = parsed.origin;
  } catch {
    return json({ error: "MAREE_APP_URL must be a valid HTTPS application origin." }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

  let body: { request_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.request_id) return json({ error: "request_id is required" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: row, error: rowError } = await admin.from("verification_requests")
    .select("id,user_id,requested_role,business_name,contact_name,phone,registration_number,evidence_note,created_at")
    .eq("id", body.request_id).eq("user_id", userData.user.id).maybeSingle();
  if (rowError || !row) return json({ error: "Request not found" }, 404);

  const [approveToken, rejectToken] = [randomToken(), randomToken()];
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: tokenError } = await admin.rpc("create_verification_email_action_tokens", {
    p_request_id: row.id,
    p_approved_hash: await hashToken(approveToken),
    p_rejected_hash: await hashToken(rejectToken),
    p_expires_at: expiresAt,
  });
  if (tokenError) return json({ error: "Could not prepare secure email actions" }, 500);

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
  if (!response.ok) return json({ error: "Email provider rejected the message", details: result }, 502);
  return json({ ok: true, email_id: result.id });
});
