import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
type DivergenceFlag = 'ALIGNED' | 'MASKED_HIGH' | 'RECOVERY_UNDERWAY';

function getDivergenceFlag(feltScore: number, wearableScore: number): DivergenceFlag {
  const gap = Math.abs(feltScore - wearableScore);
  if (gap > 30) {
    return feltScore > wearableScore ? 'MASKED_HIGH' : 'RECOVERY_UNDERWAY';
  }
  return 'ALIGNED';
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

// ==================== 3-LAYER CONTEXT STATEMENTS ====================

// Layer 1: Base statements (outcome × timeOfDay) — 15 combinations
const BASE_STATEMENTS: Record<string, Record<string, string>> = {
  overwhelmed: {
    morning: "Your nervous system is activated before the day has begun. Regulation is your first priority.",
    afternoon: "Accumulated pressure has reached your threshold. Your system is signalling overload.",
    evening: "Your day carried significant weight. The load hasn't fully cleared yet.",
  },
  drained: {
    morning: "Your reserves are low coming into the day. Your system is running a recovery deficit.",
    afternoon: "Real energy depletion — not a mindset issue. Your body is asking for restoration.",
    evening: "Your system has given what it had today. The signal is clear — recovery is needed.",
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
    morning: "Recovery signals detected — your system is in a low-reserve state.",
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

function getLayer3Text(
  divergenceFlag: DivergenceFlag,
  hrvDeviation: number | null,
  patternContext: HRVPatternContext | null,
  baselineConfidence: 'low' | 'medium' | 'high' = 'high',
  sampleDays: number = 30
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
      parts.push(`Your HRV is reading ${absDeviation}% below ${baselineLabel} — your physiological load is higher than your felt state suggests.`);
    } else if (divergenceFlag === 'RECOVERY_UNDERWAY') {
      parts.push(`Your HRV is reading ${absDeviation}% above ${baselineLabel} — your body is more recovered than you currently feel.`);
    } else if (absDeviation < 5) {
      parts.push("Your HRV is steady at baseline — your body and mind are reading the same signal.");
    } else if (hrvDeviation > 0) {
      parts.push(`Your HRV is tracking ${absDeviation}% above ${baselineLabel} — your physiological state is consistent with how you feel.`);
    } else {
      parts.push(`Your HRV is tracking ${absDeviation}% below ${baselineLabel} — a slight physiological dip, worth noting.`);
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

// ==================== MAIN SCORING ====================

interface ComputeRequest {
  checkInOutcome: string | null;
  clarityLevel: number | null;
  confidenceLevel: number | null;
  wearableHRV: number | null;
  wearableBaseline: number | null;
  hasCheckIn: boolean;
  hasWearable: boolean;
  timezoneOffset?: number;
  hrvPatternContext?: HRVPatternContext | null;
  baselineConfidence?: 'low' | 'medium' | 'high';
  sampleDays?: number;
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

    // Signal 1: Felt State
    const feltScore = getFeltStateScore(checkInOutcome);

    // Signal 2: Internal Readiness
    const irScore = getIRScore(clarity, confidence);

    // Signal 3: Circadian
    const circadianScore = getCircadianScore(hour, dayOfWeek);

    // Signal 4: Wearable (if available)
    let wearableScore = 0;
    let hrvDeviation: number | null = null;
    let divergenceFlag: DivergenceFlag = 'ALIGNED';

    if (hasWearable && body.wearableHRV != null && body.wearableBaseline != null && body.wearableBaseline > 0) {
      wearableScore = getWearableScore(body.wearableHRV, body.wearableBaseline);
      hrvDeviation = getHRVDeviation(body.wearableHRV, body.wearableBaseline);
      divergenceFlag = getDivergenceFlag(feltScore, wearableScore);
    }

    // Compute final score based on weighting mode + baseline confidence
    // Scale wearable weight by confidence: low=15%, medium=25%, high=full (25-35%)
    const wearableConfidenceScale = bConf === 'low' ? 0.6 : bConf === 'medium' ? 0.85 : 1.0;

    let score: number;
    if (!hasWearable) {
      // Mode 1: No wearable
      score = Math.round(feltScore * 0.55 + irScore * 0.30 + circadianScore * 0.15);
    } else if (divergenceFlag === 'MASKED_HIGH') {
      // Mode 3: Masked High — scale wearable weight by confidence
      const wW = 0.35 * wearableConfidenceScale;
      const remainder = 1 - wW - 0.10; // circadian stays 0.10
      score = Math.round(feltScore * (remainder * 0.55) + irScore * (remainder * 0.45) + wearableScore * wW + circadianScore * 0.10);
    } else if (divergenceFlag === 'RECOVERY_UNDERWAY') {
      // Mode 4: Recovery Underway
      const wW = 0.30 * wearableConfidenceScale;
      const remainder = 1 - wW - 0.10;
      score = Math.round(feltScore * (remainder * 0.58) + irScore * (remainder * 0.42) + wearableScore * wW + circadianScore * 0.10);
    } else {
      // Mode 2: Aligned
      const wW = 0.25 * wearableConfidenceScale;
      const remainder = 1 - wW - 0.10;
      score = Math.round(feltScore * (remainder * 0.62) + irScore * (remainder * 0.38) + wearableScore * wW + circadianScore * 0.10);
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    const tier = getEnergyTier(score);
    const subTier = getEnergySubTier(score);

    // Assemble context statement (now with always-on Layer 3 + confidence-aware text)
    const { text: contextStatement, layersActive } = assembleContextStatement(
      checkInOutcome, hasCheckIn, timeOfDay, tier,
      clarity, confidence, divergenceFlag, hrvDeviation,
      hrvPatternContext ?? null, bConf, sampleDays
    );

    // Data sources
    const dataSources: string[] = [];
    if (hasCheckIn) dataSources.push('check-in');
    if (hasWearable) dataSources.push('wearable');
    dataSources.push('circadian');

    const result = {
      score,
      tier,
      subTier,
      contextStatement,
      layersActive,
      divergenceFlag,
      hrvDeviation,
      dataSources,
      confidence: hasCheckIn ? (hasWearable ? 'high' : 'medium') : 'low',
      timeOfDay,
      checkInOutcome: hasCheckIn ? checkInOutcome : null,
      tierLabel: getTierLabel(tier),
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
