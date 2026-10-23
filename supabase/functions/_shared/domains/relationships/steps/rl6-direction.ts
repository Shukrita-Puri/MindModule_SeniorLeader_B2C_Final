// [KIND: step] [LAYER: 1] [TIERS: 3] [AUDIENCE: universal]
// Step RL6: Direction and Role Resolution.
// Source: Part 2 Layer 1 (Section 3).

import type {
  RelationshipDirection,
  RelationshipRole,
  OrganisationType,
  CompanyContextProfile,
} from "../types.ts";

export interface DirectionAndRole {
  direction: RelationshipDirection;
  role: RelationshipRole;
  confidence: number;
  reason: string;
}

/**
 * Resolves commercial/functional direction by comparing outside organisation with user context.
 */
export function resolveDirectionAndRole(input: {
  domain: string;
  orgType: OrganisationType;
  userContext: CompanyContextProfile;
  title?: string | null;
  isOrganiser?: boolean;
}): DirectionAndRole {
  const { domain, orgType, userContext, title, isOrganiser } = input;
  const cleanDomain = domain.toLowerCase().trim();

  // 1. User investors list
  if (userContext.investors.some((inv) => cleanDomain.includes(inv.toLowerCase()))) {
    return {
      direction: "reporting_up",
      role: "investor",
      confidence: 0.9,
      reason: `Domain ${cleanDomain} matches declared company investor`,
    };
  }

  // 2. User partners list
  if (userContext.partners.some((p) => cleanDomain.includes(p.toLowerCase()))) {
    return {
      direction: "external_collaboration",
      role: "vendor_partner",
      confidence: 0.85,
      reason: `Domain ${cleanDomain} matches declared strategic partner`,
    };
  }

  // 3. User sales target sectors (e.g. user sells to schools/education, hospitals/health, government)
  const isTargetSector = userContext.sectorsSoldTo.some((sector) => {
    const s = sector.toLowerCase();
    return (
      (orgType === "education" && (s.includes("education") || s.includes("school") || s.includes("university"))) ||
      (orgType === "government" && (s.includes("government") || s.includes("public_sector"))) ||
      (orgType === "health" && (s.includes("health") || s.includes("hospital") || s.includes("clinical")))
    );
  });

  if (isTargetSector) {
    return {
      direction: "user_selling",
      role: "customer",
      confidence: 0.8,
      reason: `Organisation type ${orgType} matches user target sales sectors`,
    };
  }

  // 4. Media organisation
  if (orgType === "media") {
    return {
      direction: "on_stage",
      role: "press",
      confidence: 0.75,
      reason: "Domain identified as news/media organisation",
    };
  }

  // 5. Default fallback: unknown stays unknown
  return {
    direction: "unknown",
    role: "unknown",
    confidence: 0.3,
    reason: "No context match; direction and role remain unknown",
  };
}
