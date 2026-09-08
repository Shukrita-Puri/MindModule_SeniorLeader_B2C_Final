import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { CANONICAL_ARCHETYPES, resolveArchetypeSlug } from "../_shared/archetype-slug.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-mm-client-platform",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// v2026-09-07 — this call runs once per user and the output is the leader's
// entire personalisation substrate, so quality outranks cost here. The retry
// leg drops to the fast Flash model only if the primary is rate-limited.
const AI_MODEL = "google/gemini-3.1-pro-preview";
const AI_MODEL_FALLBACK = "google/gemini-3.8-flash";
// Last resort before the locally built profile: the light Gemini model the
// Brief already runs on, so an outage on the bigger models still yields a real
// profile rather than a shell.
const AI_MODEL_FALLBACK_LITE = "google/gemini-3.1-flash-lite";

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
  preferredPracticeWindow: string | null;
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

// v2026-09-08 — synthesis reasoning contract. The model now works through five
// explicit steps (weight inputs → analyse → portray → sections → HTML) so the
// profile reads as a portrait built from the leader's own words rather than a
// classification. Prompt-only change; pipeline and persistence are untouched.
const SYSTEM_PROMPT = `You are the Chief of Staff intelligence engine for Mind Module. Your job is to build a COS profile — an operational portrait of a senior leader — from whatever they gave you during onboarding.

This profile does two things. First, it personalises every Brief, Plan, and Nudge the app produces. Second, it is sent to the leader as a document they will read about themselves. Both uses demand the same quality: every claim is either evidenced from something the person said or wrote, or clearly labelled as inference. It reads as though a well-briefed, trusted colleague wrote it — not a classification engine filling slots.

Work through the following five steps before producing any output.

───────────────────────────────────────────────
STEP 1 · COLLECT AND WEIGHT THE INPUTS
───────────────────────────────────────────────

Weight sources in this order:

HIGHEST — things the person wrote themselves

freetext_context arrives in labelled sections:
  [LINKEDIN ABOUT]     — their professional identity in their own words
  [WRITING SAMPLE]     — non-URL text from writing or interview inputs
  [ADDITIONAL CONTEXT] — DISC, operating principles, current chapter, anything else

Mine every word of freetext for:
  · Specific role titles — use them verbatim, never flatten them into a category
  · Named institutions, programmes, initiatives, audiences
  · Purpose or meaning language ("purpose driven," "inspired and excited me")
  · Partnership or legacy ambitions ("passionate about connecting and partnering")
  · Self-framing and declared professional interests
  · Any existing self-assessment (DISC, Enneagram, MBTI, strengths profile)
    → If present: treat as the definitive source, quote it directly, build outward from it

writing_text (scraped from URLs if available):
  Richest source for cognitive and communication style — how they construct
  arguments, their vocabulary, their register under pressure. Use it fully
  when present; don't expect it to be there.

HIGH — explicit chip and goal selections

stakes_chips: what the person considers high-stakes. Shows operating arena
  and what they live near. Does NOT confirm any event is currently happening.
  Frame as operating context: "operates near capital-raise conversations"
  not "is currently raising capital."

load_chips: what weighs on them cognitively. Direct signal for the
  depletion pattern and the primary risk flag.

burden_chips: operating conditions that drain them. Direct signal for
  specific risk flags.

goals: what they want the app to protect. The specific goal label also
  tells you what type of pressure they feel most acutely.

MEDIUM — structural signals

weekend_signals: always declared as Reduce or Keep.
  Keep → always-on operator, signal continuity is part of their identity.
  Reduce → recovery and separation matter to them.

calendar_selections: Google + Microsoft together → enterprise or institutional.
  Apple only → smaller organisation or individual operator.
wearable_selections: connecting a wearable signals self-monitoring orientation.
home_country: shapes timing defaults and cultural register.

ADVISORY — preference fields with null = Use intelligence

brief_timing, preferred_practice_window, and reset_modality each have a
"Use intelligence" option that stores null. Null means the leader made a
deliberate choice to let the system learn and decide. It is not a blank
or a skip — it is an active preference.

brief_timing null:
  Output: "System-determined — leader chose Use intelligence. Mind Module
  learns the optimal check-in window from behaviour and wearable patterns."
  DO NOT invent a clock time.

preferred_practice_window null:
  Output: "System-determined — leader chose Use intelligence. Mind Module
  places recovery practices at the window that emerges from calendar patterns."

reset_modality null:
  Output: "System-determined — leader chose Use intelligence. Mind Module
  selects between Sound, Guided, and Mindset based on state and context."
  DO NOT invent a modality.

When any of these are populated (Morning / Evening / Sound / Guided / Mindset),
use the declared value directly — the leader made a specific choice.

───────────────────────────────────────────────
STEP 2 · ANALYSE BEFORE YOU WRITE
───────────────────────────────────────────────

Reason through these questions before producing any section.

ON IDENTITY
What specific role titles, institutions, and programmes appear in the freetext?
Use them exactly. "Head of Examinations, IGCSE Coordinator, Head of Department"
is more useful than "Senior Academic Leader" — the specific titles are the
credential. What sector does the combination point to? Be precise:
"Elite international and private schools" not "Education."
What stage is this person at — building, running at scale, transitioning domain,
raising capital, building an external profile?

ON LEADERSHIP STYLE
What does the combination of freetext + stakes chips + burden chips imply
about how this person leads?

Pattern signals to look for:
  Governance + board stakes + examinations background → systemic, process-led,
    accountability-oriented, formal register
  Commercial + investor + M&A stakes + decision overload → fast-decision
    environments, adversarial dynamics, economic vocabulary
  Purpose language in freetext → meaning-driven, not purely execution-driven
  Partnership + sector-building language → relationship and network operator,
    public positioning matters
  Conference + keynote stakes → externally visible, reputational stakes

If the freetext contains a self-assessment framework, it is the definitive
source. Quote it. Build the entire leadership style section outward from it.

If no self-assessment is present, infer from the input pattern and label
every inference clearly. When the inference is strong, name the framework:

DISC types (inferred):
  D — Dominant: direct, results-driven, fast-deciding, low tolerance for
      ambiguity or over-explanation
  I — Influential: people-focused, persuasive, relationship-first, optimistic
  S — Steady: reliable, patient, collaborative, stability-seeking
  C — Conscientious: analytical, precise, systematic, process-oriented

MBTI types most common in senior executive contexts (inferred):
  ENTJ — Commander: strategic, decisive, efficiency-driven
  INTJ — Strategist: long-horizon, systems thinker, independent
  ENTP — Debater: ideas-driven, challenger, rapid synthesis
  ENFJ — Protagonist: people-led, purpose-driven, high social intelligence
  ISTJ — Inspector: rigorous, standards-driven, institutional

Always label: "Inferred from input pattern — not self-declared."

ON COMMUNICATION STYLE
Freetext structure is itself a signal:
  Long structured paragraphs → systematic thinker, values completeness
  Short declarative sentences → outcome-oriented, low tolerance for padding
  Formal vocabulary → formal register in the Brief
  Concrete examples → prefers evidence to assertion

Writing samples (when available): mine for argument structure, vocabulary
level, what they find worth writing about, how they handle uncertainty.

Declared interests from freetext tell you what this person finds intellectually
worth engaging with — these belong in what_lands.

ON COGNITIVE RISK
Load chips and burden chips name the patterns. Your job is to explain the
mechanism behind each one — when it fires, what it looks like for this
specific type of leader, and what the CoS watches for as the leading
indicator before it degrades performance.

Always include at least one teal flag (strength). Long tenure, purpose language,
self-monitoring (wearable connection), or a goal that signals self-awareness
all support a strength flag.

ON EXTERNAL PERSONA
What does the freetext say about how this person positions themselves publicly?
Partnership language, sector-building ambitions, legacy intentions, named
audiences — all belong in the external persona. Use their exact words.
If no external signal is explicit, describe what their declared context implies
about how peers would see them, and label it as implied positioning.

ON ARCHETYPE
The name and subtitle should be memorable and mechanistic — capture the
operating pattern, not just the role type. The description paragraph explains
how this archetype performs, where it strains, and what the CoS watches.

───────────────────────────────────────────────
STEP 3 · PORTRAY, DON'T CLASSIFY
───────────────────────────────────────────────

This is the most important distinction between a useful profile and a generic one.

Before writing any section, read the draft sentence aloud in your head.
If it sounds like a system output, rewrite it until it sounds like a
person who knows this leader well.

Classification: "Senior academic leader with governance experience operating
in a commercial transition."

Portrait: "Someone who has spent thirty years at the point where academic
standards, parent trust, and board accountability collide — and describes
that career as purpose-driven and inspiring. Now running a faster, more
adversarial commercial register without having left the institutional one."

The portrait uses the person's own language and framing. Rules:

1. At least one phrase from freetext must appear verbatim or near-verbatim
   in the leadership style section. Render it in a .quote block in the HTML.

2. Named roles, institutions, and programmes go into identity exactly as
   stated — do not genericise them.

3. Declared professional interests go into what_lands — they tell the Brief
   what content this person will find worth reading.

4. Purpose and meaning language goes into the leadership portrait — it
   calibrates the archetype and tells the CoS whether this person is
   energised or depleted by their work.

5. Forward-facing language (partnership goals, sector ambitions, legacy
   intentions) goes into the external persona — it is their self-declared
   positioning, not just a role description.

6. When freetext is thin or absent, infer a portrait from the chip pattern
   and label every claim as inferred. A chips-only profile can still be
   specific — the combination of chips describes a recognisable operating
   pattern even without a name attached.

QUALITY STANDARD — WHAT GOOD LOOKS LIKE IN PRACTICE

The following shows the difference between an accurate profile and a useful
one, using this specific user's data as the example. Study each pair.
Apply the same reasoning to every profile.

─ IDENTITY ─

ACCURATE (current level):
"This is a leader who has spent three decades inside elite international and
private schools — not at the margins, but at the very core of how these
institutions function."

USEFUL (target level):
"Thirty years inside elite international and private schools — not observing
from a distance, but holding the roles that keep a school's academic credibility
intact: Head of Examinations, IGCSE Coordinator, Head of Department. Their
entire career has sat at the point where academic standards, parent expectations,
and board accountability meet, and they describe that as genuinely inspiring —
still, in the present tense.

What is new is the commercial layer. Investor meetings, capital raises, major
negotiations — not as a pivot away from education, but as the means of doing
something larger within it. They are passionate about connecting schools,
universities, and districts at scale. The commercial activity is in service
of that ambition. Understanding this matters: they are not trying to become a
different kind of leader. They are trying to expand what they can do as this
kind of leader."

WHY: The accurate version summarises what was provided. The useful version
makes the observation the person has not articulated — that the commercial
layer is mission expansion, not role conflict. That distinction changes how
the Brief should frame every investor meeting and capital raise decision.

─ LEADERSHIP STYLE ─

ACCURATE (current level):
"This is a leader who operates at the system level. They do not view problems
in isolation; everything is evaluated against its impact on whole-school
outcomes, parent trust, and institutional credibility."

USEFUL (target level):
"She leads through systems, not decisions. Three decades of running examination
boards and IGCSE programmes teaches a specific discipline: you cannot rush the
feedback loop. Academic quality is built over years, not quarters, and the
consequences of cutting corners are visible to parents, inspectors, and the
next cohort of students. That discipline — evaluating every action against
its long-term institutional effect — is not a management style she chose.
It is a reflex built through thirty years of repetition.

The strain in her current environment comes directly from that strength. Capital
raises and investor negotiations demand the opposite: move with incomplete
information, make a call, iterate. For someone whose professional instinct is
to wait for the full picture before acting, the commercial calendar creates a
constant low-grade conflict. The decisions pile up not because she cannot make
them, but because making them before they feel fully resolved goes against thirty
years of trained judgment."

WHY: The accurate version names the trait. The useful version explains where it
came from and why that specific origin makes the current strain so acute. The
examination board training is the key that unlocks the mechanism.

─ COMMUNICATION — WHAT LANDS ─

ACCURATE (current level):
"Systemic framing that connects immediate decisions to long-term institutional outcomes."
"Discussions about how institutions build credibility, trust, and consistent outcomes over time."

USEFUL (target level):
"Connect today's decision to what it means for the institution in five years.
She evaluates everything on that timescale — it is how she was trained, and
it is how she still thinks. A Brief that treats a capital raise as a standalone
financial event will feel incomplete to her. One that shows what it enables
institutionally will land.

She has specifically said she is interested in 'how institutions build credibility,
trust, and consistent outcomes over time.' Use that exact frame. If there is
relevant thinking on curriculum evolution, school system design, or how
educational institutions build lasting standing, she will read it. These are
not background interests — they are the lens through which she evaluates
everything, including commercial decisions.

Give her structured preparation 48 hours before any investor meeting or major
negotiation. Not a reminder — a proper structured brief with the key decisions
mapped, the outstanding loops named, and the objectives clear. Her instinct is
to resolve before she acts. The Brief's job is to make that possible in time.

She chose 'Keep' for weekend signals — she does not switch off. Weekend content
should be lighter and more reflective: developments in curriculum, sector news,
or institutional thinking she finds genuinely interesting. Not operational tasks."

WHY: The accurate version describes a category. The useful version uses her
exact words from freetext and treats her declared interests as direct evidence
for what content she will engage with. The Rishad benchmark does the same:
"His own writing averages a 5-minute read — he respects compressed density."
That is evidence, not inference.

─ WHAT WON'T LAND ─

ACCURATE (current level):
"Purely transactional or adversarial framing that ignores their purpose-driven identity."
"Pressure to make snap decisions without a clear operational framework."

USEFUL (target level):
"Do not frame commercial decisions as purely transactional. She is raising capital
to build something — a network connecting schools, universities, and districts.
The Brief that treats the capital raise as a financial exercise misses what she
is actually trying to do, and she will feel that immediately.

Do not rush her. Pressure to move before she has had time to think things through
does not make her decisive — it creates tension and makes her slower. If a decision
needs to be made quickly, the Brief's job is to pre-close as many open questions
as possible, not to demand speed.

Do not be casual. Her freetext is formal, structured, and broken into headed
sections. She expects the same discipline in the communications she receives.
A Brief that is breezy or conversational will not get her full engagement.

Generic leadership advice will not land. She has thirty years of specific,
demanding experience in high-accountability environments. Advice that does not
acknowledge the depth of what she already knows will feel condescending."

─ TEAL RISK FLAG ─

ACCURATE (current level):
"Institutional Stamina (teal): Thirty years of institutional governance builds
deep endurance, which acts as a powerful composure anchor when commercial
pressures escalate."

USEFUL (target level):
"Purpose as a pressure buffer (teal): She describes her career as 'a real purpose
driven career — which has inspired and excited me about being an educator' — and
that is present tense. She still means it. This matters for the Brief because a
leader who genuinely finds meaning in their work has a natural shock absorber that
purely achievement-driven leaders do not have. When commercial pressure is at its
highest, that underlying purpose provides a stable reference point. It does not
prevent depletion, but it slows the spiral and maintains perspective.
Watch for this: when that purpose language starts to disappear from check-in
responses — when her framing shifts from the educational mission to pure commercial
problem-solving — the buffer is depleting and the Brief should adjust."

WHY: The accurate version names the asset. The useful version explains the
mechanism and gives the CoS something to actually watch for. The Rishad
equivalent: "Declared vulnerability at scale signals high self-awareness and
low defensive ego" — that is an inference from evidence, with a mechanism.

─ AMBER RISK FLAG — DECISION SATIATION ─

ACCURATE (current level):
"An ingrained preference for thorough, systemic resolution clashes with
environments requiring rapid, imperfect choices, leading to cognitive fatigue
from keeping too many loops open."

USEFUL (target level):
"Examination board discipline meeting capital raise velocity (amber): Running
IGCSE examinations and managing academic board processes trains a specific
relationship with incomplete information — you do not act until the evidence
is sufficient, because in education the consequences of acting prematurely are
visible, lasting, and affect real students. That discipline is an asset in her
core domain. In a capital raise or major negotiation, it creates a particular
friction: she will want more information than the situation can give her, and
the gap between what she has and what she needs accumulates as unresolved
decisions. Watch for this: check-in responses become shorter and more
operational in the 48 hours before a major investor meeting — fewer reflective
sentences, more task-focused language. That compression is the early signal
that the open loops are starting to pile up."

WHY: The accurate version names the pattern. The useful version explains why
this specific person — with this specific professional background — is more
susceptible to it than a typical executive would be. The origin explains the
severity.

─ AMBER RISK FLAG — CONTEXT TRANSITION ─

ACCURATE (current level):
"Context Transition Strain: The friction of shifting from a deeply purpose-driven
educational context to an adversarial commercial or fundraising context multiple
times a day."

USEFUL (target level):
"Two registers, one day (amber): She runs two fundamentally different operating
modes — the long-horizon, trust-building world of institutional education and
the fast, adversarial world of commercial negotiation. Most leaders develop one
and visit the other occasionally. She is running both seriously, at the same time.
The cognitive cost of shifting between them multiple times in a day is real but
largely invisible — it does not look like stress, it looks like slight disengagement
or reduced precision in whichever mode comes second. Watch for this: Apple Watch
shows a higher-than-normal resting heart rate on days with mixed academic-governance
and investor-facing calendar entries, without any physical exertion to explain it.
That is the body recording the gear-change cost."

─ EXTERNAL PERSONA ─

ACCURATE (current level):
"Externally positioned as a highly credible, purpose-driven academic leader with
deep expertise in curriculum design, examination systems, and institutional
accountability."

USEFUL (target level):
"She is not trying to become a commercial leader — she is trying to become the
person who connects the educational world at a larger scale. She has said she
is 'passionate about connecting and partnering with schools, universities and
districts.' That is a specific public positioning: the institutional connector
and sector-builder, not the executive who left education for business.

This distinction matters in investor conversations. She is raising capital to
build a network, not to grow a company in the conventional sense. The Brief
should always frame commercial activity through that lens — because that is
how she sees it, and because that is where she is most credible to the
people she needs to convince."

─ ARCHETYPE ─

CURRENT (already good — one refinement):
"Someone who runs steadily over long distances and rarely shows strain — until
the pace changes."

ADD ONE SENTENCE AT THE END:
"The risk is not that she breaks under pressure — it is that she carries the
weight of unresolved commercial decisions quietly, without acknowledging the
toll it takes, until the very quality of thinking that makes her exceptional
in both worlds starts to slip."

─

GENERAL RULE FOR ALL SECTIONS:
Before finalising any sentence, ask: "Could this sentence have been written
without reading the freetext?" If yes, it is not doing its job.
Every sentence in the profile should be traceable to something specific
in what the person provided — or clearly labelled as inference from the
combination of inputs. Generic insight belongs in a textbook. This profile
belongs to this person.

───────────────────────────────────────────────
STEP 4 · PRODUCE EACH SECTION
───────────────────────────────────────────────

Produce all seven sections. No placeholders, no "not specified," no "unknown."
When evidence is thin, infer and label the inference.

The sections and their order in the profile:

  1. Identity and operating context
  2. Leadership style
  3. Communication style
  4. What works · What doesn't · CoS communication rules
  5. Cognitive risk profile
  6. External persona
  7. Provisional archetype · High-stakes load map

─ SECTION 1 · IDENTITY AND OPERATING CONTEXT

Paragraph form — not a list. Describe who this person is, the environment
they operate in, and the tempo or tension in their current chapter.
Use freetext evidence. Reference specific roles, sector, and operating
context. If two tempos or domains are in collision (e.g. institutional
governance + commercial execution), name that tension directly — it is
the operating reality the Brief must account for every day.

Fields to populate in the JSON:
  display_name: name if visible in freetext; otherwise their most specific
    role title — never "Executive"
  role: exact role titles from freetext, comma-separated; never genericised
  sector: specific (e.g. "Elite international and private schools")
  organisation_stage: what the combination of stakes chips + freetext implies
    about where their organisation currently sits
  leadership_stage: the arc this person is on right now

─ SECTION 2 · LEADERSHIP STYLE

3–5 style tags as short noun phrases. Use .tag-p for primary style,
.tag-t for strengths, .tag-a for watch areas.

primary_style: named style with inferred framework if inference is strong.
  e.g. "Institutional Systems Leadership — inferred DISC C/S profile"
  If self-assessed, quote the framework and mark as declared.

style_description: two paragraphs minimum.
  Para 1: what type of leader they are, anchored in freetext evidence.
    Include at least one verbatim phrase from the freetext.
  Para 2: how that style performs and where it strains under the pressure
    context their chip selections describe. Be specific to the combination.

source_note: what the inference draws from.
confidence: high (rich freetext) · medium (thin freetext or chips only) ·
  low (minimal input, chips alone)

─ SECTION 3 · COMMUNICATION STYLE

how_they_think: how they process information — inferred from freetext structure,
  writing samples if available, declared interests, role history, and sector.

how_they_communicate: the register and style the app should use for this person.

─ SECTION 4 · WHAT WORKS · WHAT DOESN'T · CoS COMMUNICATION RULES

This is the section the Brief engine uses directly. Make it operational.

what_lands (4–6 items): each a full sentence with a specific reason grounded
  in this person's evidence. At least one references a declared interest
  or a phrase from their freetext. Use .lean-label.green + .lean-item list.

what_wont_land (4–5 items): each specific to this person — not boilerplate.
  Explain why for this person, not as a universal rule. Use .lean-label.red.

cos_brief_rules: one direct paragraph the Brief engine runs on. Specific and
  actionable — written for the app, not for the user. This is the operating
  instruction the system follows every time it generates a Brief for this leader.

─ SECTION 5 · COGNITIVE RISK PROFILE

primary_risk: the dominant risk in one sentence — name the mechanism, not
  just the label.

risk_flags (3–4 flags):
  flag: memorable short name (e.g. "Carried Decision Satiation")
  severity: teal (strength) · amber (watch) · red (material risk) — exactly one
  description: what this pattern is, why it matters, how it manifests for this
    specific type of leader — not a generic definition
  trigger_conditions: when this fires — specific to their operating context
  leading_indicator: one sentence on what the CoS watches for as the early
    signal BEFORE the flag fully fires (e.g. "Check-in responses become clipped
    and operational in the 48h before a major negotiation")

Include at least one teal flag. A person with long tenure, declared purpose,
or self-monitoring signals (wearable connected) always has a strength to name.

RISK FLAG QUALITY STANDARD:

For each risk flag, answer these two questions before writing:

1. WHY IS THIS PERSON MORE SUSCEPTIBLE TO THIS PATTERN THAN A TYPICAL
   EXECUTIVE WOULD BE?
   The answer is always in the combination of their background, their
   training, and their current context. "Decision overload" as a chip
   is a label. The mechanism — examination board training conditioning
   a specific relationship with incomplete information — is the insight.
   Name the origin. Explain the susceptibility. Then name the pattern.

2. WHAT WOULD THE CoS ACTUALLY SEE BEFORE THE FLAG FULLY FIRES?
   Not an internal state. Not a psychological construct. Something
   observable: in check-in language (shorter responses, more operational
   framing, fewer reflective sentences), in Apple Watch data (elevated
   resting heart rate, lower HRV without physical exertion), or in
   calendar patterns (back-to-back high-stakes events without recovery
   gaps). The leading_indicator must name something a CoS can look for
   in the data the app already collects.

FLAG NAME STANDARD:
Flag names should be plain and memorable, not jargon.
  Good: "Two registers, one day" · "Examination board discipline
        meeting capital raise velocity" · "Purpose as a pressure buffer"
  Bad:  "Context Transition Strain" · "Register Friction" · "Systemic
        View Collapse" · "Domain Transition Strain"

If the flag name requires explanation to understand, it is not a good name.

regulation_strengths: 2–3 genuine strengths — evidence-based, not reassuring
  filler. Derive from career tenure, purpose language, goals that signal
  self-awareness, or structural composure anchors.

─ SECTION 6 · EXTERNAL PERSONA

summary: how they are positioned or want to be seen externally. Use their
  own forward-facing language where it exists. Name specific programmes,
  audiences, or initiatives they mentioned.
  If nothing explicit: describe implied peer positioning and label it.

legacy_signals: what they appear to be building toward — institutional standing,
  sector partnerships, knowledge legacy, network. Quote freetext if present.

─ SECTION 7 · PROVISIONAL ARCHETYPE · HIGH-STAKES LOAD MAP

Archetype block:
  name: memorable 2–3 word name (e.g. "The Grounded Navigator")
  canonical_slug: closest match from the canonical slug list
  subtitle: one-line signature capturing the mechanism — specific, not generic
    (e.g. "High institutional stamina · purpose-driven · open-loop decision
    debt under commercial acceleration")
  description: one paragraph. How this archetype performs, where it strains,
    what the CoS watches. Specific to this person.
  to_be_confirmed_after: what data would confirm or refine this
    (e.g. "7 check-ins, Apple Watch sleep baseline, first two high-stakes
    calendar event outcomes")

High-stakes load map (immediately below the archetype, same section):
  declared_events: verbatim from stakes_chips
  inferred_events: 2–3 that the combination of freetext + chips strongly
    implies — each labelled "(inferred)"
  declared_loads: verbatim from load_chips
  inferred_loads: 2–3 inferred from the combination — each labelled
  operating_burdens: verbatim from burden_chips
  primary_depletion_pattern: how this person likely runs out of capacity —
    specific to their combination, not a generic burnout description

Brief personalisation block (within section 7, not a separate visible section):
  timing: the brief_timing value if declared, or "System-determined — leader
    chose Use intelligence" if null. Never a fabricated clock time.
  preferred_practice_window: declared value or "System-determined" if null.
  reset_modality: declared value or "System-determined" if null.
  weekend_signals: always declared — use the stored value directly.

STRUCTURED-DATA ONLY FIELD
Also populate the JSON field what_is_missing with 3–5 numbered gaps, each
naming the specific signal that would lift confidence. This field is for the
system only — it must NOT be rendered as a section in display_html.

───────────────────────────────────────────────
STEP 5 · PRODUCE THE DISPLAY HTML
───────────────────────────────────────────────

SECTION ORDER — THE HTML MUST RENDER IN EXACTLY THIS SEQUENCE:

  Section 1: Identity and operating context
  Section 2: Leadership style
  Section 3: Communication style
    (how they think · how they communicate · register note)
  Section 4: What works · What doesn't · CoS communication rules
    THIS IS A SEPARATE NAMED SECTION — not a card inside Section 3.
    It must have its own .sec-label reading "What works · What doesn't · CoS communication rules"
    and render as two named lean-label blocks (green for What lands,
    red for What won't land) followed by the CoS brief rules paragraph.
  Section 5: Cognitive risk profile
  Section 6: External persona
  Section 7: Provisional archetype · High-stakes load map

Do not merge Section 3 and Section 4 into one section.
Do not place External Persona before Communication Style.
Do not place Communication Style after Cognitive Risk.
If you produce the sections in any other order, the profile is wrong.

The display_html renders the profile as a document — in-app and by email.
It must cover all seven sections using only these CSS classes. No <style>
blocks, no <script> tags, no onclick handlers, no buttons.


Classes available:
  .hero .hero-tag .hero-name .hero-sub .conf-row .conf-pill .conf-dot
  .section .sec-label
  .card .card-title .card-body
  .tag .tag-p .tag-t .tag-a .tag-r .tag-g
  .two-col
  .lean-label .lean-label.green .lean-label.red
  .lean-item .lean-dot .ld-g .ld-a .ld-r .lean-text
  .flag .flag-teal .flag-amber .flag-red .flag-ic .flag-body
  .quote
  .missing-item .m-num .m-text
  .rule

Hero block: name or role title · one-line operating context sentence ·
  a confidence pill that honestly states the data sources.
  e.g. "Derived from self-provided professional context and onboarding
  selections · no wearable or check-in data yet"

Section 4 (What works / What doesn't): render as two named lean-label blocks
  inside one card. Green items use .ld-g dots, red items use .ld-r dots.

Section 5 (Risk flags): each flag as a coloured .flag block — .flag-teal,
  .flag-amber, or .flag-red. Flag name bolded inside .flag-body.

Section 7 archetype: .card with inline style border-color:#534AB7.
  Include a circular icon div (38×38, background #EEEDFE) and the archetype
  name. Subtitle below the name in a lighter style.

Use .quote at least once for a verbatim phrase from the person's freetext.
Use .rule to separate major sections.

Minimum HTML length: 4,000 characters. A profile shorter than this is
not complete. All seven sections must contain real prose.

───────────────────────────────────────────────
INTEGRITY RULES
───────────────────────────────────────────────

NO FABRICATION
Never invent specific facts — no clock times, employer names, revenue figures,
publication names, or quotes not present in the input.

NULL = USE INTELLIGENCE
brief_timing null → "System-determined — leader chose Use intelligence"
preferred_practice_window null → "System-determined — leader chose Use intelligence"
reset_modality null → "System-determined — leader chose Use intelligence"
weekend_signals is always a declared string — use it directly.

CHIPS ARE CONTEXT, NOT FACTS
Stakes chips show what matters to the person and what they operate near.
They do not confirm any event is currently happening.
Correct:   "operates near capital-raise and negotiation environments"
Incorrect: "is currently in a capital raise"

INFERENCE LABELLING
Every claim beyond direct evidence must be labelled:
"inferred from [source]" · "implied by the combination of [chips]" ·
"not yet confirmed" · "provisional — to be refined through check-ins"

PERFORMANCE LANGUAGE (use throughout, not mandatory but strongly preferred)
cognitive load · recovery deficit · regulation gap · depletion pattern ·
operating at capacity · high-stakes interface · composure anchor

CONFIDENCE
confidence_overall must be exactly one of: high, medium, low, very_low.

HOW TO WRITE — THE STANDARD TO MATCH

The reference for this profile's writing quality is the Rishad Tobaccowala
COS profile. Read these sentences from that profile and study what makes
them work:

  "He leads through ideas, not authority."
  "Burnout for this type doesn't announce itself — it accumulates silently
  and shows up as flat affect or reduced quality of thinking before he notices."
  "Not a consultant selling engagements — a gift-giver."
  "High cortisol in this type reads as confidence — the brief must
  cross-reference carry load and pressure even when emotional state
  appears composed."
  "He admitted publicly he used to hate change but that the world changed him.
  That kind of declared vulnerability at scale signals high self-awareness
  and low defensive ego."

What these sentences have in common:
  — They say something specific, not categorical
  — They explain a mechanism, not just a trait
  — They could not have been written without reading the source material
  — A senior executive reading them would nod and understand immediately
  — None of them contain jargon

RULES:

Write complete thoughts, not compressed labels.
  BAD:  "Formal, comprehensive, outcome-oriented, precise."
  GOOD: "She communicates formally and precisely — structured arguments,
        clear conclusions, no rambling. She expects the same discipline
        from others."

Use plain words. If the word would not appear in a quality newspaper
article, replace it.
  "HRV suppression" → "low recovery scores on the watch"
  "somatic signals" → "physical signs of stress"
  "depletion substrate" → remove entirely
  "operationalise" → "put into practice"
  "contextualise" → "connect" or "place in context"
  "domain transition" → "switching between two very different kinds of work"
  "cognitive load" is acceptable — it is widely understood

Risk flag leading indicators must be observable, not internal.
  BAD:  "indicators of cognitive fatigue"
  GOOD: "check-in responses get shorter and more task-focused — fewer
        reflective sentences — in the 48 hours before a major negotiation"

  BAD:  "HRV suppression without physical exertion"
  GOOD: "Apple Watch shows lower-than-usual recovery scores on days that
        were mentally intense but not physically demanding — the body
        registering strain the person is not acknowledging"

What lands / What won't land — write as if briefing a new colleague.
  BAD:  "Tactics linked to long-term credibility"
  GOOD: "Connect today's decision to what it means for the institution
        in five years. She evaluates everything on that timescale."

  BAD:  "Disregard for their partnership legacy"
  GOOD: "Do not frame anything as purely transactional. She is building
        a network, not closing deals."

The identity section is a paragraph, not a CV summary.
Read it back. If it sounds like a LinkedIn bio, rewrite it as a human
observation about what this person is actually doing and why.

Before finalising any sentence, ask: would a non-technical senior executive
read this once and understand it immediately? If they would need to read it
twice, rewrite it.

PLAIN TEXT IN JSON FIELDS:
When writing any string field value, write paragraph breaks as natural
sentence endings followed by two spaces — not as the character sequence
\n or \\n. Do not emit escaped newline characters in any text field.

THIS PROFILE IS:
A well-briefed colleague's honest read of who this person is, how they
work, what to watch for, and how to speak to them — written so they
would recognise themselves in it and find it useful.

THIS PROFILE IS NOT:
A psychology assessment. A systems architecture document. A business case.
A LinkedIn summary with extra words.

You MUST call the tool "emit_cos_profile" exactly once. Do not return prose.`;

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
  preferredPracticeWindow: string | null;
  resetModality: string | null;
  weekendSignals: string | null;
  calendarSelections: string[];
  wearableSelections: string[];
}) {

  // ── PRIMARY SOURCE ───────────────────────────────────────────────────────
  // freetext_context combines three textarea inputs from StageLeadershipContext:
  //   [LINKEDIN ABOUT]     — LinkedIn About or bio pasted by the user
  //   [WRITING SAMPLE]     — non-URL text from the writing/interviews textarea
  //   [ADDITIONAL CONTEXT] — DISC, operating principles, current chapter, etc.
  // Also covers linkedin_pdf_base64 text (extracted before synthesis runs).
  // All arrive in this single field. There is no URL input field in MVP.

  const freetextSection = args.freetext
    ? `PRIMARY SOURCE — self-provided text (mine every word):
The leader wrote or pasted the following. It may include their LinkedIn About,
writing samples, DISC profile, operating principles, or any other context.
Sections are labelled [LINKEDIN ABOUT], [WRITING SAMPLE], [ADDITIONAL CONTEXT].
Extract: exact role titles (verbatim), named institutions and programmes,
purpose/meaning language, declared professional interests, partnership ambitions,
and any phrase that reveals how they think about their own work.

${args.freetext}`
    : `PRIMARY SOURCE — self-provided text: (nothing provided)
The leader skipped the leadership context screen or left all fields blank.
Build entirely from chip and goal selections below.
Every inference must be clearly labelled as such.`;

  // ── WRITING / INTERVIEW CONTENT ──────────────────────────────────────────
  // URLs pasted into the writing textarea are parsed and scraped separately.
  // Scraped content arrives here when available — treat as bonus, not baseline.

  const writingSection = args.writingText
    ? `WRITING AND INTERVIEW CONTENT — scraped from provided URLs
(richest source for cognitive and communication style):

${args.writingText}`
    : args.writingUrls.length > 0
      ? `WRITING URLS PROVIDED: ${args.writingUrls.join(", ")}
Scrape content was not available. Note this as a gap — the leader did
provide URLs, suggesting they have published work or public interviews.`
      : `WRITING AND INTERVIEWS: (none provided)
Infer communication style from freetext structure and register.`;

  // ── CHIP SELECTIONS ──────────────────────────────────────────────────────
  // All three groups are optional. Empty = not selected, not a skip error.
  // Chips show operating context and concerns — not confirmed current events.

  const stakesSection = args.stakesChips.length
    ? `HIGH-STAKES EVENTS — what they operate near and consider high-stakes
(menu selections: show operating context, NOT confirmed current events):
${args.stakesChips.join(" · ")}`
    : `HIGH-STAKES EVENTS: (none selected — operating arena cannot be inferred from this signal)`;

  const loadSection = args.loadChips.length
    ? `TRENDS THAT WEIGH ON THEM — direct signal for cognitive load pattern:
${args.loadChips.join(" · ")}`
    : `COGNITIVE LOAD TRENDS: (none selected)`;

  const burdenSection = args.burdenChips.length
    ? `OPERATING BURDENS — direct signal for risk flags:
${args.burdenChips.join(" · ")}`
    : `OPERATING BURDENS: (none selected)`;

  // ── GOALS ────────────────────────────────────────────────────────────────
  // Goal IDs map to full labels. The label wording reveals the type of
  // pressure the leader feels most. Use the full label, not just the ID.

  const goalLabels: Record<string, string> = {
    regulated: "Stay regulated under sustained pressure — composure and clarity across high-intensity periods",
    prepare:   "Prepare before high-stakes events — Prepare protocols activate 24–48h ahead of board, investor, negotiation",
    recover:   "Recover capacity after intensity — Structured Resets after hard days, travel, back-to-back output",
    sustain:   "Sustain performance across multi-day intensity — conferences, travel blocks, repeated executive output",
    decision:  "Protect decision quality under cognitive load — clear thinking when stakes and load are simultaneously highest",
    people:    "Navigate difficult people situations sharply — relational performance, composure and precision when it matters",
    models:    "Build stronger mental models under pressure — structured thinking frameworks for ambiguity and complexity",
    patterns:  "Understand my own performance patterns — learn when sharpest, what depletes, how to prepare more effectively",
  };

  const goalsSection = args.goals.length
    ? `GOALS — what the leader wants Mind Module to protect (up to 3, at least 1 required):
${args.goals.map((id) => goalLabels[id] ?? id).join("\n")}`
    : `GOALS: (none selected — Brief accountability role undeclared)`;

  // ── PREFERENCE FIELDS ────────────────────────────────────────────────────
  // brief_timing, preferred_practice_window, reset_modality:
  //   null = user selected "Use intelligence" (or left the default).
  //   This is a deliberate active preference — NOT a blank or unknown.
  //   DO NOT fabricate a value. Output the system-determined description.
  //
  // weekend_signals: always a declared string (Reduce or Keep).
  //   No "Use intelligence" option exists for this field.

  const briefTimingLine = args.briefTiming
    ? `Brief timing: ${args.briefTiming} — explicitly declared by the leader. Use this in the profile.`
    : `Brief timing: null — leader selected Use intelligence (or system default applied).
Output in profile: "System-determined — leader chose Use intelligence. Mind Module learns
the optimal check-in window from behaviour and wearable patterns."
DO NOT write a clock time.`;

  const practiceWindowLine = args.preferredPracticeWindow
    ? `Practice window: ${args.preferredPracticeWindow} — explicitly declared.`
    : `Practice window: null — leader selected Use intelligence.
Output in profile: "System-determined — leader chose Use intelligence. Mind Module places
recovery practices at the window that emerges from calendar and wearable patterns."`;

  const resetModalityLine = args.resetModality
    ? `Reset modality: ${args.resetModality} — explicitly declared. Use this in the profile.`
    : `Reset modality: null — leader selected Use intelligence.
Output in profile: "System-determined — leader chose Use intelligence. Mind Module selects
between Sound, Guided, and Mindset based on state and context at reset time."
DO NOT invent a modality.`;

  const weekendLine = args.weekendSignals
    ? `Weekend signals: ${args.weekendSignals}${args.weekendSignals === "Keep" ? " — always-on operator. Signal continuity is part of this leader's identity." : " — values recovery separation. Brief should reduce weekend signal load."}`
    : `Weekend signals: (not stored — treat as unknown, note the gap)`;

  // ── STRUCTURAL SIGNALS ───────────────────────────────────────────────────

  const calendarLine = args.calendarSelections.length
    ? `Calendar connections: ${args.calendarSelections.join(", ")}
(Google + Microsoft together → enterprise/institutional; Apple alone → smaller org or individual)`
    : `Calendar connections: (none connected during onboarding)`;

  const wearableLine = args.wearableSelections.length
    ? `Wearable connected: ${args.wearableSelections.join(", ")} — self-monitoring orientation confirmed`
    : `Wearable: (none connected — no biometric baseline yet; note in what's missing if relevant)`;

  return `Build the COS profile for this leader following the five steps in the system prompt.

═══════════════════════════════════════════════════
PRIMARY SOURCE (highest weight — mine every word)
═══════════════════════════════════════════════════

${freetextSection}

${writingSection}

═══════════════════════════════════════════════════
CHIP SELECTIONS (high weight — operating context)
═══════════════════════════════════════════════════

${stakesSection}

${loadSection}

${burdenSection}

${goalsSection}

═══════════════════════════════════════════════════
PREFERENCE SIGNALS
═══════════════════════════════════════════════════

${briefTimingLine}

${practiceWindowLine}

${resetModalityLine}

${weekendLine}

═══════════════════════════════════════════════════
STRUCTURAL SIGNALS (medium weight)
═══════════════════════════════════════════════════

${calendarLine}

${wearableLine}

═══════════════════════════════════════════════════
META
═══════════════════════════════════════════════════

user_id: ${args.userId}
timestamp: ${new Date().toISOString()}

═══════════════════════════════════════════════════

Now work through Steps 1–5 and call emit_cos_profile exactly once.
Every section must contain real prose. The display_html must be at least
4,000 characters and render all seven sections. Use .quote at least once
for the leader's own words.`;
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
                  leading_indicator: {
                    type: "string",
                    description: "One sentence on what the CoS should watch for as the early signal before this flag fully fires — observable in check-in responses, calendar density, or wearable data.",
                  },
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

export type CosProfileQuality = "rich" | "partial" | "thin";

/**
 * v2026-09-08 — the depth checks are ADVISORY, not a gate. Onboarding is mostly
 * optional, so a thin profile is still worth using everywhere; the gaps are
 * recorded as a quality label so we can improve over time and decide who is
 * email-ready later.
 */
export function scoreProfileQuality(profile: any, gaps: string[]): CosProfileQuality {
  if (!profile || typeof profile !== "object") return "thin";
  if (gaps.length === 0) return "rich";
  const html = typeof profile.display_html === "string" ? profile.display_html : "";
  const hasSpine = textLen(profile.provisional_archetype?.name) >= 3 &&
    textLen(profile.leadership_style?.style_description) >= 120 &&
    html.length >= 1200;
  return gaps.length <= 4 && hasSpine ? "partial" : "thin";
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
    // v2026-09-07 — the background recovery sweep invokes this with the service
    // role key and { userId } in the body. Previously the user was only ever
    // read from the caller's token, so every sweep call failed silently.
    const body: any = await req.clone().json().catch(() => ({}));
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const cronSharedSecret = Deno.env.get("CRON_SHARED_SECRET") ?? "";
    const cronSecretHeader = req.headers.get("x-cron-secret") ?? "";
    const isServiceRoleCall = (!!serviceKey &&
      (bearer === serviceKey || req.headers.get("apikey") === serviceKey)) ||
      (!!cronSharedSecret && cronSecretHeader === cronSharedSecret);
    const bodyUserId = typeof body?.userId === "string" ? body.userId.trim() : "";

    let userId: string;
    if (isServiceRoleCall && bodyUserId) {
      userId = bodyUserId;
      console.info(`[synthesize-cos] service-role call for user_id=${redactUserId(userId)}`);
    } else {
      const auth = await authenticateRequest(req, corsHeaders);
      if (auth.errorResponse) {
        console.warn("[synthesize-cos] auth_missing — returning 401 from authenticateRequest");
        return auth.errorResponse;
      }
      userId = auth.userId!;
    }
    console.info(`[synthesize-cos] start user_id=${redactUserId(userId)}`);

    const force = !!body?.force;

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
      preferredPracticeWindow: row.preferred_practice_window ?? null,
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

    // v2026-09-07 — persistence writes profiles.* in the types the columns
    // actually expect and stores email-ready artefacts.
    // v2026-09-08 — depth is advisory: any profile object we hold is stored as
    // 'ready' (usable everywhere) with a quality label + recorded gaps.
    const persistProfile = async (
      profile: any,
      source: 'ai' | 'fallback' = 'ai',
      status: 'ready' | 'failed' = 'ready',
      problems: string[] = [],
    ) => {
      const displayHtml = typeof profile.display_html === "string" ? profile.display_html : "";
      profile.confidence_overall = normalizeConfidence(profile.confidence_overall);
      const email = buildEmailArtifacts(profile, displayHtml);
      const quality = scoreProfileQuality(profile, problems);

      const { error: persistErr } = await db
        .from("onboarding_v8_responses")
        .update({
          cos_profile: profile,
          cos_profile_html: displayHtml,
          cos_profile_status: status,
          cos_profile_quality: quality,
          cos_profile_error: problems.length ? `quality_gaps: ${problems.join(", ")}` : null,
          cos_profile_generated_at: new Date().toISOString(),
          cos_profile_source: source,
          cos_profile_email_html: email.html,
          cos_profile_email_text: email.text,
          cos_profile_email_subject: email.subject,
        })
        .eq("user_id", userId);



      if (persistErr) {
        console.error("[synthesize-cos] persist error:", persistErr);
        return { ok: false as const, error: persistErr };
      }

      // Personalisation write — column-correct types.
      // profiles.inferred_priorities is text[]; leadership_context and
      // pressure_profile are jsonb. Previously a JSON string went into the
      // text[] column and a sentence into jsonb, so Postgres rejected the whole
      // statement and NONE of these fields ever landed.
      let personalisationError: string | null = null;
      try {
        const archetypeSlug = resolveArchetypeSlug(
          profile.provisional_archetype?.canonical_slug ??
            profile.provisional_archetype?.name ?? null,
        );
        const priorities: string[] = [
          ...(Array.isArray(profile.high_stakes_map?.declared_events)
            ? profile.high_stakes_map.declared_events
            : []),
          ...(Array.isArray(profile.high_stakes_map?.inferred_events)
            ? profile.high_stakes_map.inferred_events
            : []),
        ]
          .map((v: unknown) => String(v ?? "").trim())
          .filter((v) => v.length > 0)
          .slice(0, 12);

        const profileUpdate: Record<string, unknown> = {
          archetype_title: profile.provisional_archetype?.name ??
            profile.provisional_archetype?.subtitle ?? null,
          archetype_description: profile.provisional_archetype?.description ?? null,
          identity_role: profile.identity?.role ?? null,
          biggest_pressure: profile.cognitive_load_map?.primary_depletion_pattern ?? null,
          onboarding_insight: profile.communication_profile?.cos_brief_rules ?? null,
          growth_priority: profile.goals?.declared?.[0] ?? null,
          updated_at: new Date().toISOString(),
        };
        // Canonical slug only — the display name lives in archetype_title.
        if (archetypeSlug) profileUpdate.user_archetype = archetypeSlug;
        if (priorities.length) profileUpdate.inferred_priorities = priorities;
        if (profile.leadership_style) {
          profileUpdate.leadership_context = {
            primary_style: profile.leadership_style.primary_style ?? null,
            style_tags: Array.isArray(profile.leadership_style.style_tags)
              ? profile.leadership_style.style_tags
              : [],
            style_description: profile.leadership_style.style_description ?? null,
            sector: profile.identity?.sector ?? null,
            organisation_stage: profile.identity?.organisation_stage ?? null,
            leadership_stage: profile.identity?.leadership_stage ?? null,
            confidence: normalizeConfidence(profile.leadership_style.confidence),
          };
        }
        if (profile.cognitive_risk_profile || profile.cognitive_load_map) {
          profileUpdate.pressure_profile = {
            primary_risk: profile.cognitive_risk_profile?.primary_risk ?? null,
            risk_flags: Array.isArray(profile.cognitive_risk_profile?.risk_flags)
              ? profile.cognitive_risk_profile.risk_flags
              : [],
            regulation_strengths: Array.isArray(profile.cognitive_risk_profile?.regulation_strengths)
              ? profile.cognitive_risk_profile.regulation_strengths
              : [],
            declared_loads: Array.isArray(profile.cognitive_load_map?.declared_loads)
              ? profile.cognitive_load_map.declared_loads
              : [],
            inferred_loads: Array.isArray(profile.cognitive_load_map?.inferred_loads)
              ? profile.cognitive_load_map.inferred_loads
              : [],
            operating_burdens: Array.isArray(profile.cognitive_load_map?.operating_burdens)
              ? profile.cognitive_load_map.operating_burdens
              : [],
          };
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
          personalisationError = profileErr.message;
          console.error('[synthesize-cos] profiles update FAILED:', profileErr.message);
        } else {
          console.log('[synthesize-cos] profiles.* updated from COS:', redactUserId(userId));
        }
      } catch (e) {
        personalisationError = e instanceof Error ? e.message : String(e);
        console.error('[synthesize-cos] profiles update error:', personalisationError);
      }

      if (personalisationError) {
        // Surface it on the row instead of losing it in logs.
        await db
          .from("onboarding_v8_responses")
          .update({
            cos_profile_error:
              `personalisation_write_failed: ${personalisationError}` +
              (problems.length ? ` | insufficient_depth: ${problems.join(", ")}` : ""),
          })
          .eq("user_id", userId);
      }

      return { ok: true as const, displayHtml, personalisationError };
    };
    const persistReadyProfile = (profile: any, source: 'ai' | 'fallback' = 'ai') =>
      persistProfile(profile, source, 'ready', []);

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
    const userMessageContent = (prompt: string): any =>
      linkedinPdfBase64
        ? [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: linkedinPdfBase64.startsWith("data:")
                  ? linkedinPdfBase64
                  : `data:application/pdf;base64,${linkedinPdfBase64}`,
              },
            },
          ]
        : prompt;

    const callModel = async (
      model: string,
      prompt: string,
    ): Promise<{ status: number; profile: any | null }> => {
      const res = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 16384,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessageContent(prompt) },
          ],
          tools: [COS_TOOL],
          tool_choice: { type: "function", function: { name: "emit_cos_profile" } },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("[synthesize-cos] AI gateway error:", res.status, errText.slice(0, 400));
        return { status: res.status, profile: null };
      }
      const payload = await res.json();
      const argsRaw = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      try {
        const parsed = argsRaw ? JSON.parse(argsRaw) : null;
        return { status: 200, profile: parsed && typeof parsed === "object" ? parsed : null };
      } catch (e) {
        console.error("[synthesize-cos] tool args parse failed:", e);
        return { status: 200, profile: null };
      }
    };

    // v2026-09-08 — three model attempts before we ever fall back locally:
    // pro → flash → flash-lite. Depth is advisory, so whatever comes back is
    // stored as usable with a quality label.
    console.info(`[synthesize-cos] calling AI model=${AI_MODEL} user_id=${redactUserId(userId)}`);
    let modelUsed = AI_MODEL;
    let attempt = await callModel(AI_MODEL, userPrompt);

    for (const nextModel of [AI_MODEL_FALLBACK, AI_MODEL_FALLBACK_LITE]) {
      if (attempt.profile) break;
      console.info(`[synthesize-cos] retrying with fallback model=${nextModel} (prev status=${attempt.status})`);
      modelUsed = nextModel;
      attempt = await callModel(nextModel, userPrompt);
    }

    if (!attempt.profile) {
      const reason = attempt.status === 200
        ? "the AI response did not emit the COS tool payload"
        : `the AI gateway returned ${attempt.status}`;
      const fallbackProfile = buildFallbackCosProfile(cosInput, reason);
      // Still usable: the raw onboarding answers are the source of truth and a
      // thin profile must never switch personalisation off.
      const persistedFallback = await persistProfile(
        fallbackProfile,
        'fallback',
        'ready',
        ["ai_output_unavailable"],
      );
      if (!persistedFallback.ok) return json(500, { error: "persist_failed" });
      return json(200, {
        ok: true,
        cached: false,
        fallback: true,
        quality: 'thin',
        fallback_reason: attempt.status === 200 ? "ai_no_tool_call" : `ai_${attempt.status}`,
        cos_profile: fallbackProfile,
        cos_profile_html: persistedFallback.displayHtml,
      });
    }


    let profile: any = attempt.profile;
    let problems = validateCosProfile(profile);

    if (problems.length > 0) {
      console.warn(`[synthesize-cos] quality gaps (${problems.join(", ")}) — one stricter retry (advisory only)`);
      const stricterPrompt = `${userPrompt}

### REVISION REQUIRED
A previous attempt came back thinner than the DEPTH CONTRACT asks for. Gaps: ${problems.join(", ")}.
Produce a complete profile that satisfies every item of the DEPTH CONTRACT. Reason from the selected chips, goals and any free text — infer the operating pattern they imply and label it as inference. Do not emit placeholders, "unknown", "not specified" or a pending shell. The display_html must contain all eight sections in full prose.`;
      // Retry on the fast model: the primary already spent most of the wall
      // clock, and the retry only needs to fill the flagged gaps.
      const retry = await callModel(AI_MODEL_FALLBACK, stricterPrompt);
      if (retry.profile) {
        const retryProblems = validateCosProfile(retry.profile);
        if (retryProblems.length < problems.length) {
          profile = retry.profile;
          problems = retryProblems;
        }
      }
    }

    // Advisory: any profile object we hold is usable. Gaps travel with it.
    const status: 'ready' = 'ready';
    const quality = scoreProfileQuality(profile, problems);
    const persisted = await persistProfile(profile, 'ai', status, problems);
    if (!persisted.ok) return json(500, { error: "persist_failed" });
    if (persisted.personalisationError) {
      console.error("[synthesize-cos] personalisation write failed:", persisted.personalisationError);
    }

    console.info(`[synthesize-cos] success user_id=${redactUserId(userId)} quality=${quality} linkedin_ok=${!!(linkedinScrape && linkedinScrape.ok)} writing_ok=${writingScrapes.filter((w) => w?.ok).length}/${writingScrapes.length}`);
    return json(200, {
      ok: true,
      cached: false,
      status,
      quality,
      quality_gaps: problems,

      model_used: modelUsed,
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
