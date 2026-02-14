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
    pause: 25, 'power-up': 20, presence: 35, ready: 80,
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
function getTierLabel(tier: string, checkInOutcome?: string | null): string {
  if (checkInOutcome) {
    switch (checkInOutcome) {
      case 'overwhelmed': return 'Regulate and Reset';
      case 'drained': return 'Rest and Restore';
      case 'scattered': return 'Ground and Focus';
      case 'steady': return 'Steady State';
      case 'focused': return tier === 'peak' ? 'Peak Performance' : 'Perform and Execute';
    }
  }
  switch (tier) {
    case 'depleted': return 'Rest and Restore';
    case 'managing': return 'Stabilize and Simplify';
    case 'strong': return 'Perform and Execute';
    case 'peak': return 'Peak Performance';
    default: return 'Stabilize and Simplify';
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

// Layer 2: C+C Modifiers (appended when avg C+C ≤ 2.5 or ≥ 4.5)
const LOW_CC_MODIFIERS: Record<string, string> = {
  overwhelmed: "Low clarity and confidence in this state compounds the risk.",
  drained: "Your clarity and confidence scores suggest your judgment is more impaired than it may feel.",
  scattered: "Low clarity is deepening the fragmentation.",
  steady: "Your stability is present but your confidence is signalling hesitation.",
  focused: "High energy with low confidence is a misalignment worth noting.",
};

const HIGH_CC_MODIFIERS: Record<string, string> = {
  overwhelmed: "Despite the load, your clarity and confidence are holding.",
  drained: "Even depleted, your judgment is intact — this is about pacing, not direction.",
  scattered: "Your clarity and confidence are strong — this is an attention issue, not a direction issue.",
  steady: "Strong clarity and confidence on a steady foundation — a good combination.",
  focused: "Peak energy, clarity, and confidence are all aligned.",
};

function assembleContextStatement(
  outcome: string | null,
  hasCheckIn: boolean,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  tier: EnergyTier,
  clarity: number,
  confidence: number,
  divergenceFlag: DivergenceFlag,
  hrvDeviation: number | null
): string {
  const parts: string[] = [];

  // Layer 1: Base statement
  if (hasCheckIn && outcome && BASE_STATEMENTS[outcome]) {
    parts.push(BASE_STATEMENTS[outcome][timeOfDay]);
  } else {
    parts.push(TIER_FALLBACK_STATEMENTS[tier][timeOfDay]);
  }

  // Layer 2: C+C modifier (only when avg ≤ 2.5 or ≥ 4.5)
  if (hasCheckIn && outcome) {
    const avgCC = (clarity + confidence) / 2;
    if (avgCC <= 2.5 && LOW_CC_MODIFIERS[outcome]) {
      parts.push(LOW_CC_MODIFIERS[outcome]);
    } else if (avgCC >= 4.5 && HIGH_CC_MODIFIERS[outcome]) {
      parts.push(HIGH_CC_MODIFIERS[outcome]);
    }
  }

  // Layer 3: Divergence overlay
  if (divergenceFlag === 'MASKED_HIGH' && hrvDeviation !== null) {
    parts.push(`Your HRV is reading ${Math.abs(hrvDeviation)}% below your baseline — your physiological load is higher than your felt state suggests.`);
  } else if (divergenceFlag === 'RECOVERY_UNDERWAY' && hrvDeviation !== null) {
    parts.push(`Your HRV is reading ${Math.abs(hrvDeviation)}% above your baseline — your body is more recovered than you currently feel.`);
  }

  return parts.join(' ');
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
  timezoneOffset?: number; // minutes offset from UTC (e.g. -300 for EST)
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

    // Compute final score based on weighting mode
    let score: number;
    if (!hasWearable) {
      // Mode 1: No wearable
      score = Math.round(feltScore * 0.55 + irScore * 0.30 + circadianScore * 0.15);
    } else if (divergenceFlag === 'MASKED_HIGH') {
      // Mode 3: Masked High
      score = Math.round(feltScore * 0.30 + irScore * 0.25 + wearableScore * 0.35 + circadianScore * 0.10);
    } else if (divergenceFlag === 'RECOVERY_UNDERWAY') {
      // Mode 4: Recovery Underway
      score = Math.round(feltScore * 0.35 + irScore * 0.25 + wearableScore * 0.30 + circadianScore * 0.10);
    } else {
      // Mode 2: Aligned
      score = Math.round(feltScore * 0.40 + irScore * 0.25 + wearableScore * 0.25 + circadianScore * 0.10);
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    const tier = getEnergyTier(score);
    const subTier = getEnergySubTier(score);

    // Assemble context statement
    const contextStatement = assembleContextStatement(
      checkInOutcome, hasCheckIn, timeOfDay, tier,
      clarity, confidence, divergenceFlag, hrvDeviation
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
      divergenceFlag,
      hrvDeviation,
      dataSources,
      confidence: hasCheckIn ? (hasWearable ? 'high' : 'medium') : 'low',
      timeOfDay,
      checkInOutcome: hasCheckIn ? checkInOutcome : null,
      tierLabel: getTierLabel(tier, hasCheckIn ? checkInOutcome : null),
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
