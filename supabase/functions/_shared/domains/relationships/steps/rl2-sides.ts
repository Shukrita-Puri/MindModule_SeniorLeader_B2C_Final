// [KIND: step] [LAYER: 1] [TIERS: 3] [AUDIENCE: universal]
// Step RL2: Attendee Sides of the Table Analysis.
// Source: Part 2 Layer 1 (Section 3).

import type { CanonicalCalendarItem, AttendeeSignal } from "../../calendar/types.ts";
import type { SideAnalysis, CompanyContextProfile } from "../types.ts";
import { PERSONAL_EMAIL_DOMAINS } from "../constants.ts";

/**
 * Splits calendar event attendees into functional sides of the table.
 */
export function analyzeSides(
  item: CanonicalCalendarItem,
  userContext: CompanyContextProfile,
): SideAnalysis {
  const userDomains = new Set<string>();
  if (userContext.userOrgDomain) {
    userDomains.add(userContext.userOrgDomain.toLowerCase().trim());
  }
  for (const d of userContext.declaredDomains) {
    if (d) userDomains.add(d.toLowerCase().trim());
  }

  const outsideDomains = new Map<string, string[]>();
  const personalEmails: string[] = [];

  const sendingDomain = item.organizer?.domain ? item.organizer.domain.toLowerCase().trim() : null;

  for (const att of item.attendees) {
    const email = att.email ? att.email.toLowerCase().trim() : null;
    const domain = att.domain ? att.domain.toLowerCase().trim() : (email ? email.split("@")[1] : null);

    if (att.isSelf && domain) {
      userDomains.add(domain);
      continue;
    }

    if (!domain) continue;

    if (PERSONAL_EMAIL_DOMAINS.has(domain)) {
      if (email) personalEmails.push(email);
    } else if (userDomains.has(domain)) {
      // Internal colleague on user's own domain
    } else {
      // Outside organisation domain
      const existing = outsideDomains.get(domain) ?? [];
      if (email && !existing.includes(email)) existing.push(email);
      outsideDomains.set(domain, existing);
    }
  }

  const hasOutsideOrganizations = outsideDomains.size > 0;
  const isInternalOnly = !hasOutsideOrganizations && personalEmails.length === 0;

  return {
    userSideDomains: userDomains,
    outsideDomains,
    personalEmails,
    sendingDomain,
    isInternalOnly,
    hasOutsideOrganizations,
  };
}
