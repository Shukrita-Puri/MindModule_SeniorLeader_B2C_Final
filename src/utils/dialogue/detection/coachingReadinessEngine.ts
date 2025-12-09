// Dialogue Room - Coaching Readiness & Rate Limiting Module

import { CoachingReadiness, DetectedSignals } from '../types';

interface InterventionHistory {
  timestamps: number[];
  maxPerWindow: number;
  windowMs: number;
}

// Rate limiting state (in-memory for now, can be persisted)
const interventionHistory: Map<string, InterventionHistory> = new Map();

const OPENNESS_INDICATORS = [
  'help me understand', 'i need help', 'what should i',
  'how can i', 'teach me', 'show me', 'i want to improve',
  'feedback', 'advice', 'suggestion', 'what do you think'
];

const BREAKTHROUGH_INDICATORS = [
  'i never thought of it that way', 'thats a good point',
  "that's a good point", 'i see now', 'i understand now',
  'youre right', "you're right", 'i was wrong', 'i realize',
  'aha', 'oh i see', 'that makes sense now'
];

const MASTERY_INDICATORS = [
  'i stayed calm', 'i managed to', 'i controlled',
  'i recognized', 'i noticed', 'i paused', 'i reflected',
  'i understood their perspective', 'i asked clarifying'
];

export function assessCoachingReadiness(
  text: string,
  signals: Partial<DetectedSignals>,
  sessionId: string
): CoachingReadiness {
  const normalizedText = text.toLowerCase().replace(/['']/g, "'");

  // Calculate openness score
  let opennessScore = 0.5; // baseline
  
  // Positive indicators
  const opennessMatches = OPENNESS_INDICATORS.filter(ind =>
    normalizedText.includes(ind.replace(/['']/g, "'"))
  );
  opennessScore += opennessMatches.length * 0.1;

  // Negative indicators from signals
  if (signals.eiBehaviors?.escalationPattern?.detected) {
    opennessScore -= 0.3;
  }
  if (signals.conversationFlow?.responseType === 'defensive') {
    opennessScore -= 0.2;
  }
  if (signals.conversationFlow?.responseType === 'dismissive') {
    opennessScore -= 0.3;
  }

  // Positive indicators from signals
  if (signals.eiBehaviors?.selfRegulation?.detected) {
    opennessScore += 0.1;
  }
  if (signals.conversationFlow?.acknowledgementsGiven) {
    opennessScore += 0.1;
  }

  opennessScore = Math.max(0, Math.min(1, opennessScore));

  // Detect breakthrough potential
  const breakthroughMatches = BREAKTHROUGH_INDICATORS.filter(ind =>
    normalizedText.includes(ind.replace(/['']/g, "'"))
  );
  const breakthroughPotential = breakthroughMatches.length > 0;

  // Detect mastery demonstration
  const masteryMatches = MASTERY_INDICATORS.filter(ind =>
    normalizedText.includes(ind.replace(/['']/g, "'"))
  );

  // Rate limiting check
  const canIntervene = checkRateLimit(sessionId);
  let reasonIfNot: string | undefined;
  
  if (!canIntervene) {
    reasonIfNot = 'Rate limit reached (max 5 interventions per 15 minutes)';
  } else if (opennessScore < 0.3) {
    reasonIfNot = 'User not currently receptive to feedback';
  } else if (signals.eiBehaviors?.escalationPattern?.level && 
             signals.eiBehaviors.escalationPattern.level > 6) {
    reasonIfNot = 'User is escalating - allow de-escalation first';
  }

  return {
    opennessScore: Math.round(opennessScore * 100) / 100,
    breakthroughPotential,
    masteryDemonstrated: masteryMatches,
    canIntervene: canIntervene && opennessScore >= 0.3 && 
                  !(signals.eiBehaviors?.escalationPattern?.level && 
                    signals.eiBehaviors.escalationPattern.level > 6),
    reasonIfNot
  };
}

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxPerWindow = 5;

  let history = interventionHistory.get(sessionId);
  if (!history) {
    history = { timestamps: [], maxPerWindow, windowMs };
    interventionHistory.set(sessionId, history);
  }

  // Clean old timestamps
  history.timestamps = history.timestamps.filter(t => now - t < windowMs);

  return history.timestamps.length < maxPerWindow;
}

export function recordIntervention(sessionId: string): void {
  const history = interventionHistory.get(sessionId);
  if (history) {
    history.timestamps.push(Date.now());
  }
}

export function resetSessionRateLimit(sessionId: string): void {
  interventionHistory.delete(sessionId);
}
