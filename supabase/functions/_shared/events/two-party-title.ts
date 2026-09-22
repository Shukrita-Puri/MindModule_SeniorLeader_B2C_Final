/**
 * Title-only two-party (1:1) detection.
 *
 * Most invites never contain the token "1:1" — they are titled
 * "Shukrita Puri | Jane", "Rohit and Shukrita", or "catch up with Jane".
 * This module recognises those forms from the TITLE ALONE.
 *
 * Contract:
 * - Attendee counts are NEVER used. People create calendar blocks with no
 *   invitees at all, so an empty attendee list proves nothing. Attendee data
 *   is reserved for relationship characterisation elsewhere.
 * - Duration is not used either.
 * - This is a gap filler: it only runs after every stronger A–H layer has
 *   returned nothing.
 */

/** Social / non-work markers — never a 1:1. */
const SOCIAL_EXCLUSIONS =
  /\b(chit\s*chat|chitchat|drinks?|lunch|brunch|dinner|birthday|party|walk|coffee\s*run|happy\s*hour|wedding|funeral|holiday|vacation)\b/i;

/** Titles that describe a group, a company, a product or a ritual. */
const NON_PERSON_TOKENS = new Set([
  "team", "teams", "all", "hands", "all-hands", "allhands", "town", "hall",
  "board", "committee", "council", "group", "squad", "pod", "crew", "staff",
  "company", "org", "department", "dept", "leadership", "exec", "execs",
  "standup", "stand-up", "scrum", "sprint", "retro", "retrospective",
  "review", "planning", "kickoff", "kick-off", "offsite", "workshop",
  "webinar", "conference", "summit", "interview", "panel", "demo",
  "product", "project", "platform", "roadmap", "budget", "finance",
  "marketing", "sales", "engineering", "design", "ops", "operations",
  "weekly", "monthly", "quarterly", "daily", "biweekly", "call", "meeting",
  "session", "sync", "update", "check-in", "checkin", "hold", "block",
  "focus", "admin", "misc", "tbc", "tbd", "ai", "hr", "it", "qbr",
  "client", "clients", "customer", "customers", "partner", "partners",
  "presentation", "pitch", "prep", "deck", "proposal", "vendor", "supplier",
  "introductions", "intro", "onboarding", "training", "induction",
]);

const CONNECTOR_RE =
  /^\s*(?:catch[-\s]?up|catch\s*up|1[-:\s]?on[-:\s]?1|touch\s*base)\s+(?:with|w\/)\s+(.+)$/i;

const SEPARATOR_RE = /\s*(?:\||\/|<>|<->|&|\band\b|\bx\b|\s-\s)\s*/i;

/**
 * Unambiguous pair separators only — the spaced hyphen is excluded because it
 * is also the common "Topic - Detail" form ("Coca-Cola Client - Presentation").
 * Used by the layer that runs BEFORE the keyword dictionary.
 */
const STRONG_SEPARATOR_RE = /\s*(?:\||<>|<->|&|\bx\b)\s*/i;

/**
 * Generic ritual nouns that trail a two-party title:
 * "Shukrita x Melanie catch up", "Rohit | Jane weekly sync".
 * Stripped (repeatedly) before person detection so the pair is still visible.
 */
const RITUAL_TAIL_RE =
  /\s*[-–—:|,]?\s*(?:catch[-\s]?up|catchup|touch\s*base|sync|check[-\s]?in|checkin|chat|call|meeting|conversation|1[-:\s]?1|1[-:\s]?on[-:\s]?1|weekly|monthly|fortnightly|biweekly|quarterly|daily|update)\s*$/i;

/** Remove trailing generic meeting nouns; returns the bare pair portion. */
export function stripRitualTail(rawTitle: string): string {
  let out = (rawTitle ?? "").trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(RITUAL_TAIL_RE, "").trim();
    if (next === out || !next) break;
    out = next;
  }
  return out;
}

function tokenise(part: string): string[] {
  return part
    .replace(/[()[\]{}""'.,:;]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** A person-like name: one to three alphabetic words, none of them a group noun. */
export function isPersonLikeName(part: string): boolean {
  const raw = (part ?? "").trim();
  if (!raw) return false;
  if (/\d/.test(raw)) return false;
  const words = tokenise(raw);
  if (words.length === 0 || words.length > 3) return false;
  return words.every((w) => {
    if (!/^[A-Za-z][A-Za-z'’-]*$/.test(w)) return false;
    if (w.length < 2) return false;
    return !NON_PERSON_TOKENS.has(w.toLowerCase());
  });
}

/**
 * True when the title alone reads as a two-party meeting.
 * Returns false for anything social, group-shaped or ambiguous.
 */
/** Connector form only: "catch up with Jane", "sync with Jane". */
export function isConnectorTwoPartyTitle(rawTitle: string | null | undefined): boolean {
  const title = (rawTitle ?? "").replace(/^\d{1,2}:\d{2}\s+/, "").trim();
  if (!title) return false;
  if (SOCIAL_EXCLUSIONS.test(title)) return false;
  const connector = title.match(CONNECTOR_RE);
  return connector ? isPersonLikeName(connector[1]) : false;
}

function pairMatches(title: string, sep: RegExp): boolean {
  // Any trailing generic ritual noun is removed first so the pair is visible.
  const core = stripRitualTail(title);
  if (!core || !sep.test(core)) return false;
  const parts = core.split(sep).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return false;
  return parts.every(isPersonLikeName);
}

export function isTwoPartyTitle(rawTitle: string | null | undefined): boolean {
  const title = (rawTitle ?? "").replace(/^\d{1,2}:\d{2}\s+/, "").trim();
  if (!title) return false;
  if (SOCIAL_EXCLUSIONS.test(title)) return false;

  // Connector form: "catch up with Jane", "sync with Jane".
  const connector = title.match(CONNECTOR_RE);
  if (connector) return isPersonLikeName(connector[1]);

  return pairMatches(title, SEPARATOR_RE);
}

/**
 * Named-pair form with an unambiguous separator only ("Shukrita x Melanie
 * catch up", "Rohit | Jane weekly sync"). Safe to run before the keyword
 * dictionary — the looser hyphen/slash forms stay in the late fallback.
 */
export function isStrongTwoPartyTitle(rawTitle: string | null | undefined): boolean {
  const title = (rawTitle ?? "").replace(/^\d{1,2}:\d{2}\s+/, "").trim();
  if (!title) return false;
  if (SOCIAL_EXCLUSIONS.test(title)) return false;
  return pairMatches(title, STRONG_SEPARATOR_RE);
}
