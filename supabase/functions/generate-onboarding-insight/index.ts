import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callLovableAIText } from "../_shared/anthropic.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mm-client-platform',
};

// ==================== SCORING ENGINE v2.0 ====================
// 3-component model: Energy Regulation, Focus Recovery, Energy Renewal
// Component weights per question:
//   ER: Q1=40%, Q2=35%, Q3=10%, Q4=15%
//   FR: Q1=25%, Q2=20%, Q3=30%, Q4=25%
//   EN: Q1=17.5%, Q2=22.5%, Q3=30%, Q4=30%

interface ComponentScores {
  energyRegulation: number;
  focusRecovery: number;
  energyRenewal: number;
}

// Q1: Emotional Awareness – how early you notice internal shifts
const Q1_SCORES: Record<string, { er: number; fr: number; en: number }> = {
  notice_early:   { er: 85, fr: 75, en: 70 },
  physical_signs: { er: 60, fr: 55, en: 65 },
  realize_after:  { er: 45, fr: 40, en: 50 },
  push_through:   { er: 35, fr: 55, en: 30 },
};

// Q2: Stress Response – what happens under pressure
const Q2_SCORES: Record<string, { er: number; fr: number; en: number }> = {
  stay_grounded:    { er: 90, fr: 80, en: 80 },
  react_quickly:    { er: 45, fr: 50, en: 55 },
  freeze_overthink: { er: 55, fr: 35, en: 50 },
  power_through:    { er: 50, fr: 60, en: 35 },
};

// Q3: Recovery Patterns – how you recharge
const Q3_SCORES: Record<string, { er: number; fr: number; en: number }> = {
  bounce_back:          { er: 80, fr: 85, en: 90 },
  weekend_recover:      { er: 55, fr: 55, en: 60 },
  accumulating_fatigue: { er: 45, fr: 40, en: 35 },
  always_tired:         { er: 35, fr: 30, en: 25 },
};

// Q4: Mental Clarity – cognitive load management
const Q4_SCORES: Record<string, { er: number; fr: number; en: number }> = {
  crystal_clear: { er: 80, fr: 90, en: 75 },
  mostly_clear:  { er: 65, fr: 70, en: 60 },
  fog_creeps:    { er: 45, fr: 40, en: 45 },
  overwhelmed:   { er: 35, fr: 25, en: 35 },
};

const DEFAULT = { er: 50, fr: 50, en: 50 };

function calculateScores(q1: string, q2: string, q3: string, q4: string): { scores: ComponentScores; baseline: number } {
  const s1 = Q1_SCORES[q1] || DEFAULT;
  const s2 = Q2_SCORES[q2] || DEFAULT;
  const s3 = Q3_SCORES[q3] || DEFAULT;
  const s4 = Q4_SCORES[q4] || DEFAULT;

  const energyRegulation = Math.min(100, Math.round(
    s1.er * 0.40 + s2.er * 0.35 + s3.er * 0.10 + s4.er * 0.15
  ));
  const focusRecovery = Math.min(100, Math.round(
    s1.fr * 0.25 + s2.fr * 0.20 + s3.fr * 0.30 + s4.fr * 0.25
  ));
  const energyRenewal = Math.min(100, Math.round(
    s1.en * 0.175 + s2.en * 0.225 + s3.en * 0.30 + s4.en * 0.30
  ));

  // Baseline: ER 35% + FR 35% + EN 30%
  const baseline = Math.min(100, Math.round(
    energyRegulation * 0.35 + focusRecovery * 0.35 + energyRenewal * 0.30
  ));

  return {
    scores: { energyRegulation, focusRecovery, energyRenewal },
    baseline,
  };
}

// ==================== ARCHETYPE ASSIGNMENT v2.0 ====================
interface ArchetypeResult {
  id: string;
  title: string;
  description: string;
}

const ARCHETYPES: Record<string, { title: string; description: string }> = {
  'grounded-leader': {
    title: 'The Grounded Master',
    description: 'You lead from stillness. Stability under pressure is your signature.',
  },
  'resilient-performer': {
    title: 'The Resilient Performer',
    description: 'You absorb impact and recover fast. Endurance under sustained demand is your edge.',
  },
  'clear-thinker': {
    title: 'The Clear Thinker',
    description: 'You cut through complexity with precision. Clarity under cognitive load is your advantage.',
  },
  'intensity-driver': {
    title: 'The Intensity Driver',
    description: 'You channel directed force into every challenge. Controlled intensity is your operating mode.',
  },
  'adaptive-navigator': {
    title: 'The Adaptive Navigator',
    description: 'You read the field and adjust in real time. Strategic flexibility is your strength.',
  },
};

function assignArchetype(scores: ComponentScores): ArchetypeResult {
  const { energyRegulation, focusRecovery, energyRenewal } = scores;

  // Priority order: first match wins
  if (energyRegulation >= 65 && energyRenewal >= 55) {
    return { id: 'grounded-leader', ...ARCHETYPES['grounded-leader'] };
  }
  if (energyRenewal >= 65 && energyRegulation >= 50) {
    return { id: 'resilient-performer', ...ARCHETYPES['resilient-performer'] };
  }
  if (focusRecovery >= 65 && energyRegulation >= 45) {
    return { id: 'clear-thinker', ...ARCHETYPES['clear-thinker'] };
  }
  if (energyRegulation >= 60 && focusRecovery < 50) {
    return { id: 'intensity-driver', ...ARCHETYPES['intensity-driver'] };
  }
  return { id: 'adaptive-navigator', ...ARCHETYPES['adaptive-navigator'] };
}

// ==================== MAIN HANDLER ====================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Require signed-in Auth0 user — paid Anthropic call, must not be
  // internet-callable by unauthenticated clients.
  const auth = await authenticateRequest(req, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();


    // Support both v1 (legacy) and v2 payloads
    let baselineScore: number;
    let componentScores: ComponentScores;
    let archetype: ArchetypeResult;

    if (body.answers) {
      // v2 payload: raw answers → server-side scoring
      const { q1, q2, q3, q4 } = body.answers;
      console.log('[Onboarding] Received answers:', { q1, q2, q3, q4 });
      
      if (!q1 || !q2 || !q3 || !q4) {
        console.error('Missing answers:', { q1, q2, q3, q4 });
        return new Response(
          JSON.stringify({ error: 'Incomplete answers. Please complete all questions.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const result = calculateScores(q1, q2, q3, q4);
      baselineScore = result.baseline;
      componentScores = result.scores;
      archetype = assignArchetype(componentScores);
    } else {
      // v1 legacy payload: pre-computed values
      baselineScore = body.baselineScore || 50;
      componentScores = body.componentScores || { energyRegulation: 50, focusRecovery: 50, energyRenewal: 50 };
      archetype = assignArchetype(componentScores);
    }

    const pressureContext = body.pressureContextTag || body.biggestPressure || '';
    const practiceGoal = body.practicePriorityTag || '';

    const prompt = `You are an Executive Performance Coach. A leader just completed their baseline assessment.

Results:
- Archetype: ${archetype.title}
- Energy Regulation: ${componentScores.energyRegulation}/100
- Focus Recovery: ${componentScores.focusRecovery}/100
- Energy Renewal: ${componentScores.energyRenewal}/100
- Primary pressure: ${pressureContext}
- Practice goal: ${practiceGoal}

Write 2-3 sentences that name this leader's specific pattern – what their scores reveal about how they lead under pressure, and what their practice will build. Speak directly to the leader. No generic language. No research citations. No timeline promises. No percentile comparisons.`;

    // 2026-08-31 — Two-model consolidation (C4). Single attempt on
    // Gemini 3.1 Flash Lite via the Lovable gateway helper; 200-token cap and
    // the deterministic fallback below are unchanged.
    let insight = '';
    try {
      insight = (await callLovableAIText({
        messages: [{ role: 'user', content: prompt }],
        model: 'google/gemini-3.1-flash-lite',
        max_tokens: 200,
        temperature: 0.7,
      }))?.trim() || '';
    } catch (aiErr) {
      const status = (aiErr as any)?.status;
      if (status === 429 || status === 402) {
        throw new Error(status === 429 ? 'Rate limit exceeded. Please try again shortly.' : 'AI credits exhausted. Please add credits.');
      }
      console.error('[Onboarding] AI insight failed:', aiErr instanceof Error ? aiErr.message : aiErr);
    }

    if (!insight) {
      // Graceful fallback: deterministic insight when AI is unavailable
      console.warn('[Onboarding] AI unavailable, using fallback insight');
      const lowest = Object.entries(componentScores).sort((a, b) => (a[1] as number) - (b[1] as number))[0];
      const lowestLabel = lowest[0] === 'energyRegulation' ? 'energy regulation' : lowest[0] === 'focusRecovery' ? 'focus recovery' : 'energy renewal';
      insight = `Your pattern shows strong capacity across your leadership dimensions. Your practice will focus on strengthening ${lowestLabel} – the area with the most room for growth given your current profile.`;
    }


    return new Response(
      JSON.stringify({
        baselineScore,
        componentScores,
        archetype: archetype.id,
        archetypeTitle: archetype.title,
        archetypeDescription: archetype.description,
        insight,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating onboarding insight:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
