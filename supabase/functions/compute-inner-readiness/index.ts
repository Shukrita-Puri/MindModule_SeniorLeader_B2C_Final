import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  computeDivergenceFlag,
  computePhysiologicalComposite,
  computeIntradayDecline,
  type RhrTrend,
} from "../_shared/signal-engine/divergence-flag.ts";
import {
  composeBaselineV4,
  type SubScore,
} from "../_shared/signal-engine/mrs-v4-compose.ts";
import type { SubComponentId, Window as MrsWindow } from "../_shared/signal-engine/mrs-v4-weights.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ==================== FELT STATE SCORING ====================
function getFeltStateScore(outcome: string | null): number {
  if (!outcome) return 50;
  const map: Record<string, number> = {
    drained: 20, overwhelmed: 25, scattered: 35, steady: 55, focused: 80,
  };
  return map[outcome] ?? 50;
}

// ==================== INTERNAL READINESS (C+C) ====================
function getIRScore(clarity: number, confidence: number): number {
  return (clarity + confidence) * 8;
}

// ==================== MRS v3 §3.2-3.3 — REFINED-SCORE HELPERS ====================
// Mind Check-in dimensions: clarity / emotion / pressure / regulation, each
// stored as nullable int 1–5 on `daily_checkins`. Pressure inversion is baked
// into the slider semantics (1=Overloaded, 5=Spacious), so all four dims use
// the same numeric mapping below. Null → neutral (contributes 0 vs baseline).
const MIND_SLIDER_MAP: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 10, 2: 30, 3: 55, 4: 80, 5: 100,
};

function sliderToScore(level: number | null | undefined, baseline: number): number {
  if (level == null) return baseline;
  const v = Math.round(level) as 1 | 2 | 3 | 4 | 5;
  return MIND_SLIDER_MAP[v] ?? baseline;
}

/**
 * Spec §3.2 — base 11/9/5/5 (sum 30). When `has_imminent_high_stakes` is true
 * (JIT cat A/B event within next 6h), donate 3% from Clarity to Regulation.
 * Sum is always 0.30 (expressed as fractions of the blended total).
 */
function getMindWeights(hasImminentHighStakes: boolean): {
  clarity: number; emotion: number; pressure: number; regulation: number;
} {
  return hasImminentHighStakes
    ? { clarity: 0.08, emotion: 0.09, pressure: 0.05, regulation: 0.08 }
    : { clarity: 0.11, emotion: 0.09, pressure: 0.05, regulation: 0.05 };
}

export interface RefinedScoreResult {
  scoreBaseline: number | null;       // unchanged input baseline (0–100)
  scoreRefined: number | null;        // post-blend, post ±15 clamp
  readinessState: 'baseline' | 'refined' | 'awaiting';
  refinedContribution: number | null; // signed −15..+15
  mindWeights: ReturnType<typeof getMindWeights>;
}

/**
 * Spec §3.3 formula:
 *   weightedCheckIn = Σ ( sub_score_i × weight_i ) / 0.30
 *   blended         = baseline × 0.70 + weightedCheckIn × 0.30
 *   refined         = clamp( round(blended), baseline − 15, baseline + 15 )
 * Null dims short-circuit to the baseline (so they contribute zero net).
 * When all four dims are null → state='baseline', refined=baseline.
 */
export function computeRefinedScore(args: {
  baseline: number;
  clarity: number | null;
  emotion: number | null;
  pressure: number | null;
  regulation: number | null;
  hasImminentHighStakes: boolean;
}): RefinedScoreResult {
  const { baseline, clarity, emotion, pressure, regulation, hasImminentHighStakes } = args;
  const weights = getMindWeights(hasImminentHighStakes);

  const allNull = clarity == null && emotion == null && pressure == null && regulation == null;
  if (allNull) {
      return {
        scoreBaseline: baseline,
        scoreRefined: baseline,
        readinessState: 'baseline',
        refinedContribution: 0,
      mindWeights: weights,
    };
  }

  const c = sliderToScore(clarity, baseline);
  const e = sliderToScore(emotion, baseline);
  const p = sliderToScore(pressure, baseline);
  const r = sliderToScore(regulation, baseline);

  const weightedSum =
    c * weights.clarity + e * weights.emotion + p * weights.pressure + r * weights.regulation;
  const weightedCheckIn = weightedSum / 0.30; // normalise back to 0–100
  const blended = baseline * 0.70 + weightedCheckIn * 0.30;

  const floor = baseline - 15;
  const ceil  = baseline + 15;
  const refined = Math.max(0, Math.min(100, Math.max(floor, Math.min(ceil, Math.round(blended)))));

    return {
      scoreBaseline: baseline,
      scoreRefined: refined,
      readinessState: 'refined',
      refinedContribution: refined - baseline,
    mindWeights: weights,
  };
}

// ==================== CIRCADIAN SCORE ====================
function getCircadianScore(hour: number, dayOfWeek: number): number {
  const timeAdj = hour >= 6 && hour < 12 ? 5 : hour >= 12 && hour < 18 ? 0 : -5;
  const dayAdj: Record<number, number> = { 0: -3, 1: -2, 2: 0, 3: 0, 4: 0, 5: 2, 6: -3 };
  return 50 + (timeAdj + (dayAdj[dayOfWeek] ?? 0)) * 3;
}

function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

// ==================== WEARABLE SCORE ====================
function getWearableScore(hrv: number, baseline: number): number {
  const deviation = ((hrv - baseline) / baseline) * 100;
  if (deviation > 15) return 80;   // Recovered
  if (deviation < -15) return 20;  // Under Load
  return 50;                        // Baseline
}

function getHRVDeviation(hrv: number, baseline: number): number {
  return Math.round(((hrv - baseline) / baseline) * 100);
}

// ==================== DIVERGENCE DETECTION ====================
// MRS v2: divergence now compares the physiological composite vs calendar
// demand instead of felt-state vs wearable. MASKED_HIGH retained in the type
// so historical brief_snapshots rows still parse on read; never emitted.
type DivergenceFlag =
  | 'ALIGNED'
  | 'SUPPLY_DEMAND_GAP'
  | 'RECOVERY_UNDERWAY'
  | 'LIGHT_DAY_STRONG_STATE'
  | 'INTRADAY_DECLINE'
  | 'MASKED_HIGH';

type WeightingMode =
  | 'no_wearable'
  | 'wearable_early'
  | 'aligned'
  | 'supply_demand_gap'
  | 'recovery_window';

// Divergence detector lives in `_shared/signal-engine/divergence-flag.ts`
// — single source of truth for the composite math (MRS v2 §3.3).

// MRS v2 §3.1 — map demand score onto the 20/50/80 band.
function getDemandStateScore(demandScore: number | null): number {
  if (demandScore == null) return 50;
  if (demandScore > 70) return 80;
  if (demandScore >= 40) return 50;
  return 20;
}

// MRS v2 §3.1 — map pattern signals onto the 20/30/50/70/80 band.
interface PatternSignalsLite {
  hrv_3day_trend?: 'improving' | 'stable' | 'declining' | 'unknown';
  consecutive_high_load_days?: number;
}
function getPatternScore(p: PatternSignalsLite | null | undefined): number {
  if (!p) return 50;
  if ((p.consecutive_high_load_days ?? 0) >= 3) return 20;
  if ((p.consecutive_high_load_days ?? 0) === 0 && p.hrv_3day_trend === 'improving') return 80;
  switch (p.hrv_3day_trend) {
    case 'declining': return 30;
    case 'improving': return 70;
    case 'stable':    return 50;
    default:          return 50;
  }
}

// ==================== TIER MAPPING ====================
type EnergyTier = 'depleted' | 'managing' | 'strong' | 'peak';
type EnergySubTier = 'very-low' | 'low' | 'low-mid' | 'mid' | 'mid-high' | 'high' | 'very-high';

function getEnergyTier(score: number): EnergyTier {
  if (score < 40) return 'depleted';
  if (score < 60) return 'managing';
  if (score < 75) return 'strong';
  return 'peak';
}

function getEnergySubTier(score: number): EnergySubTier {
  if (score <= 15) return 'very-low';
  if (score <= 25) return 'low';
  if (score <= 35) return 'low-mid';
  if (score <= 55) return 'mid';
  if (score <= 65) return 'mid-high';
  if (score <= 75) return 'high';
  return 'very-high';
}

// ==================== MRS v3 — TIER-CAP "SOFT GUARD" ====================
// Patterns no longer move the score. Instead they can *cap the displayed tier*
// down to 'managing' (UI label "Mixed") when chronic load is active AND the
// user's physiological composite is not already in the Low band (<50).
//
// Invariants (see docs/MRS_V3_SPECIFICATION.md §4b):
//   • The cap can NEVER raise a low score.
//   • The cap can NEVER hide an acute crash — when physComposite < 50,
//     today's reading already tells the truth, so we leave it alone.
//   • The cap is suppressed during cold-start (baselineConfidence === 'low')
//     because pattern signals are not yet trustworthy.
function deriveTierCap(
  rawTier: EnergyTier,
  physComposite: number | null,
  patterns: PatternSignalsLite | null | undefined,
  baselineConfidence: 'low' | 'medium' | 'high',
): { tierDisplayed: EnergyTier; tierCapReason: 'SUSTAINED_DEFICIT' | 'CONSECUTIVE_LOAD' | null } {
  // Cold-start safety: pattern signals don't carry enough weight yet.
  if (baselineConfidence === 'low') {
    return { tierDisplayed: rawTier, tierCapReason: null };
  }
  // Only Strong/Peak are eligible for the cap.
  if (rawTier !== 'strong' && rawTier !== 'peak') {
    return { tierDisplayed: rawTier, tierCapReason: null };
  }
  // Acute crash precedence: if physio is already Low, the score reads
  // honestly — never apply the cap (would mask the crash).
  if (physComposite != null && physComposite < 50) {
    return { tierDisplayed: rawTier, tierCapReason: null };
  }
  const sustainedDeficit = (patterns as any)?.sustained_deficit_flag === true;
  if (sustainedDeficit) {
    return { tierDisplayed: 'managing', tierCapReason: 'SUSTAINED_DEFICIT' };
  }
  if ((patterns?.consecutive_high_load_days ?? 0) >= 4) {
    return { tierDisplayed: 'managing', tierCapReason: 'CONSECUTIVE_LOAD' };
  }
  return { tierDisplayed: rawTier, tierCapReason: null };
}

// ==================== TIER LABELS ====================
function getTierLabel(tier: string): string {
  switch (tier) {
    case 'depleted': return 'Low Reserve';
    case 'managing': return 'Moderate Capacity';
    case 'strong': return 'Strong Readiness';
    case 'peak': return 'Peak Readiness';
    default: return 'Moderate Capacity';
  }
}

// ==================== MRS BAND SSOT ====================
// Canonical 5-band map shared with `src/utils/readinessLabels.ts`.
// Keep these in lock-step — drift breaks Brief/Plan band-gate alignment.
type ReadinessBandId = 'full' | 'ready' | 'holding' | 'reserves' | 'empty';
type ReadinessValence = 'low' | 'mid' | 'high';
const MRS_BANDS: ReadonlyArray<{
  id: ReadinessBandId;
  valence: ReadinessValence;
  min: number;
  max: number;
  text: string;
}> = [
  { id: 'full',     valence: 'high', min: 80, max: 100, text: "full strength — go after it" },
  { id: 'ready',    valence: 'high', min: 65, max: 79,  text: "ready and clear" },
  { id: 'holding',  valence: 'mid',  min: 50, max: 64,  text: "holding the line — solid, not your peak" },
  { id: 'reserves', valence: 'low',  min: 35, max: 49,  text: "running on reserves — pick your battles" },
  { id: 'empty',    valence: 'low',  min: 0,  max: 34,  text: "running on empty — today's about protecting yourself" },
];
function resolveBand(score: number | null): { id: ReadinessBandId; valence: ReadinessValence; label: string } {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return { id: 'holding', valence: 'mid', label: MRS_BANDS[2].text };
  }
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const b of MRS_BANDS) {
    if (s >= b.min && s <= b.max) return { id: b.id, valence: b.valence, label: b.text };
  }
  return { id: 'holding', valence: 'mid', label: MRS_BANDS[2].text };
}

// ==================== 3-LAYER CONTEXT STATEMENTS ====================

// Layer 1: Base statements (outcome × timeOfDay) – 15 combinations
const BASE_STATEMENTS: Record<string, Record<string, string>> = {
  overwhelmed: {
    morning: "Your nervous system is activated before the day has begun. Regulation is your first priority.",
    afternoon: "Accumulated pressure has reached your threshold. Your system is signalling overload.",
    evening: "Your day carried significant weight. The load hasn't fully cleared yet.",
  },
  drained: {
    morning: "Your reserves are low coming into the day. Your system is running a recovery deficit.",
    afternoon: "Real energy depletion – not a mindset issue. Your body is asking for restoration.",
    evening: "Your system has given what it had today. The signal is clear – recovery is needed.",
  },
  scattered: {
    morning: "Your cognition is fragmented at the start of the day. Grounding before action is the fastest route to clarity.",
    afternoon: "Cognitive fatigue is showing. Your mental bandwidth has narrowed.",
    evening: "Your mind is still processing the day. It hasn't found its close yet.",
  },
  steady: {
    morning: "You're regulated and baseline-ready. This is a solid internal foundation.",
    afternoon: "Your regulation is holding through the day. Internal balance is intact.",
    evening: "A steady close. Your system has maintained equilibrium through the day.",
  },
  focused: {
    morning: "High cognitive readiness at the start of the day. Your mental capacity is at its sharpest.",
    afternoon: "Sustained focus this late in the day is genuinely rare. Your cognitive state is elevated.",
    evening: "Your mind is still highly activated. Your system hasn't begun its wind-down.",
  },
};

// Tier-based fallback statements (no check-in)
const TIER_FALLBACK_STATEMENTS: Record<string, Record<string, string>> = {
  depleted: {
    morning: "Recovery signals detected – your system is in a low-reserve state.",
    afternoon: "Low reserves mid-day. Your system is running below baseline.",
    evening: "Your system needs genuine recovery tonight.",
  },
  managing: {
    morning: "Moderate reserves. Operational but not at full capacity.",
    afternoon: "Baseline state holding. Nothing exceptional in either direction.",
    evening: "A managed day. Your system is steady but not surplus.",
  },
  strong: {
    morning: "Strong readiness this morning. Internal capacity is high.",
    afternoon: "Solid reserves through the afternoon. Above baseline.",
    evening: "Good reserves at close of day. Your system held well.",
  },
  peak: {
    morning: "Peak internal readiness detected. Your system is fully resourced.",
    afternoon: "Exceptional capacity mid-day. Your system is at its highest.",
    evening: "High activation at end of day. Your system hasn't wound down yet.",
  },
};

// Layer 2: C+C Modifiers
function getCCModifier(
  outcome: string,
  clarity: number,
  confidence: number,
  timeOfDay: 'morning' | 'afternoon' | 'evening'
): string | null {
  const clarityLow = clarity <= 2;
  const clarityMid = clarity === 3;
  const clarityHigh = clarity >= 4;
  const confidenceLow = confidence <= 2;
  const confidenceMid = confidence === 3;
  const confidenceHigh = confidence >= 4;

  if (clarityLow && confidenceHigh && timeOfDay === 'evening') {
    return "High confidence without clarity this late in the day. The urgency you feel is disconnected from your sense of direction.";
  }
  if (clarityLow && confidenceHigh) {
    return "Low clarity with high confidence. You're certain about an unclear path.";
  }
  if (clarityHigh && confidenceLow && timeOfDay === 'morning') {
    return "High clarity with low confidence. The path is clear, but the doubt is about execution. Morning clarity is typically your most reliable signal.";
  }
  if (clarityHigh && confidenceLow) {
    return "High clarity with low confidence. The path is clear, but the doubt is about execution, not direction.";
  }
  if (clarityLow && timeOfDay === 'evening') {
    return "Clarity is low this late in the day. Your sense of direction is fragmented when decision-making is already impaired.";
  }
  if (clarityLow && confidenceLow) {
    return "Low clarity and low confidence. Both your sense of direction and your trust in execution are wavering.";
  }
  if (clarityLow && confidenceMid) {
    return "Low clarity. Your sense of direction is unclear right now.";
  }
  if (clarityHigh && confidenceHigh) {
    return "High clarity and high confidence. Both your sense of direction and your trust in execution are aligned.";
  }
  if (clarityHigh && confidenceMid) {
    return "High clarity with moderate confidence. The path is clear, execution certainty is holding.";
  }
  if (clarityMid && confidenceHigh) {
    return "Moderate clarity with high confidence. You trust your execution more than your current sense of direction.";
  }
  if (clarityMid && confidenceLow) {
    return "Moderate clarity with low confidence. The uncertainty is about execution, not direction.";
  }
  if (clarityMid && confidenceMid) {
    const midModifiers: Record<string, string> = {
      focused: "Strong energy with moderate clarity and confidence. Your internal compass is neither sharp nor lost.",
      scattered: "Fragmented attention with moderate clarity. Focus is compromised but direction isn't fully lost.",
      drained: "Low energy with moderate clarity. Your sense of direction is holding despite depletion.",
      overwhelmed: "Under pressure with moderate clarity. The load is real but your internal compass is still functioning.",
    };
    return midModifiers[outcome] || null;
  }

  return null;
}

// ==================== LAYER 3: ALWAYS-ON HRV CONTEXT ====================
interface HRVPatternContext {
  weekdayAvg: number | null;
  weekendAvg: number | null;
  dayOfWeekAvgs: Record<string, number>;
  morningAvg: number | null;
  afternoonAvg: number | null;
  eveningAvg: number | null;
  baseline30d: number | null;
  totalSamples: number;
  sampleDays?: number;
  baselineConfidence?: 'low' | 'medium' | 'high';
  patternObservations: string[];
}

// Feature flag for Phase 2 sustained deficit warning
const ENABLE_SUSTAINED_DEFICIT_WARNING = false;

function getLayer3Text(
  divergenceFlag: DivergenceFlag,
  hrvDeviation: number | null,
  patternContext: HRVPatternContext | null,
  baselineConfidence: 'low' | 'medium' | 'high' = 'high',
  sampleDays: number = 30,
  recentHRVSamples?: Array<{ date: string; hrv: number }> | null,
  baseline30d?: number | null,
): string | null {
  const parts: string[] = [];

  // === Core HRV deviation message (always shows when wearable active) ===
  if (hrvDeviation !== null) {
    const absDeviation = Math.abs(hrvDeviation);
    // Use data-density-aware baseline label
    const baselineLabel = baselineConfidence === 'high'
      ? 'your 30-day baseline'
      : baselineConfidence === 'medium'
        ? `your ${sampleDays}-day baseline`
        : `${sampleDays} days of HRV data`;

    if (divergenceFlag === 'MASKED_HIGH') {
      parts.push(`Your HRV is reading ${absDeviation}% below ${baselineLabel} – your physiological load is higher than your felt state suggests.`);
    } else if (divergenceFlag === 'RECOVERY_UNDERWAY') {
      parts.push(`Your HRV is reading ${absDeviation}% above ${baselineLabel} – your body is more recovered than you currently feel.`);
    } else if (absDeviation < 5) {
      parts.push("Your HRV is steady at baseline – your body and mind are reading the same signal.");
    } else if (hrvDeviation > 0) {
      parts.push(`Your HRV is tracking ${absDeviation}% above ${baselineLabel} – your physiological state is consistent with how you feel.`);
    } else {
      parts.push(`Your HRV is tracking ${absDeviation}% below ${baselineLabel} – a slight physiological dip, worth noting.`);
    }

    // Phase 2: Sustained deficit warning (feature-flagged OFF)
    if (ENABLE_SUSTAINED_DEFICIT_WARNING && recentHRVSamples && baseline30d && baseline30d > 0 && divergenceFlag === 'MASKED_HIGH') {
      let consecutiveDays = 0;
      const sorted = [...recentHRVSamples].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      for (const sample of sorted) {
        const dev = ((sample.hrv - baseline30d) / baseline30d) * 100;
        if (dev < -20) consecutiveDays++;
        else break;
      }
      if (consecutiveDays >= 2) {
        const nth = consecutiveDays === 2 ? '2nd' : consecutiveDays === 3 ? '3rd' : `${consecutiveDays}th`;
        parts.push(`⚠️ This is the ${nth} consecutive day your HRV has been suppressed. Your system is signaling sustained physiological depletion.`);
      }
    }
  }

  // === Pattern observations (only surface at medium+ confidence) ===
  if (patternContext && patternContext.patternObservations.length > 0 && baselineConfidence !== 'low') {
    parts.push(patternContext.patternObservations[0] + '.');
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

function assembleContextStatement(
  outcome: string | null,
  hasCheckIn: boolean,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  tier: EnergyTier,
  clarity: number,
  confidence: number,
  divergenceFlag: DivergenceFlag,
  hrvDeviation: number | null,
  patternContext: HRVPatternContext | null,
  baselineConfidence: 'low' | 'medium' | 'high' = 'high',
  sampleDays: number = 30
): { text: string; layersActive: string[] } {
  const parts: string[] = [];
  const layersActive: string[] = ['base'];

  // Layer 1: Base statement
  if (hasCheckIn && outcome && BASE_STATEMENTS[outcome]) {
    parts.push(BASE_STATEMENTS[outcome][timeOfDay]);
  } else {
    parts.push(TIER_FALLBACK_STATEMENTS[tier][timeOfDay]);
  }

  // Layer 2: Clarity × Confidence as independent signals
  if (hasCheckIn && outcome) {
    const ccModifier = getCCModifier(outcome, clarity, confidence, timeOfDay);
    if (ccModifier) {
      parts.push(ccModifier);
      layersActive.push('clarity-confidence');
    }
  }

  // Layer 3: Always-on HRV context (fires even when ALIGNED)
  const layer3 = getLayer3Text(divergenceFlag, hrvDeviation, patternContext, baselineConfidence, sampleDays);
  if (layer3) {
    parts.push(layer3);
    layersActive.push('wearable');
  }

  return { text: parts.join(' '), layersActive };
}

// ==================== CALENDAR-AWARE SIGNAL SELECTION ====================

interface SelectedSignals {
  primary: string;      // Main physiological sentence
  secondary: string | null;  // Cognitive sentence (only if diverges from physical)
  alreadyUsed: string[];     // Signals used, for relay to Compass
}

function selectSignalsForStatement(
  outcome: string | null,
  hasCheckIn: boolean,
  tier: EnergyTier,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  clarity: number,
  confidence: number,
  hrvDeviation: number | null,
  hasWearable: boolean,
  patternContext: HRVPatternContext | null,
  sleepScore: number | null,
  rhrElevated: boolean,
  calendarLoad: string | null,
  highStakesCount: number,
  consecutiveStreak: { tier: string; count: number } | null,
  baselineConfidence: 'low' | 'medium' | 'high',
  sampleDays: number,
): SelectedSignals {
  const alreadyUsed: string[] = [];
  const isHeavyDay = calendarLoad === 'high' || calendarLoad === 'extreme' || highStakesCount > 0;

  // Collect divergent signals
  const signals: Array<{ key: string; text: string; divergence: number }> = [];

  if (hasWearable && hrvDeviation !== null) {
    const absD = Math.abs(hrvDeviation);
    const baselineLabel = baselineConfidence === 'high' ? 'baseline' : `${sampleDays}-day baseline`;
    if (absD >= 5) {
      const direction = hrvDeviation > 0 ? 'above' : 'below';
      signals.push({
        key: 'hrv_deviation',
        text: `HRV ${absD}% ${direction} ${baselineLabel}`,
        divergence: absD,
      });
    }
  }

  if (sleepScore !== null) {
    if (sleepScore < 60) {
      signals.push({ key: 'sleep_score', text: `sleep below baseline (score: ${sleepScore})`, divergence: 60 - sleepScore });
    } else if (sleepScore >= 80) {
      signals.push({ key: 'sleep_good', text: 'solid sleep', divergence: sleepScore - 70 });
    }
  }

  if (rhrElevated) {
    signals.push({ key: 'rhr_elevated', text: 'resting heart rate above baseline', divergence: 15 });
  }

  // Sort by divergence (most notable first)
  signals.sort((a, b) => b.divergence - a.divergence);

  // Build primary sentence (physiological reality)
  let primary = '';
  if (!hasWearable && !hasCheckIn) {
    primary = TIER_FALLBACK_STATEMENTS[tier]?.[timeOfDay] || 'Readiness data is limited.';
    alreadyUsed.push('tier_fallback');
  } else if (!hasWearable) {
    // Check-in only – use clarity + confidence as proxy
    if (hasCheckIn && outcome && BASE_STATEMENTS[outcome]) {
      primary = BASE_STATEMENTS[outcome][timeOfDay];
      alreadyUsed.push('checkin_outcome');
    } else {
      primary = TIER_FALLBACK_STATEMENTS[tier]?.[timeOfDay] || 'Readiness data is limited.';
      alreadyUsed.push('tier_fallback');
    }
  } else if (isHeavyDay) {
    // Heavy day: surface multiple divergent signals
    const notable = signals.filter(s => s.divergence >= 10);
    const positive = signals.filter(s => ['sleep_good'].includes(s.key));
    if (notable.length >= 2) {
      primary = `Strong readiness signals are mixed – ${notable[0].text} and ${notable[1].text} this morning.`;
      notable.slice(0, 2).forEach(s => alreadyUsed.push(s.key));
    } else if (notable.length === 1 && positive.length > 0) {
      primary = `${getTierLabel(tier)} with ${positive[0].text} – but ${notable[0].text}, signalling physiological load despite the mental clarity.`;
      alreadyUsed.push(notable[0].key, positive[0].key);
    } else if (notable.length === 1) {
      primary = `${getTierLabel(tier)} this ${timeOfDay} – ${notable[0].text}.`;
      alreadyUsed.push(notable[0].key);
    } else if (signals.length > 0 && signals[0].key.includes('good')) {
      // All signals strong on a heavy day – reassure
      primary = `${getTierLabel(tier)} with ${signals.map(s => s.text).join(' and ')}.`;
      signals.forEach(s => alreadyUsed.push(s.key));
    } else {
      primary = hasCheckIn && outcome && BASE_STATEMENTS[outcome]
        ? BASE_STATEMENTS[outcome][timeOfDay]
        : (TIER_FALLBACK_STATEMENTS[tier]?.[timeOfDay] || 'Readiness data is limited.');
      alreadyUsed.push('checkin_outcome');
    }
  } else {
    // Light/moderate day: single strongest signal only
    if (signals.length > 0) {
      const top = signals[0];
      primary = `Readiness is steady, ${top.text}.`;
      alreadyUsed.push(top.key);
    } else if (hasCheckIn && outcome && BASE_STATEMENTS[outcome]) {
      primary = BASE_STATEMENTS[outcome][timeOfDay];
      alreadyUsed.push('checkin_outcome');
    } else {
      primary = TIER_FALLBACK_STATEMENTS[tier]?.[timeOfDay] || 'Readiness data is limited.';
      alreadyUsed.push('tier_fallback');
    }
  }

  // Consecutive streak
  if (consecutiveStreak && consecutiveStreak.count >= 3) {
    primary += ` ${consecutiveStreak.count} days running at this level.`;
    alreadyUsed.push(`streak_${consecutiveStreak.count}d`);
  }

  // Build secondary sentence (cognitive reality) – only if it meaningfully diverges
  let secondary: string | null = null;
  const clarityHigh = clarity >= 4;
  const clarityLow = clarity <= 2;
  const confidenceHigh = confidence >= 4;
  const confidenceLow = confidence <= 2;

  if (hasCheckIn) {
    // Only show if cognitive state diverges from physical
    const physicalGood = tier === 'strong' || tier === 'peak';
    const physicalBad = tier === 'depleted';

    if (clarityHigh && confidenceLow) {
      secondary = 'Clarity is strong – but confidence is low, which means the thinking is there but the belief in it isn\'t yet.';
      alreadyUsed.push('clarity_high', 'confidence_low');
    } else if (clarityLow && confidenceHigh) {
      secondary = 'Confidence is high but clarity is low – certainty about an unclear path.';
      alreadyUsed.push('clarity_low', 'confidence_high');
    } else if (clarityLow && confidenceLow && !physicalBad) {
      secondary = 'Both clarity and confidence flagged low in your check-in.';
      alreadyUsed.push('clarity_low', 'confidence_low');
    } else if (clarityHigh && confidenceHigh && physicalBad) {
      secondary = 'Your cognitive signals are strong despite the physiological picture.';
      alreadyUsed.push('clarity_high', 'confidence_high');
    }
  }

  return { primary, secondary, alreadyUsed };
}

// ==================== MAIN SCORING ====================

interface ComputeRequest {
  // MRS v2 — primary scoring inputs.
  demandScore?: number | null;
  patternSignals?: PatternSignalsLite | null;
  weightingMode?: WeightingMode | null;

  // Legacy check-in inputs — accepted for backwards compatibility but
  // intentionally IGNORED by scoring. The check-in surface was removed; these
  // remain so we can resurface a felt-state input later without a client churn.
  checkInOutcome: string | null;
  clarityLevel: number | null;
  confidenceLevel: number | null;

  // MRS v3 §3.2 — Mind Check-in dimensions (1–5 or null). Optional, null=neutral.
  // `clarityLevel` above is reused for the v3 Clarity dim (the column is
  // `daily_checkins.clarity_level`); the other three are new wiring.
  emotionLevel?: number | null;
  pressureLevel?: number | null;
  regulationLevel?: number | null;
  /** True when a JIT cat A/B event sits within the next 6h. Shifts 3% Clarity→Regulation weight. */
  hasImminentHighStakes?: boolean;

  // Wearable + cold-start configuration (unchanged).
  wearableHRV: number | null;
  wearableBaseline: number | null;
  hasCheckIn: boolean;
  hasWearable: boolean;
  timezoneOffset?: number;
  hrvPatternContext?: HRVPatternContext | null;
  baselineConfidence?: 'low' | 'medium' | 'high';
  sampleDays?: number;
  // New: calendar-aware signal selection inputs
  calendarLoad?: string | null;
  highStakesCount?: number;
  consecutiveStreak?: { tier: string; count: number } | null;
  sleepScore?: number | null;
  rhrElevated?: boolean;
  /** Optional explicit RHR 3-day trend. Wins over `rhrElevated` derivation. */
  rhrTrend?: RhrTrend | null;
  /** Optional last-night sleep duration (hours). Used by phys composite. */
  sleepHours?: number | null;
  /**
   * Wearable tri-state surfaced by the client so the response can echo
   * fresh vs stale vs missing. `hasWearable` already gates the math; this
   * preserves the distinction for downstream UI/QA (stale ≠ never connected).
   */
  wearableStatus?: 'fresh' | 'stale' | 'missing';

  // ─── MRS v4 — required window-aware baseline path ────────────────────
  // `weightingMode` is retained only as a label for audit/back-compat. It no
  // longer changes baseline math. State 1 must always come from the v4
  // composer (§3 + §8.3 redistribution + §3.2a sleep cap).
  mrsWindow?: 'morning' | 'afternoon' | 'evening' | null;
  /** Per-sub-component score + availability for the current window. */
  mrsSubScores?: Array<{
    id: SubComponentId;
    score: number;       // 0..100
    available: boolean;
  }>;
  /** Anchor for INTRADAY_DECLINE (§6 flag 2). Null on the morning compute. */
  morningBaselineScore?: number | null;
  /** §3.2a measured-low sleep cap inputs (absence-vs-deficit guard inside composer). */
  sleepDeficitMeasurement?: {
    available: boolean;
    sleepTotalMinutes?: number | null;
    sleepQuality?: 'poor' | 'fair' | 'good' | 'peak' | null;
  };
  /** Afternoon decision-leakage flag (drives INTRADAY_DECLINE). */
  decisionLeakageRisk?: boolean;
  /** Evening body-load flag (drives INTRADAY_DECLINE). */
  bodyLoadElevated?: boolean;
  /** Afternoon intraday HR % above resting baseline (drives INTRADAY_DECLINE). */
  intradayHrDeviationPct?: number | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ComputeRequest = await req.json();
    const {
      checkInOutcome,
      hasCheckIn,
      hasWearable,
      timezoneOffset = 0,
      hrvPatternContext = null,
      baselineConfidence: bConf = 'high',
      sampleDays = 30,
    } = body;

    const clarity = body.clarityLevel ?? 3;
    const confidence = body.confidenceLevel ?? 3;

    // Compute current time in user's timezone
    const now = new Date();
    const userTime = new Date(now.getTime() - timezoneOffset * 60000);
    const hour = userTime.getHours();
    const dayOfWeek = userTime.getDay();
    const timeOfDay = getTimeOfDay(hour);

    // ─── MRS v2 inputs ──────────────────────────────────────────────────
    // The two former check-in inputs (felt-state, C×C internal readiness) are
    // replaced by calendar demand + wearable pattern. Legacy felt/IR helpers
    // are kept above for resurfacing later.
    const demandScore = body.demandScore ?? null;
    const demandStateScore = getDemandStateScore(demandScore);
    const patternScore = getPatternScore(body.patternSignals ?? null);

    // Circadian (unchanged).
    const circadianScore = getCircadianScore(hour, dayOfWeek);

    // Wearable composite (unchanged in principle — still HRV-driven).
    let wearableScore = 0;
    let hrvDeviation: number | null = null;
    if (
      hasWearable &&
      body.wearableHRV != null &&
      body.wearableBaseline != null &&
      body.wearableBaseline > 0
    ) {
      wearableScore = getWearableScore(body.wearableHRV, body.wearableBaseline);
      hrvDeviation = getHRVDeviation(body.wearableHRV, body.wearableBaseline);
    }

    // ─── Physiological composite (MRS v2 §3.3) ──────────────────────────
    // HRV (50%) + Sleep (35%) + RHR-trend (15%). Composite is `null` when
    // no component is available; the classifier degrades to ALIGNED.
    const rhrTrendInput: RhrTrend | null =
      body.rhrTrend ?? (body.rhrElevated === true
        ? 'rising'
        : body.rhrElevated === false ? 'stable' : null);
    const physCompositeRaw = hasWearable
      ? computePhysiologicalComposite({
          hrvDeviationPct: hrvDeviation,
          sleepScore: body.sleepScore ?? null,
          sleepHours: body.sleepHours ?? null,
          rhrTrend: rhrTrendInput,
        })
      : null;
    // Keep `physComposite` numeric for downstream weighting (0–100).
    const physComposite = physCompositeRaw ?? (hasWearable ? wearableScore : 50);
    const dScore = demandScore ?? 50;
    const hrvRecovering = body.patternSignals?.hrv_3day_trend === 'improving';
    const divergenceFlag: DivergenceFlag = !hasWearable
      ? 'ALIGNED'
      : computeDivergenceFlag({
          physComposite: physCompositeRaw,
          demandScore: dScore,
          hrvRecovering,
        });

    const wearableConfidenceScale = bConf === 'low' ? 0.6 : bConf === 'medium' ? 0.85 : 1.0;

    // Resolve weighting mode. Callers may override; otherwise derive from
    // baseline confidence + divergence flag.
    let weightingMode: WeightingMode;
    if (body.weightingMode) weightingMode = body.weightingMode;
    else if (!hasWearable) weightingMode = 'no_wearable';
    else if (bConf === 'low') weightingMode = 'wearable_early';
    else if (divergenceFlag === 'SUPPLY_DEMAND_GAP') weightingMode = 'supply_demand_gap';
    else if (divergenceFlag === 'RECOVERY_UNDERWAY') weightingMode = 'recovery_window';
    else weightingMode = 'aligned';

    // ─── MRS v4 §3 / §8 — Baseline scoring ─────────────────────────────
    // The legacy weightingMode branches have been removed. Missing data is
    // handled only by per-sub-component v4 redistribution.
    let score: number | null;
    let mrsV4Provenance: unknown | null = null;
    let mrsV4Window: MrsWindow | null = null;
    let mrsV4AwaitingSignals = false;

    if (!body.mrsWindow) {
      console.error('[compute-inner-readiness] FATAL: missing mrsWindow; refusing legacy baseline fallback');
      return new Response(JSON.stringify({ error: 'mrs_v4_inputs_required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!Array.isArray(body.mrsSubScores) || body.mrsSubScores.length === 0) {
      console.error('[compute-inner-readiness] FATAL: empty mrsSubScores; refusing legacy baseline fallback');
      return new Response(JSON.stringify({ error: 'mrs_v4_inputs_required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const v4 = composeBaselineV4(
      body.mrsWindow,
      body.mrsSubScores as SubScore[],
      body.sleepDeficitMeasurement ?? { available: false },
    );
    score = v4.baseline;
    mrsV4Provenance = v4.weightProvenance;
    mrsV4Window = body.mrsWindow;
    mrsV4AwaitingSignals = v4.awaitingSignals;
    // Circadian + patternScore are intentionally NOT folded into the score.
    // They remain available downstream for framing only (see §4 spec).

    const awaitingReadiness = mrsV4AwaitingSignals && score == null;
    const scoreForMath = Math.max(0, Math.min(100, score ?? 50));

    // MRS v4 §6 flag 2 — INTRADAY_DECLINE. Evaluated only on afternoon /
    // evening windows where a morning anchor exists. Overrides
    // `divergenceFlag` per §6 priority order (REGULATION_RISK is owned by
    // the Brief layer; this is the highest-priority MRS-side flag).
    let v4DivergenceFlag: DivergenceFlag = divergenceFlag;
    if (
      mrsV4Window &&
      mrsV4Window !== 'morning' &&
      typeof body.morningBaselineScore === 'number'
    ) {
      const intraday = computeIntradayDecline({
        currentWindowBaseline: scoreForMath,
        morningBaselineScore: body.morningBaselineScore,
        decisionLeakageRisk: body.decisionLeakageRisk === true,
        bodyLoadElevated: body.bodyLoadElevated === true,
        intradayHrDeviationPct: body.intradayHrDeviationPct ?? null,
      });
      if (intraday) v4DivergenceFlag = 'INTRADAY_DECLINE';
    }

    const tier = getEnergyTier(scoreForMath);
    const subTier = getEnergySubTier(scoreForMath);

    // ─── MRS v3 §3.3 — Refined-score path ──────────────────────────────
    // Blend baseline with the 4 Mind Check-in dimensions, hard-capped at
    // baseline ±15. When all four dims are null, refined === baseline.
    const refined = computeRefinedScore({
      baseline: scoreForMath,
      clarity: body.clarityLevel ?? null,
      emotion: body.emotionLevel ?? null,
      pressure: body.pressureLevel ?? null,
      regulation: body.regulationLevel ?? null,
      hasImminentHighStakes: body.hasImminentHighStakes === true,
    });

    // The "displayed" score & tier are refined when a check-in exists, else
    // baseline. The number the UI shows tracks this, not the raw baseline.
    const displayedScore = awaitingReadiness
      ? null
      : (refined.readinessState === 'refined' ? refined.scoreRefined : refined.scoreBaseline);
    const displayedTier = awaitingReadiness
      ? 'managing'
      : getEnergyTier(displayedScore ?? scoreForMath);
    const displayedSubTier = awaitingReadiness
      ? 'mid'
      : getEnergySubTier(displayedScore ?? scoreForMath);

    // MRS v3 — soft-guard tier cap. Runs on the displayed tier so a refined
    // score that crossed a boundary still gets capped consistently.
    const { tierDisplayed, tierCapReason } = deriveTierCap(
      displayedTier,
      hasWearable ? physComposite : null,
      body.patternSignals ?? null,
      bConf,
    );

    // Calendar-aware signal selection (new approach)
    const calLoad = body.calendarLoad || null;
    const hsCount = body.highStakesCount || 0;
    const consStreak = body.consecutiveStreak || null;
    const sleepSc = body.sleepScore ?? null;
    const rhrElev = body.rhrElevated ?? false;

    const selectedSignals = selectSignalsForStatement(
      checkInOutcome, hasCheckIn, tier, timeOfDay,
      clarity, confidence, hrvDeviation, hasWearable,
      hrvPatternContext ?? null, sleepSc, rhrElev,
      calLoad, hsCount, consStreak,
      bConf, sampleDays,
    );

    // Assemble context statement from selected signals
    const contextStatement = selectedSignals.secondary
      ? `${selectedSignals.primary} ${selectedSignals.secondary}`
      : selectedSignals.primary;

    const layersActive = selectedSignals.alreadyUsed;

    // Also keep legacy 3-layer assembly for backwards compatibility where needed
    const { text: legacyContextStatement, layersActive: legacyLayers } = assembleContextStatement(
      checkInOutcome, hasCheckIn, timeOfDay, tier,
      clarity, confidence, divergenceFlag, hrvDeviation,
      hrvPatternContext ?? null, bConf, sampleDays
    );

    // Data sources
    const dataSources: string[] = [];
    if (hasCheckIn) dataSources.push('check-in');
    if (hasWearable) dataSources.push('wearable');
    dataSources.push('circadian');
    // Tri-state wearable echo. Default to derived value when caller omits it
    // so older callers keep behaving identically.
    const wearableStatus: 'fresh' | 'stale' | 'missing' =
      body.wearableStatus ?? (hasWearable ? 'fresh' : 'missing');
    dataSources.push(`wearable_status:${wearableStatus}`);

    // Extract Layer 3 as dedicated field for separate rendering
    const layer3Statement = getLayer3Text(divergenceFlag, hrvDeviation, hrvPatternContext ?? null, bConf, sampleDays);

    // Canonical band SSOT — derived once here from the DISPLAYED score and
    // forwarded to Brief / validator / Plan so nobody re-derives.
    const bandInfo = awaitingReadiness ? null : resolveBand(displayedScore ?? scoreForMath);

    const result = {
      // `score` keeps its back-compat contract — it is now the DISPLAYED
      // number (refined when a check-in exists, else baseline). Downstream
      // consumers that read `score` continue to read the user-visible value.
      score: displayedScore,
      tier: displayedTier,
      subTier: displayedSubTier,
      // Canonical band — id ('full'|'ready'|'holding'|'reserves'|'empty'),
      // verbatim one-liner label (matches READINESS_ONE_LINERS), and the
      // 3-bucket valence ('low'|'mid'|'high') used to gate Brief tone and
      // Plan practice bias. Always read these instead of mapping `score`
      // a second time downstream.
      band: awaitingReadiness ? null : bandInfo?.id ?? null,
      bandLabel: awaitingReadiness ? 'awaiting signals' : (bandInfo?.label ?? null),
      bandValence: awaitingReadiness ? null : bandInfo?.valence ?? null,
      contextStatement,
      layer3Statement,
      layersActive,
      divergenceFlag: v4DivergenceFlag,
      hrvDeviation,
      dataSources,
      // Alias for callers that prefer the explicit name; same contents.
      sourceBreakdown: dataSources,
      wearableStatus,
      confidence: hasCheckIn ? (hasWearable ? 'high' : 'medium') : 'low',
      timeOfDay,
      checkInOutcome: hasCheckIn ? checkInOutcome : null,
      tierLabel: awaitingReadiness ? 'Awaiting signals' : getTierLabel(displayedTier),
      // New: alreadyUsed[] relay for Compass
      alreadyUsed: selectedSignals.alreadyUsed,
      // MRS v2 — surface the resolved mode + scoring inputs so callers can
      // mirror them into daily_context_snapshot without re-deriving.
      weightingMode,
      demandStateScore,
      patternScore,
      physComposite,
      // MRS v3 — soft-guard tier cap. Callers should mirror these into
      // daily_context_snapshot and the UI should render `tierDisplayed`
      // (label `tierDisplayedLabel`) rather than re-deriving from `score`.
      tierDisplayed: awaitingReadiness ? 'managing' : tierDisplayed,
      tierDisplayedLabel: awaitingReadiness ? 'Awaiting signals' : getTierLabel(tierDisplayed),
      tierCapReason: awaitingReadiness ? null : tierCapReason,
      // MRS v3 §3.3 — refined-score surface. `scoreRefined` is null until a
      // Mind Check-in exists for the window; `scoreBaseline` is always the
      // raw State 1 value so the client can render baseline-vs-refined deltas.
      scoreBaseline: awaitingReadiness ? null : refined.scoreBaseline,
      scoreRefined: awaitingReadiness ? null : (refined.readinessState === 'refined' ? refined.scoreRefined : null),
      readinessState: awaitingReadiness ? 'awaiting' : refined.readinessState,
      refinedContribution: awaitingReadiness ? null : refined.refinedContribution,
      mindWeights: refined.mindWeights,
      // MRS v4 surface — always populated for successful baseline computes.
      mrsWindow: mrsV4Window,
      weightProvenance: mrsV4Provenance,
      mrsAwaitingSignals: mrsV4AwaitingSignals,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[compute-inner-readiness] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
