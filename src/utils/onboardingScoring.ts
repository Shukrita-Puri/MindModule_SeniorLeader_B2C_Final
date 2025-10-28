// Scoring algorithm based on Meta Skill assessment

export interface BehavioralAnswers {
  q1_setback_response: string;
  q2_performance_gap: string;
  q3_pressure_response: string;
  q4_communication_style: string;
  q5_consistency_pattern: string;
  q6_emotional_awareness: string[];
}

export interface MetaSkillScores {
  ALA: number; // Adaptability & Learning Agility
  CSI: number; // Communication & Social Intelligence
  SRR: number; // Self-Regulation & Resilience
}

export interface ScoringResult {
  scores: MetaSkillScores;
  profileType: string;
  profileDescription: string;
}

// Scoring matrices
const Q1_SCORES = {
  analyzed: { ALA: 3, CSI: 1, SRR: 2 },
  discouraged: { ALA: 1, CSI: 0, SRR: 3 },
  questioned: { ALA: 0, CSI: 0, SRR: 0 },
  threw_back: { ALA: 1, CSI: 0, SRR: 1 },
};

const Q2_SCORES = {
  naturally_talented: { ALA: 0, CSI: 0, SRR: 0 },
  learn_differently: { ALA: 3, CSI: 3, SRR: 2 },
  work_harder: { ALA: 1, CSI: 0, SRR: 1 },
  built_for_it: { ALA: 0, CSI: 0, SRR: 0 },
};

const Q3_SCORES = {
  pause: { ALA: 2, CSI: 2, SRR: 3 },
  defend: { ALA: 0, CSI: 0, SRR: 0 },
  flustered: { ALA: 0, CSI: 0, SRR: 0 },
  calm: { ALA: 1, CSI: 1, SRR: 3 },
};

const Q4_SCORES = {
  logic_steps: { ALA: 0, CSI: 0, SRR: 0 },
  ask_questions: { ALA: 2, CSI: 3, SRR: 1 },
  story_analogy: { ALA: 2, CSI: 3, SRR: 1 },
  frustrated: { ALA: 0, CSI: 0, SRR: 0 },
};

const Q5_SCORES = {
  focused_goals: { ALA: 1, CSI: 0, SRR: 2 },
  shifted_learned: { ALA: 3, CSI: 1, SRR: 1 },
  several_paths: { ALA: 3, CSI: 2, SRR: 0 },
  core_experiment: { ALA: 2, CSI: 1, SRR: 2 },
};

const Q6_SCORES = {
  own_emotions: { ALA: 1, CSI: 0, SRR: 2 },
  own_why: { ALA: 1, CSI: 1, SRR: 3 },
  others_emotions: { ALA: 2, CSI: 3, SRR: 2 },
  social_undercurrents: { ALA: 2, CSI: 3, SRR: 3 },
  content_focus: { ALA: 0, CSI: 0, SRR: 0 },
};

const MAX_POSSIBLE_SCORE = 18; // 6 questions × 3 max points

export function calculateMetaSkillScores(answers: BehavioralAnswers): ScoringResult {
  let rawScores: MetaSkillScores = { ALA: 0, CSI: 0, SRR: 0 };

  // Q1: Setback Response
  const q1Scores = Q1_SCORES[answers.q1_setback_response as keyof typeof Q1_SCORES] || { ALA: 0, CSI: 0, SRR: 0 };
  rawScores.ALA += q1Scores.ALA;
  rawScores.CSI += q1Scores.CSI;
  rawScores.SRR += q1Scores.SRR;

  // Q2: Performance Gap
  const q2Scores = Q2_SCORES[answers.q2_performance_gap as keyof typeof Q2_SCORES] || { ALA: 0, CSI: 0, SRR: 0 };
  rawScores.ALA += q2Scores.ALA;
  rawScores.CSI += q2Scores.CSI;
  rawScores.SRR += q2Scores.SRR;

  // Q3: Pressure Response
  const q3Scores = Q3_SCORES[answers.q3_pressure_response as keyof typeof Q3_SCORES] || { ALA: 0, CSI: 0, SRR: 0 };
  rawScores.ALA += q3Scores.ALA;
  rawScores.CSI += q3Scores.CSI;
  rawScores.SRR += q3Scores.SRR;

  // Q4: Communication Style
  const q4Scores = Q4_SCORES[answers.q4_communication_style as keyof typeof Q4_SCORES] || { ALA: 0, CSI: 0, SRR: 0 };
  rawScores.ALA += q4Scores.ALA;
  rawScores.CSI += q4Scores.CSI;
  rawScores.SRR += q4Scores.SRR;

  // Q5: Consistency Pattern
  const q5Scores = Q5_SCORES[answers.q5_consistency_pattern as keyof typeof Q5_SCORES] || { ALA: 0, CSI: 0, SRR: 0 };
  rawScores.ALA += q5Scores.ALA;
  rawScores.CSI += q5Scores.CSI;
  rawScores.SRR += q5Scores.SRR;

  // Q6: Emotional Awareness (multi-select - sum all selected)
  answers.q6_emotional_awareness.forEach(selection => {
    const q6Scores = Q6_SCORES[selection as keyof typeof Q6_SCORES] || { ALA: 0, CSI: 0, SRR: 0 };
    rawScores.ALA += q6Scores.ALA;
    rawScores.CSI += q6Scores.CSI;
    rawScores.SRR += q6Scores.SRR;
  });

  // Normalize to 0-10 scale (rounded to 1 decimal)
  const normalizedScores: MetaSkillScores = {
    ALA: Math.round((rawScores.ALA / MAX_POSSIBLE_SCORE) * 10 * 10) / 10,
    CSI: Math.round((rawScores.CSI / MAX_POSSIBLE_SCORE) * 10 * 10) / 10,
    SRR: Math.round((rawScores.SRR / MAX_POSSIBLE_SCORE) * 10 * 10) / 10,
  };

  // Generate profile
  const { profileType, profileDescription } = generateProfile(normalizedScores);

  return {
    scores: normalizedScores,
    profileType,
    profileDescription,
  };
}

function generateProfile(scores: MetaSkillScores): { profileType: string; profileDescription: string } {
  // Sort scores to find top 2
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topSkill = sorted[0][0];
  const secondSkill = sorted[1][0];

  // Check if all scores are within 0.5 points (balanced)
  const scoreDiff = Math.max(...Object.values(scores)) - Math.min(...Object.values(scores));
  if (scoreDiff <= 0.5) {
    return {
      profileType: 'Balanced Developer',
      profileDescription: 'You show consistent capability across all three Meta Skills—Adaptability, Communication, and Self-Regulation. This balanced foundation allows you to flex between different challenges without a dominant pattern limiting you. Your development path focuses on situational mastery: knowing which skill to deploy when.',
    };
  }

  // Profile combinations based on top 2 skills
  const profiles: Record<string, { type: string; description: string }> = {
    'ALA-CSI': {
      type: 'Adaptive Communicator',
      description: 'You naturally pivot well under changing conditions and read social dynamics effectively. You learn fast and adjust your communication style to different audiences. Your development edge is in stress regulation—building the capacity to stay centered when pressure spikes or emotions run high.',
    },
    'ALA-SRR': {
      type: 'Adaptive Regulator',
      description: 'You combine quick learning with strong emotional composure. When conditions shift, you adapt while staying grounded. Your development edge is in social influence—reading others\' perspectives deeply and adjusting your communication to bridge different mental models.',
    },
    'CSI-ALA': {
      type: 'Social Adapter',
      description: 'You excel at reading people and adjusting your approach based on what you learn. You combine social intelligence with a learning mindset. Your development edge is in self-regulation—managing your own stress and energy when social dynamics become demanding.',
    },
    'CSI-SRR': {
      type: 'Empathic Regulator',
      description: 'You read others well and manage your own emotional state effectively. You stay composed in difficult conversations and track what\'s happening beneath the surface. Your development edge is in adaptability—pivoting strategy when new information emerges or assumptions prove wrong.',
    },
    'SRR-ALA': {
      type: 'Centered Adapter',
      description: 'You stay composed under pressure and learn quickly from experience. You regulate stress while remaining open to new approaches. Your development edge is in social intelligence—reading interpersonal dynamics and influencing others when perspectives differ.',
    },
    'SRR-CSI': {
      type: 'Centered Communicator',
      description: 'You manage your own state well and communicate effectively with others. You stay grounded in difficult conversations and read social cues accurately. Your development edge is in learning agility—pivoting strategy quickly when conditions change or new patterns emerge.',
    },
  };

  const profileKey = `${topSkill}-${secondSkill}`;
  const profile = profiles[profileKey] || profiles['ALA-CSI'];

  return {
    profileType: profile.type,
    profileDescription: profile.description,
  };
}

export function determineAlignment(
  selfAssessedStrength: string,
  scores: MetaSkillScores
): {
  status: 'MATCH' | 'UNDERESTIMATE' | 'OVERESTIMATE';
  message: string;
  actualHighest: string;
} {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const actualHighest = sorted[0][0];
  const actualHighestScore = sorted[0][1];

  if (selfAssessedStrength === 'none') {
    return {
      status: 'UNDERESTIMATE',
      actualHighest,
      message: `You selected "none" as your current strength, but your behaviors show meaningful capability in ${getSkillDisplayName(actualHighest)} (${actualHighestScore}/10). This suggests you may be underestimating yourself—a common pattern in high achievers. This hidden strength becomes leverage for faster growth.`,
    };
  }

  const selfAssessedScore = scores[selfAssessedStrength as keyof MetaSkillScores] || 0;
  const scoreDifference = actualHighestScore - selfAssessedScore;

  // MATCH: within ±1.0 points
  if (Math.abs(scoreDifference) <= 1.0) {
    return {
      status: 'MATCH',
      actualHighest,
      message: `Your self-perception aligns with your behavioral patterns. You accurately identified ${getSkillDisplayName(selfAssessedStrength)} as a strength area, and your responses confirm this (${selfAssessedScore}/10). This self-awareness accelerates development—you know where you stand and can practice deliberately from here.`,
    };
  }

  // UNDERESTIMATE: actual is >1.5 points higher
  if (scoreDifference > 1.5) {
    return {
      status: 'UNDERESTIMATE',
      actualHighest,
      message: `Your behaviors show more capability in ${getSkillDisplayName(actualHighest)} (${actualHighestScore}/10) than you give yourself credit for. You self-assessed ${getSkillDisplayName(selfAssessedStrength)} as your strength (${selfAssessedScore}/10), but you're actually stronger in ${getSkillDisplayName(actualHighest)}. This is common in high achievers—you may be stronger than you realize. This hidden strength becomes leverage for faster growth.`,
    };
  }

  // OVERESTIMATE: self-assessed is >1.5 points higher
  return {
    status: 'OVERESTIMATE',
    actualHighest,
    message: `You highly value ${getSkillDisplayName(selfAssessedStrength)}, and your behaviors show room to grow here (${selfAssessedScore}/10 vs. ${actualHighestScore}/10 in ${getSkillDisplayName(actualHighest)}). This awareness is powerful—it means you're ready to develop deliberately. Mind Module will help you close this gap through targeted practice.`,
  };
}

function getSkillDisplayName(skill: string): string {
  const names: Record<string, string> = {
    ALA: 'Adaptability & Learning Agility',
    CSI: 'Communication & Social Intelligence',
    SRR: 'Self-Regulation & Resilience',
  };
  return names[skill] || skill;
}
