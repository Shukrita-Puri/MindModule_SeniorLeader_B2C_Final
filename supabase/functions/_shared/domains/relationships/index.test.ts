// [KIND: test] [LAYER: 1] [TIERS: 3] [AUDIENCE: universal]
// Unit tests for Layer 1 Relationships domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { RelationshipEngine } from "./engine.ts";
import type { CompanyContextProfile } from "./types.ts";
import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type { Provenance } from "../../spine/types.ts";

const mockProvenance: Provenance = {
  source: "test_suite",
  version: "1.0.0",
  traceId: "test_rel_trace",
};

function makeMockItem(opts: {
  title: string;
  organizerDomain?: string;
  attendees: Array<{ email: string; isSelf?: boolean }>;
}): CanonicalCalendarItem {
  return {
    schemaVersion: 1,
    userId: "user_test",
    provider: "google",
    externalId: "evt_1",
    seriesId: null,
    originalStartUtc: null,
    identityKey: "test_key",
    title: opts.title,
    cleanTitle: opts.title.toLowerCase(),
    startUtc: "2026-10-23T10:00:00Z",
    endUtc: "2026-10-23T11:00:00Z",
    allDay: false,
    localStartDate: "2026-10-23",
    localEndDate: "2026-10-23",
    timeZone: "UTC",
    status: "confirmed",
    showAs: "busy",
    eventType: "default",
    userReply: "accepted",
    organizer: {
      name: "Organizer",
      email: opts.organizerDomain ? `org@${opts.organizerDomain}` : null,
      domain: opts.organizerDomain ?? null,
      reply: "accepted",
      isSelf: false,
      isOrganizer: true,
      isResource: false,
    },
    attendees: opts.attendees.map((a) => ({
      name: a.email.split("@")[0],
      email: a.email,
      domain: a.email.split("@")[1] ?? null,
      reply: "accepted",
      isSelf: Boolean(a.isSelf),
      isOrganizer: false,
      isResource: false,
    })),
    location: { text: null, address: null, lat: null, lng: null, room: false },
    meeting: { url: null, provider: null, online: false },
    descriptionCues: [],
    categories: [],
    visibility: "default",
    importance: "normal",
    providerCreatedAt: null,
    firstSeenAt: new Date().toISOString(),
    provenance: mockProvenance,
  };
}

Deno.test("Relationships Domain: Scenario RL-04 Internal only meeting", () => {
  const engine = new RelationshipEngine();
  const context: CompanyContextProfile = {
    userId: "user_test",
    userOrgDomain: "mindmodule.me",
    sectorsSoldTo: ["education"],
    partners: [],
    investors: [],
    declaredDomains: ["mindmodule.me"],
  };

  const item = makeMockItem({
    title: "Weekly Product Review",
    organizerDomain: "mindmodule.me",
    attendees: [
      { email: "user@mindmodule.me", isSelf: true },
      { email: "cto@mindmodule.me", isSelf: false },
    ],
  });

  const res = engine.evaluate({ item, userContext: context });
  assertEquals(res.isInternalOnly, true);
  assertEquals(res.hasUserSelling, false);
  assertEquals(res.findings[0].role, "team_member");
  assertEquals(res.findings[0].direction, "peers");
});

Deno.test("Relationships Domain: Scenario RL-01 User sells to schools", () => {
  const engine = new RelationshipEngine();
  const context: CompanyContextProfile = {
    userId: "user_test",
    userOrgDomain: "mindmodule.me",
    sectorsSoldTo: ["education"],
    partners: [],
    investors: [],
    declaredDomains: ["mindmodule.me"],
  };

  const item = makeMockItem({
    title: "Platform Demo for St Pauls",
    organizerDomain: "mindmodule.me",
    attendees: [
      { email: "user@mindmodule.me", isSelf: true },
      { email: "headmaster@stpauls.sch.uk", isSelf: false },
    ],
  });

  const res = engine.evaluate({ item, userContext: context });
  assertEquals(res.hasUserSelling, true);
  const outFinding = res.findings.find((f) => f.domain === "stpauls.sch.uk");
  assertEquals(outFinding?.orgType, "education");
  assertEquals(outFinding?.direction, "user_selling");
  assertEquals(outFinding?.role, "customer");
});

Deno.test("Relationships Domain: Scenario RL-09 Investor in declared investors list", () => {
  const engine = new RelationshipEngine();
  const context: CompanyContextProfile = {
    userId: "user_test",
    userOrgDomain: "mindmodule.me",
    sectorsSoldTo: [],
    partners: [],
    investors: ["sequoiacap.com"],
    declaredDomains: ["mindmodule.me"],
  };

  const item = makeMockItem({
    title: "Quarterly Update",
    attendees: [
      { email: "user@mindmodule.me", isSelf: true },
      { email: "partner@sequoiacap.com", isSelf: false },
    ],
  });

  const res = engine.evaluate({ item, userContext: context });
  assertEquals(res.hasInvestor, true);
  assertEquals(res.hasUserReportingUp, true);
});

Deno.test("Relationships Domain: Scenario RL-13 Blocked deep work with no attendees does not run", () => {
  const engine = new RelationshipEngine();
  const item = makeMockItem({
    title: "Deep work: strategy",
    attendees: [{ email: "user@mindmodule.me", isSelf: true }],
  });

  const res = engine.evaluate({ item });
  assertEquals(res.findings.length, 0, "Engine must not run for self-only blocks with no tags");
});
