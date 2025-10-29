// Streamlined scoring for 3 behavioral questions

export interface BehavioralAnswers {
  q1_setback_response: string;
  q2_pressure_response: string;
  q3_communication_style: string;
}

export interface MetaSkillScores {
  adaptability_learning: number;
  communication_social: number;
  self_regulation: number;
}

export interface ScoringResult {
  scores: MetaSkillScores;
  profileType: string;
  profileDescription: string;
}

// Scoring matrices for 3 questions (max 3 points per skill per question)
const Q1_SCORES = {
  analyzed_adjusted: { ALA: 3, SRR: 2, CSI: 1 },
  took_break: { SRR: 3, ALA: 1, CSI: 0 },
  pushed_through: { SRR: 1, ALA: 1, CSI: 0 },
  questioned_path: { ALA: 0, CSI: 0, SRR: 0 },
};

const Q2_SCORES = {
  pause_collect: { SRR: 3, CSI: 2, ALA: 1 },
  stay_calm: { SRR: 3, CSI: 1, ALA: 1 },
  defend_explain: { CSI: 1, SRR: 0, ALA: 0 },
  flustered: { ALA: 0, CSI: 0, SRR: 0 },
};

const Q3_SCORES = {
  ask_questions: { CSI: 3, ALA: 2, SRR: 1 },
  find_analogy: { CSI: 3, ALA: 2, SRR: 1 },
  walk_through_logic: { CSI: 1, ALA: 0, SRR: 0 },
  frustrated: { ALA: 0, CSI: 0, SRR: 0 },
};

export function calculateMetaSkillScores(
  answers: BehavioralAnswers
): ScoringResult {
  // Initialize raw scores
  let rawALA = 0;
  let rawCSI = 0;
  let rawSRR = 0;

  // Q1: Setback Response
  const q1Key = answers.q1_setback_response as keyof typeof Q1_SCORES;
  if (Q1_SCORES[q1Key]) {
    rawALA += Q1_SCORES[q1Key].ALA;
    rawCSI += Q1_SCORES[q1Key].CSI;
    rawSRR += Q1_SCORES[q1Key].SRR;
  }

  // Q2: Pressure Response
  const q2Key = answers.q2_pressure_response as keyof typeof Q2_SCORES;
  if (Q2_SCORES[q2Key]) {
    rawALA += Q2_SCORES[q2Key].ALA;
    rawCSI += Q2_SCORES[q2Key].CSI;
    rawSRR += Q2_SCORES[q2Key].SRR;
  }

  // Q3: Communication Style
  const q3Key = answers.q3_communication_style as keyof typeof Q3_SCORES;
  if (Q3_SCORES[q3Key]) {
    rawALA += Q3_SCORES[q3Key].ALA;
    rawCSI += Q3_SCORES[q3Key].CSI;
    rawSRR += Q3_SCORES[q3Key].SRR;
  }

  // Normalize to 0-10 scale (max raw score is 9 per skill)
  const normalizedScores: MetaSkillScores = {
    adaptability_learning: Math.round((rawALA / 9) * 100) / 10,
    communication_social: Math.round((rawCSI / 9) * 100) / 10,
    self_regulation: Math.round((rawSRR / 9) * 100) / 10,
  };

  // Generate profile based on scores
  const { profileType, profileDescription } = generateProfile(normalizedScores);

  return {
    scores: normalizedScores,
    profileType,
    profileDescription,
  };
}

function generateProfile(scores: MetaSkillScores): {
  profileType: string;
  profileDescription: string;
} {
  const sortedSkills = [
    { name: "ALA", score: scores.adaptability_learning },
    { name: "CSI", score: scores.communication_social },
    { name: "SRR", score: scores.self_regulation },
  ].sort((a, b) => b.score - a.score);

  const highest = sortedSkills[0];
  const secondHighest = sortedSkills[1];

  // If top two are within 0.5 points, consider it balanced
  if (Math.abs(highest.score - secondHighest.score) < 0.5) {
    return {
      profileType: "Balanced Developer",
      profileDescription:
        "You show balanced capability across all three Meta Skills. This versatility is valuable—you can adapt your approach based on what each situation demands. Your development path will focus on deepening your strongest area while maintaining this balance.",
    };
  }

  // Generate profile based on top two skills
  const combo = `${highest.name}-${secondHighest.name}`;

  const profiles: Record<string, { type: string; description: string }> = {
    "ALA-CSI": {
      type: "Adaptive Communicator",
      description:
        "You excel at reading situations and adjusting your communication approach. You're likely strongest when navigating change while keeping people aligned. Your development path will focus on maintaining composure when both adaptation and influence are needed simultaneously.",
    },
    "ALA-SRR": {
      type: "Adaptive Regulator",
      description:
        "You combine flexibility with composure—able to shift direction while staying centered. You're likely strongest when facing unexpected challenges that require both quick thinking and emotional steadiness. Your development path will focus on bringing others along as you adapt.",
    },
    "CSI-ALA": {
      type: "Social Adapter",
      description:
        "You lead with connection and reading the room, backed by mental flexibility. You're likely strongest in situations requiring influence through changing circumstances. Your development path will focus on maintaining your calm center when both relationship dynamics and plans are shifting.",
    },
    "CSI-SRR": {
      type: "Empathic Regulator",
      description:
        "You combine social awareness with emotional steadiness—able to read others while staying composed yourself. You're likely strongest in high-stakes interpersonal situations. Your development path will focus on maintaining this balance when circumstances change rapidly.",
    },
    "SRR-ALA": {
      type: "Centered Adapter",
      description:
        "You lead with composure and add mental agility when needed. You're likely strongest when facing pressure that requires both staying calm and thinking differently. Your development path will focus on reading social dynamics while maintaining this centered flexibility.",
    },
    "SRR-CSI": {
      type: "Centered Communicator",
      description:
        "You combine emotional regulation with social intelligence—staying composed while reading others. You're likely strongest in tense interpersonal situations. Your development path will focus on maintaining this balance when rapid adaptation is also required.",
    },
  };

  const profile = profiles[combo] || profiles["ALA-CSI"];

  return {
    profileType: profile.type,
    profileDescription: profile.description,
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
  // Map self-assessment to skill names
  const skillMap: Record<string, keyof MetaSkillScores> = {
    ALA: "adaptability_learning",
    CSI: "communication_social",
    SRR: "self_regulation",
  };

  const skillNameMap: Record<keyof MetaSkillScores, string> = {
    adaptability_learning: "Adaptability & Learning Agility",
    communication_social: "Communication & Social Intelligence",
    self_regulation: "Self-Regulation & Resilience",
  };

  // Find actual highest score
  const scoresArray = [
    { skill: "adaptability_learning", score: scores.adaptability_learning },
    { skill: "communication_social", score: scores.communication_social },
    { skill: "self_regulation", score: scores.self_regulation },
  ];

  const highest = scoresArray.reduce((prev, current) =>
    current.score > prev.score ? current : prev
  );

  const actualHighestSkill = highest.skill as keyof MetaSkillScores;
  const actualHighestName = skillNameMap[actualHighestSkill];

  // Handle "none" self-assessment
  if (selfAssessedStrength === "none") {
    return {
      status: "UNDERESTIMATE",
      message: `You're being modest! Your responses show clear strength in ${actualHighestName}. This self-awareness gap is common—Mind Module will help you recognize and leverage your natural capabilities.`,
      actualHighest: actualHighestName,
    };
  }

  const selfAssessedSkill = skillMap[selfAssessedStrength];
  const selfAssessedScore = scores[selfAssessedSkill];
  const actualHighestScore = highest.score;

  const difference = actualHighestScore - selfAssessedScore;

  if (Math.abs(difference) <= 1.0) {
    return {
      status: "MATCH",
      message: `Your self-perception aligns with your behavioral patterns! ${actualHighestName} is indeed your strongest area. This accurate self-awareness is a valuable meta-skill itself.`,
      actualHighest: actualHighestName,
    };
  }

  if (difference > 1.5) {
    return {
      status: "UNDERESTIMATE",
      message: `Interesting insight: Your responses reveal ${actualHighestName} as your strongest area, but you identified ${skillNameMap[selfAssessedSkill]}. This hidden strength is worth exploring—Mind Module will help you recognize and leverage it more intentionally.`,
      actualHighest: actualHighestName,
    };
  }

  return {
    status: "OVERESTIMATE",
    message: `Valuable insight: While you identified ${skillNameMap[selfAssessedSkill]} as your strength, your responses show ${actualHighestName} is currently your strongest pattern. Mind Module will help you develop ${skillNameMap[selfAssessedSkill]} through targeted practice.`,
    actualHighest: actualHighestName,
  };
}
