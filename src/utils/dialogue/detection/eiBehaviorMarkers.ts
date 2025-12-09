// Dialogue Room - EI Behavior Detection Module

import { EIBehaviors } from '../types';
import {
  EMPATHY_INDICATORS,
  SELF_REGULATION_INDICATORS,
  PERSPECTIVE_TAKING_INDICATORS,
  DEFENSIVE_PATTERNS,
  ESCALATION_INDICATORS
} from './lexicons';

export function detectEIBehaviors(text: string): EIBehaviors {
  const normalizedText = text.toLowerCase().replace(/['']/g, "'");

  // Empathy detection
  const empathyMatches = EMPATHY_INDICATORS.filter(ind => 
    normalizedText.includes(ind)
  );

  // Self-regulation detection
  const selfRegMatches = SELF_REGULATION_INDICATORS.filter(ind =>
    normalizedText.includes(ind)
  );

  // Perspective-taking detection
  const perspectiveMatches = PERSPECTIVE_TAKING_INDICATORS.filter(ind =>
    normalizedText.includes(ind)
  );

  // Reflective statement detection (questions about own behavior/thinking)
  const reflectivePatterns = [
    /i (wonder|think|believe|feel) (if|that|about)/i,
    /maybe i (should|could|might)/i,
    /i need to (think|consider|reflect)/i,
    /what if i/i,
    /looking back/i
  ];
  const reflectiveMatches = reflectivePatterns
    .filter(pattern => pattern.test(text))
    .map(p => p.source);

  // Defensive pattern detection
  const defensiveMatches = DEFENSIVE_PATTERNS.filter(ind =>
    normalizedText.includes(ind.replace(/['']/g, "'"))
  );

  // Escalation detection
  const escalationMatches = ESCALATION_INDICATORS.filter(ind =>
    normalizedText.includes(ind.replace(/['']/g, "'"))
  );

  // Calculate escalation level (0-10)
  let escalationLevel = 0;
  if (escalationMatches.length > 0) escalationLevel += 3;
  if (defensiveMatches.length > 1) escalationLevel += 2;
  if (text.includes('!')) escalationLevel += 1;
  if (/[A-Z]{3,}/.test(text)) escalationLevel += 2; // CAPS detection
  escalationLevel = Math.min(10, escalationLevel);

  return {
    empathy: {
      detected: empathyMatches.length > 0,
      indicators: empathyMatches
    },
    selfRegulation: {
      detected: selfRegMatches.length > 0,
      indicators: selfRegMatches
    },
    perspectiveTaking: {
      detected: perspectiveMatches.length > 0,
      indicators: perspectiveMatches
    },
    reflectiveStatement: {
      detected: reflectiveMatches.length > 0,
      indicators: reflectiveMatches
    },
    escalationPattern: {
      detected: escalationMatches.length > 0 || defensiveMatches.length > 1,
      level: escalationLevel,
      indicators: [...escalationMatches, ...defensiveMatches]
    }
  };
}
