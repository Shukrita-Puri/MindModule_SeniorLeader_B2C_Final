// Dialogue Room - Signal Detection Pipeline
// Orchestrates all client-side detection modules

import { DetectedSignals } from './types';
import { analyzeSentiment } from './detection/sentimentAnalyzer';
import { detectEmotions } from './detection/emotionDetector';
import { detectEIBehaviors } from './detection/eiBehaviorMarkers';
import { detectSkillGaps } from './detection/skillGapDetector';
import { analyzeConversationFlow } from './detection/conversationFlowAnalyzer';
import { assessCoachingReadiness } from './detection/coachingReadinessEngine';

export function runSignalDetection(
  text: string,
  previousMessage: string | undefined,
  sessionId: string
): DetectedSignals {
  // Run all detection modules in parallel (they're all synchronous)
  const sentiment = analyzeSentiment(text);
  const emotions = detectEmotions(text);
  const eiBehaviors = detectEIBehaviors(text);
  const { gaps: skillGaps, strengths: skillStrengths } = detectSkillGaps(text);
  const conversationFlow = analyzeConversationFlow(text, previousMessage);

  // Risk assessment based on signals
  const riskAssessment = calculateRiskAssessment(sentiment, eiBehaviors, conversationFlow);

  // Coaching readiness (includes rate limiting)
  const partialSignals = { sentiment, eiBehaviors, conversationFlow };
  const coachingReadiness = assessCoachingReadiness(text, partialSignals, sessionId);

  return {
    sentiment,
    emotions,
    eiBehaviors,
    skillGaps,
    skillStrengths,
    conversationFlow,
    riskAssessment,
    coachingReadiness
  };
}

function calculateRiskAssessment(
  sentiment: DetectedSignals['sentiment'],
  eiBehaviors: DetectedSignals['eiBehaviors'],
  conversationFlow: DetectedSignals['conversationFlow']
): DetectedSignals['riskAssessment'] {
  const riskFactors: string[] = [];
  let riskScore = 0;

  // Sentiment factors
  if (sentiment.label === 'negative' && sentiment.intensity > 0.6) {
    riskScore += 2;
    riskFactors.push('High negative sentiment intensity');
  }

  // Escalation factors
  if (eiBehaviors.escalationPattern.detected) {
    riskScore += eiBehaviors.escalationPattern.level / 2;
    riskFactors.push(`Escalation level ${eiBehaviors.escalationPattern.level}/10`);
  }

  // Defensive patterns
  if (conversationFlow.responseType === 'defensive') {
    riskScore += 1;
    riskFactors.push('Defensive response pattern');
  }

  // Dismissive patterns
  if (conversationFlow.responseType === 'dismissive') {
    riskScore += 1;
    riskFactors.push('Dismissive response pattern');
  }

  // Determine levels
  let escalationRisk: DetectedSignals['riskAssessment']['escalationRisk'];
  if (riskScore >= 5) {
    escalationRisk = 'high';
  } else if (riskScore >= 2) {
    escalationRisk = 'medium';
  } else {
    escalationRisk = 'low';
  }

  let interventionUrgency: DetectedSignals['riskAssessment']['interventionUrgency'];
  if (riskScore >= 6) {
    interventionUrgency = 'high';
  } else if (riskScore >= 3) {
    interventionUrgency = 'medium';
  } else if (riskScore >= 1) {
    interventionUrgency = 'low';
  } else {
    interventionUrgency = 'none';
  }

  return {
    escalationRisk,
    interventionUrgency,
    riskFactors
  };
}

// Re-export types and utilities
export * from './types';
export { runSafetyCheck } from './safety/safetyProtocols';
export { recordIntervention, resetSessionRateLimit } from './detection/coachingReadinessEngine';
