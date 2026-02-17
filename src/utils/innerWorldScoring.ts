// Inner World Scoring Engine v2.0 — 3-Component Model
// Components: Energy Regulation, Focus Recovery, Energy Renewal
// All proprietary scoring logic lives server-side in generate-onboarding-insight.
// This file provides types and lightweight client-side helpers only.

export interface InnerWorldAnswers {
  emotional_awareness_response: string;
  stress_response_response: string;
  recovery_patterns_response: string;
  mental_clarity_response: string;
}

export interface ComponentScoresV2 {
  energyRegulation: number;   // 0-100
  focusRecovery: number;      // 0-100
  energyRenewal: number;      // 0-100
}

export interface InnerWorldProfile {
  baselineScore: number;
  scores: ComponentScoresV2;
  archetype: string;
  archetypeTitle: string;
  archetypeDescription: string;
}

// Component display labels
export const COMPONENT_LABELS: Record<keyof ComponentScoresV2, string> = {
  energyRegulation: 'Recalibration',
  focusRecovery: 'Clarity',
  energyRenewal: 'Renewal',
};
