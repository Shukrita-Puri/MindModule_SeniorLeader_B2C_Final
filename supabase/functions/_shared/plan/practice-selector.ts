// OWNERSHIP: Plan content selection. Pure scoring helpers — no IO, no LLM.
//
// Binds the Today's-Priorities slot intent (verb + objective + anchor
// category + protocol-combo) to the catalog metadata that actually
// discriminates practices today:
//   • sanctuary_content.category       (Recalibrate: pause | power-up | presence)
//   • sanctuary_content.sub_type       (mindset | tool)
//   • sanctuary_content_metadata.meta_skill   (meta-clarity | meta-recalibration | meta-renewal)
//
// NOTE on `mastery_category`: every active row currently stores
// `{"primary": null}`. Until that column is backfilled it is NOT used
// here — relying on it would drop the entire pool to zero score and
// re-introduce the "selector ignores intent" bug this module fixes.
// When the backfill ships, add a +25 boost for `masteryCategoryMatch`.
//
// Single source of truth for verb → intent mapping. Imported by both the
// filler and the primary selection paths in `generate-mastery-plan`.

import type { EventCategoryId } from "../events/event-categories.ts";
import type { Phase } from "../events/event-phase-map.ts";
import {
  COMBO_TO_PRACTICE_TYPE,
  PRACTICE_TYPE_TO_COMBO,
  type ComboKey,
  type LegacyPracticeType,
} from "../protocols/protocol-combos.ts";

export type MetaSkill = "meta-clarity" | "meta-recalibration" | "meta-renewal";
export type RecalibrateCategory = "pause" | "power-up" | "presence";

/**
 * Intent derived from the slot's resolved verb/anchor. The selector scores
 * each content row by how well its metadata matches this intent.
 */
export interface SlotIntent {
  metaSkills: MetaSkill[];        // preferred meta_skill values, order = priority
  recalibrateCategories: RecalibrateCategory[]; // preferred Recalibrate `category` values
  combo: ComboKey | null;         // §4 protocol combo for the slot, when known
  /** Human-readable label for telemetry / tests. */
  intentLabel: string;
}

/** Anchor + slot signals the intent is derived from. */
export interface SlotIntentInput {
  /** Verb emitted by composeStateLabel — e.g. "Re-consolidate focus",
   *  "Prime for focus", "Steady the system", "Decompress", "Restore HRV",
   *  "Settle the system", "Re-anchor circadian rhythm", "Build capacity".  */
  stateAction: string | null;
  /** CEO-behaviour verb from `buildPriorityTitle` (Lead/Steady/Sharpen/etc). */
  ceoVerb?: string | null;
  anchorCategory: EventCategoryId | null;
  anchorPhase: Phase | null;
  combo?: ComboKey | null;
  practicePriorityTag?: string | null;
}

/**
 * Map the slot's resolved verbs / anchor to the meta_skill + Recalibrate
 * category the practice should belong to. Deliberately conservative —
 * returns multiple acceptable values when the signal is ambiguous so the
 * scorer can still find a match in a sparse catalog.
 */
export function deriveSlotIntent(inp: SlotIntentInput): SlotIntent {
  const action = (inp.stateAction || "").toLowerCase();
  const verb = (inp.ceoVerb || "").toLowerCase();
  const tag = (inp.practicePriorityTag || "").toLowerCase();

  // ────────────────────────────────────────────────────────────────
  // 0. Pre-decision clarity / detachment — Sprint 5 (Phase 7).
  //
  // Placed BEFORE the Focus/Flow branch so it cannot be shadowed by
  // `verb === "decide"` which routes to mindset.flow. Focus/Flow is
  // for ACTIVE decision-making (sharpen and go); this branch is for
  // the state that comes BEFORE the decision — clarity, detachment,
  // decision fatigue, reactive-thinking recovery.
  //
  // Also handles state-based slots explicitly asking for the
  // `mindset.pause` combo (e.g. a state anchor whose upstream label
  // has already resolved to a Cat-A "pre" clarity moment). This
  // makes the branch reachable independent of an event anchor.
  // ────────────────────────────────────────────────────────────────
  const wantsPreDecisionPause =
    action.includes("clarify") ||
    action.includes("clarity") ||
    action.includes("detach") ||
    action.includes("reactive") ||
    action.includes("decision fatigue") ||
    action.includes("pre-decision") ||
    verb === "clarify" ||
    verb === "detach" ||
    tag === "decision_fatigue" ||
    tag === "pre_decision_clarity" ||
    inp.combo === "mindset.pause";
  if (wantsPreDecisionPause) {
    return {
      metaSkills: ["meta-clarity", "meta-recalibration"],
      recalibrateCategories: ["pause"],
      combo: inp.combo ?? "mindset.pause",
      intentLabel: "pre-decision-clarity",
    };
  }

  // 1. Focus / Flow Mastery family.
  if (
    action.includes("focus") ||
    verb === "sharpen" || verb === "decide" ||
    tag === "focus_clarity" ||
    inp.anchorCategory === "E"
  ) {
    return {
      metaSkills: ["meta-clarity"],
      recalibrateCategories: ["presence"],
      combo: inp.combo ?? "mindset.flow",
      intentLabel: "focus/flow-mastery",
    };
  }

  // 2. Recovery / Renewal — post-peak, close-of-day, recovery tags.
  if (
    action.includes("recover") || action.includes("restore") ||
    action.includes("settle") || action.includes("decompress") ||
    verb === "recover" || verb === "reset" || verb === "land" ||
    tag === "recovery_resilience" ||
    inp.anchorPhase === "post"
  ) {
    return {
      metaSkills: ["meta-renewal", "meta-recalibration"],
      recalibrateCategories: ["pause"],
      combo: inp.combo ?? "mindset.reenergise",
      intentLabel: "recovery/renewal",
    };
  }

  // 3. Circadian / travel.
  if (action.includes("circadian") || inp.anchorCategory === "G") {
    return {
      metaSkills: ["meta-recalibration", "meta-renewal"],
      recalibrateCategories: ["pause"],
      combo: inp.combo ?? "somatic.reenergise",
      intentLabel: "circadian",
    };
  }

  // 4. Energy / activation.
  if (
    action.includes("activate") || action.includes("build capacity") ||
    verb === "present" || verb === "lead" ||
    tag === "energy_endurance"
  ) {
    return {
      metaSkills: ["meta-recalibration", "meta-clarity"],
      recalibrateCategories: ["power-up", "presence"],
      combo: inp.combo ?? "somatic.flow",
      intentLabel: "activation/presence",
    };
  }

  // 5. Default — regulation / composure (Steady the system, Ground, Hold).
  return {
    metaSkills: ["meta-recalibration"],
    recalibrateCategories: ["pause"],
    combo: inp.combo ?? "somatic.pause",
    intentLabel: "regulation/composure",
  };
}

/**
 * Minimal content shape the scorer needs. Matches the `enrichedContent`
 * row produced by `generate-mastery-plan`.
 */
export interface ScorableContent {
  id: string;
  content_type?: string | null;
  category?: string | null;          // Recalibrate category
  sub_type?: string | null;
  protocol_type?: string | null;
  structuredTags?: {
    pillar?: string | null;
    masterySubtypes?: string[] | null;
    goalTags?: string[] | null;
    physioTarget?: string[] | null;
    contextTags?: string[] | null;
    environmentSuitability?: string[] | null;
    equipment?: string[] | null;
    cognitiveLoadHelp?: string[] | null;
    socialTag?: string | null;
    intensityLevel?: string | null;
    energyDirection?: string | null;
  } | null;
  metaSkillTags?: string[] | null;
  stateSignalTags?: string[] | null;
  isFoundational?: boolean | null;
  masteryCategory?: { primary?: string | null; secondary?: string[] | null } | null;
}

export interface SelectionSlotContract {
  mode?: "jit" | "state" | "jit+state" | "full_arc" | null;
  slotRole?: "start_of_day" | "dominant_demand" | "recovery" | "pre" | "during" | "post" | "state_anchor" | null;
  arcLabel?: "Prepare" | "During" | "Recover" | "Steady" | null;
  jitPhase?: "pre" | "during" | "post" | null;
  jitEventTitle?: string | null;
  dayShape?: "light_routine" | "dominant_structural_event" | "mixed_day" | "rest_day" | null;
  allocationReason?: string | null;
}

export interface PracticeSelectionContext {
  recentPracticeDays?: Record<string, number>;
  stateSignalTags?: string[];
  mrsScore?: number | null;
}

export interface IntentScoreBreakdown {
  metaSkill: number;
  recalibrateCategory: number;
  structuredTags: number;
  combo: number;
  total: number;
}

function arr(v: string[] | null | undefined): string[] {
  return Array.isArray(v) ? v.map((s) => String(s).toLowerCase()) : [];
}

function scoreStructuredTags(c: ScorableContent, intent: SlotIntent): number {
  const tags = c.structuredTags;
  if (!tags) return 0;

  const pillar = String(tags.pillar ?? "").toLowerCase();
  const subtypes = arr(tags.masterySubtypes);
  const goals = arr(tags.goalTags);
  const context = arr(tags.contextTags);
  const loadHelp = arr(tags.cognitiveLoadHelp);
  const direction = String(tags.energyDirection ?? "").toLowerCase();

  switch (intent.intentLabel) {
    case "pre-decision-clarity": {
      // Sprint 5 (Phase 7) — reward pause-pillar practices whose goal
      // profile matches pre-decision clarity: mental clarity, perspective,
      // composure, emotional regulation, decision readiness. Real catalog
      // fixtures this targets: eye-of-storm, detachment-observer-new,
      // stillness-gap-new, fudoshin-immovable-mind. Practices without
      // structuredTags fall through with 0 here and still win via the
      // Recalibrate category ('pause') + meta_skill ('meta-clarity')
      // signals in scoreContentAgainstIntent.
      let score = 0;
      if (pillar === "pause") score += 7;
      if (subtypes.some((s) => ["grounding", "composure", "deep-calm"].includes(s))) score += 5;
      if (goals.some((g) => [
        "mental_clarity", "perspective", "decision_readiness",
        "emotional_regulation", "composure", "overwhelm_reduction",
        "focus",
      ].includes(g))) score += 6;
      if (context.some((t) => [
        "high_pressure", "overwhelm", "information_overload",
        "crisis_mode", "difficult_conversation", "pre-meeting",
        "leadership_moment", "multitasking_chaos",
      ].includes(t))) score += 4;
      if (loadHelp.includes("supports_decision") || loadHelp.includes("lowers_cognitive_load")) score += 3;
      if (direction === "stabilize" || direction === "clarify") score += 2;
      // Guardrail: penalise pure renewal content that has no clarity
      // signal — same shape as focus/flow-mastery's Ikigai guard.
      if (pillar === "renewal" && !goals.some((g) => [
        "mental_clarity", "perspective", "decision_readiness", "composure",
      ].includes(g))) score -= 8;
      return score;
    }
    case "focus/flow-mastery": {
      let score = 0;
      if (pillar === "flow") score += 8;
      if (subtypes.some((s) => ["optimize", "maintain-peak", "activate"].includes(s))) score += 5;
      if (goals.some((g) => ["focus", "mental_clarity", "decision_readiness", "sustained_attention", "concentration", "flow"].includes(g))) score += 7;
      if (loadHelp.some((h) => ["improves_concentration", "supports_decision", "deep_focus", "creative_thinking"].includes(h))) score += 4;
      if (direction === "clarify" || direction === "stabilize") score += 2;
      if (pillar === "renewal" && !goals.some((g) => ["focus", "mental_clarity", "decision_readiness"].includes(g))) score -= 8;
      return score;
    }
    case "recovery/renewal": {
      let score = 0;
      if (pillar === "renewal" || pillar === "pause") score += 7;
      if (subtypes.some((s) => ["recharge", "restore", "refresh", "deep-calm", "grounding"].includes(s))) score += 5;
      if (goals.some((g) => ["resilience", "recovery", "stress_reduction", "deep_reset", "calming", "sleep_preparation", "acceptance"].includes(g))) score += 6;
      if (context.some((t) => ["post-stress", "post-meeting", "evening_winddown", "bedtime", "rest", "post-performance"].includes(t))) score += 4;
      if (direction === "downshift" || direction === "stabilize") score += 3;
      return score;
    }
    case "circadian": {
      let score = 0;
      if (pillar === "pause" || pillar === "renewal") score += 6;
      if (context.some((t) => ["evening_winddown", "bedtime", "morning_ritual", "rest"].includes(t))) score += 6;
      if (direction === "downshift" || direction === "stabilize") score += 3;
      return score;
    }
    case "activation/presence": {
      let score = 0;
      if (pillar === "flow" || pillar === "renewal") score += 5;
      if (subtypes.some((s) => ["activate", "optimize", "maintain-peak", "recharge"].includes(s))) score += 5;
      if (goals.some((g) => ["energize", "confidence", "courage", "focus", "mental_clarity", "presence"].includes(g))) score += 6;
      if (direction === "uplift" || direction === "activate" || direction === "motivate" || direction === "clarify") score += 5;
      return score;
    }
    default: {
      let score = 0;
      if (pillar === "pause") score += 7;
      if (subtypes.some((s) => ["deep-calm", "grounding", "composure"].includes(s))) score += 6;
      if (goals.some((g) => ["grounding", "breathing_regulation", "composure", "emotional_regulation", "presence", "centering", "calming"].includes(g))) score += 6;
      if (loadHelp.includes("lowers_cognitive_load") || loadHelp.includes("supports_decision")) score += 3;
      if (direction === "downshift" || direction === "stabilize") score += 3;
      return score;
    }
  }
}

/**
 * Score a single content row against a slot intent. Used as an additive
 * boost on top of the existing state-signal / favorites / recency scoring.
 *
 * Weights tuned so a clean intent match (meta_skill + Recalibrate category
 * + combo) outranks a strong state-signal match (+15) but doesn't bury
 * favorites (+30).
 */
export function scoreContentAgainstIntent(
  c: ScorableContent,
  intent: SlotIntent,
): IntentScoreBreakdown {
  const tags = (c.metaSkillTags || []) as MetaSkill[];

  // meta_skill — primary intent signal.
  let metaSkill = 0;
  for (let i = 0; i < intent.metaSkills.length; i++) {
    if (tags.includes(intent.metaSkills[i])) {
      // Strongest match for the first listed meta_skill, weaker for the rest.
      metaSkill = i === 0 ? 18 : 10;
      break;
    }
  }
  // Hard negative when the content's ONLY meta_skill is one the intent
  // explicitly does not want — prevents `meta-renewal` Ikigai winning a
  // focus slot just because state-signal scored +15.
  if (metaSkill === 0 && tags.length > 0 && !tags.some((t) => intent.metaSkills.includes(t))) {
    metaSkill = -12;
  }

  // Recalibrate category.
  let recalibrateCategory = 0;
  const cat = (c.category || "") as RecalibrateCategory;
  const idx = intent.recalibrateCategories.indexOf(cat);
  if (idx === 0) recalibrateCategory = 8;
  else if (idx > 0) recalibrateCategory = 4;

  // Recalibrate v2 structured tags — sourced from the frontend
  // `src/data/practicesAndSoundscapes.ts` catalog and mirrored into
  // `sanctuary_content_metadata.structured_tags`. This lets Plan Step 3
  // bind to the same multi-dimensional tagging model used by Recalibrate
  // without importing the asset-heavy frontend TS file into Deno.
  const structuredTags = scoreStructuredTags(c, intent);

  // Protocol combo — best-effort; `protocol_type` is currently sparse,
  // so this is a small tiebreaker rather than a strong signal.
  let combo = 0;
  if (intent.combo && c.protocol_type) {
    const [proto] = intent.combo.split(".");
    if (c.protocol_type === proto) combo = 4;
  }

  const total = metaSkill + recalibrateCategory + structuredTags + combo;
  return { metaSkill, recalibrateCategory, structuredTags, combo, total };
}

/**
 * Convenience — sort a pool by combined intent score (desc). Pure.
 */
export function rankByIntent<T extends ScorableContent>(
  pool: T[],
  intent: SlotIntent,
): Array<T & { intentScore: number }> {
  return pool
    .map((c) => ({ ...c, intentScore: scoreContentAgainstIntent(c, intent).total }))
    .sort((a, b) => b.intentScore - a.intentScore);
}

export function buildComboTarget(slot: SelectionSlotContract, intent: SlotIntent): ComboKey | null {
  if (slot.mode === "state") return intent.combo ?? null;
  if (slot.mode === "full_arc") {
    if (slot.jitPhase === "during") return "somatic.flow";
    if (slot.jitPhase === "post") return "mindset.reenergise";
    return intent.combo ?? null;
  }
  if (slot.mode === "jit+state") return intent.combo ?? null;
  return intent.combo ?? null;
}

function recencyPenalty(daysAgo: number | undefined): number {
  if (daysAgo === undefined) return 0;
  if (daysAgo <= 1) return 30;
  if (daysAgo <= 3) return 16;
  if (daysAgo <= 7) return 8;
  return 0;
}

function masterySecondaryBoost(c: ScorableContent, targetType: LegacyPracticeType | null): number {
  const secondary = c.masteryCategory?.secondary ?? [];
  if (!targetType || secondary.length === 0) return 0;
  return secondary.some((s) => String(s).toLowerCase().includes(targetType)) ? 6 : 0;
}

export function findAlternate<T extends ScorableContent>(
  pool: T[],
  current: T,
  intent: SlotIntent,
  excludeIds: Set<string>,
): T | null {
  const targetType = intent.combo ? COMBO_TO_PRACTICE_TYPE[intent.combo] : null;
  const ranked = pool
    .filter((c) => c.id !== current.id && !excludeIds.has(c.id))
    .map((c) => {
      let score = scoreContentAgainstIntent(c, intent).total;
      if (targetType && c.protocol_type === PRACTICE_TYPE_TO_COMBO[targetType].protocol) score += 4;
      if (targetType && c.sub_type && c.sub_type === current.sub_type) score += 6;
      if (targetType && c.content_type && c.content_type === current.content_type) score += 2;
      score += masterySecondaryBoost(c, targetType);
      const commonState = (c.stateSignalTags || []).filter((t) => (current.stateSignalTags || []).includes(t)).length;
      score += commonState * 2;
      const commonMeta = (c.metaSkillTags || []).filter((t) => (current.metaSkillTags || []).includes(t)).length;
      score += commonMeta * 3;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.c ?? null;
}

export function selectPracticeForSlot<T extends ScorableContent>(
  pool: T[],
  slot: SelectionSlotContract,
  intent: SlotIntent,
  excludeIds: Set<string>,
  ctx: PracticeSelectionContext = {},
): { selected: T[]; usedProtocolFallback: boolean } {
  const combo = buildComboTarget(slot, intent);
  let candidates = (pool || []).filter((c) => !excludeIds.has(c.id));
  const protocolFiltered = combo
    ? candidates.filter((c) => {
        const targetType = COMBO_TO_PRACTICE_TYPE[combo];
        const expectedProtocol = PRACTICE_TYPE_TO_COMBO[targetType].protocol;
        return c.protocol_type === expectedProtocol;
      })
    : [];
  const protocolCandidates = protocolFiltered.length > 0 ? protocolFiltered : candidates;
  const usedProtocolFallback = protocolFiltered.length === 0 && !!combo;
  if (usedProtocolFallback) {
    console.log("[practice-selector] protocol fallback", {
      combo,
      slotRole: slot.slotRole ?? null,
      mode: slot.mode ?? null,
      jitPhase: slot.jitPhase ?? null,
      jitEventTitle: slot.jitEventTitle ?? null,
    });
  }

  const scored = protocolCandidates
    .map((c) => {
      let score = scoreContentAgainstIntent(c, intent).total;
      if (ctx.recentPracticeDays?.[c.id] !== undefined) score -= recencyPenalty(ctx.recentPracticeDays[c.id]);
      if (slot.mode === "state" && ctx.mrsScore != null) score += Math.max(0, 10 - Math.abs(ctx.mrsScore - 50) / 5);
      if (slot.mode === "jit+state") score += 3;
      if (slot.mode === "full_arc" && slot.jitPhase === "during") score += 4;
      if (slot.mode === "full_arc" && slot.jitPhase === "post") score += 4;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);

  const head = scored[0]?.c ?? null;
  if (!head) return { selected: [], usedProtocolFallback };
  const selected = [head];
  return { selected, usedProtocolFallback };
}
