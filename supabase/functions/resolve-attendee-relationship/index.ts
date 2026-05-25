// Async resolver — given (user, attendee email/name), infers the
// professional relationship from publicly indexed LinkedIn data using
// Gemini Flash with web grounding. Caches into attendee_relationships
// (90d TTL). Never blocks plan generation; called by calendar sync.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GENERIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com",
  "proton.me", "protonmail.com",
]);

const ROLES = [
  "boss", "board_member", "investor", "client", "vendor",
  "peer", "report", "external_partner", "unknown",
] as const;

const DAILY_LOOKUP_CAP = 50;

interface ResolveRequest {
  user_id: string;
  user_name?: string;
  user_title?: string;
  user_company?: string;
  attendee_email: string;
  attendee_name?: string;
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1).toLowerCase().trim();
}

async function logLookup(supabase: any, user_id: string, attendee_email: string, status: string) {
  try {
    await supabase.from("attendee_resolver_log").insert({ user_id, attendee_email, status });
  } catch (_e) { /* swallow */ }
}

async function dailyLookupCount(supabase: any, user_id: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabase
    .from("attendee_resolver_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user_id)
    .eq("status", "resolved")
    .gte("created_at", since);
  return count ?? 0;
}

async function callGemini(prompt: string): Promise<any | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You return only strict JSON. Infer professional relationships from publicly indexed LinkedIn data. If unsure, return role='unknown'. Never fabricate evidence URLs." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: ResolveRequest;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!body?.user_id || !body?.attendee_email) {
    return new Response(JSON.stringify({ error: "missing_fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const email = body.attendee_email.toLowerCase().trim();
  const domain = domainOf(email);

  // 1. cached?
  const { data: cached } = await supabase
    .from("attendee_relationships")
    .select("*")
    .eq("user_id", body.user_id)
    .eq("attendee_email", email)
    .maybeSingle();

  if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
    return new Response(JSON.stringify({ source: "cache", relationship: cached }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 2. generic-domain blocklist
  if (GENERIC_DOMAINS.has(domain)) {
    await logLookup(supabase, body.user_id, email, "skipped_generic");
    return new Response(JSON.stringify({ source: "skipped_generic", role: "unknown" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 3. rate cap
  const count = await dailyLookupCount(supabase, body.user_id);
  if (count >= DAILY_LOOKUP_CAP) {
    await logLookup(supabase, body.user_id, email, "rate_limited");
    return new Response(JSON.stringify({ source: "rate_limited", role: "unknown" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 4. LLM lookup
  const prompt = `Given the user and attendee below, infer the attendee's professional relationship to the user using only publicly indexed LinkedIn data.

User:
  name: ${body.user_name ?? "unknown"}
  title: ${body.user_title ?? "unknown"}
  company: ${body.user_company ?? "unknown"}

Attendee:
  name: ${body.attendee_name ?? "unknown"}
  email: ${email}
  domain: ${domain}

Return strict JSON:
{
  "role": one of ${JSON.stringify(ROLES)},
  "seniority": "junior" | "mid" | "senior" | "exec" | null,
  "confidence": number 0..1,
  "evidence_url": string | null
}`;

  const inferred = await callGemini(prompt);
  const role = ROLES.includes(inferred?.role) ? inferred.role : "unknown";
  const seniority = inferred?.seniority ?? null;
  const confidence = typeof inferred?.confidence === "number" ? inferred.confidence : null;
  const evidence_url = typeof inferred?.evidence_url === "string" ? inferred.evidence_url : null;

  // 5. upsert (only if no user_tag row exists — user tag is sovereign)
  if (!cached || cached.source !== "user_tag") {
    const expiresAt = new Date(Date.now() + 90 * 24 * 3600_000).toISOString();
    await supabase.from("attendee_relationships").upsert({
      user_id: body.user_id,
      attendee_email: email,
      attendee_name: body.attendee_name ?? null,
      attendee_domain: domain,
      role,
      seniority,
      confidence,
      evidence_url,
      source: "llm",
      resolved_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: "user_id,attendee_email" });
  }

  await logLookup(supabase, body.user_id, email, "resolved");
  return new Response(JSON.stringify({ source: "llm", role, seniority, confidence }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});