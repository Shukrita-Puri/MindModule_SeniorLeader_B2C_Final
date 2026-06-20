// JIT v2 — relationship resolver weights. Lives inside Immediate (§1 of
// the v2 plan): identity in the room structurally changes how important
// an event is to a CEO. User tag is sovereign; Gemini/domain fills gaps;
// `unknown` is no-penalty.

import { RELATIONSHIP_TAXONOMY, type RelationshipRole } from "./relationship-taxonomy.ts";

export type ResolvedRole =
  RelationshipRole | "boss" | "report";

export const RELATIONSHIP_WEIGHT: Record<ResolvedRole, number> = {
  ...Object.fromEntries(Object.entries(RELATIONSHIP_TAXONOMY).map(([k, v]) => [k, v.weight])),
  boss: 25,
  report: 5,
};

/**
 * Provenance of a resolved relationship. Drives the confidence multiplier
 * applied to RELATIONSHIP_WEIGHT inside `relationshipWeight`.
 *  - `user_tag`        — sovereign, full weight, no decay
 *  - `memory_user_tag` — replayed from a prior `tag_relationship` row
 *  - `llm`             — Gemini resolver
 *  - `domain_heuristic`— directional fallback while LLM is async
 */
export type RoleSource = 'user_tag' | 'memory_user_tag' | 'llm' | 'domain_heuristic';

export interface AttendeeRoleSignal {
  role: ResolvedRole;
  source: RoleSource;
  /** 0..1 from LLM; null when source is user_tag/memory_user_tag (treated as 1). */
  confidence: number | null;
}

/** Confidence → multiplier table. user_tag / memory_user_tag bypass this. */
function confidenceMultiplier(confidence: number | null | undefined): number {
  if (confidence == null) return 0.3;        // unknown confidence → nudge only
  if (confidence >= 0.75) return 1.0;
  if (confidence >= 0.5)  return 0.6;
  return 0.3;
}

/**
 * Confidence- and source-aware relationship weight.
 * Back-compat: called with only `(role)` returns the unscaled base weight,
 * preserving legacy callers and the existing test suite.
 */
export function relationshipWeight(
  role: ResolvedRole,
  confidence?: number | null,
  source?: RoleSource,
): number {
  const base = RELATIONSHIP_WEIGHT[role] ?? 0;
  if (confidence === undefined && source === undefined) return base;
  if (source === 'user_tag' || source === 'memory_user_tag') return base;
  return Math.round(base * confidenceMultiplier(confidence));
}

/** Legacy — highest base-weight role wins. Kept for callers without source/confidence. */
export function dominantRole(roles: ResolvedRole[]): ResolvedRole {
  let best: ResolvedRole = 'unknown';
  let bestW = -1;
  for (const r of roles) {
    const w = RELATIONSHIP_WEIGHT[r] ?? 0;
    if (w > bestW) { bestW = w; best = r; }
  }
  return best;
}

/**
 * Pick the strongest signal across multiple attendees using the
 * confidence-aware weight (a high-confidence Boss beats a domain-heuristic
 * peer even though both score > 0).
 */
export function weightedDominantRole(
  signals: AttendeeRoleSignal[],
): { signal: AttendeeRoleSignal; weight: number } {
  let best: AttendeeRoleSignal = { role: 'unknown', source: 'llm', confidence: null };
  let bestW = -1;
  for (const s of signals) {
    const w = relationshipWeight(s.role, s.confidence, s.source);
    if (w > bestW) { bestW = w; best = s; }
  }
  return { signal: best, weight: Math.max(0, bestW) };
}

/** Domains we never send to the LLM/LinkedIn resolver. */
export const GENERIC_EMAIL_DOMAINS = new Set<string>([
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.co.uk',
  'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'proton.me', 'protonmail.com',
]);

export function isGenericDomain(email: string | null | undefined): boolean {
  if (!email) return true;
  const at = email.lastIndexOf('@');
  if (at < 0) return true;
  return GENERIC_EMAIL_DOMAINS.has(email.slice(at + 1).toLowerCase().trim());
}

function domainOf(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).toLowerCase().trim();
}

/**
 * Domain-based heuristic — used ONLY when the LLM resolver hasn't returned
 * yet. Returns `unknown` (zero contribution) for generic domains so we
 * never demote on absence of signal.
 *
 *  - same domain as the user → `peer` (internal, conf 0.5)
 *  - different real work domain → `external_partner` (conf 0.4)
 *  - generic/unknown domain → `unknown`
 */
export function inferRoleFromDomain(
  attendeeEmail: string,
  userOwnDomain: string | null | undefined,
): AttendeeRoleSignal {
  const d = domainOf(attendeeEmail);
  if (!d || GENERIC_EMAIL_DOMAINS.has(d)) {
    return { role: 'unknown', source: 'domain_heuristic', confidence: null };
  }
  const own = (userOwnDomain ?? '').toLowerCase().trim();
  if (own && d === own) {
    return { role: 'peer', source: 'domain_heuristic', confidence: 0.5 };
  }
  return { role: 'external_partner', source: 'domain_heuristic', confidence: 0.4 };
}
