// Inner World Archetypes v2.0 — Unified archetype system
// All assignment logic lives server-side. This file provides display metadata only.

export interface ArchetypeInfo {
  id: string;
  title: string;
  description: string;
}

export const ARCHETYPES: Record<string, ArchetypeInfo> = {
  'grounded-leader': {
    id: 'grounded-leader',
    title: 'The Grounded Master',
    description: 'You lead from stillness. Stability under pressure is your signature.',
  },
  'resilient-performer': {
    id: 'resilient-performer',
    title: 'The Resilient Performer',
    description: 'You absorb impact and recover fast. Endurance under sustained demand is your edge.',
  },
  'clear-thinker': {
    id: 'clear-thinker',
    title: 'The Clear Thinker',
    description: 'You cut through complexity with precision. Clarity under cognitive load is your advantage.',
  },
  'intensity-driver': {
    id: 'intensity-driver',
    title: 'The Intensity Driver',
    description: 'You channel directed force into every challenge. Controlled intensity is your operating mode.',
  },
  'adaptive-navigator': {
    id: 'adaptive-navigator',
    title: 'The Adaptive Navigator',
    description: 'You read the field and adjust in real time. Strategic flexibility is your strength.',
  },
};

// Legacy ID mappings for backward compatibility
export const LEGACY_ARCHETYPE_MAP: Record<string, string> = {
  'natural_regulator': 'grounded-leader',
  'strategic_pauser': 'clear-thinker',
  'high_octane_performer': 'resilient-performer',
  'awareness_builder': 'intensity-driver',
  'grounded_master': 'grounded-leader',
  'balanced_navigator': 'adaptive-navigator',
  'aware_leader': 'grounded-leader',
  'resilient_performer': 'resilient-performer',
  'clear_thinker': 'clear-thinker',
  'intensity_driver': 'intensity-driver',
  'growth_ready': 'adaptive-navigator',
  'foundation_builder': 'adaptive-navigator',
};

export function resolveArchetypeId(rawId: string | null | undefined): string {
  if (!rawId) return 'adaptive-navigator';
  if (ARCHETYPES[rawId]) return rawId;
  return LEGACY_ARCHETYPE_MAP[rawId] || 'adaptive-navigator';
}

export function getArchetypeDisplay(rawId: string | null | undefined): ArchetypeInfo {
  const resolved = resolveArchetypeId(rawId);
  return ARCHETYPES[resolved] || ARCHETYPES['adaptive-navigator'];
}

// Practice priority tag display labels
export const PRACTICE_PRIORITY_LABELS: Record<string, string> = {
  'regulation_composure': 'composure under pressure',
  'regulation_early': 'early stress regulation',
  'recovery_resilience': 'setback recovery',
  'energy_endurance': 'sustained energy',
  'focus_clarity': 'mental clarity and focus',
  'mindset_reframe': 'pattern reframing',
};
