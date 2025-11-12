// Self-Regulation Scoring Engine (0-100 scale)

export interface SelfRegulationAnswers {
  energy_regulation_response?: string;
  focus_recovery_response?: string;
  energy_renewal_response?: string;
  growth_priority?: string;
}

export interface ComponentScores {
  q2_energy_regulation: number;
  q3_focus_recovery: number;
  q4_energy_renewal: number;
  q5_growth_priority: number;
}

export interface ScoringResult {
  componentScores: ComponentScores;
  mentalFitnessBaseline: number;
  scoreBreakdown: {
    energyRegulation: { score: number; weight: number; contribution: number };
    focusRecovery: { score: number; weight: number; contribution: number };
    energyRenewal: { score: number; weight: number; contribution: number };
    growthPriority: { score: number; weight: number; contribution: number };
  };
}

// Q2: Energy Regulation Scoring (30% weight)
const Q2_SCORES: Record<string, number> = {
  naturally_unwind: 85,
  try_but_racing: 55,
  stay_high_gear: 35,
  feel_guilty: 25
};

// Q3: Focus Recovery Scoring (30% weight)
const Q3_SCORES: Record<string, number> = {
  re_establish_quickly: 90,
  take_5_10_minutes: 70,
  struggle_to_recover: 40,
  get_frustrated: 25
};

// Q4: Energy Renewal Scoring (30% weight)
const Q4_SCORES: Record<string, number> = {
  go_to_strategies: 85,
  step_away_partial: 60,
  push_through_caffeine: 35,
  no_strategies: 30
};

// Q5: Growth Self-Assessment Scoring (10% weight)
const Q5_SCORES: Record<string, number> = {
  staying_composed_pressure: 80,
  recovering_setbacks: 75,
  maintaining_focus_chaos: 85,
  managing_energy_demands: 70,
  building_resilience: 80
};

export function calculateSelfRegulationScore(answers: SelfRegulationAnswers): ScoringResult {
  // Get individual component scores
  const q2Score = Q2_SCORES[answers.energy_regulation_response || ''] || 50;
  const q3Score = Q3_SCORES[answers.focus_recovery_response || ''] || 50;
  const q4Score = Q4_SCORES[answers.energy_renewal_response || ''] || 50;
  const q5Score = Q5_SCORES[answers.growth_priority || ''] || 75;

  const componentScores: ComponentScores = {
    q2_energy_regulation: q2Score,
    q3_focus_recovery: q3Score,
    q4_energy_renewal: q4Score,
    q5_growth_priority: q5Score
  };

  // Apply weights to calculate Mental Fitness Baseline
  const weights = {
    q2: 0.3,
    q3: 0.3,
    q4: 0.3,
    q5: 0.1
  };

  const mentalFitnessBaseline = Math.round(
    (q2Score * weights.q2) +
    (q3Score * weights.q3) +
    (q4Score * weights.q4) +
    (q5Score * weights.q5)
  );

  const scoreBreakdown = {
    energyRegulation: {
      score: q2Score,
      weight: weights.q2,
      contribution: Math.round(q2Score * weights.q2)
    },
    focusRecovery: {
      score: q3Score,
      weight: weights.q3,
      contribution: Math.round(q3Score * weights.q3)
    },
    energyRenewal: {
      score: q4Score,
      weight: weights.q4,
      contribution: Math.round(q4Score * weights.q4)
    },
    growthPriority: {
      score: q5Score,
      weight: weights.q5,
      contribution: Math.round(q5Score * weights.q5)
    }
  };

  return {
    componentScores,
    mentalFitnessBaseline,
    scoreBreakdown
  };
}

export function getScoreRangeCategory(score: number): {
  category: string;
  description: string;
  percentile: string;
} {
  if (score >= 80) {
    return {
      category: "Exceptional Starting Point",
      description: "You're operating at an elite baseline. Most people will never reach your starting point.",
      percentile: "top 8%"
    };
  } else if (score >= 70) {
    return {
      category: "Strong Foundation",
      description: "You have solid self-regulation capabilities with clear areas for strategic growth.",
      percentile: "top 25%"
    };
  } else if (score >= 55) {
    return {
      category: "Building Momentum",
      description: "You're aware of your patterns and ready to build the tools that transform stress response.",
      percentile: "top 50%"
    };
  } else {
    return {
      category: "Foundation Phase",
      description: "You're at the beginning of your self-regulation journey—this awareness alone puts you ahead.",
      percentile: "top 65%"
    };
  }
}

export function getGapToElite(score: number): number {
  return Math.max(0, 90 - score);
}

export function getNationalAverage(): number {
  return 62; // Based on assessment data
}
