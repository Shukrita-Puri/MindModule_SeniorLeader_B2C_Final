// [KIND: step] [LAYER: 1] [TIERS: 3] [AUDIENCE: universal]
// Step RL7: Personal Address Handling.
// Source: Part 2 Layer 1 (Section 3).

import type { RelationshipFinding, RelationshipRole, RelationshipDirection } from "../types.ts";

/**
 * Resolves relationship for personal email addresses.
 * Rule RL7: Personal addresses NEVER imply role alone.
 */
export function resolvePersonalAddressRole(input: {
  email: string;
  title: string;
  isPersonalCategory?: boolean;
}): RelationshipFinding {
  const { email, title, isPersonalCategory } = input;
  const lowerTitle = title.toLowerCase();

  let role: RelationshipRole = "unknown";
  let direction: RelationshipDirection = "personal";
  let confidence = 0.4;
  let source = "personal_address:unresolved";

  if (isPersonalCategory || /\b(birthday|dinner|lunch|coffee|family|drinks|party|school run)\b/i.test(lowerTitle)) {
    role = "friend";
    direction = "personal";
    confidence = 0.65;
    source = "title_cues:personal";
  } else if (/\b(board|investor|advisory|chair)\b/i.test(lowerTitle)) {
    role = "board_member";
    direction = "reporting_up";
    confidence = 0.55;
    source = "title_cues:governance_on_personal_address";
  }

  return {
    domain: email.split("@")[1] ?? "personal",
    email,
    side: "personal",
    role,
    direction,
    orgType: "personal",
    confidence,
    sources: [source],
    isUserReportingUp: direction === "reporting_up",
  };
}
