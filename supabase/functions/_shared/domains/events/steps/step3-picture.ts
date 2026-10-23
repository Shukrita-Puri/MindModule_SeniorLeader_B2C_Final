// [KIND: step] [LAYER: 1] [TIERS: 0-3] [AUDIENCE: universal]
// Phase 3 Build the Picture: Signature Matching, Cross-checks, and Confidence.
// Source: Final Design (§4 Phase 3, §6, §7), Part 2 Layer 1 (Section 1).

import type { CategoryLetter } from "../../../spine/categories.ts";
import type { SubtypeId } from "../../../spine/subtypes.ts";
import type {
  Finding,
  EvidenceFamily,
  ItemDimensions,
  ConfirmationState,
  DecisionSource,
} from "../types.ts";
import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import {
  SHARED_STAKES_ORDER,
  CONFIDENCE_HIGH_THRESHOLD,
  CONFIDENCE_MEDIUM_THRESHOLD,
} from "../constants.ts";
import { CANONICAL_CATEGORIES } from "../../../spine/categories.ts";

export interface PictureResult {
  category: CategoryLetter;
  subtype: SubtypeId | null;
  bestCandidateSubtype: SubtypeId | null;
  categoryConfidence: number;
  subtypeConfidence: number;
  confirmationState: ConfirmationState;
  decisionSource: DecisionSource;
  runnerUp: { category: CategoryLetter | null; subtype: SubtypeId | null; score: number } | null;
  reasons: string[];
  dimensions: ItemDimensions;
}

export function buildPicture(input: {
  item: CanonicalCalendarItem;
  findings: Finding[];
  isPrep?: boolean;
}): PictureResult {
  const { item, findings } = input;
  const reasons: string[] = [];

  // ── 1. Category Score Buckets ──────────────────────────────────────────
  const scores: Record<CategoryLetter, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
    F: 0,
    G: 0,
    H: 0,
    I: 0,
    J: 0,
  };

  const familySupport: Record<CategoryLetter, Set<EvidenceFamily>> = {
    A: new Set(),
    B: new Set(),
    C: new Set(),
    D: new Set(),
    E: new Set(),
    F: new Set(),
    G: new Set(),
    H: new Set(),
    I: new Set(),
    J: new Set(),
  };

  // Tally evidence
  for (const f of findings) {
    const weight = f.strength === "decisive" ? 25 : f.strength === "strong" ? 15 : f.strength === "medium" ? 8 : 4;

    if (f.type === "topic" && f.value === "board") {
      const isFormalAdvisoryBoard = /\badvisory board\b/i.test(item.cleanTitle);
      const isBoardRecruiting = !isFormalAdvisoryBoard && /\b(advisory|role|intro|interview)\b/i.test(item.cleanTitle);
      if (isBoardRecruiting) {
        scores.D += weight + 10;
        familySupport.D.add(f.family);
      } else {
        scores.A += weight;
        familySupport.A.add(f.family);
      }
    } else if (f.type === "topic" && f.value === "investor_or_pitch") {
      scores.B += weight;
      familySupport.B.add(f.family);
    } else if (f.type === "direction" && f.value === "user_selling") {
      scores.B += weight;
      familySupport.B.add(f.family);
    } else if (f.type === "direction" && f.value === "on_stage") {
      scores.C += weight;
      familySupport.C.add(f.family);
    } else if (f.type === "topic" && f.value === "hiring") {
      scores.D += weight + 10;
      familySupport.D.add(f.family);
    } else if (f.type === "format" && f.value === "1:1") {
      // Check if internal team sync
      if (item.cleanTitle.includes("manoj") || item.cleanTitle.includes("team sync")) {
        scores.I += weight + 5;
        familySupport.I.add(f.family);
      } else {
        scores.D += weight + 8;
        familySupport.D.add(f.family);
      }
    } else if (f.type === "format" && f.value === "external_event_or_meetup") {
      scores.F += weight + 15;
      familySupport.F.add(f.family);
    } else if (f.type === "intent" && f.value === "product_review_or_discovery") {
      scores.E += weight + 10;
      familySupport.E.add(f.family);
    } else if (f.type === "label" && f.value === "public_holiday") {
      scores.H += weight + 20;
      familySupport.H.add(f.family);
    } else if (f.type === "intent" && f.value === "prepare") {
      scores.E += weight;
      familySupport.E.add(f.family);
    } else if (f.type === "format" && f.value === "peer_forum") {
      scores.E += weight + 10;
      familySupport.E.add(f.family);
    } else if (f.type === "format" && f.value === "public_or_large_group") {
      scores.F += weight;
      familySupport.F.add(f.family);
    } else if (f.type === "topic" && f.value === "flight_booking") {
      scores.G += weight + 15;
      familySupport.G.add(f.family);
    } else if (f.type === "topic" && f.value === "personal_or_recovery") {
      scores.H += weight;
      familySupport.H.add(f.family);
    } else if (f.type === "intent" && f.value === "run_or_track_business") {
      scores.I += weight;
      familySupport.I.add(f.family);
    } else if (f.type === "intent" && f.value === "respond_to_incident") {
      scores.J += weight + 20;
      familySupport.J.add(f.family);
    } else if (f.type === "label" && f.value === "focus_time") {
      scores.E += weight + 10;
      familySupport.E.add(f.family);
    } else if (f.type === "label" && f.value === "out_of_office") {
      scores.H += weight + 15;
      familySupport.H.add(f.family);
    }
  }

  // ── 2. Cross-Checks (Final Design §6.2) ─────────────────────────────────

  // Cross-check: Prep vs Meeting ("Prep for board" -> E, not A)
  const hasPrep = findings.some((f) => f.type === "intent" && f.value === "prepare");
  if (hasPrep && scores.A > 0) {
    scores.E += scores.A;
    scores.A = Math.max(0, scores.A - 20);
    reasons.push("Preparation context routes governance topic to Strategic Prep (E)");
  }

  // Cross-check: G Travel needs flight number or travel venue
  const hasFlight = findings.some((f) => f.type === "topic" && f.value === "flight_booking");
  const hasTravelVenue = findings.some((f) => f.type === "setting" && f.value === "travel_venue");
  if (!hasFlight && !hasTravelVenue && scores.G > 0) {
    scores.G = Math.floor(scores.G * 0.3); // Drastically damp G without booking/venue
  }

  // Cross-check: Forum / Webinar / Workshop attendance without user presenting -> E or F
  const isForum = /\b(forum|webinar)\b/i.test(item.cleanTitle);
  const isWorkshop = /\b(workshop|open day)\b/i.test(item.cleanTitle);
  if (isForum && !findings.some((f) => f.type === "direction" && f.value === "on_stage")) {
    scores.E += 15;
    familySupport.E.add("text");
    reasons.push("Forum / webinar without active presentation routes to Peer Community / Learning (E)");
  } else if (isWorkshop) {
    scores.F += 18;
    familySupport.F.add("text");
    reasons.push("External workshop / open day routes to Conferences & External Events (F)");
  }

  // Cross-check: Operations vs Strategic thinking
  // Recurring standup/sync -> I
  if (item.allDay) {
    // All-day without other work markers favors H or G
    if (scores.H === 0 && scores.G === 0 && scores.A === 0) {
      scores.H += 10;
      familySupport.H.add("time");
    }
  }

  // ── 3. Winner Determination ────────────────────────────────────────────

  let topCategory: CategoryLetter = "E";
  let maxScore = -1;
  let runnerUpCat: CategoryLetter | null = null;
  let runnerUpScore = 0;

  const categories = Object.keys(scores) as CategoryLetter[];
  // Sort candidates by score descending, breaking ties by SHARED_STAKES_ORDER
  categories.sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    const rankA = SHARED_STAKES_ORDER[a as CategoryLetter] ?? 0;
    const rankB = SHARED_STAKES_ORDER[b as CategoryLetter] ?? 0;
    return rankB - rankA;
  });

  topCategory = categories[0];
  maxScore = scores[topCategory];
  if (categories.length > 1 && scores[categories[1]] > 0) {
    runnerUpCat = categories[1];
    runnerUpScore = scores[runnerUpCat];
  }

  // If completely unclassified (score 0), default to I for meeting with attendees, E for solo block
  if (maxScore <= 0) {
    if (item.attendees.length > 1) {
      topCategory = "I";
      reasons.push("Unclassified meeting with attendees defaults to Routine Coordination (I)");
    } else {
      topCategory = "E";
      reasons.push("Unclassified focus/solo block defaults to Strategic Thinking (E)");
    }
  }

  // ── 4. Independent Evidence Families & Confidence (Final Design §6.3) ───

  const familiesCount = familySupport[topCategory].size;
  const hasDecisiveFinding = findings.some(
    (f) => f.strength === "decisive" && familySupport[topCategory].has(f.family),
  );
  let categoryConfidence = 0.5;

  if (hasDecisiveFinding || familiesCount >= 3) {
    categoryConfidence = 0.85;
  } else if (familiesCount === 2) {
    categoryConfidence = 0.76;
  } else if (maxScore >= 20) {
    categoryConfidence = 0.68;
  } else {
    categoryConfidence = 0.52;
  }

  // Margin penalty if runner-up is very close
  if (runnerUpCat && maxScore > 0 && (maxScore - runnerUpScore) < 5) {
    categoryConfidence = Math.max(0.45, categoryConfidence - 0.15);
  }

  let confirmationState: ConfirmationState = "inferred_medium";
  if (categoryConfidence >= CONFIDENCE_HIGH_THRESHOLD) {
    confirmationState = "inferred_high";
  } else if (categoryConfidence >= CONFIDENCE_MEDIUM_THRESHOLD) {
    confirmationState = "inferred_medium";
  } else {
    confirmationState = "uncertain";
  }

  // ── 5. Subtype Selection ───────────────────────────────────────────────

  let subtype: SubtypeId | null = null;
  let bestCandidateSubtype: SubtypeId | null = null;
  let subtypeConfidence = 0.0;

  // Subtype heuristics by winning category
  const lowerTitle = item.cleanTitle;

  switch (topCategory) {
    case "A":
      if (lowerTitle.includes("remco") || lowerTitle.includes("audit") || lowerTitle.includes("nomco")) {
        bestCandidateSubtype = "gov.board_committee";
      } else if (lowerTitle.includes("prep")) {
        bestCandidateSubtype = "gov.board_prep";
      } else {
        bestCandidateSubtype = "gov.board_meeting";
      }
      break;
    case "B":
      if (lowerTitle.includes("pitch")) {
        bestCandidateSubtype = "inf.pitch_competitive";
      } else if (lowerTitle.includes("investor") || lowerTitle.includes("fundrais")) {
        bestCandidateSubtype = "inf.fundraising";
      } else {
        bestCandidateSubtype = "inf.client_presentation";
      }
      break;
    case "C":
      bestCandidateSubtype = "vis.roundtable";
      break;
    case "D":
      if (lowerTitle.includes("interview") || lowerTitle.includes("hiring")) {
        bestCandidateSubtype = "lead.hiring_interview";
      } else {
        bestCandidateSubtype = "lead.executive_1on1";
      }
      break;
    case "E":
      if (isForum || lowerTitle.includes("forum")) {
        bestCandidateSubtype = "str.community";
      } else if (hasPrep) {
        bestCandidateSubtype = "str.deep_work";
      } else if (lowerTitle.includes("learning") || lowerTitle.includes("course") || lowerTitle.includes("webinar")) {
        bestCandidateSubtype = "str.learning";
      } else {
        bestCandidateSubtype = "str.deep_work";
      }
      break;
    case "F":
      if (isWorkshop) {
        bestCandidateSubtype = "conf.workshop";
      } else if (lowerTitle.includes("offsite")) {
        bestCandidateSubtype = "conf.offsite";
      } else {
        bestCandidateSubtype = "conf.attendance";
      }
      break;
    case "G":
      if (hasFlight) {
        bestCandidateSubtype = "trv.flight";
      } else {
        bestCandidateSubtype = "trv.travel_day";
      }
      break;
    case "H":
      if (lowerTitle.includes("fast") || lowerTitle.includes("gym") || lowerTitle.includes("wellness")) {
        bestCandidateSubtype = "rhy.wellness_self_care";
      } else {
        bestCandidateSubtype = "rhy.family";
      }
      break;
    case "I":
      if (lowerTitle.includes("standup") || lowerTitle.includes("sync")) {
        bestCandidateSubtype = "ops.operating_review";
      } else {
        bestCandidateSubtype = "ops.admin";
      }
      break;
    case "J":
      bestCandidateSubtype = "risk.incident_review";
      break;
  }

  // Only promote bestCandidateSubtype to established subtype if categoryConfidence is high enough
  if (categoryConfidence >= 0.70 && bestCandidateSubtype) {
    subtype = bestCandidateSubtype;
    subtypeConfidence = Math.min(categoryConfidence, 0.85);
  }

  // Dimensions
  const stakesOrderVal = SHARED_STAKES_ORDER[topCategory as CategoryLetter] ?? 0;
  const isHighStakes = stakesOrderVal >= 30;

  const dimensions: ItemDimensions = {
    stakes: isHighStakes ? "high" : "medium",
    travelRelated: topCategory === "G" || hasFlight || hasTravelVenue,
    workContext: topCategory === "H" ? "personal" : "work",
    durationMinutes: item.startUtc && item.endUtc ? Math.round((new Date(item.endUtc).getTime() - new Date(item.startUtc).getTime()) / 60000) : null,
    meetingMode: item.meeting.online ? "online" : "in_person",
    isOneToOne: item.attendees.length === 2,
    userIsOrganiser: Boolean(item.organizer?.isSelf),
    userIsPresenting: findings.some((f) => f.type === "direction" && f.value === "on_stage"),
    isRecurring: item.seriesId !== null,
  };

  reasons.push(`Assigned to Category ${topCategory} (${CANONICAL_CATEGORIES[topCategory].name}) based on ${findings.length} findings across ${familiesCount} evidence families`);

  return {
    category: topCategory,
    subtype,
    bestCandidateSubtype,
    categoryConfidence,
    subtypeConfidence,
    confirmationState,
    decisionSource: "evidence",
    runnerUp: runnerUpCat ? { category: runnerUpCat, subtype: null, score: runnerUpScore } : null,
    reasons,
    dimensions,
  };
}
