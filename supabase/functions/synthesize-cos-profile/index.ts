import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { CANONICAL_ARCHETYPES, resolveArchetypeSlug } from "../_shared/archetype-slug.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-mm-client-platform",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// v2026-09-07 — this call runs once per user and the output is the leader's
// entire personalisation substrate, so quality outranks cost here. The retry
// leg drops to the fast Flash model only if the primary is rate-limited.
const AI_MODEL = "google/gemini-3.1-pro-preview";
const AI_MODEL_FALLBACK = "google/gemini-3.8-flash";

type CosFallbackArgs = {
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
};

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

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function compactList(values: string[], fallback: string): string {
  const clean = values.map((v) => String(v).trim()).filter(Boolean);
  return clean.length ? clean.join(", ") : fallback;
}

function hasMeaningfulCosInput(args: CosFallbackArgs): boolean {
  return Boolean(
    args.linkedinUrl ||
    args.linkedinText ||
    args.writingUrls.length ||
    args.writingText ||
    args.freetext ||
    args.stakesChips.length ||
    args.loadChips.length ||
    args.burdenChips.length ||
    args.goals.length ||
    args.briefTiming ||
    args.resetModality ||
    args.weekendSignals ||
    args.calendarSelections.length ||
    args.wearableSelections.length,
  );
}

function inferSelfKnowledge(freetext: string) {
  const disc = freetext.match(/\bDISC\s*[:=-]?\s*([A-Z/ -]{1,16})/i);
  const enneagram = freetext.match(/\b(?:enneagram|type)\s*[:=-]?\s*([0-9][a-zw0-9 -]*)/i);
  return {
    discType: disc?.[1]?.trim() || "",
    otherFrameworks: enneagram ? `Enneagram/type signal: ${enneagram[1].trim()}` : "",
  };
}

function buildFallbackDisplayHtml(profile: any): string {
  const gaps = Array.isArray(profile.what_is_missing) ? profile.what_is_missing : [];
  return `
<div class="hero">
  <div class="sec-label">Chief of Staff profile</div>
  <h2>Provisional leadership context</h2>
  <p>${escapeHtml(profile.confidence_note)}</p>
</div>
<div class="section">
  <div class="sec-label">What we know</div>
  <div class="card"><div class="card-body">
    <span class="tag">Goals: ${escapeHtml(compactList(profile.goals?.declared ?? [], "not selected"))}</span>
    <span class="tag">High stakes: ${escapeHtml(compactList(profile.high_stakes_map?.declared_events ?? [], "not declared"))}</span>
    <span class="tag">Load: ${escapeHtml(compactList(profile.cognitive_load_map?.declared_loads ?? [], "not declared"))}</span>
  </div></div>
</div>
<div class="section">
  <div class="sec-label">How Mind Module should brief you</div>
  <div class="card"><div class="card-body">${escapeHtml(profile.communication_profile?.cos_brief_rules ?? "")}</div></div>
</div>
<div class="section">
  <div class="sec-label">Missing context</div>
  ${gaps.map((g: any) => `<div class="missing-item">${escapeHtml(g.gap)} — ${escapeHtml(g.description)}</div>`).join("")}
</div>`.trim();
}

function buildFallbackCosProfile(args: CosFallbackArgs, reason: string) {
  const generatedAt = new Date().toISOString();
  const self = inferSelfKnowledge(args.freetext);
  const hasExternalText = Boolean(args.linkedinText || args.writingText);
  const dataSources = [
    args.linkedinUrl ? "linkedin_url" : null,
    args.linkedinText ? "linkedin_scrape" : null,
    args.writingUrls.length ? "writing_urls" : null,
    args.writingText ? "writing_scrapes" : null,
    args.freetext ? "self_provided_context" : null,
    args.stakesChips.length || args.loadChips.length || args.burdenChips.length ? "cognitive_load_chips" : null,
    args.goals.length ? "goals" : null,
    args.calendarSelections.length ? "calendar_connection_choice" : null,
    args.wearableSelections.length ? "wearable_connection_choice" : null,
  ].filter(Boolean);
  const confidence = hasExternalText || args.freetext.length > 120 ? "medium" : hasMeaningfulCosInput(args) ? "low" : "very_low";

  const profile: any = {
    profile_id: `cos_${args.userId}_${Date.now()}`,
    generated_at: generatedAt,
    data_sources: dataSources,
    confidence_overall: confidence,
    confidence_note:
      `Generated provisionally from onboarding data because ${reason}. This profile is intentionally conservative and will improve when LinkedIn, writing, or richer self-context is available.`,
    identity: {
      display_name: "Executive",
      role: args.linkedinUrl ? "LinkedIn URL provided; role not yet extracted" : "Role not provided",
      sector: "Not provided",
      organisation_stage: "Not provided",
      leadership_stage: args.stakesChips.length ? "High-stakes operating context declared" : "Not yet established",
    },
    leadership_style: {
      primary_style: self.discType ? `Self-reported DISC ${self.discType}` : "Provisional operator",
      style_tags: [
        ...args.goals.slice(0, 3),
        ...args.stakesChips.slice(0, 2),
      ].filter(Boolean),
      style_description:
        args.freetext ||
        "Leadership style cannot be inferred yet from external materials. Use declared goals and load signals only until richer context is available.",
      confidence,
      source_note: args.freetext ? "Based primarily on self-provided context." : "Based on onboarding selections only.",
    },
    communication_profile: {
      how_they_think:
        args.writingText
          ? "Writing was provided for later enrichment; use it as the main source for cognitive style."
          : "Cognitive style is not yet directly evidenced.",
      how_they_communicate:
        args.freetext
          ? "Mirror the user's own stated operating language and avoid over-inference."
          : "Use concise, executive-grade language and make uncertainty explicit.",
      what_lands: ["Direct signal", "Clear tradeoffs", "Specific next action"],
      what_wont_land: ["Generic encouragement", "Wellness language", "Overconfident personality claims"],
      cos_brief_rules:
        "Brief with discretion and precision. Name what is known, what is provisional, and what is missing. Tie recommendations to declared goals, load, and high-stakes moments.",
      confidence,
    },
    existing_self_knowledge: {
      disc_provided: Boolean(self.discType),
      disc_type: self.discType,
      archetype_provided: Boolean(self.otherFrameworks),
      archetype_type: "",
      other_frameworks: self.otherFrameworks,
      alignment_note: self.discType || self.otherFrameworks ? "Treat self-reported frameworks as primary until contradicted by richer source material." : "No self-knowledge framework provided.",
      confidence: self.discType || self.otherFrameworks ? "medium" : "low",
    },
    cognitive_risk_profile: {
      primary_risk: args.loadChips[0] || args.burdenChips[0] || "Context not yet specific enough to name a primary risk",
      risk_flags: [
        ...args.loadChips.slice(0, 2).map((flag) => ({
          flag,
          severity: "unknown",
          description: `Declared load signal: ${flag}`,
          trigger_conditions: compactList(args.stakesChips, "High-demand leadership moments"),
        })),
        ...args.burdenChips.slice(0, 1).map((flag) => ({
          flag,
          severity: "unknown",
          description: `Declared operating burden: ${flag}`,
          trigger_conditions: "Sustained demand without recovery space",
        })),
      ],
      regulation_strengths: args.goals.length ? args.goals : ["To be learned through check-ins and practice usage"],
      confidence,
    },
    external_persona: {
      summary: args.linkedinUrl ? `LinkedIn URL provided: ${args.linkedinUrl}` : "No external persona source provided.",
      legacy_signals: args.writingUrls.length ? `Writing/interview URLs provided: ${args.writingUrls.join(", ")}` : "No writing/interview sources provided.",
      confidence: hasExternalText ? "medium" : "low",
    },
    high_stakes_map: {
      declared_events: args.stakesChips,
      inferred_events: [],
      event_frequency_estimate: "Requires calendar history to estimate reliably",
    },
    cognitive_load_map: {
      declared_loads: args.loadChips,
      inferred_loads: [],
      operating_burdens: args.burdenChips,
      primary_depletion_pattern: args.loadChips[0] || args.burdenChips[0] || "Not enough signal yet",
    },
    goals: {
      declared: args.goals,
      cos_accountability_note: args.goals.length
        ? `Use daily briefs and plan selection to protect: ${args.goals.join(", ")}.`
        : "Ask the user to select goals before applying accountability logic.",
    },
    brief_personalisation: {
      timing: args.briefTiming || "Not set",
      reset_modality: args.resetModality || "Not set",
      weekend_signals: args.weekendSignals || "Not set",
      brief_voice_note: "Use high-signal, low-drama language. Avoid false certainty.",
    },
    provisional_archetype: {
      name: "Provisional Executive Operator",
      subtitle: "Built from onboarding signals only",
      description: "A temporary profile used to personalise the app until richer leadership context is available.",
      to_be_confirmed_after: "LinkedIn scrape, writing/interviews, richer self-context, and several days of check-ins",
      confidence,
    },
    what_is_missing: [
      !args.linkedinText ? { gap_number: 1, gap: "LinkedIn details", description: "Role, sector, trajectory, and external positioning could not be read yet." } : null,
      !args.writingText ? { gap_number: 2, gap: "Writing/interview evidence", description: "Communication style and cognitive style need richer source material." } : null,
      !args.freetext ? { gap_number: 3, gap: "Self-provided operating context", description: "DISC, operating principles, current chapter, or leadership constraints would improve confidence." } : null,
    ].filter(Boolean),
  };
  profile.display_html = buildFallbackDisplayHtml(profile);
  return profile;
}

async function firecrawlScrape(apiKey: string, url: string): Promise<{ ok: boolean; markdown?: string; summary?: string; metadata?: any; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000); // 15s per URL
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
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
      if (!res.ok || !parsed) {
        return { ok: false, error: `firecrawl_${res.status}` };
      }
      const root = parsed.data ?? parsed ?? {};
      const markdown = typeof root.markdown === "string" ? root.markdown.slice(0, 60_000) : "";
      // Content quality gate: reject paywall stubs and thin pages
      const hasRealContent = markdown && markdown.length > 200
        && !markdown.includes('Subscribe to continue reading')
        && !markdown.includes('Sign in to view')
        && !markdown.includes('Create your free account');
      if (!hasRealContent) {
        return { ok: false, error: 'insufficient_content', markdown: markdown || undefined };
      }
      return {
        ok: true,
        markdown,
        summary: typeof root.summary === "string" ? root.summary : undefined,
        metadata: root.metadata,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'timeout_15s' };
    }
    return { ok: false, error: err instanceof Error ? err.message : "fetch_failed" };
  }
}

// v2026-09-07 — depth contract. The reference profile (Rishad) is ~12k of HTML
// with eight sections; earlier output collapsed to ~600 chars of placeholders.
// The prompt now states the required sections, the minimum substance per
// section, and how to reason from chips alone when free text is absent.
const SYSTEM_PROMPT = `You are an expert analyst building a Chief of Staff for the Mind (COS) intelligence profile for a senior executive. Your role is to synthesise onboarding inputs into a structured, actionable profile that the app uses to personalise daily briefs, Readiness Assessments, Prepare protocols, and Recalibrate recommendations. The same profile is also sent to the leader as a written document, so it must read as a considered, complete piece of analysis — not a form.

Output must be:
- Operational and precise, never generic
- Performance-coded, never wellness-coded (say "cognitive load" not "stress", "recovery deficit" not "burnout", "regulation gap" not "anxiety")
- Honest about what is known vs inferred vs missing
- Structured for both app consumption (JSON fields) and display (HTML)

You are writing for a CEO-level user. Tone: highly intelligent, discreet chief of staff. Direct. Economical. High signal. Never sounds like coaching, therapy, or personality assessment.

DEPTH CONTRACT — every profile must contain all of the following, with real content:
1. Identity — role, sector, organisation stage, leadership stage. When these are not evidenced, describe the operating position that the declared high-stakes events and burdens imply (e.g. "operates at board and investor interface; capital-raising cycle"). NEVER emit placeholders such as "[Role]", "[Sector]", "Unknown", "Not specified", "N/A", "User", "Executive".
2. Leadership style — 3-5 short style tags plus at least two substantial paragraphs of analysis.
3. Communication profile — how they think, how they communicate, and a register note. At least 4 distinct "what lands" items and 4 distinct "what won't land" items, each a full sentence with a reason.
4. Cognitive risk profile — 3-4 risk flags, each with a severity of exactly one of: teal (strength), amber (watch), red (material risk); each with a description and the conditions that trigger it.
5. External persona — how they are positioned externally. When there is no external source, say so plainly and describe the positioning their declared context implies.
6. High-stakes map and cognitive load map — declared items verbatim, plus inferred items reasoned from the combination.
7. What is missing — 3-5 numbered gaps, each naming the specific signal that would lift confidence.
8. Provisional archetype — a memorable name, a one-line signature (e.g. "High output · high self-awareness · delayed fatigue signal"), a paragraph of description, and the canonical_slug that best matches.

REASONING FROM THIN INPUT: most users provide chips and goals only. That is enough for a real profile. Reason from the COMBINATION — the pairing of high-stakes event types, load drivers, operating burdens and protection goals describes an operating pattern. State clearly which conclusions are inference from selections rather than evidence, using the confidence fields and what_is_missing. Never pad, never fabricate specifics (no invented employers, numbers, quotes or biography), and never return a "profile pending" shell.

Critical rules:
- If freetext contains DISC / Enneagram / archetype / self-assessment, treat as PRIMARY SOURCE — overrides inferred traits.
- LinkedIn: extract role, sector, trajectory, board exposure, positioning, communication signals. Do not infer emotional states from job titles.
- Writing/interviews: richest source for cognitive style and how the COS should speak to them.
- confidence_overall must be exactly one of: high, medium, low, very_low.
- display_html must render all eight sections above using these classes only: .hero, .hero-tag, .hero-name, .hero-sub, .conf-row, .conf-pill, .conf-dot, .section, .sec-label, .card, .card-title, .card-body, .tag, .tag-p, .tag-t, .tag-a, .tag-r, .tag-g, .two-col, .lean-label, .lean-label.green, .lean-label.red, .lean-item, .lean-dot, .ld-g, .ld-a, .ld-r, .lean-text, .flag, .flag-amber, .flag-red, .flag-teal, .flag-body, .quote, .missing-item. No <style> block, no <script>, no buttons, no inline event handlers.

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
            canonical_slug: {
              type: "string",
              enum: [...CANONICAL_ARCHETYPES],
              description:
                "The closest canonical archetype slug for this leader. Must be one of the listed values.",
            },
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
        "external_persona",
        "high_stakes_map",
        "cognitive_load_map",
        "goals",
        "brief_personalisation",
        "provisional_archetype",
        "what_is_missing",
        "display_html",
      ],
      additionalProperties: false,
    },
  },
};

// ── v2026-09-07 quality gate + email-ready rendering ───────────────
// Nothing hollow is allowed to be stored as "ready". A failing profile gets one
// stricter retry; if it still fails it is stored as "needs_input" with the
// reasons, so the surfaces can tell "thin" apart from "good".

const PLACEHOLDER_PATTERN =
  /(\[[a-z_ -]{2,}\]|profile initialization pending|not specified|not provided|unknown|n\/a|to be determined|tbd|lorem ipsum)/i;

const CONFIDENCE_VALUES = ["high", "medium", "low", "very_low"] as const;
type ConfidenceValue = (typeof CONFIDENCE_VALUES)[number];

function normalizeConfidence(raw: unknown): ConfidenceValue {
  const v = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v.includes("very") && v.includes("low")) return "very_low";
  if (v.startsWith("high") || v.includes("strong")) return "high";
  if (v.startsWith("med") || v.includes("moderate") || v.includes("provisional")) return "medium";
  if (v.startsWith("low") || v.includes("limited") || v.includes("thin")) return "low";
  return "medium";
}

function textLen(v: unknown): number {
  return typeof v === "string" ? v.trim().length : 0;
}

function arrLen(v: unknown): number {
  return Array.isArray(v) ? v.filter((x) => x != null && String(x).trim().length > 0).length : 0;
}

/** Returns the list of unmet depth requirements. Empty array = passes. */
function validateCosProfile(profile: any): string[] {
  const problems: string[] = [];
  if (!profile || typeof profile !== "object") return ["no_profile_object"];

  const identity = profile.identity ?? {};
  for (const field of ["role", "sector"]) {
    const value = String(identity[field] ?? "").trim();
    if (value.length < 3) problems.push(`identity.${field}_missing`);
    else if (PLACEHOLDER_PATTERN.test(value)) problems.push(`identity.${field}_placeholder`);
  }

  const style = profile.leadership_style ?? {};
  if (arrLen(style.style_tags) < 3) problems.push("leadership_style.style_tags_thin");
  if (textLen(style.style_description) < 300) problems.push("leadership_style.style_description_thin");

  const comms = profile.communication_profile ?? {};
  if (textLen(comms.how_they_think) < 120) problems.push("communication_profile.how_they_think_thin");
  if (arrLen(comms.what_lands) < 4) problems.push("communication_profile.what_lands_thin");
  if (arrLen(comms.what_wont_land) < 4) problems.push("communication_profile.what_wont_land_thin");

  const risk = profile.cognitive_risk_profile ?? {};
  const flags = Array.isArray(risk.risk_flags) ? risk.risk_flags : [];
  if (flags.length < 3) problems.push("cognitive_risk_profile.risk_flags_thin");
  if (flags.some((f: any) => !["teal", "amber", "red"].includes(String(f?.severity ?? "").toLowerCase()))) {
    problems.push("cognitive_risk_profile.severity_invalid");
  }

  if (textLen(profile.external_persona?.summary) < 100) problems.push("external_persona_thin");
  if (arrLen(profile.high_stakes_map?.declared_events) + arrLen(profile.high_stakes_map?.inferred_events) < 3) {
    problems.push("high_stakes_map_thin");
  }
  if (arrLen(profile.what_is_missing) < 3) problems.push("what_is_missing_thin");

  const arch = profile.provisional_archetype ?? {};
  if (textLen(arch.name) < 3) problems.push("provisional_archetype.name_missing");
  if (textLen(arch.description) < 150) problems.push("provisional_archetype.description_thin");

  const html = typeof profile.display_html === "string" ? profile.display_html : "";
  if (html.length < 3000) problems.push("display_html_thin");
  if (PLACEHOLDER_PATTERN.test(html.replace(/not provided by the user/gi, ""))) {
    problems.push("display_html_placeholder");
  }

  return problems;
}

const EMAIL_CLASS_STYLES: Record<string, string> = {
  hero: "background:#12100E;color:#F4F1EC;padding:28px;border-radius:12px;margin-bottom:24px;",
  "hero-tag": "font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;",
  "hero-name": "font-size:26px;font-weight:600;margin:8px 0 4px;",
  "hero-sub": "font-size:14px;opacity:.8;",
  "conf-row": "margin-top:14px;font-size:12px;opacity:.85;",
  "conf-pill": "display:inline-block;padding:3px 10px;border:1px solid rgba(244,241,236,.35);border-radius:999px;margin-right:8px;font-size:11px;",
  "conf-dot": "display:inline-block;width:7px;height:7px;border-radius:50%;background:#C98B3B;margin-right:6px;",
  section: "margin:0 0 26px;",
  "sec-label": "font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A8175;margin-bottom:10px;",
  card: "border:1px solid #E4DFD6;border-radius:10px;padding:18px;background:#FBFAF7;margin-bottom:12px;",
  "card-title": "font-size:15px;font-weight:600;color:#201E1B;margin-bottom:8px;",
  "card-body": "font-size:14px;line-height:1.65;color:#3B3630;",
  tag: "display:inline-block;padding:3px 10px;border-radius:999px;background:#EEE9DF;color:#4A443B;font-size:11px;margin:0 6px 6px 0;",
  "tag-p": "display:inline-block;padding:3px 10px;border-radius:999px;background:#E7EDEA;color:#2F4A41;font-size:11px;margin:0 6px 6px 0;",
  "tag-t": "display:inline-block;padding:3px 10px;border-radius:999px;background:#E4EEEC;color:#27544C;font-size:11px;margin:0 6px 6px 0;",
  "tag-a": "display:inline-block;padding:3px 10px;border-radius:999px;background:#F6EAD6;color:#7A5620;font-size:11px;margin:0 6px 6px 0;",
  "tag-r": "display:inline-block;padding:3px 10px;border-radius:999px;background:#F5E1DC;color:#7A3226;font-size:11px;margin:0 6px 6px 0;",
  "tag-g": "display:inline-block;padding:3px 10px;border-radius:999px;background:#E6EDE3;color:#3A5230;font-size:11px;margin:0 6px 6px 0;",
  "two-col": "margin:0;",
  "lean-label": "font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#3A5230;margin:12px 0 6px;",
  "lean-item": "font-size:14px;line-height:1.6;color:#3B3630;margin-bottom:6px;",
  "lean-dot": "display:inline-block;width:6px;height:6px;border-radius:50%;background:#8A8175;margin-right:8px;",
  "ld-g": "background:#4F7A3F;",
  "ld-a": "background:#C98B3B;",
  "ld-r": "background:#A8452F;",
  "lean-text": "font-size:14px;line-height:1.6;color:#3B3630;",
  flag: "border-left:3px solid #8A8175;padding:10px 14px;margin-bottom:10px;background:#FBFAF7;",
  "flag-amber": "border-left:3px solid #C98B3B;padding:10px 14px;margin-bottom:10px;background:#FDF7EE;",
  "flag-red": "border-left:3px solid #A8452F;padding:10px 14px;margin-bottom:10px;background:#FBF1EE;",
  "flag-teal": "border-left:3px solid #2F6F63;padding:10px 14px;margin-bottom:10px;background:#EFF6F4;",
  "flag-body": "font-size:14px;line-height:1.6;color:#3B3630;",
  quote: "border-left:2px solid #C9C2B6;padding-left:14px;font-style:italic;color:#5A544B;margin:12px 0;",
  "missing-item": "font-size:14px;line-height:1.6;color:#3B3630;margin-bottom:8px;",
};

function stripUnsafeForEmail(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<button[\s\S]*?<\/button>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "");
}

function inlineEmailStyles(html: string): string {
  return html.replace(
    /<([a-z0-9]+)([^>]*?)\sclass="([^"]*)"([^>]*?)>/gi,
    (_m, tag: string, pre: string, cls: string, post: string) => {
      const style = cls
        .split(/\s+/)
        .map((c) => EMAIL_CLASS_STYLES[c])
        .filter(Boolean)
        .join("");
      const attrs = `${pre}${post}`.replace(/\s+/g, " ").trimEnd();
      return style ? `<${tag}${attrs ? " " + attrs.trim() : ""} style="${style}">` : `<${tag}${attrs ? " " + attrs.trim() : ""}>`;
    },
  );
}

function htmlToPlainText(html: string): string {
  return stripUnsafeForEmail(html)
    .replace(/<\/(p|div|section|li|h1|h2|h3|h4|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Email-ready artefacts stored alongside the profile so a later send is a lookup. */
function buildEmailArtifacts(profile: any, displayHtml: string): {
  html: string;
  text: string;
  subject: string;
} {
  const body = inlineEmailStyles(stripUnsafeForEmail(displayHtml || ""));
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Chief of Staff profile</title></head><body style="margin:0;padding:24px;background:#F4F1EC;font-family:Georgia,'Times New Roman',serif;color:#201E1B;"><div style="max-width:640px;margin:0 auto;">${body}<p style="font-size:12px;color:#8A8175;margin-top:28px;line-height:1.6;">This profile is provisional. It sharpens as Mind Module observes your calendar, readiness and check-ins.</p></div></body></html>`;
  const archetypeName = String(profile?.provisional_archetype?.name ?? "").trim();
  const subject = archetypeName
    ? `Your Chief of Staff profile: ${archetypeName}`
    : "Your Chief of Staff profile";
  return { html, text: htmlToPlainText(displayHtml || ""), subject };
}

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

    // ── 1. Data Input Resolution (PDF / Scrapes) ───────────────────
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const linkedinUrl: string | null = row.linkedin_url ?? null;
    const linkedinPdfBase64: string | null = row.linkedin_pdf_base64 ?? null;
    const writingUrls: string[] = Array.isArray(row.writing_urls) ? row.writing_urls.slice(0, 5) : [];

    let linkedinScrape: any = row.linkedin_scrape ?? null;
    const writingScrapes: any[] = [];

    // Note: LinkedIn URL scraping is disabled for MVP in favor of direct PDF upload + paste.
    // NinjaPear integration will replace this post-MVP.
    if (firecrawlKey) {
      for (const u of writingUrls) {
        if (!isValidHttpUrl(u)) {
          writingScrapes.push({ url: u, ok: false, error: "invalid_url" });
          continue;
        }
        const r = await firecrawlScrape(firecrawlKey, u);
        writingScrapes.push({ url: u, ...r, scraped_at: new Date().toISOString() });
        console.info(`[synthesize-cos] firecrawl writing ok=${!!r.ok}`);
      }
    } else if (writingUrls.length > 0) {
      console.warn("[synthesize-cos] FIRECRAWL_API_KEY missing — skipping writing URL scrapes");
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
      .filter((w) => w?.ok && (w?.markdown || w?.summary))
      .map((w) => `SOURCE: ${w.url}\n${w?.markdown || w?.summary || ""}`)
      .join('\n\n---\n\n');

    const cosInput: CosFallbackArgs = {
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
    };
    let userPrompt = buildUserPrompt(cosInput);

    if (linkedinPdfBase64) {
      console.info(`[synthesize-cos] LinkedIn PDF attached for user_id=${redactUserId(userId)}`);
      userPrompt += `\n\n**PDF DOCUMENT ATTACHED:** A LinkedIn profile PDF document is attached below. Use its full career history, accomplishments, and bio as primary leadership context for synthesizing the COS profile.`;
    }

    const persistReadyProfile = async (profile: any, source: 'ai' | 'fallback' = 'ai') => {
      const displayHtml = typeof profile.display_html === "string" ? profile.display_html : "";
      const { error: persistErr } = await db
        .from("onboarding_v8_responses")
        .update({
          cos_profile: profile,
          cos_profile_html: displayHtml,
          cos_profile_status: "ready",
          cos_profile_error: null,
          cos_profile_generated_at: new Date().toISOString(),
          cos_profile_source: source,
        })
        .eq("user_id", userId);

      if (persistErr) {
        console.error("[synthesize-cos] persist error:", persistErr);
        return { ok: false as const, error: persistErr };
      }

      // Write AI-derived personality fields to profiles (richer overwrite of chip-derived values)
      try {
        const profileUpdate: Record<string, unknown> = {
          user_archetype: resolveArchetypeSlug(
            profile.provisional_archetype?.canonical_slug ??
              profile.provisional_archetype?.name ?? null,
          ),
          archetype_title: profile.provisional_archetype?.subtitle ?? null,
          archetype_description: profile.provisional_archetype?.description ?? null,
          identity_role: profile.identity?.role ?? null,
          biggest_pressure: profile.cognitive_load_map?.primary_depletion_pattern ?? null,
          leadership_context: profile.leadership_style?.style_description ?? null,
          onboarding_insight: profile.communication_profile?.cos_brief_rules ?? null,
          growth_priority: profile.goals?.declared?.[0] ?? null,
          updated_at: new Date().toISOString(),
        };
        // Only write structured fields if they contain data
        if (profile.high_stakes_map) {
          profileUpdate.inferred_priorities = JSON.stringify(profile.high_stakes_map);
        }
        if (profile.cognitive_risk_profile) {
          profileUpdate.pressure_profile = JSON.stringify(profile.cognitive_risk_profile);
        }
        const linkedinMd = linkedinScrape?.ok ? (linkedinScrape.markdown ?? null) : null;
        if (linkedinMd) {
          profileUpdate.linkedin_raw_markdown = linkedinMd;
          profileUpdate.linkedin_analyzed_at = new Date().toISOString();
        }
        const { error: profileErr } = await db
          .from('profiles')
          .update(profileUpdate)
          .eq('id', userId);
        if (profileErr) {
          console.warn('[synthesize-cos] profiles update warning:', profileErr.message);
        } else {
          console.log('[synthesize-cos] ✅ profiles.* updated from COS:', redactUserId(userId));
        }
      } catch (e) {
        console.warn('[synthesize-cos] profiles update error:', e instanceof Error ? e.message : String(e));
      }

      return { ok: true as const, displayHtml };
    };

    if (!lovableKey) {
      console.warn("[synthesize-cos] LOVABLE_API_KEY missing — generating fallback COS profile");
      const profile = buildFallbackCosProfile(cosInput, "the AI gateway is not configured");
      const persisted = await persistReadyProfile(profile, 'fallback');
      if (!persisted.ok) return json(500, { error: "persist_failed" });
      return json(200, {
        ok: true,
        cached: false,
        fallback: true,
        fallback_reason: "ai_unavailable",
        cos_profile: profile,
        cos_profile_html: persisted.displayHtml,
      });
    }

    // ── 3. Call Lovable AI Gateway ────────────────────────────────
    console.info(`[synthesize-cos] calling AI model=${AI_MODEL} user_id=${redactUserId(userId)}`);
    const userMessageContent: any = linkedinPdfBase64
      ? [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: linkedinPdfBase64.startsWith("data:")
                ? linkedinPdfBase64
                : `data:application/pdf;base64,${linkedinPdfBase64}`,
            },
          },
        ]
      : userPrompt;

    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 8192,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessageContent },
        ],
        tools: [COS_TOOL],
        tool_choice: { type: "function", function: { name: "emit_cos_profile" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[synthesize-cos] AI gateway error:", aiRes.status, errText);
      // Retry with fallback model on 429/402/503
      if ([429, 402, 503].includes(aiRes.status)) {
        console.info(`[synthesize-cos] retrying with fallback model=${AI_MODEL_FALLBACK}`);
        const fallbackAiRes = await fetch(AI_GATEWAY_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: AI_MODEL_FALLBACK,
            max_tokens: 8192,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userMessageContent },
            ],
            tools: [COS_TOOL],
            tool_choice: { type: "function", function: { name: "emit_cos_profile" } },
          }),
        });
        if (fallbackAiRes.ok) {
          // Use the fallback response — continue to parse below
          const fallbackPayload = await fallbackAiRes.json();
          const fallbackToolCall = fallbackPayload?.choices?.[0]?.message?.tool_calls?.[0];
          const fallbackArgsRaw = fallbackToolCall?.function?.arguments;
          let fallbackProfile: any = null;
          try {
            fallbackProfile = fallbackArgsRaw ? JSON.parse(fallbackArgsRaw) : null;
          } catch (e) {
            console.error("[synthesize-cos] fallback tool args parse failed:", e);
          }
          if (fallbackProfile && typeof fallbackProfile === "object") {
            const persisted = await persistReadyProfile(fallbackProfile);
            if (!persisted.ok) return json(500, { error: "persist_failed" });
            return json(200, {
              ok: true,
              cached: false,
              cos_profile: fallbackProfile,
              cos_profile_html: persisted.displayHtml,
              model_used: AI_MODEL_FALLBACK,
            });
          }
        }
      }
      const profile = buildFallbackCosProfile(cosInput, `the AI gateway returned ${aiRes.status}`);
      const persisted = await persistReadyProfile(profile, 'fallback');
      if (!persisted.ok) return json(500, { error: "persist_failed" });
      return json(200, {
        ok: true,
        cached: false,
        fallback: true,
        fallback_reason: `ai_${aiRes.status}`,
        cos_profile: profile,
        cos_profile_html: persisted.displayHtml,
      });
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
      const fallbackProfile = buildFallbackCosProfile(cosInput, "the AI response did not emit the COS tool payload");
      const persisted = await persistReadyProfile(fallbackProfile, 'fallback');
      if (!persisted.ok) return json(500, { error: "persist_failed" });
      return json(200, {
        ok: true,
        cached: false,
        fallback: true,
        fallback_reason: "ai_no_tool_call",
        cos_profile: fallbackProfile,
        cos_profile_html: persisted.displayHtml,
      });
    }

    const persisted = await persistReadyProfile(profile);
    if (!persisted.ok) return json(500, { error: "persist_failed" });

    console.info(`[synthesize-cos] success user_id=${redactUserId(userId)} linkedin_ok=${!!(linkedinScrape && linkedinScrape.ok)} writing_ok=${writingScrapes.filter((w) => w?.ok).length}/${writingScrapes.length}`);
    return json(200, {
      ok: true,
      cached: false,
      cos_profile: profile,
      cos_profile_html: persisted.displayHtml,
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
