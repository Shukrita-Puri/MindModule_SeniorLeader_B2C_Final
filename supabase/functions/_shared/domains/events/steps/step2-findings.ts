// [KIND: step] [LAYER: 1] [TIERS: 0-3] [AUDIENCE: universal]
// Phase 2 Gather Findings across 5 independent evidence families.
// Source: Final Design (§4 Phase 2).

import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import type { Finding } from "../types.ts";
import type { CompanyContextProfile } from "../../relationships/types.ts";
import { RelationshipEngine } from "../../relationships/engine.ts";

export function gatherFindings(input: {
  item: CanonicalCalendarItem;
  userContext?: CompanyContextProfile | null;
  crisisEpisodeActive?: boolean;
}): Finding[] {
  const { item, userContext, crisisEpisodeActive } = input;
  const findings: Finding[] = [];
  const lowerTitle = item.cleanTitle;
  const rawTitle = item.title;
  const desc = (item.descriptionCues.join(" ") + " " + (item.title || "")).toLowerCase();

  // ── Step 2.1: Title & Description (family: text) ───────────────────────

  // Prep vs Meeting check
  const isPrep = /\b(prep|preparation|deck|drafting|reading|briefing pack)\b/i.test(lowerTitle);
  if (isPrep) {
    findings.push({
      type: "intent",
      value: "prepare",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_prep_keyword",
      description: "Preparation or deep work context indicated in title",
    });
  }

  // Two-party pattern check (e.g. "Name1 / Name2", "Name1 x Name2", "Chat with Name")
  const isTwoPartyTitle = /\b([a-z]+)\s*(?:\/|x|\||-)\s*([a-z]+)\b/i.test(rawTitle) || /^chat with\s+[a-z]+/i.test(lowerTitle);
  const isHiringOrInterview = /\b(founding engg|founding engineer|candidate|recruiter|recruitment|interview|for board role|board role|board advisory|cto advisory|intro call)\b/i.test(lowerTitle);

  if (isHiringOrInterview) {
    findings.push({
      type: "topic",
      value: "hiring",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_hiring_candidate",
      description: "Hiring, founding engineer, or advisory recruitment conversation",
    });
  } else if (isTwoPartyTitle && /\b(catch up|catchup|chat|chit chat)\b/i.test(lowerTitle)) {
    findings.push({
      type: "format",
      value: "1:1",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_two_party_1to1",
    });
  }

  // Holiday check
  if (/\b(bank holiday|public holiday|national holiday|observed holiday)\b/i.test(lowerTitle)) {
    findings.push({
      type: "label",
      value: "public_holiday",
      family: "provider",
      strength: "decisive",
      sourceTrust: "provider",
      source: "holiday_calendar",
    });
  }

  // External event / meetup / showcase / pitch competition (F, not B)
  if (/\b(meetup|pitch series|pitch night|pitch competition|demo day|open day|summit|showcase)\b/i.test(lowerTitle)) {
    findings.push({
      type: "format",
      value: "external_event_or_meetup",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_meetup_or_event_series",
    });
  }

  // Product review, discovery, beta feedback, finalisation (E)
  if (/\b(feedback|beta test|beta testing|user research|discovery|finalisation|product review|sprint planning)\b/i.test(lowerTitle)) {
    findings.push({
      type: "intent",
      value: "product_review_or_discovery",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_product_review",
    });
  }

  // VC / Funding keyword
  if (/\b(funding|venture capital|venture|seed round|pre-seed|series a|series b)\b/i.test(lowerTitle)) {
    findings.push({
      type: "topic",
      value: "investor_or_pitch",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_vc_funding",
    });
  }

  if (/\b(forum|mastermind|peer group|peer circle)\b/i.test(lowerTitle)) {
    findings.push({
      type: "format",
      value: "peer_forum",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_format_peer_forum",
    });
  } else if (/\b(panel|keynote|summit|conference|webinar|town hall|all hands)\b/i.test(lowerTitle)) {
    findings.push({
      type: "format",
      value: "public_or_large_group",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_format_conference",
    });
  } else if (/\b(hold|placeholder|block|blocked|focus|time block)\b/i.test(lowerTitle)) {
    findings.push({
      type: "format",
      value: "hold_or_block",
      family: "text",
      strength: "medium",
      sourceTrust: "user",
      source: "title_format_hold",
    });
  }

  // Topic cues
  if (/\b(board|trustee|governance|remco|nomco|audit committee)\b/i.test(lowerTitle)) {
    findings.push({
      type: "topic",
      value: "board",
      family: "text",
      strength: isPrep ? "medium" : "decisive",
      sourceTrust: "user",
      source: "title_topic_board",
    });
  }

  if (/\b(investor|fundraise|fundraising|pitch|venture|term sheet|cap table|series [a-d])\b/i.test(lowerTitle)) {
    findings.push({
      type: "topic",
      value: "investor_or_pitch",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_topic_investor",
    });
  }

  if (/\b(interview|hiring|candidate|debrief|offer call|recruiter)\b/i.test(lowerTitle)) {
    findings.push({
      type: "topic",
      value: "hiring",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_topic_hiring",
    });
  }

  if (/\b(standup|sync|sprint|status|pipeline|weekly ops|ops review|metrics review|engineering catchup|engineering sync|feature sprint)\b/i.test(lowerTitle)) {
    findings.push({
      type: "intent",
      value: "run_or_track_business",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_intent_ops",
    });
  }

  // School discovery / consumer research (E)
  if (/\bschool\b/i.test(lowerTitle) && !/\b(run|pickup|dropoff)\b/i.test(lowerTitle)) {
    findings.push({
      type: "intent",
      value: "product_review_or_discovery",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_school_discovery",
    });
  }

  // Recreation / cinema / meeting friend (H)
  if (/\b(the odyssey|odyssey|cinema|movie|theatre|concert)\b/i.test(lowerTitle) || /^meeting [a-z]+$/i.test(lowerTitle.trim())) {
    findings.push({
      type: "topic",
      value: "personal_or_recovery",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_personal_recreation",
    });
  }

  if (/\b(incident|sev1|sev-1|post-mortem|crisis|outage|breach|litigation|injunction)\b/i.test(lowerTitle)) {
    findings.push({
      type: "intent",
      value: "respond_to_incident",
      family: "text",
      strength: "decisive",
      sourceTrust: "user",
      source: "title_intent_incident",
    });
  }

  if (/\b(birthday|dinner|lunch|breakfast|fast|wellness|workout|gym|physio|dentist|doctor|family)\b/i.test(lowerTitle)) {
    findings.push({
      type: "topic",
      value: "personal_or_recovery",
      family: "text",
      strength: "strong",
      sourceTrust: "user",
      source: "title_topic_personal",
    });
  }

  // Flight numbers and booking cues
  const flightCodeMatch = rawTitle.match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/);
  if (flightCodeMatch) {
    findings.push({
      type: "topic",
      value: "flight_booking",
      family: "text",
      strength: "decisive",
      sourceTrust: "provider",
      source: `flight_code:${flightCodeMatch[0]}`,
      description: "Flight number code matched in title",
    });
  }

  // ── Step 2.2 & 2.3: People & Relationships (families: people, relationship) ─

  const relationshipEngine = new RelationshipEngine();
  const relResult = relationshipEngine.evaluate({
    item,
    userContext,
    traceId: item.provenance.traceId,
  });

  if (relResult.isInternalOnly) {
    findings.push({
      type: "side",
      value: "internal_only",
      family: "people",
      strength: "strong",
      sourceTrust: "domain_pattern",
      source: "attendee_domains",
    });
  } else if (item.attendees.length > 1) {
    findings.push({
      type: "side",
      value: "has_outside_parties",
      family: "people",
      strength: "medium",
      sourceTrust: "domain_pattern",
      source: "attendee_domains",
    });
  }

  for (const rf of relResult.findings) {
    findings.push({
      type: "relationship",
      value: rf.role,
      family: "relationship",
      strength: rf.confidence >= 0.8 ? "strong" : "medium",
      sourceTrust: "company_context",
      source: `relationship_engine:${rf.domain ?? "person"}`,
      description: `${rf.role} (${rf.direction})`,
    });

    if (rf.direction !== "unknown") {
      findings.push({
        type: "direction",
        value: rf.direction,
        family: "relationship",
        strength: rf.confidence >= 0.8 ? "strong" : "medium",
        sourceTrust: "company_context",
        source: `direction:${rf.direction}`,
      });
    }
  }

  // ── Step 2.4: Place (family: place) ────────────────────────────────────

  if (item.meeting.online) {
    findings.push({
      type: "setting",
      value: "online",
      family: "place",
      strength: "strong",
      sourceTrust: "provider",
      source: "meeting_link",
    });
  }

  if (item.location.text) {
    const loc = item.location.text.toLowerCase();
    if (/\b(hotel|airport|terminal|station|flight|gate|lounge)\b/i.test(loc)) {
      findings.push({
        type: "setting",
        value: "travel_venue",
        family: "place",
        strength: "strong",
        sourceTrust: "user",
        source: "location_travel_venue",
      });
    }
  }

  // ── Step 2.5: Time & Calendar Labels (families: time, provider) ────────

  if (item.allDay) {
    findings.push({
      type: "shape",
      value: "all_day",
      family: "time",
      strength: "strong",
      sourceTrust: "provider",
      source: "all_day_flag",
    });
  }

  if (item.eventType === "outOfOffice") {
    findings.push({
      type: "label",
      value: "out_of_office",
      family: "provider",
      strength: "decisive",
      sourceTrust: "provider",
      source: "provider_out_of_office",
    });
  } else if (item.eventType === "focusTime") {
    findings.push({
      type: "label",
      value: "focus_time",
      family: "provider",
      strength: "decisive",
      sourceTrust: "provider",
      source: "provider_focus_time",
    });
  }

  if (crisisEpisodeActive) {
    findings.push({
      type: "label",
      value: "active_crisis_episode",
      family: "memory",
      strength: "strong",
      sourceTrust: "history",
      source: "crisis_engine",
    });
  }

  return findings;
}
