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

const extractOutputText = (payload: Record<string, unknown>): string => {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part === "object" && part !== null) {
        const candidate = part as Record<string, unknown>;
        if (candidate.type === "output_text" && typeof candidate.text === "string") return candidate.text;
      }
    }
  }
  throw new Error("The recognition provider returned no text.");
};

const allowedGroups = new Set(["fish", "crustacean", "mollusc", "other", "unknown"]);
const allowedConfidence = new Set(["high", "medium", "low"]);

Deno.serve(async (req: Request) => {
  const { headers, allowed } = cors(req);
  if (!allowed) return json(req, { error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (req.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json(req, { error: "Content-Type must be application/json" }, 415);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const bearer = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!bearer) return json(req, { error: "Sign in is required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !anonKey) return json(req, { error: "Authentication service is not configured." }, 503);
  if (!openAiKey) return json(req, { error: "Seafood recognition is not configured yet. Add the OPENAI_API_KEY Supabase secret." }, 503);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(req, { error: "Session is invalid or expired." }, 401);
  const { data: profile, error: profileError } = await userClient.from("profiles").select("role").eq("id", userData.user.id).single();
  if (profileError || !profile || !["fisher", "restaurant"].includes(profile.role)) {
    return json(req, { error: "Only an approved fisher or restaurant account can use seafood recognition." }, 403);
  }

  let body: unknown;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 5_800_000) return json(req, { error: "Image payload is too large. Use an image under 4 MB." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json(req, { error: "Invalid JSON payload." }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return json(req, { error: "Invalid request." }, 400);
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["imageBase64", "mimeType"].includes(key)) ||
      typeof input.imageBase64 !== "string" || typeof input.mimeType !== "string" ||
      !["image/jpeg", "image/png", "image/webp"].includes(input.mimeType) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(input.imageBase64) || input.imageBase64.length > 5_600_000) {
    return json(req, { error: "Only JPEG, PNG or WEBP images up to 4 MB are accepted." }, 400);
  }

  try {
    const prompt = `Identify visible seafood species for a Jersey (Channel Islands) fish-market traceability assistant.
Return JSON only, with this exact shape:
{"is_seafood":boolean,"candidates":[{"common_name_fr":string,"common_name_en":string,"scientific_name":string,"group":"fish"|"crustacean"|"mollusc"|"other"|"unknown","confidence":"high"|"medium"|"low","visual_reason":string}],"image_notes":string}
Return at most 3 candidates, ranked from most to least plausible. Include common local/European market species when visually supported, such as sea bass/bar, gilthead sea bream/dorade royale, sole, turbot, brill, plaice, pollock, mackerel, sardine, red mullet, hake, cod, ray, conger, lobster, crawfish, brown crab, spider crab, velvet crab, shrimp, prawn, langoustine, oyster, mussel, clam, cockle, scallop, squid, cuttlefish and octopus.
Do not guess a species from a vague image. If the image is not clearly seafood, set is_seafood=false and candidates=[].
If the species cannot be distinguished reliably, use a broad/common group name and low confidence. Never claim freshness, origin, catch method, legality, food safety, size, weight or certification from an image. Visual identification is advisory only; the user must confirm it.`;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-5.4-mini",
        store: false,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: `data:${input.mimeType};base64,${input.imageBase64}`, detail: "high" },
          ],
        }],
        text: { format: { type: "json_object" } },
        max_output_tokens: 700,
      }),
    });
    if (!response.ok) {
      const providerBody = await response.text();
      console.error("Vision provider error", response.status, providerBody.slice(0, 500));
      return json(req, { error: "Species recognition is temporarily unavailable." }, 502);
    }
    const providerPayload = await response.json() as Record<string, unknown>;
    const parsed = JSON.parse(extractOutputText(providerPayload)) as Record<string, unknown>;
    if (typeof parsed.is_seafood !== "boolean" || !Array.isArray(parsed.candidates)) {
      return json(req, { error: "Recognition result format was invalid." }, 502);
    }
    const candidates = parsed.candidates.slice(0, 3).flatMap((value) => {
      if (typeof value !== "object" || value === null) return [];
      const candidate = value as Record<string, unknown>;
      if (typeof candidate.common_name_fr !== "string" || typeof candidate.common_name_en !== "string" ||
          typeof candidate.scientific_name !== "string" || typeof candidate.group !== "string" ||
          typeof candidate.confidence !== "string" || typeof candidate.visual_reason !== "string" ||
          !allowedGroups.has(candidate.group) || !allowedConfidence.has(candidate.confidence)) return [];
      return [{
        common_name_fr: candidate.common_name_fr.slice(0, 100),
        common_name_en: candidate.common_name_en.slice(0, 100),
        scientific_name: candidate.scientific_name.slice(0, 120),
        group: candidate.group,
        confidence: candidate.confidence,
        visual_reason: candidate.visual_reason.slice(0, 240),
      }];
    });
    return json(req, {
      is_seafood: parsed.is_seafood,
      candidates,
      image_notes: typeof parsed.image_notes === "string" ? parsed.image_notes.slice(0, 300) : "",
      requires_human_confirmation: true,
      stored: false,
    });
  } catch (error) {
    console.error("Seafood recognition failed", error instanceof Error ? error.message : "Unknown error");
    return json(req, { error: "Unable to identify this image. Try a clearer photo with one specimen visible." }, 502);
  }
});
