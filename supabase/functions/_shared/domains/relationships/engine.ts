// [KIND: implementation] [LAYER: 1] [TIERS: 3] [AUDIENCE: universal]
// Relationships and Context Engine.
// Source: Part 2 Layer 1 (Section 3), Final Design (§5).

import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type {
  CompanyContextProfile,
  RelationshipEngineResult,
  RelationshipFinding,
  OrganisationType,
} from "./types.ts";
import type { Provenance } from "../../spine/types.ts";
import { analyzeSides } from "./steps/rl2-sides.ts";
import { checkSuffixHint } from "./steps/rl5-org-lookup.ts";
import { resolveDirectionAndRole } from "./steps/rl6-direction.ts";
import { resolvePersonalAddressRole } from "./steps/rl7-personal.ts";

export class RelationshipEngine {
  /**
   * Evaluates relationships for a calendar item.
   * Runs only when item has attendees other than user OR explicit relationship tag (RL1-RL10).
   */
  public evaluate(input: {
    item: CanonicalCalendarItem;
    userContext?: CompanyContextProfile | null;
    userTag?: string | null;
    traceId?: string;
  }): RelationshipEngineResult {
    const { item, userTag, traceId } = input;
    const nowIso = new Date().toISOString();
    const provenance: Provenance = {
      source: "relationships_engine",
      version: "1.0.0",
      traceId: traceId ?? `rel_${Date.now()}`,
      atUtc: nowIso,
    };

    const hasAttendeesOtherThanSelf = item.attendees.some((a: any) => !a.isSelf);
    const hasTag = Boolean(userTag);

    // Guard: only runs when there are other people or an explicit user tag
    if (!hasAttendeesOtherThanSelf && !hasTag) {
      return {
        findings: [],
        isInternalOnly: false,
        hasGovernance: false,
        hasInvestor: false,
        hasPress: false,
        hasUserSelling: false,
        hasUserReportingUp: false,
        provenance,
      };
    }

    const context: CompanyContextProfile = input.userContext ?? {
      userId: item.userId,
      userOrgDomain: item.organizer?.domain ?? null,
      sectorsSoldTo: [],
      partners: [],
      investors: [],
      declaredDomains: [],
    };

    const sides = analyzeSides(item, context);
    const findings: RelationshipFinding[] = [];

    // Internal only meeting
    if (sides.isInternalOnly) {
      findings.push({
        domain: context.userOrgDomain,
        side: "user_side",
        role: "team_member",
        direction: "peers",
        orgType: "company",
        confidence: 0.9,
        sources: ["internal_domains_only"],
        isUserReportingUp: false,
      });

      return {
        findings,
        isInternalOnly: true,
        hasGovernance: false,
        hasInvestor: false,
        hasPress: false,
        hasUserSelling: false,
        hasUserReportingUp: false,
        provenance,
      };
    }

    // Outside organizations
    for (const [domain, emails] of sides.outsideDomains.entries()) {
      let orgType: OrganisationType = "company";
      const sources: string[] = [];

      const suffixHint = checkSuffixHint(domain);
      if (suffixHint) {
        orgType = suffixHint.orgType;
        sources.push(suffixHint.source);
      }

      const res = resolveDirectionAndRole({
        domain,
        orgType,
        userContext: context,
        title: item.title,
        isOrganiser: item.organizer?.domain?.toLowerCase() === domain,
      });

      sources.push(res.reason);

      findings.push({
        domain,
        side: "outside_org",
        role: res.role,
        direction: res.direction,
        orgType,
        confidence: res.confidence,
        sources,
        isUserReportingUp: res.direction === "reporting_up",
      });
    }

    // Personal email addresses
    for (const email of sides.personalEmails) {
      const pFinding = resolvePersonalAddressRole({
        email,
        title: item.title,
      });
      findings.push(pFinding);
    }

    const hasGovernance = findings.some(
      (f) => f.role === "board_chair" || f.role === "board_member" || f.role === "investor",
    );
    const hasInvestor = findings.some((f) => f.role === "investor");
    const hasPress = findings.some((f) => f.role === "press");
    const hasUserSelling = findings.some((f) => f.direction === "user_selling");
    const hasUserReportingUp = findings.some((f) => f.direction === "reporting_up");

    return {
      findings,
      isInternalOnly: sides.isInternalOnly,
      hasGovernance,
      hasInvestor,
      hasPress,
      hasUserSelling,
      hasUserReportingUp,
      provenance,
    };
  }
}
