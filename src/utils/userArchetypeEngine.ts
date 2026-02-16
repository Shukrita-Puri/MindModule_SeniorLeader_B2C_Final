// User Archetype Engine v2.0 — Thin wrapper using unified archetype system
// Legacy file kept for backward compatibility with imports

import { resolveArchetypeId, getArchetypeDisplay, ARCHETYPES } from './innerWorldArchetypes';

export interface UserArchetype {
  id: string;
  title: string;
  description: string;
  percentile: string;
  unlockStatement: string;
  strengthArea: string;
  growthArea: string;
  recommendedMastery: 'Pause' | 'Flow' | 'Renewal';
}

export interface ComponentScores {
  q2_energy_regulation: number;
  q3_focus_recovery: number;
  q4_energy_renewal: number;
  q5_growth_priority: number;
}

/**
 * @deprecated Use resolveArchetypeId + getArchetypeDisplay from innerWorldArchetypes instead
 */
export function determineArchetype(scores: ComponentScores): UserArchetype {
  // Map legacy component scores to v2 format for archetype resolution
  const er = scores.q2_energy_regulation;
  const fr = scores.q3_focus_recovery;
  const en = scores.q4_energy_renewal;

  let archetypeId = 'adaptive-navigator';
  if (er >= 65 && en >= 55) archetypeId = 'grounded-leader';
  else if (en >= 65 && er >= 50) archetypeId = 'resilient-performer';
  else if (fr >= 65 && er >= 45) archetypeId = 'clear-thinker';
  else if (er >= 60 && fr < 50) archetypeId = 'intensity-driver';

  const info = getArchetypeDisplay(archetypeId);

  return {
    id: archetypeId,
    title: info.title,
    description: info.description,
    percentile: '',
    unlockStatement: '',
    strengthArea: '',
    growthArea: '',
    recommendedMastery: 'Pause',
  };
}

export function getArchetypeInsights(_archetype: UserArchetype, _scores: ComponentScores) {
  return {
    patternRevealation: [],
    developmentFocus: '',
    expectedOutcomes: [],
    timeline: '',
  };
}

export function getLowestComponent(scores: ComponentScores) {
  const components = [
    { key: 'q2_energy_regulation', score: scores.q2_energy_regulation, label: 'Energy Regulation' },
    { key: 'q3_focus_recovery', score: scores.q3_focus_recovery, label: 'Focus Recovery' },
    { key: 'q4_energy_renewal', score: scores.q4_energy_renewal, label: 'Energy Renewal' },
  ];
  const lowest = components.reduce((a, b) => a.score < b.score ? a : b);
  return { component: lowest.key, score: lowest.score, label: lowest.label };
}
