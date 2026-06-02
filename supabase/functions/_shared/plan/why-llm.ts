// OWNERSHIP: engineering. Lovable AI Gateway call that writes the per-priority
// "Why this matters" line for Today's 3 Priorities.
//
// Spec §4: ≤25 words, event-specific, references ≥1 non-null signal, picks one
// of PREVENT | PREPARE. Caller fans out 3 calls in parallel via Promise.all.

import type { EventCategoryId } from "../events/event-categories.ts";
import { EVENT_CATEGORIES } from "../events/event-categories.ts";
import { EVENT_PHASE_MAP, type Phase } from "../events/event-phase-map.ts";
import type { TitleRole } from "./title-prefixes.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export interface WhyLLMInput {
  role: TitleRole;
  eventName: string;
  category: EventCategoryId;
  phase: Phase;
  minutesUntilStart: number | null;

  // signals — pass null when unavailable; the prompt skips nulls.
  hrvDeltaPct: number | null;
  sleepScore: number | null;
  rhrTrend: "elevated" | "normal" | "low" | null;
  travelDebtActive: boolean | null;
  stressLoad: "low" | "medium" | "high" | null;
  burnoutRisk: "none" | "emerging" | "active" | null;
  mindState: number | null;
  bodyState: number | null;
  patternSummary: string | null;

  growthIntention: string | null;

  // ── Shared-module advisories (Brief↔Plan parity) ──
  // Pre-formatted blocks lifted off the Brief's persisted behaviour snapshot
  // so this LLM call reasons from the SAME active CEO behaviours and event
  // pillar focus the Brief used. Both fields are optional — when null/empty
  // the prompt simply omits the section (no fallback copy is invented).
  /** "=== ACTIVE CEO BEHAVIOURS ===" block from the Brief's snapshot. */
  ceoBehaviourBlock?: string | null;
  /** "=== EVENT TAXONOMY ===" block from the Brief's snapshot. */
  eventTaxonomyBlock?: string | null;
}

function buildPrompt(inp: WhyLLMInput): string {
  const cat = EVENT_CATEGORIES[inp.category];
  const ph = EVENT_PHASE_MAP[inp.category]?.[inp.phase];
  const categoryLabel = cat ? `${inp.category} — ${cat.name}` : inp.category;
  const selfReg = cat?.selfRegulationFocus || "";
  const preventsBuilds = (ph?.preventsBuilds || []).join("; ");

  const signals: string[] = [];
  if (inp.hrvDeltaPct !== null) signals.push(`- HRV vs baseline: ${inp.hrvDeltaPct}%`);
  if (inp.sleepScore !== null) signals.push(`- Sleep score last night: ${inp.sleepScore}/100`);
  if (inp.rhrTrend) signals.push(`- RHR trend: ${inp.rhrTrend}`);
  if (inp.travelDebtActive !== null) signals.push(`- Travel debt active: ${inp.travelDebtActive}`);
  if (inp.stressLoad) signals.push(`- Stress load: ${inp.stressLoad}`);
  if (inp.burnoutRisk) signals.push(`- Burnout risk: ${inp.burnoutRisk}`);
  if (inp.mindState !== null) signals.push(`- Self-declared mind state: ${inp.mindState}/5`);
  if (inp.bodyState !== null) signals.push(`- Self-declared body state: ${inp.bodyState}/5`);
  if (inp.patternSummary) signals.push(`- Pattern data: ${inp.patternSummary}`);

  const strategic = inp.growthIntention ? `\nStrategic context (use only if directly relevant to this event):\n- Growth intention: ${inp.growthIntention}` : "";

  // Append the Brief's deterministic advisories so this LLM call grounds its
  // Why statement in the same pillar focus and active behaviours the Brief
  // already named to the user. Order: taxonomy (pure labelling) first,
  // behaviours (rule output) second — same order the Brief uses.
  const sharedAdvisory = [
    (inp.eventTaxonomyBlock || "").trim(),
    (inp.ceoBehaviourBlock || "").trim(),
  ].filter(Boolean).join("\n");

  return `You are the Chief of Staff for a CEO. Your role is to write a single "Why This Matters" statement for one action priority in the CEO's daily plan.

This statement must:
- Be ≤25 words
- Be specific to THIS event, not generic
- Reference at least one of the data signals provided
- Name what this priority PREVENTS or PREPARES (never both — pick the dominant one)
- Sound like a Chief of Staff briefing a CEO, not a wellness coach
- Use no filler words: no "important", "remember to", "make sure", "today is a great day"

The priority role is: ${inp.role}

Event context:
- Event name: ${inp.eventName}
- Category: ${categoryLabel}
- Self-regulation focus for this category: ${selfReg}
- Phase window: ${inp.phase}
- What this phase prevents or builds: ${preventsBuilds}
- Minutes until event: ${inp.minutesUntilStart ?? "unknown"}

Available signals (use whichever are non-null and most relevant — do not mention null fields):
${signals.length ? signals.join("\n") : "- (none available — reference the event itself and the phase intent)"}
${strategic}${sharedAdvisory ? "\n\n" + sharedAdvisory + "\n\nWhen the active behaviours above name this exact event, prefer aligning the statement to that anchor — do not echo the copyHint verbatim." : ""}

Write only the statement. No preamble, no explanation, no quotation marks.`;
}

export function trimToWords(s: string, max = 25): string {
  const clean = (s || "").replace(/^["'\s]+|["'\s]+$/g, "").trim();
  const words = clean.split(/\s+/);
  if (words.length <= max) return clean;
  const head = words.slice(0, max).join(" ");
  return head.replace(/[,;:.\-—\s]+$/, "") + ".";
}

/**
 * Calls Lovable AI Gateway. Returns trimmed statement or null on failure /
 * missing key / too-short response. Caller decides fallback path.
 */
export async function generateWhyStatement(inp: WhyLLMInput): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  try {
    const prompt = buildPrompt(inp);
    const tool = {
      type: "function",
      function: {
        name: "write_why",
        description: "Write the ≤25-word Why This Matters statement.",
        parameters: {
          type: "object",
          properties: {
            statement: { type: "string", description: "≤25 words. Chief-of-staff voice. References a signal." },
            role: { type: "string", enum: ["PREVENT", "PREPARE"] },
          },
          required: ["statement", "role"],
          additionalProperties: false,
        },
      },
    };
    const resp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "write_why" } },
      }),
    });
    if (!resp.ok) {
      console.warn("[why-llm] gateway error", resp.status, await resp.text().catch(() => ""));
      return null;
    }
    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let statement: string | null = null;
    if (typeof args === "string") {
      try { statement = JSON.parse(args)?.statement ?? null; } catch { statement = null; }
    } else if (args && typeof args === "object") {
      statement = (args as any).statement ?? null;
    }
    if (!statement) {
      // Some providers stream content directly instead of tool_calls.
      const direct = data?.choices?.[0]?.message?.content;
      if (typeof direct === "string" && direct.trim()) statement = direct.trim();
    }
    if (!statement) return null;
    const trimmed = trimToWords(statement, 25);
    if (trimmed.split(/\s+/).length < 5) return null;
    return trimmed;
  } catch (e) {
    console.warn("[why-llm] failed", (e as any)?.message || e);
    return null;
  }
}

/** Jaccard similarity over lowercase token sets — used for dedupe. */
export function jaccard(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}