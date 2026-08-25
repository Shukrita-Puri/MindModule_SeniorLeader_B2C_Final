/**
 * Plan eligibility SSOT (server mirror of src/data/contentSurfacing.ts).
 *
 * A practice may only be selected by the Mastery Plan / JIT carousel when the
 * shipped frontend actually surfaces it to the user. Rows can stay
 * `is_active = true` in `sanctuary_content` for future features, but without a
 * frontend home they are legacy for plan purposes and must never be selected.
 *
 * Exception: plan-native items (e.g. the evening reflection / tiny-win slot)
 * are not content rows and never pass through this filter.
 */
export const SURFACED_CONTENT_IDS: readonly string[] = [
  "energised-focus-didgeridoo-bowls",
  "warrior-drums",
  "basque-txalaparta",
  "harmonic-calm",
  "deep-calm-forest-bathing",
  "vagus-wind-down",
  "deep-focus-monastic-resonance",
  "sustained-focus-choir-harmonic",
  "ina-night-fields",
  "spartan-battle-breath",
  "box-breathing",
  "bhramari-pranayama",
  "trataka-flame-gaze",
  "stoic-reflection",
  "energy-forge",
  "fudoshin-immovable-mind",
  "eye-of-storm",
  "presence-grounding-new",
  "release-exhale-new",
  "stillness-gap-new",
  "detachment-observer-new",
  "softness-release-new",
  "wu-wei-flow",
  "mushin-no-mind",
  "jobs-simplicity",
  "ikigai-purpose",
  "buddhist-phoenix",
  "energy-through-reframe",
  "courage-future-self",
  "confidence-through-evidence",
  "energy-through-completion",
  "courage-arena",
  "single-thread-focus",
  "first-move-momentum",
  "depth-subtraction",
  "eternal-now-presence",
  "rhythm-pulse",
  "mastery-constraint",
];

const SURFACED = new Set(SURFACED_CONTENT_IDS);

export const isSurfacedContent = (id: string | null | undefined): boolean =>
  !!id && SURFACED.has(id);

/** Filter a fetched content library down to plan-eligible rows. */
export function filterSurfaced<T extends { id: string }>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter((r) => SURFACED.has(r.id));
}
