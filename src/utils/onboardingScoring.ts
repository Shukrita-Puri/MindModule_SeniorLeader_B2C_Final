// Streamlined scoring for 3 behavioral questions
// Scores now map to the 8 canonical Meta Skills

export interface BehavioralAnswers {
  q1_setback_response: string;
  q2_pressure_response: string;
  q3_communication_style: string;
}

export interface MetaSkillScores {
  self_regulation: number;
  resilience: number;
  emotional_intelligence: number;
  confidence: number;
  thinking_clarity: number;
  adaptive_capacity: number;
  influence: number;
  presence: number;
}

export interface ScoringResult {
  scores: MetaSkillScores;
  profileType: string;
  profileDescription: string;
}

// Scoring matrices for 3 questions
// Each answer distributes points across the 8 meta skills (max 3 per skill per question)
const Q1_SCORES: Record<string, Partial<Record<keyof MetaSkillScores, number>>> = {
  analyzed_adjusted:  { thinking_clarity: 3, adaptive_capacity: 2, resilience: 1, confidence: 1 },
  took_break:         { self_regulation: 3, emotional_intelligence: 2, resilience: 1 },
  pushed_through:     { resilience: 2, confidence: 1, self_regulation: 1 },
  questioned_path:    { thinking_clarity: 1, adaptive_capacity: 1 },
};

const Q2_SCORES: Record<string, Partial<Record<keyof MetaSkillScores, number>>> = {
  pause_collect:    { self_regulation: 3, presence: 2, thinking_clarity: 1, confidence: 1 },
  stay_calm:        { self_regulation: 2, presence: 2, resilience: 1, confidence: 1 },
  defend_explain:   { influence: 2, confidence: 1 },
  flustered:        { emotional_intelligence: 1 },
};

const Q3_SCORES: Record<string, Partial<Record<keyof MetaSkillScores, number>>> = {
  ask_questions:      { influence: 3, emotional_intelligence: 2, adaptive_capacity: 1, presence: 1 },
  find_analogy:       { thinking_clarity: 3, influence: 2, adaptive_capacity: 1 },
  walk_through_logic: { thinking_clarity: 2, influence: 1 },
  frustrated:         { emotional_intelligence: 1 },
};

const ALL_SKILL_KEYS: (keyof MetaSkillScores)[] = [
  'self_regulation', 'resilience', 'emotional_intelligence', 'confidence',
  'thinking_clarity', 'adaptive_capacity', 'influence', 'presence'
];

export function calculateMetaSkillScores(
  answers: BehavioralAnswers
): ScoringResult {
  const raw: Record<string, number> = {};
  ALL_SKILL_KEYS.forEach(k => raw[k] = 0);

  // Accumulate raw scores from all 3 questions
  const matrices = [
    { key: answers.q1_setback_response, table: Q1_SCORES },
    { key: answers.q2_pressure_response, table: Q2_SCORES },
    { key: answers.q3_communication_style, table: Q3_SCORES },
  ];

  for (const { key, table } of matrices) {
    const entry = table[key];
    if (entry) {
      for (const [skill, pts] of Object.entries(entry)) {
        raw[skill] = (raw[skill] || 0) + (pts || 0);
      }
    }
  }

  // Normalize to 0-10 scale (theoretical max per skill across 3 questions is ~9)
  const scores = {} as MetaSkillScores;
  for (const k of ALL_SKILL_KEYS) {
    scores[k] = Math.round(Math.min(10, (raw[k] / 9) * 10) * 10) / 10;
  }

  const { profileType, profileDescription } = generateProfile(scores);

  return { scores, profileType, profileDescription };
}

function generateProfile(scores: MetaSkillScores): {
  profileType: string;
  profileDescription: string;
} {
  const sorted = ALL_SKILL_KEYS
    .map(k => ({ key: k, score: scores[k] }))
    .sort((a, b) => b.score - a.score);

  const top = sorted[0];
  const second = sorted[1];

  if (Math.abs(top.score - second.score) < 0.5) {
    return {
      profileType: "Balanced Leader",
      profileDescription:
        "You show balanced capability across multiple Meta Skills. This versatility is valuable—you can adapt your approach based on what each situation demands.",
    };
  }

  const LABELS: Record<string, string> = {
    self_regulation: "Self-Regulation",
    resilience: "Resilience",
    emotional_intelligence: "Emotional Intelligence",
    confidence: "Confidence",
    thinking_clarity: "Thinking Clarity",
    adaptive_capacity: "Adaptive Capacity",
    influence: "Influence",
    presence: "Presence",
  };

  return {
    profileType: `${LABELS[top.key]} Leader`,
    profileDescription:
      `Your strongest area is ${LABELS[top.key]}, supported by ${LABELS[second.key]}. Mind Module will help you leverage these strengths while developing across all eight Meta Skills.`,
  };
}

export function determineAlignment(
  selfAssessedStrength: string,
  scores: MetaSkillScores
): {
  status: "MATCH" | "UNDERESTIMATE" | "OVERESTIMATE";
  message: string;
  actualHighest: string;
} {
  const LABELS: Record<string, string> = {
    self_regulation: "Self-Regulation",
    resilience: "Resilience",
    emotional_intelligence: "Emotional Intelligence",
    confidence: "Confidence",
    thinking_clarity: "Thinking Clarity",
    adaptive_capacity: "Adaptive Capacity",
    influence: "Influence",
    presence: "Presence",
    // Legacy mappings
    ALA: "Adaptive Capacity",
    CSI: "Influence",
    SRR: "Self-Regulation",
  };

  // Legacy key → new key mapping
  const legacyToNew: Record<string, keyof MetaSkillScores> = {
    ALA: 'adaptive_capacity',
    CSI: 'influence',
    SRR: 'self_regulation',
  };

  // Find actual highest
  const sorted = ALL_SKILL_KEYS
    .map(k => ({ key: k, score: scores[k] }))
    .sort((a, b) => b.score - a.score);
  const highest = sorted[0];
  const actualHighestName = LABELS[highest.key] || highest.key;

  if (selfAssessedStrength === "none") {
    return {
      status: "UNDERESTIMATE",
      message: `You're being modest! Your responses show clear strength in ${actualHighestName}. Mind Module will help you recognise and leverage your natural capabilities.`,
      actualHighest: actualHighestName,
    };
  }

  const assessedKey = legacyToNew[selfAssessedStrength] || selfAssessedStrength as keyof MetaSkillScores;
  const selfScore = scores[assessedKey] ?? 0;
  const diff = highest.score - selfScore;
  const selfLabel = LABELS[selfAssessedStrength] || LABELS[assessedKey] || selfAssessedStrength;

  if (Math.abs(diff) <= 1.0) {
    return {
      status: "MATCH",
      message: `Your self-perception aligns with your behavioral patterns! ${actualHighestName} is indeed your strongest area.`,
      actualHighest: actualHighestName,
    };
  }

  if (diff > 1.5) {
    return {
      status: "UNDERESTIMATE",
      message: `Your responses reveal ${actualHighestName} as your strongest area, but you identified ${selfLabel}. This hidden strength is worth exploring.`,
      actualHighest: actualHighestName,
    };
  }

  return {
    status: "OVERESTIMATE",
    message: `While you identified ${selfLabel} as your strength, your responses show ${actualHighestName} is currently your strongest pattern. Mind Module will help you develop ${selfLabel} through targeted practice.`,
    actualHighest: actualHighestName,
  };
}
