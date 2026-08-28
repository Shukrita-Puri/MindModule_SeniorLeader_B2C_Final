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
]);

const CONNECTOR_RE =
  /^\s*(?:catch[-\s]?up|catch\s*up|1[-:\s]?on[-:\s]?1|touch\s*base)\s+(?:with|w\/)\s+(.+)$/i;

const SEPARATOR_RE = /\s*(?:\||\/|<>|<->|&|\band\b|\s-\s)\s*/i;

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

export function isTwoPartyTitle(rawTitle: string | null | undefined): boolean {
  const title = (rawTitle ?? "").replace(/^\d{1,2}:\d{2}\s+/, "").trim();
  if (!title) return false;
  if (SOCIAL_EXCLUSIONS.test(title)) return false;

  // Connector form: "catch up with Jane", "sync with Jane".
  const connector = title.match(CONNECTOR_RE);
  if (connector) return isPersonLikeName(connector[1]);

  // Separator / conjunction form: "A | B", "A / B", "A <> B", "A and B".
  if (!SEPARATOR_RE.test(title)) return false;
  const parts = title.split(SEPARATOR_RE).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return false;
  return parts.every(isPersonLikeName);
}
