// Async resolver — given (user, attendee email/name), infers the
// professional relationship using a resolver chain:
//
//   1. user_tag (sovereign — never overwritten)
//   2. fresh non-user cache
//   3. generic-domain skip
//   4. daily lookup cap (50/user/24h)
//   5. Gemini Flash via Lovable AI Gateway (publicly indexed evidence)
//   6. cost-gated enrichment — if Gemini confidence < 0.5 AND external
//      domain AND enrichment cap (15/user/24h) AND FIRECRAWL_API_KEY:
//        Firecrawl search → distilled structured evidence → Gemini pass 2
//   7. domain heuristic fallback (sender domain matches user's email)
//   8. unknown / no-penalty floor
//
// Caches into attendee_relationships (90d TTL). Never blocks plan
// generation. Fired proactively by `sync-calendar` / `sync-apple-calendar`
// (post-sync, fire-and-forget) and also lazily by `generate-mastery-plan`
// as a backstop for races and user_tag updates.

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
const DAILY_ENRICHMENT_CAP = 15;

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

async function dailyEnrichmentCount(supabase: any, user_id: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabase
    .from("attendee_resolver_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user_id)
    .eq("status", "enrichment_attempt")
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

interface DistilledEvidence {
  name?: string | null;
  title?: string | null;
  company?: string | null;
  seniority?: string | null;
  profile_url?: string | null;
  evidence_source: string;
  evidence_summary: string; // <= 400 chars
}

/**
 * Cost-gated Firecrawl search → distill into structured evidence.
 * Raw scraped markdown is NEVER returned to the caller or logged;
 * we keep a short summary capped at 400 chars.
 */
async function firecrawlEnrich(
  attendee_email: string,
  attendee_name: string | null,
  domain: string,
): Promise<DistilledEvidence | null> {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) return null;
  const queryParts = [attendee_name, attendee_email, "site:linkedin.com/in OR site:" + domain].filter(Boolean);
  const query = queryParts.join(" ");
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        limit: 1,
        scrapeOptions: { formats: ["summary"] },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.log(`[resolve-attendee] firecrawl status=${res.status} ok=false`);
      return null;
    }
    const j = await res.json().catch(() => null);
    const first = Array.isArray(j?.data) ? j.data[0] : (Array.isArray(j?.web) ? j.web[0] : null);
    if (!first) return null;
    const profile_url: string | null = typeof first?.url === "string" ? first.url : null;
    const summaryRaw: string =
      (typeof first?.summary === "string" && first.summary) ||
      (typeof first?.description === "string" && first.description) ||
      (typeof first?.title === "string" && first.title) || "";
    const summary = summaryRaw.replace(/\s+/g, " ").slice(0, 400);
    if (!summary && !profile_url) return null;
    return {
      name: attendee_name,
      title: null,
      company: null,
      seniority: null,
      profile_url,
      evidence_source: "firecrawl",
      evidence_summary: summary,
    };
  } catch (e) {
    console.log(`[resolve-attendee] firecrawl error category=net msg=${(e as Error)?.message?.slice(0, 80)}`);
    return null;
  }
}

function buildGeminiPrompt(body: ResolveRequest, email: string, domain: string, evidence?: DistilledEvidence | null): string {
  const base = `Given the user and attendee below, infer the attendee's professional relationship to the user using only publicly indexed evidence.

User:
  name: ${body.user_name ?? "unknown"}
  title: ${body.user_title ?? "unknown"}
  company: ${body.user_company ?? "unknown"}

Attendee:
  name: ${body.attendee_name ?? "unknown"}
  email: ${email}
  domain: ${domain}`;
  const evidenceBlock = evidence ? `

Structured evidence (distilled, treat as ground truth where present):
  name: ${evidence.name ?? "unknown"}
  title: ${evidence.title ?? "unknown"}
  company: ${evidence.company ?? "unknown"}
  seniority: ${evidence.seniority ?? "unknown"}
  profile_url: ${evidence.profile_url ?? "none"}
  source: ${evidence.evidence_source}
  summary: ${evidence.evidence_summary}` : "";
  return `${base}${evidenceBlock}

Return strict JSON:
{
  "role": one of ${JSON.stringify(ROLES)},
  "seniority": "junior" | "mid" | "senior" | "exec" | null,
  "confidence": number 0..1,
  "evidence_url": string | null
}`;
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
  // 4. LLM pass 1 — public knowledge only
  const inferred = await callGemini(buildGeminiPrompt(body, email, domain, null));
  let role: string = (inferred && ROLES.includes(inferred.role)) ? inferred.role : "unknown";
  let seniority: string | null = inferred?.seniority ?? null;
  let confidence: number | null = typeof inferred?.confidence === "number" ? inferred.confidence : null;
  let evidence_url: string | null = typeof inferred?.evidence_url === "string" ? inferred.evidence_url : null;
  let evidence_summary: string | null = null;
  let source: string = "llm";

  // 5. Cost-gated enrichment — fires ONLY for external attendees where
  //    pass-1 confidence is low. Bounded by a 15/user/day cap so we never
  //    enrich every attendee. Firecrawl call is server-side; raw markdown
  //    is distilled before being passed to Gemini.
  const passOneWeak = (confidence ?? 0) < 0.5;
  const firecrawlAvailable = !!Deno.env.get("FIRECRAWL_API_KEY");
  if (passOneWeak && firecrawlAvailable) {
    const enrichCount = await dailyEnrichmentCount(supabase, body.user_id);
    if (enrichCount >= DAILY_ENRICHMENT_CAP) {
      await logLookup(supabase, body.user_id, email, "enrichment_skipped_cap");
    } else {
      await logLookup(supabase, body.user_id, email, "enrichment_attempt");
      const evidence = await firecrawlEnrich(email, body.attendee_name ?? null, domain);
      if (evidence) {
        const inferred2 = await callGemini(buildGeminiPrompt(body, email, domain, evidence));
        const role2 = (inferred2 && ROLES.includes(inferred2.role)) ? inferred2.role : null;
        const conf2 = typeof inferred2?.confidence === "number" ? inferred2.confidence : null;
        if (role2 && conf2 !== null && conf2 >= (confidence ?? 0)) {
          role = role2;
          confidence = conf2;
          seniority = inferred2?.seniority ?? seniority;
          evidence_url = (typeof inferred2?.evidence_url === "string" ? inferred2.evidence_url : null) ?? evidence.profile_url ?? evidence_url;
          evidence_summary = evidence.evidence_summary || null;
          source = "enrichment_llm";
        }
      }
    }
  }

  // 6. Domain heuristic fallback — if still weak/unknown and the attendee
  //    domain matches the user's own email domain, treat as internal peer.
  if ((role === "unknown" || (confidence ?? 0) < 0.3) && body.user_name) {
    const userEmailDomain = (body as any).user_email ? domainOf(String((body as any).user_email)) : "";
    if (userEmailDomain && userEmailDomain === domain && !GENERIC_DOMAINS.has(userEmailDomain)) {
      role = "peer";
      seniority = seniority ?? null;
      confidence = Math.max(confidence ?? 0, 0.4);
      source = "domain_heuristic";
    }
  }

  // 7. Upsert (only if no user_tag row exists — user tag is sovereign).
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
      evidence_summary,
      source,
      resolved_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: "user_id,attendee_email" });
  }

  await logLookup(supabase, body.user_id, email, "resolved");
  return new Response(JSON.stringify({ source, role, seniority, confidence }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});