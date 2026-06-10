// OWNERSHIP: engineering. Pure regex helpers used by classify-event-v2 Layer 4
// to detect travel-shaped titles without depending on event location data.
// No DB reads, no taxonomy reads. Cheap.

// Flight numbers: BA245, BA 245, UA1234, AF 12 — 2 letter carrier + 2-4 digits.
// Anchored on word boundaries to avoid matching "ID12345".
export const FLIGHT_NUMBER_PATTERN = /\b[A-Z]{2}\s?\d{2,4}\b/;

// Route codes: LHR-JFK, SFO–HKG, JFK>LHR — two 3-letter airport codes joined
// by hyphen / en-dash / arrow. Case-sensitive on purpose (all-caps signal).
export const ROUTE_CODE_PATTERN = /\b[A-Z]{3}\s?[-–>]\s?[A-Z]{3}\b/;

// "Fly to NYC", "Travel to Berlin", "Visit Tokyo office" — directional cues.
export const TRAVEL_VERB_PATTERN = /\b(fly|flight|flying|travel|travelling|traveling|drive|driving|visit|visiting|trip)\s+(to|from)\s+[A-Z]/;

// Generic travel-leaning tokens used only when paired with an out-of-home
// travel_state. Substring match, case-insensitive.
const TRAVEL_LEAN_TOKENS = [
  'flight','airport','boarding','departure','arrival','layover','transit',
  'hotel','check-in','check in','uber','taxi','train','rail','platform',
  'lounge','gate','terminal','rental car','car hire',
];

export interface TravelDetectionResult {
  matched: boolean;
  reason: 'flight_number' | 'route_code' | 'travel_verb' | 'travel_state_token' | null;
}

/**
 * Detects travel intent from a calendar event title plus optional travel_state.
 * Pure function — no IO, no taxonomy dependencies.
 */
export function detectTravelFromTitle(
  title: string | null | undefined,
  travelState?: 'home' | 'travelling' | 'arriving' | 'returning',
): TravelDetectionResult {
  if (!title) return { matched: false, reason: null };
  const t = title.trim();
  if (FLIGHT_NUMBER_PATTERN.test(t)) return { matched: true, reason: 'flight_number' };
  if (ROUTE_CODE_PATTERN.test(t)) return { matched: true, reason: 'route_code' };
  if (TRAVEL_VERB_PATTERN.test(t)) return { matched: true, reason: 'travel_verb' };

  if (travelState && travelState !== 'home') {
    const lower = t.toLowerCase();
    if (TRAVEL_LEAN_TOKENS.some((tok) => lower.includes(tok))) {
      return { matched: true, reason: 'travel_state_token' };
    }
  }
  return { matched: false, reason: null };
}

/**
 * Pulls bare 3-letter airport codes (e.g. "LHR", "JFK") from a title. Used by
 * Layer 5 acronym matching as the corroboration gate: a bare 3-letter all-caps
 * token only counts as travel when another travel cue is present.
 */
export function extractBareAirportCodes(title: string | null | undefined): string[] {
  if (!title) return [];
  const matches = title.match(/\b[A-Z]{3}\b/g);
  return matches ?? [];
}