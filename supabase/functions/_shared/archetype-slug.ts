// Canonical archetype slug resolver.
//
// `profiles.user_archetype` historically held one of nine canonical slugs
// (written by the legacy assessment onboarding). The v8 CoS synthesis writes a
// free-text LLM name instead (e.g. "The Architect-Commander"), which never
// matches the archetype x tier matrix in compute-outer-readiness, silently
// dropping every v8 user to the tier-only fallback.
//
// This module is the single source of truth for the nine slugs and maps any
// raw value (canonical slug, legacy underscore id, or free-text CoS name) onto
// a canonical slug. Returns null when nothing matches — callers must then use
// their tier fallback and label it TIER, not ARCHETYPE.

export const CANONICAL_ARCHETYPES = [
  "grounded-leader",
  "resilient-performer",
  "clear-thinker",
  "intensity-driver",
  "adaptive-navigator",
  "natural-regulator",
  "high-octane-performer",
  "strategic-pauser",
  "awareness-builder",
] as const;

export type CanonicalArchetype = (typeof CANONICAL_ARCHETYPES)[number];

const CANONICAL_SET = new Set<string>(CANONICAL_ARCHETYPES);

// Keyword → canonical slug. Order matters: the first keyword found in the
// normalised text wins, so more specific keywords are listed first.
const KEYWORD_MAP: Array<[string, CanonicalArchetype]> = [
  // strategic-pauser
  ["architect", "strategic-pauser"],
  ["strategist", "strategic-pauser"],
  ["strategic", "strategic-pauser"],
  ["planner", "strategic-pauser"],
  ["pauser", "strategic-pauser"],
  ["chess", "strategic-pauser"],
  // intensity-driver
  ["commander", "intensity-driver"],
  ["driver", "intensity-driver"],
  ["operator", "intensity-driver"],
  ["closer", "intensity-driver"],
  ["intensity", "intensity-driver"],
  ["forceful", "intensity-driver"],
  // high-octane-performer
  ["sprinter", "high-octane-performer"],
  ["high-octane", "high-octane-performer"],
  ["high octane", "high-octane-performer"],
  ["high-output", "high-octane-performer"],
  ["high output", "high-octane-performer"],
  ["accelerator", "high-octane-performer"],
  // resilient-performer
  ["athlete", "resilient-performer"],
  ["resilient", "resilient-performer"],
  ["performer", "resilient-performer"],
  ["endurance", "resilient-performer"],
  ["marathon", "resilient-performer"],
  // adaptive-navigator
  ["juggler", "adaptive-navigator"],
  ["navigator", "adaptive-navigator"],
  ["adaptive", "adaptive-navigator"],
  ["improviser", "adaptive-navigator"],
  ["orchestrator", "adaptive-navigator"],
  ["conductor", "adaptive-navigator"],
  // clear-thinker
  ["analyst", "clear-thinker"],
  ["thinker", "clear-thinker"],
  ["scientist", "clear-thinker"],
  ["synthesiser", "clear-thinker"],
  ["synthesizer", "clear-thinker"],
  ["clarity", "clear-thinker"],
  // grounded-leader
  ["steward", "grounded-leader"],
  ["anchor", "grounded-leader"],
  ["grounded", "grounded-leader"],
  ["stabiliser", "grounded-leader"],
  ["stabilizer", "grounded-leader"],
  ["guardian", "grounded-leader"],
  ["custodian", "grounded-leader"],
  // natural-regulator
  ["regulator", "natural-regulator"],
  ["steady", "natural-regulator"],
  ["metronome", "natural-regulator"],
  ["pacer", "natural-regulator"],
  // awareness-builder
  ["learner", "awareness-builder"],
  ["builder", "awareness-builder"],
  ["explorer", "awareness-builder"],
  ["apprentice", "awareness-builder"],
  ["observer", "awareness-builder"],
];

function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")          // drop "(Provisional)" etc.
    .replace(/\b(provisional|the|a|an)\b/g, " ")
    .replace(/[_/]+/g, "-")
    .replace(/[^a-z0-9\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveArchetypeSlug(
  raw: string | null | undefined,
): CanonicalArchetype | null {
  if (!raw || typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (CANONICAL_SET.has(trimmed)) return trimmed as CanonicalArchetype;

  const text = normalise(trimmed);
  if (!text) return null;

  // Legacy underscore ids ("natural_regulator") normalise to the slug form.
  const hyphenated = text.replace(/ /g, "-");
  if (CANONICAL_SET.has(hyphenated)) return hyphenated as CanonicalArchetype;

  for (const [keyword, slug] of KEYWORD_MAP) {
    if (text.includes(keyword)) return slug;
  }
  return null;
}

export function isCanonicalArchetype(raw: string | null | undefined): boolean {
  return !!raw && CANONICAL_SET.has(raw.trim());
}
