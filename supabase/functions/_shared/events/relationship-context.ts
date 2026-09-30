// OWNERSHIP: engineering. Company context and attendee relationship profile analysis.
// Reference: "A–J Event Classification: Final Design" (§5, §9, §13).
//
// This module provides:
// 1. Company Context Profile: what the user's company does, target customers, partners, domains.
// 2. Domain Categorisation: public domain patterns (education, government, health, personal).
// 3. Attendee Relationship Resolution: splitting attendees into sides, identifying direction
//    (user_selling, user_buying, reporting_up, on_stage, peer), and relationship role.

export interface CompanyContextProfile {
  companyName: string;
  primaryDomain: string;
  associatedDomains: string[];
  targetSectors: string[]; // e.g. ["schools", "education", "b2b_saas", "enterprise"]
  isSellingTo: string[];   // e.g. ["schools", "corporates"]
  partners: string[];
  investors: string[];
}

export type DomainType =
  | "education"    // .sch.uk, .ac.uk, .edu
  | "government"   // .gov, .gov.uk, .mil
  | "health"       // .nhs.uk, .hospital, health
  | "personal"     // gmail, hotmail, icloud, etc.
  | "corporate"    // standard company domain
  | "unknown";

export type RelationshipDirection =
  | "user_selling"
  | "user_buying"
  | "reporting_up"
  | "reporting_down"
  | "on_stage"
  | "peer"
  | "personal";

export interface AttendeeSideSummary {
  hasUserDomain: boolean;
  hasOutsideDomain: boolean;
  hasPersonalDomain: boolean;
  outsideDomains: string[];
  outsideTypes: DomainType[];
  outsideRoles: string[];
  inferredDirection?: RelationshipDirection | null;
}

const GENERIC_PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com",
  "proton.me", "protonmail.com",
]);

export function identifyDomainType(domain: string | null | undefined): DomainType {
  if (!domain) return "unknown";
  const d = domain.toLowerCase().trim();
  if (GENERIC_PERSONAL_DOMAINS.has(d)) return "personal";
  if (d.endsWith(".sch.uk") || d.endsWith(".ac.uk") || d.endsWith(".edu") || d.includes("school") || d.includes("college") || d.includes("university")) {
    return "education";
  }
  if (d.endsWith(".gov") || d.endsWith(".gov.uk") || d.endsWith(".mil") || d.endsWith(".parliament.uk")) {
    return "government";
  }
  if (d.endsWith(".nhs.uk") || d.includes("hospital") || d.includes("clinic") || d.includes("health")) {
    return "health";
  }
  return "corporate";
}

/**
 * Default company context profile for Mind Module (senior leader B2C / B2B2C).
 * Can be augmented or loaded per user in future loops.
 */
export const DEFAULT_MIND_MODULE_CONTEXT: CompanyContextProfile = {
  companyName: "Mind Module",
  primaryDomain: "mindmodule.me",
  associatedDomains: ["mindmodule.me", "mindmodule.com"],
  targetSectors: ["schools", "education", "corporate_wellness", "executive_coaching"],
  isSellingTo: ["schools", "headteachers", "educators", "executives", "parents"],
  partners: [],
  investors: [],
};

export function analyzeAttendeeSides(
  attendees: Array<{ email?: string | null; domain?: string | null; isSelf?: boolean }>,
  organizer: { email?: string | null; domain?: string | null; isSelf?: boolean } | null | undefined,
  companyContext: CompanyContextProfile = DEFAULT_MIND_MODULE_CONTEXT,
): AttendeeSideSummary {
  const userDomains = new Set([companyContext.primaryDomain, ...companyContext.associatedDomains]);
  let hasUserDomain = false;
  let hasOutsideDomain = false;
  let hasPersonalDomain = false;
  const outsideDomains: string[] = [];
  const outsideTypes: DomainType[] = [];

  const allAttendees = [...attendees];
  if (organizer) allAttendees.push(organizer);

  for (const a of allAttendees) {
    const rawEmail = a.email ?? "";
    const dom = (a.domain ?? (rawEmail.includes("@") ? rawEmail.split("@")[1] : "")).toLowerCase().trim();
    if (!dom) continue;

    if (userDomains.has(dom) || a.isSelf) {
      hasUserDomain = true;
    } else if (GENERIC_PERSONAL_DOMAINS.has(dom)) {
      hasPersonalDomain = true;
      if (!outsideDomains.includes(dom)) outsideDomains.push(dom);
      if (!outsideTypes.includes("personal")) outsideTypes.push("personal");
    } else {
      hasOutsideDomain = true;
      if (!outsideDomains.includes(dom)) outsideDomains.push(dom);
      const domType = identifyDomainType(dom);
      if (!outsideTypes.includes(domType)) outsideTypes.push(domType);
    }
  }

  // Infer direction from outside domain type and company context
  let inferredDirection: RelationshipDirection | null = null;
  if (hasOutsideDomain) {
    const hasEducationOutside = outsideTypes.includes("education");
    if (hasEducationOutside && companyContext.targetSectors.includes("schools")) {
      // Company sells to schools/education, external side is school -> user is selling
      inferredDirection = "user_selling";
    } else {
      inferredDirection = "user_selling"; // Default external engagement
    }
  } else if (!hasOutsideDomain && !hasPersonalDomain && hasUserDomain) {
    inferredDirection = "peer";
  } else if (hasPersonalDomain && !hasOutsideDomain) {
    inferredDirection = "personal";
  }

  return {
    hasUserDomain,
    hasOutsideDomain,
    hasPersonalDomain,
    outsideDomains,
    outsideTypes,
    outsideRoles: [],
    inferredDirection,
  };
}
