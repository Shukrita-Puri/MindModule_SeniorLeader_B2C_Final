import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-pro";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function firecrawlScrape(apiKey: string, url: string): Promise<{ ok: boolean; markdown?: string; summary?: string; metadata?: any; error?: string }> {
  try {
    const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        onlyMainContent: true,
        formats: ["markdown", "summary"],
      }),
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    if (!res.ok || !parsed) {
      return { ok: false, error: `firecrawl_${res.status}` };
    }
    const root = parsed.data ?? parsed ?? {};
    return {
      ok: true,
      markdown: typeof root.markdown === "string" ? root.markdown.slice(0, 60_000) : "",
      summary: typeof root.summary === "string" ? root.summary : undefined,
      metadata: root.metadata,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch_failed" };
  }
}

const SYSTEM_PROMPT = `You are an expert analyst building a Chief of Staff for the Mind (COS) intelligence profile for a senior executive. Your role is to synthesise onboarding inputs into a structured, actionable profile that the app uses to personalise daily briefs, Readiness Assessments, Prepare protocols, and Recalibrate recommendations.

Output must be:
- Operational and precise, never generic
- Performance-coded, never wellness-coded (say "cognitive load" not "stress", "recovery deficit" not "burnout", "regulation gap" not "anxiety")
- Honest about what is known vs provisional vs missing
- Structured for both app consumption (JSON fields) and in-app display (HTML)

You are writing for a CEO-level user. Tone: highly intelligent, discreet chief of staff. Direct. Economical. High signal. Never sounds like coaching, therapy, or personality assessment.

Critical rules:
- If freetext contains DISC / Enneagram / archetype / self-assessment, treat as PRIMARY SOURCE — overrides inferred traits. Flag where LinkedIn/writing confirms or diverges.
- LinkedIn: extract role, sector, trajectory, board exposure, positioning, communication signals. Do not infer emotional states from job titles.
- Writing/interviews: richest source for cognitive style and how the COS should speak to them.
- Be honest about confidence. Avoid false certainty.
- If LinkedIn or writing missing, explicitly list gaps in what_is_missing. Never fabricate.
- display_html must follow the Rishad COS profile format with classes: .hero, .section, .sec-label, .card, .card-body, .tag, .two-col, .lean-item, .flag, .flag-amber, .flag-red, .flag-teal, .quote, .missing-item.

You MUST call the tool "emit_cos_profile" exactly once with the structured profile. Do not return prose.`;

function buildUserPrompt(args: {
  userId: string;
  linkedinUrl: string | null;
  linkedinText: string;
  writingUrls: string[];
  writingText: string;
  freetext: string;
  stakesChips: string[];
  loadChips: string[];
  burdenChips: string[];
  goals: string[];
  briefTiming: string | null;
  resetModality: string | null;
  weekendSignals: string | null;
  calendarSelections: string[];
  wearableSelections: string[];
}) {
  return `Build a COS intelligence profile for this executive using the onboarding data below. Follow the output schema exactly.

### INPUT DATA

**LinkedIn URL provided:** ${args.linkedinUrl ?? "(none)"}
**LinkedIn profile content (scraped):**
${args.linkedinText || "(no scrape available)"}

**Published writing / interview URLs:** ${args.writingUrls.join(", ") || "(none)"}
**Writing content (scraped):**
${args.writingText || "(no scrape available)"}

**Self-provided context (free text):**
${args.freetext || "(none provided)"}
If this contains DISC, Enneagram, archetype, or any existing self-assessment, treat as PRIMARY SOURCE.

**High-stakes events that matter to them:** ${args.stakesChips.join(", ") || "(none selected)"}
**What tends to weigh on them:** ${args.loadChips.join(", ") || "(none selected)"}
**Operating burdens:** ${args.burdenChips.join(", ") || "(none selected)"}

**Goals selected (up to 3):** ${args.goals.join(", ") || "(none selected)"}
**Brief timing preference:** ${args.briefTiming ?? "(not set)"}
**Reset modality preference:** ${args.resetModality ?? "(not set)"}
**Weekend signals preference:** ${args.weekendSignals ?? "(not set)"}

**Calendar providers connected:** ${args.calendarSelections.join(", ") || "(none selected)"}
**Wearable providers connected:** ${args.wearableSelections.join(", ") || "(none selected)"}

user_id: ${args.userId}
timestamp: ${new Date().toISOString()}

Now emit the profile via the emit_cos_profile tool.`;
}

const COS_TOOL = {
  type: "function",
  function: {
    name: "emit_cos_profile",
    description: "Emit the structured Chief of Staff for the Mind profile.",
    parameters: {
      type: "object",
      properties: {
        profile_id: { type: "string" },
        generated_at: { type: "string" },
        data_sources: { type: "array", items: { type: "string" } },
        confidence_overall: { type: "string" },
        confidence_note: { type: "string" },
        identity: {
          type: "object",
          properties: {
            display_name: { type: "string" },
            role: { type: "string" },
            sector: { type: "string" },
            organisation_stage: { type: "string" },
            leadership_stage: { type: "string" },
          },
        },
        leadership_style: {
          type: "object",
          properties: {
            primary_style: { type: "string" },
            style_tags: { type: "array", items: { type: "string" } },
            style_description: { type: "string" },
            confidence: { type: "string" },
            source_note: { type: "string" },
          },
        },
        communication_profile: {
          type: "object",
          properties: {
            how_they_think: { type: "string" },
            how_they_communicate: { type: "string" },
            what_lands: { type: "array", items: { type: "string" } },
            what_wont_land: { type: "array", items: { type: "string" } },
            cos_brief_rules: { type: "string" },
            confidence: { type: "string" },
          },
        },
        existing_self_knowledge: {
          type: "object",
          properties: {
            disc_provided: { type: "boolean" },
            disc_type: { type: "string" },
            archetype_provided: { type: "boolean" },
            archetype_type: { type: "string" },
            other_frameworks: { type: "string" },
            alignment_note: { type: "string" },
            confidence: { type: "string" },
          },
        },
        cognitive_risk_profile: {
          type: "object",
          properties: {
            primary_risk: { type: "string" },
            risk_flags: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  flag: { type: "string" },
                  severity: { type: "string" },
                  description: { type: "string" },
                  trigger_conditions: { type: "string" },
                },
              },
            },
            regulation_strengths: { type: "array", items: { type: "string" } },
            confidence: { type: "string" },
          },
        },
        external_persona: {
          type: "object",
          properties: {
            summary: { type: "string" },
            legacy_signals: { type: "string" },
            confidence: { type: "string" },
          },
        },
        high_stakes_map: {
          type: "object",
          properties: {
            declared_events: { type: "array", items: { type: "string" } },
            inferred_events: { type: "array", items: { type: "string" } },
            event_frequency_estimate: { type: "string" },
          },
        },
        cognitive_load_map: {
          type: "object",
          properties: {
            declared_loads: { type: "array", items: { type: "string" } },
            inferred_loads: { type: "array", items: { type: "string" } },
            operating_burdens: { type: "array", items: { type: "string" } },
            primary_depletion_pattern: { type: "string" },
          },
        },
        goals: {
          type: "object",
          properties: {
            declared: { type: "array", items: { type: "string" } },
            cos_accountability_note: { type: "string" },
          },
        },
        brief_personalisation: {
          type: "object",
          properties: {
            timing: { type: "string" },
            reset_modality: { type: "string" },
            weekend_signals: { type: "string" },
            brief_voice_note: { type: "string" },
          },
        },
        provisional_archetype: {
          type: "object",
          properties: {
            name: { type: "string" },
            subtitle: { type: "string" },
            description: { type: "string" },
            to_be_confirmed_after: { type: "string" },
            confidence: { type: "string" },
          },
        },
        what_is_missing: {
          type: "array",
          items: {
            type: "object",
            properties: {
              gap_number: { type: "number" },
              gap: { type: "string" },
              description: { type: "string" },
            },
          },
        },
        display_html: { type: "string" },
      },
      required: [
        "confidence_overall",
        "identity",
        "leadership_style",
        "communication_profile",
        "cognitive_risk_profile",
        "goals",
        "brief_personalisation",
        "display_html",
      ],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) {
      console.warn("[synthesize-cos] auth_missing — returning 401 from authenticateRequest");
      return auth.errorResponse;
    }
    const userId = auth.userId!;
    console.info(`[synthesize-cos] start user_id=${redactUserId(userId)}`);

    const body = await req.json().catch(() => ({}));
    const force = !!(body as any)?.force;

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return json(503, { error: "ai_unavailable", message: "AI gateway not configured" });
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load current responses
    const { data: row, error: loadErr } = await db
      .from("onboarding_v8_responses")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (loadErr) {
      console.error("[synthesize-cos] load error:", loadErr);
      return json(500, { error: "load_failed" });
    }
    if (!row) {
      return json(400, { error: "no_onboarding_data" });
    }

    // Idempotency: if already ready and not forced, return cached
    if (!force && row.cos_profile_status === "ready" && row.cos_profile) {
      console.info(`[synthesize-cos] cached user_id=${redactUserId(userId)}`);
      return json(200, {
        ok: true,
        cached: true,
        cos_profile: row.cos_profile,
        cos_profile_html: row.cos_profile_html,
      });
    }

    // Mark in-progress
    await db
      .from("onboarding_v8_responses")
      .update({ cos_profile_status: "in_progress", cos_profile_error: null })
      .eq("user_id", userId);

    // ── 1. Firecrawl scraping ─────────────────────────────────────
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const linkedinUrl: string | null = row.linkedin_url ?? null;
    const writingUrls: string[] = Array.isArray(row.writing_urls) ? row.writing_urls.slice(0, 2) : [];

    let linkedinScrape: any = row.linkedin_scrape ?? null;
    const writingScrapes: any[] = [];

    if (firecrawlKey) {
      if (linkedinUrl && isValidHttpUrl(linkedinUrl) && !linkedinScrape) {
        const r = await firecrawlScrape(firecrawlKey, linkedinUrl);
        linkedinScrape = { url: linkedinUrl, ...r, scraped_at: new Date().toISOString() };
        console.info(`[synthesize-cos] firecrawl linkedin ok=${!!r.ok} status=${r.ok ? "scraped" : r.error ?? "unknown"}`);
      }
      for (const u of writingUrls) {
        if (!isValidHttpUrl(u)) {
          writingScrapes.push({ url: u, ok: false, error: "invalid_url" });
          continue;
        }
        const r = await firecrawlScrape(firecrawlKey, u);
        writingScrapes.push({ url: u, ...r, scraped_at: new Date().toISOString() });
        console.info(`[synthesize-cos] firecrawl writing ok=${!!r.ok}`);
      }
    } else {
      console.warn("[synthesize-cos] FIRECRAWL_API_KEY missing — skipping scrape");
    }

    // Persist scrapes (even on partial)
    await db
      .from("onboarding_v8_responses")
      .update({
        linkedin_scrape: linkedinScrape,
        writing_scrapes: writingScrapes,
      })
      .eq("user_id", userId);

    // ── 2. Build prompt ───────────────────────────────────────────
    const linkedinText =
      (linkedinScrape && (linkedinScrape.markdown || linkedinScrape.summary)) || "";
    const writingText = writingScrapes
      .map((w) => (w?.markdown || w?.summary || ""))
      .filter((t) => t && t.length > 0)
      .join("\n\n---\n\n");

    const userPrompt = buildUserPrompt({
      userId,
      linkedinUrl,
      linkedinText: String(linkedinText).slice(0, 30_000),
      writingUrls,
      writingText: String(writingText).slice(0, 30_000),
      freetext: String(row.freetext_context ?? "").slice(0, 6_000),
      stakesChips: row.stakes_chips ?? [],
      loadChips: row.load_chips ?? [],
      burdenChips: row.burden_chips ?? [],
      goals: row.goals ?? [],
      briefTiming: row.brief_timing,
      resetModality: row.reset_modality,
      weekendSignals: row.weekend_signals,
      calendarSelections: Array.isArray(row.calendar_selections) ? row.calendar_selections : [],
      wearableSelections: Array.isArray(row.wearable_selections) ? row.wearable_selections : [],
    });

    // ── 3. Call Lovable AI Gateway ────────────────────────────────
    console.info(`[synthesize-cos] calling AI model=${AI_MODEL} user_id=${redactUserId(userId)}`);
    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [COS_TOOL],
        tool_choice: { type: "function", function: { name: "emit_cos_profile" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[synthesize-cos] AI gateway error:", aiRes.status, errText);
      await db
        .from("onboarding_v8_responses")
        .update({
          cos_profile_status: "failed",
          cos_profile_error: `ai_${aiRes.status}: ${errText.slice(0, 500)}`,
        })
        .eq("user_id", userId);
      if (aiRes.status === 429) {
        return json(429, { error: "rate_limited", message: "Too many requests, please try again shortly." });
      }
      if (aiRes.status === 402) {
        return json(402, { error: "payment_required", message: "AI credits exhausted." });
      }
      return json(502, { error: "ai_failed" });
    }

    const aiPayload = await aiRes.json();
    const toolCall = aiPayload?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    let profile: any = null;
    try {
      profile = argsRaw ? JSON.parse(argsRaw) : null;
    } catch (e) {
      console.error("[synthesize-cos] tool args parse failed:", e);
    }

    if (!profile || typeof profile !== "object") {
      await db
        .from("onboarding_v8_responses")
        .update({
          cos_profile_status: "failed",
          cos_profile_error: "ai_no_tool_call",
        })
        .eq("user_id", userId);
      return json(502, { error: "ai_no_tool_call" });
    }

    const displayHtml = typeof profile.display_html === "string" ? profile.display_html : "";

    const { error: persistErr } = await db
      .from("onboarding_v8_responses")
      .update({
        cos_profile: profile,
        cos_profile_html: displayHtml,
        cos_profile_status: "ready",
        cos_profile_error: null,
        cos_profile_generated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (persistErr) {
      console.error("[synthesize-cos] persist error:", persistErr);
      return json(500, { error: "persist_failed" });
    }

    console.info(`[synthesize-cos] success user_id=${redactUserId(userId)} linkedin_ok=${!!(linkedinScrape && linkedinScrape.ok)} writing_ok=${writingScrapes.filter((w) => w?.ok).length}/${writingScrapes.length}`);
    return json(200, {
      ok: true,
      cached: false,
      cos_profile: profile,
      cos_profile_html: displayHtml,
      scrape_summary: {
        linkedin_ok: !!(linkedinScrape && linkedinScrape.ok),
        writing_ok_count: writingScrapes.filter((w) => w?.ok).length,
        writing_total: writingScrapes.length,
      },
    });
  } catch (err) {
    console.error("[synthesize-cos] Unexpected:", err);
    return json(500, { error: "internal_error" });
  }
});