import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAREE_FROM_EMAIL");
  if (!resendKey || !from) return new Response(JSON.stringify({ error: "Email provider is not configured. Add RESEND_API_KEY and MAREE_FROM_EMAIL secrets." }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  let body: { request_id?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } }); }
  if (!body.request_id) return new Response(JSON.stringify({ error: "request_id is required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: row, error: rowError } = await admin.from("verification_requests").select("id,user_id,requested_role,business_name,contact_name,phone,registration_number,evidence_note").eq("id", body.request_id).eq("user_id", userData.user.id).maybeSingle();
  if (rowError || !row) return new Response(JSON.stringify({ error: "Request not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
  const roleLabel = row.requested_role === "fisher" ? "Pêcheur / Fisher" : "Restaurant";
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const html = `<h2>Nouvelle demande de vérification — Marée Jersey</h2><p><strong>Établissement :</strong> ${escape(row.business_name)}</p><p><strong>Type :</strong> ${roleLabel}</p><p><strong>Contact :</strong> ${escape(row.contact_name)} — ${escape(row.phone)}</p><p><strong>E-mail du compte :</strong> ${escape(userData.user.email ?? "non fourni")}</p><p><strong>Enregistrement :</strong> ${escape(row.registration_number ?? "non indiqué")}</p><p><strong>Informations :</strong><br>${escape(row.evidence_note).replaceAll("\n", "<br>")}</p><p>Examinez la demande dans le tableau de bord Supabase.</p>`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: ["alexozo44760@gmail.com"], subject: `Marée Jersey — demande de vérification : ${row.business_name}`, html, reply_to: userData.user.email ? [userData.user.email] : undefined }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return new Response(JSON.stringify({ error: "Email provider rejected the message", details: result }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ ok: true, email_id: result.id }), { headers: { ...cors, "Content-Type": "application/json" } });
});