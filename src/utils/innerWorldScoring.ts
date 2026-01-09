// Inner World Scoring Engine - Self Mastery Focus
// Measures 5 dimensions of inner world mastery

export interface InnerWorldAnswers {
  emotional_awareness_response: string;
  stress_response_response: string;
  recovery_patterns_response: string;
  mental_clarity_response: string;
  growth_intention_response: string;
}

export interface InnerWorldScores {
  emotionalAwareness: number;   // 0-100: Ability to recognize and name emotions
  stressResilience: number;     // 0-100: How you respond under pressure
  recoveryCapacity: number;     // 0-100: Ability to recharge and prevent burnout
  mentalClarity: number;        // 0-100: Focus, cognitive load management
  innerStability: number;       // 0-100: Grounding, staying calm, pausing
}

export interface InnerWorldProfile {
  overallScore: number;
  scores: InnerWorldScores;
  primaryStrength: keyof InnerWorldScores;
  primaryGrowthArea: keyof InnerWorldScores;
  readinessLevel: 'Foundation' | 'Building' | 'Strong' | 'Elite';
}

// Scoring maps for each question
const EMOTIONAL_AWARENESS_SCORES: Record<string, InnerWorldScores> = {
  notice_early: { emotionalAwareness: 95, stressResilience: 75, recoveryCapacity: 70, mentalClarity: 80, innerStability: 85 },
  physical_signs: { emotionalAwareness: 70, stressResilience: 60, recoveryCapacity: 65, mentalClarity: 60, innerStability: 55 },
  realize_after: { emotionalAwareness: 45, stressResilience: 50, recoveryCapacity: 55, mentalClarity: 50, innerStability: 45 },
  push_through: { emotionalAwareness: 35, stressResilience: 55, recoveryCapacity: 40, mentalClarity: 55, innerStability: 35 },
};

const STRESS_RESPONSE_SCORES: Record<string, InnerWorldScores> = {
  stay_grounded: { emotionalAwareness: 80, stressResilience: 95, recoveryCapacity: 80, mentalClarity: 85, innerStability: 95 },
  react_quickly: { emotionalAwareness: 55, stressResilience: 45, recoveryCapacity: 55, mentalClarity: 50, innerStability: 40 },
  freeze_overthink: { emotionalAwareness: 60, stressResilience: 40, recoveryCapacity: 50, mentalClarity: 35, innerStability: 45 },
  power_through: { emotionalAwareness: 45, stressResilience: 55, recoveryCapacity: 35, mentalClarity: 60, innerStability: 50 },
};

const RECOVERY_PATTERNS_SCORES: Record<string, InnerWorldScores> = {
  bounce_back: { emotionalAwareness: 75, stressResilience: 85, recoveryCapacity: 95, mentalClarity: 80, innerStability: 80 },
  weekend_recover: { emotionalAwareness: 60, stressResilience: 55, recoveryCapacity: 60, mentalClarity: 55, innerStability: 55 },
  accumulating_fatigue: { emotionalAwareness: 50, stressResilience: 45, recoveryCapacity: 35, mentalClarity: 40, innerStability: 45 },
  always_tired: { emotionalAwareness: 40, stressResilience: 35, recoveryCapacity: 25, mentalClarity: 30, innerStability: 35 },
};

const MENTAL_CLARITY_SCORES: Record<string, InnerWorldScores> = {
  crystal_clear: { emotionalAwareness: 75, stressResilience: 80, recoveryCapacity: 75, mentalClarity: 95, innerStability: 85 },
  mostly_clear: { emotionalAwareness: 60, stressResilience: 65, recoveryCapacity: 60, mentalClarity: 70, innerStability: 65 },
  fog_creeps: { emotionalAwareness: 50, stressResilience: 45, recoveryCapacity: 45, mentalClarity: 40, innerStability: 50 },
  overwhelmed: { emotionalAwareness: 45, stressResilience: 35, recoveryCapacity: 35, mentalClarity: 25, innerStability: 40 },
};

const GROWTH_INTENTION_WEIGHTS: Record<string, Partial<InnerWorldScores>> = {
  stay_calm_pressure: { innerStability: 10, stressResilience: 5 },
  manage_anxiety: { stressResilience: 10, emotionalAwareness: 5 },
  recover_faster: { recoveryCapacity: 10, stressResilience: 5 },
  sustain_energy: { recoveryCapacity: 10, mentalClarity: 5 },
  sharpen_focus: { mentalClarity: 10, innerStability: 5 },
  reframe_rewire: { emotionalAwareness: 10, innerStability: 5 },
};

const DEFAULT_SCORES: InnerWorldScores = {
  emotionalAwareness: 50,
  stressResilience: 50,
  recoveryCapacity: 50,
  mentalClarity: 50,
  innerStability: 50,
};

export function calculateInnerWorldScores(answers: InnerWorldAnswers): InnerWorldProfile {
  // Get scores from each question
  const emotionalScores = EMOTIONAL_AWARENESS_SCORES[answers.emotional_awareness_response] || DEFAULT_SCORES;
  const stressScores = STRESS_RESPONSE_SCORES[answers.stress_response_response] || DEFAULT_SCORES;
  const recoveryScores = RECOVERY_PATTERNS_SCORES[answers.recovery_patterns_response] || DEFAULT_SCORES;
  const clarityScores = MENTAL_CLARITY_SCORES[answers.mental_clarity_response] || DEFAULT_SCORES;
  const growthWeights = GROWTH_INTENTION_WEIGHTS[answers.growth_intention_response] || {};

  // Weight the scores: each question contributes differently
  // Q1 (Emotional Awareness): 25%, Q2 (Stress Response): 25%, Q3 (Recovery): 20%, Q4 (Mental Clarity): 20%, Q5 (Growth): 10% bonus
  const scores: InnerWorldScores = {
    emotionalAwareness: Math.round(
      emotionalScores.emotionalAwareness * 0.35 +
      stressScores.emotionalAwareness * 0.25 +
      recoveryScores.emotionalAwareness * 0.20 +
      clarityScores.emotionalAwareness * 0.20 +
      (growthWeights.emotionalAwareness || 0)
    ),
    stressResilience: Math.round(
      emotionalScores.stressResilience * 0.20 +
      stressScores.stressResilience * 0.35 +
      recoveryScores.stressResilience * 0.25 +
      clarityScores.stressResilience * 0.20 +
      (growthWeights.stressResilience || 0)
    ),
    recoveryCapacity: Math.round(
      emotionalScores.recoveryCapacity * 0.20 +
      stressScores.recoveryCapacity * 0.20 +
      recoveryScores.recoveryCapacity * 0.40 +
      clarityScores.recoveryCapacity * 0.20 +
      (growthWeights.recoveryCapacity || 0)
    ),
    mentalClarity: Math.round(
      emotionalScores.mentalClarity * 0.20 +
      stressScores.mentalClarity * 0.20 +
      recoveryScores.mentalClarity * 0.20 +
      clarityScores.mentalClarity * 0.40 +
      (growthWeights.mentalClarity || 0)
    ),
    innerStability: Math.round(
      emotionalScores.innerStability * 0.25 +
      stressScores.innerStability * 0.30 +
      recoveryScores.innerStability * 0.20 +
      clarityScores.innerStability * 0.25 +
      (growthWeights.innerStability || 0)
    ),
  };

  // Cap scores at 100
  Object.keys(scores).forEach(key => {
    const k = key as keyof InnerWorldScores;
    scores[k] = Math.min(100, scores[k]);
  });

  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    scores.emotionalAwareness * 0.20 +
    scores.stressResilience * 0.25 +
    scores.recoveryCapacity * 0.20 +
    scores.mentalClarity * 0.15 +
    scores.innerStability * 0.20
  );

  // Find primary strength and growth area
  const scoreEntries = Object.entries(scores) as [keyof InnerWorldScores, number][];
  const sorted = scoreEntries.sort((a, b) => b[1] - a[1]);
  const primaryStrength = sorted[0][0];
  const primaryGrowthArea = sorted[sorted.length - 1][0];

  // Determine readiness level
  let readinessLevel: 'Foundation' | 'Building' | 'Strong' | 'Elite';
  if (overallScore >= 85) {
    readinessLevel = 'Elite';
  } else if (overallScore >= 70) {
    readinessLevel = 'Strong';
  } else if (overallScore >= 50) {
    readinessLevel = 'Building';
  } else {
    readinessLevel = 'Foundation';
  }

  return {
    overallScore,
    scores,
    primaryStrength,
    primaryGrowthArea,
    readinessLevel,
  };
}

// Dimension display names
export const DIMENSION_LABELS: Record<keyof InnerWorldScores, string> = {
  emotionalAwareness: 'Emotional Awareness',
  stressResilience: 'Stress Resilience',
  recoveryCapacity: 'Recovery Capacity',
  mentalClarity: 'Mental Clarity',
  innerStability: 'Inner Stability',
};

// Get score range category
export function getScoreCategory(score: number): { label: string; description: string } {
  if (score >= 85) {
    return { label: 'Elite', description: 'You demonstrate exceptional capability in this area.' };
  } else if (score >= 70) {
    return { label: 'Strong', description: 'You have solid foundations with room to optimize.' };
  } else if (score >= 50) {
    return { label: 'Building', description: 'You\'re developing capability with clear growth potential.' };
  } else {
    return { label: 'Foundation', description: 'This is a key area for focused development.' };
  }
}

// Get the national average for comparison
export function getNationalAverage(): number {
  return 58; // Based on professional population baseline
}
