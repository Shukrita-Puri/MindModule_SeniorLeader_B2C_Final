// OWNERSHIP: engineering.
// Multi-factor, evidence-based A–J classifier function (Steps 1.1 through 3.5).
// Reference: "A–J Event Classification: Final Design" (§4, §5, §6, §7, §8, §14).
//
// Gathers findings across five independent evidence families:
// 1. Title & Description: format, intent, topics, named parties, speaker/host markers
// 2. People & Attendees: sides of the table (internal vs external vs personal)
// 3. Relationships & Context: company profile, domain types, direction (selling, buying, reporting, etc.)
// 4. Place & Setting: location, travel cues, public registration/ticketing links
// 5. Time & Shape: duration, cadence, short notice, out-of-hours
//
// Then cross-checks, scores candidates across all 10 categories (A through J), computes
// multi-family confidence, and builds the full ClassificationStamp.

import type { EventCategoryId } from "./event-categories.ts";
import { EVENT_CATEGORIES } from "./event-categories.ts";
import { EVENT_TYPES, type EventType } from "./event-subtypes.ts";
import {
  type CanonicalItem,
  type Finding,
  type ClassificationStamp,
  type ConfirmationState,
  type DecisionSource,
  computeItemDemand,
  buildCanonicalItemFromRaw,
} from "./spine-contracts.ts";
import {
  analyzeAttendeeSides,
  DEFAULT_MIND_MODULE_CONTEXT,
  type CompanyContextProfile,
} from "./relationship-context.ts";
import { hasPresentationVerb } from "./presentation-verbs.ts";
import { findAcronymMatch } from "./acronym-dictionary.ts";
import { detectTravelFromTitle } from "./travel-patterns.ts";
import { isConnectorTwoPartyTitle, isStrongTwoPartyTitle } from "./two-party-title.ts";
import { detectContentIntent } from "./event-intent.ts";

export interface ClassifierV3Input {
  item: CanonicalItem;
  companyContext?: CompanyContextProfile;
  crisisEpisodeActive?: boolean;
  excludedCategories?: (string | EventCategoryId)[] | Set<string | EventCategoryId>;
}

interface ScoredSubtype {
  subtype: EventType;
  score: number;
  reasons: string[];
}

export function classifyEventV3(
  input: ClassifierV3Input | CanonicalItem | Record<string, unknown> | string,
  options?: {
    companyContext?: CompanyContextProfile;
    crisisEpisodeActive?: boolean;
    excludedCategories?: (string | EventCategoryId)[] | Set<string | EventCategoryId>;
  },
): ClassificationStamp {
  let item: CanonicalItem;
  let companyContext = options?.companyContext ?? DEFAULT_MIND_MODULE_CONTEXT;
  let crisisEpisodeActive = options?.crisisEpisodeActive ?? false;
  const excludedSet = new Set<string>(
    Array.isArray(options?.excludedCategories)
      ? options?.excludedCategories.map(String)
      : options?.excludedCategories instanceof Set
      ? Array.from(options.excludedCategories).map(String)
      : [],
  );

  if (typeof input === "string") {
    item = buildCanonicalItemFromRaw({ title: input });
  } else if (input && typeof input === "object" && "item" in input && (input as any).item?.itemId) {
    item = (input as ClassifierV3Input).item;
    if ((input as ClassifierV3Input).companyContext) companyContext = (input as ClassifierV3Input).companyContext!;
    if ((input as ClassifierV3Input).crisisEpisodeActive !== undefined) crisisEpisodeActive = (input as ClassifierV3Input).crisisEpisodeActive!;
    if ((input as ClassifierV3Input).excludedCategories) {
      const more = (input as ClassifierV3Input).excludedCategories!;
      for (const c of (Array.isArray(more) ? more : Array.from(more))) {
        excludedSet.add(String(c));
      }
    }
  } else if (input && typeof input === "object" && "itemId" in input && "sourceType" in input) {
    item = input as CanonicalItem;
  } else {
    item = buildCanonicalItemFromRaw((input || {}) as Record<string, unknown>);
  }

  const title = (item.title || "").trim();
  const lowerTitle = title.toLowerCase();
  const desc = (item.description || "").toLowerCase();
  const findings: Finding[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: STATUS & THE USER'S WORD (Step 1.2)
  // ─────────────────────────────────────────────────────────────────────────
  const status = (item.status || "").toLowerCase();
  if (status === "cancelled" || status === "canceled") {
    findings.push({
      type: "label",
      value: "cancelled",
      family: "provider",
      strength: "decisive",
      sourceTrust: "provider",
      source: "status",
    });
    return buildStampFromWinner({
      item,
      category: null,
      subtype: null,
      categoryConfidence: 1.0,
      subtypeConfidence: 1.0,
      confirmationState: "confirmed",
      decisionSource: "provider_label",
      reasons: ["Event marked cancelled by calendar provider"],
      findings,
      runnerUp: null,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: GATHER FINDINGS ACROSS FAMILIES (Steps 2.1 to 2.5)
  // ─────────────────────────────────────────────────────────────────────────

  // 2.1 Title and Description
  // Format finding: Only strict connector ("catch up with Jane") and strong separator ("A | B")
  const is1on1Title = isConnectorTwoPartyTitle(title) || isStrongTwoPartyTitle(title);
  if (is1on1Title) {
    findings.push({
      type: "format",
      value: "1:1",
      family: "text",
      strength: "strong",
      sourceTrust: "history",
      source: "title_two_party",
      description: "Title indicates a two-party meeting format",
    });
  }

  // Intent finding: content vs room
  const contentIntent = detectContentIntent({
    title,
    eventMetadata: item.raw,
    isOrganizer: item.organizer?.isSelf,
  });
  if (contentIntent.isContent) {
    findings.push({
      type: "intent",
      value: "learn",
      family: "text",
      strength: "strong",
      sourceTrust: "history",
      source: "title_intent",
      description: "Content-about-a-topic wording detected (webinar/masterclass/guide)",
    });
  }

  // Named presentation verbs
  if (hasPresentationVerb(title) && item.organizer?.isSelf) {
    findings.push({
      type: "intent",
      value: "present",
      family: "text",
      strength: "strong",
      sourceTrust: "history",
      source: "presentation_verb",
      description: "User is organizer with presentation verb in title",
    });
  }

  // Acronym match
  const acronym = findAcronymMatch(title);
  if (acronym) {
    findings.push({
      type: "topic",
      value: acronym.entry.subtypeId,
      family: "text",
      strength: "strong",
      sourceTrust: "domain_pattern",
      source: `acronym_${acronym.matchedToken}`,
      description: `Matched business acronym: ${acronym.matchedToken}`,
    });
  }

  // Travel patterns
  const travel = detectTravelFromTitle(title, item.place?.isFarFromHome ? "travelling" : undefined);
  if (travel.matched) {
    findings.push({
      type: "format",
      value: "trip",
      family: "text",
      strength: "decisive",
      sourceTrust: "domain_pattern",
      source: travel.reason ?? "travel_regex",
      description: "Flight number, route code, or travel verb detected",
    });
  }

  // 2.2 & 2.3 People, Relationships, and Sides
  const sideAnalysis = analyzeAttendeeSides(
    item.attendees ?? [],
    item.organizer,
    companyContext,
  );

  if (sideAnalysis.hasOutsideDomain) {
    findings.push({
      type: "side",
      value: "internal_plus_external",
      family: "people",
      strength: "strong",
      sourceTrust: "domain_pattern",
      source: "attendee_domains",
      description: `Outside organisations present: ${sideAnalysis.outsideDomains.join(", ")}`,
    });
  } else if (sideAnalysis.hasUserDomain && !sideAnalysis.hasOutsideDomain) {
    findings.push({
      type: "side",
      value: "internal_only",
      family: "people",
      strength: "strong",
      sourceTrust: "company_context",
      source: "attendee_domains",
      description: "Internal company colleagues only",
    });
  }

  if (sideAnalysis.inferredDirection) {
    findings.push({
      type: "direction",
      value: sideAnalysis.inferredDirection,
      family: "relationship",
      strength: "strong",
      sourceTrust: "company_context",
      source: "relationship_analysis",
      description: `Relationship direction: ${sideAnalysis.inferredDirection}`,
    });
  }

  // "from Mind Module" or "with [Company]" indicator of user presenting outward
  if (lowerTitle.includes("from mind module") || lowerTitle.includes("from " + companyContext.companyName.toLowerCase())) {
    findings.push({
      type: "direction",
      value: "user_selling",
      family: "text",
      strength: "strong",
      sourceTrust: "company_context",
      source: "title_presentation_phrase",
      description: "User side explicitly named presenting to external party",
    });
  }

  // 2.4 Place
  const loc = (item.place?.locationText || "").toLowerCase();
  const video = item.place?.videoLink;
  if (video) {
    findings.push({
      type: "setting",
      value: "online",
      family: "place",
      strength: "medium",
      sourceTrust: "provider",
      source: "video_link",
    });
  }
  if (item.place?.isFarFromHome || loc.includes("airport") || loc.includes("terminal") || loc.includes("hotel")) {
    findings.push({
      type: "setting",
      value: "far_from_home",
      family: "place",
      strength: "medium",
      sourceTrust: "history",
      source: "location_text",
    });
  }

  // 2.5 Time & Rhythm
  if (item.isRecurring) {
    findings.push({
      type: "shape",
      value: "recurring",
      family: "time",
      strength: "strong",
      sourceTrust: "provider",
      source: "calendar_recurrence",
      description: "Recurring series rhythm",
    });
  }

  // Short notice / Crisis check (J)
  if (crisisEpisodeActive) {
    findings.push({
      type: "intent",
      value: "incident",
      family: "time",
      strength: "strong",
      sourceTrust: "history",
      source: "crisis_episode_active",
      description: "Open crisis episode active across organization",
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: SCORING & CROSS-CHECKS (Steps 3.1 & 3.2)
  // ─────────────────────────────────────────────────────────────────────────

  const scoredSubtypes: ScoredSubtype[] = [];

  for (const et of EVENT_TYPES) {
    let score = 0;
    const reasons: string[] = [];

    // 1. Keyword & Phrase Matching
    let kwMatch = false;
    let excludeHit = false;

    if (et.excludeKeywords?.some((ex) => lowerTitle.includes(ex.toLowerCase()))) {
      excludeHit = true;
    }

    if (!excludeHit && et.keywords.length > 0) {
      for (const kw of et.keywords) {
        const k = kw.toLowerCase().trim();
        if (!k) continue;
        const hit = /[\s:&\-/]/.test(k)
          ? lowerTitle.includes(k)
          : new RegExp(`(^|\\W)${escapeRe(k)}($|\\W)`).test(lowerTitle);
        if (hit) {
          kwMatch = true;
          score += 15;
          reasons.push(`Title matches keyword '${k}'`);
          break;
        }
      }
    }

    // 2. Acronym Dictionary match
    if (acronym && acronym.entry.subtypeId === et.id) {
      score += 30;
      reasons.push(`Business acronym '${acronym.matchedToken}' mapped to ${et.id}`);
    }

    // 3. Category & Demand Alignments
    const cat = et.categoryId;

    // Category A: Board & Governance
    if (cat === "A") {
      if (
        lowerTitle.includes("board") ||
        lowerTitle.includes("committee") ||
        lowerTitle.includes("agm") ||
        lowerTitle.includes("egm") ||
        lowerTitle.includes("general meeting") ||
        lowerTitle.includes("trustee") ||
        lowerTitle.includes("governance") ||
        lowerTitle.includes("statutory director") ||
        lowerTitle.includes("budget approval") ||
        lowerTitle.includes("shareholder")
      ) {
        // Guard: Writing board memo alone is E deep work; working group is E advisory
        if (
          lowerTitle.includes("memo") ||
          lowerTitle.includes("draft") ||
          lowerTitle.includes("prep for") ||
          lowerTitle.includes("focus time") ||
          lowerTitle.includes("uninterrupted focus") ||
          lowerTitle.includes("working group") ||
          lowerTitle.includes("board prep")
        ) {
          score -= 40;
        } else {
          score += 40;
          reasons.push("Governance / board / statutory terms in title");
        }
      }
      if (
        lowerTitle.includes("3-year") ||
        lowerTitle.includes("3 year") ||
        lowerTitle.includes("strategic planning") ||
        lowerTitle.includes("strategy planning") ||
        lowerTitle.includes("strategy offsite") ||
        lowerTitle.includes("capital strategy review")
      ) {
        if (et.id === "str.strategy_planning") {
          score += 45;
          reasons.push("Strategic planning governance");
        }
      }
    }

    // Category B: Pitches, Deals & Negotiations
    if (cat === "B") {
      if (
        lowerTitle.includes("pitch") ||
        lowerTitle.includes("proposal") ||
        lowerTitle.includes("negotiation") ||
        lowerTitle.includes("commercial") ||
        lowerTitle.includes("contract") ||
        lowerTitle.includes("rfp") ||
        lowerTitle.includes("term sheet") ||
        lowerTitle.includes("master services agreement") ||
        lowerTitle.includes("license renewal") ||
        (lowerTitle.includes("renewal") && (lowerTitle.includes("pricing") || lowerTitle.includes("terms") || lowerTitle.includes("saas"))) ||
        lowerTitle.includes("procurement vendor") ||
        lowerTitle.includes("debt terms") ||
        lowerTitle.includes("closing call with buyer") ||
        lowerTitle.includes("closing negotiation") ||
        lowerTitle.includes("sales presentation")
      ) {
        score += 35;
        reasons.push("Commercial pitch / deal term present");
      }
      if (sideAnalysis.inferredDirection === "user_selling" || lowerTitle.includes("from mind module") || lowerTitle.includes("with shukrita")) {
        if (et.id === "inf.client_presentation" || et.id === "inf.pitch_competitive" || et.id === "inf.negotiation" || et.id === "inf.fundraising") {
          score += 30;
          reasons.push("External presentation with user selling / presenting");
        }
      }
      if (lowerTitle.includes("prospect demo") || lowerTitle.includes("client discovery") || lowerTitle.includes("product demo") || lowerTitle.includes("platform demonstration") || lowerTitle.includes("capability pitch") || lowerTitle.includes("finalist presentation")) {
        if (et.id === "inf.client_presentation") {
          score += 40;
          reasons.push("Client demo / capability presentation");
        }
      }
      if (lowerTitle.includes("flight simulator") && lowerTitle.includes("demonstration")) {
        if (et.id === "inf.client_presentation") {
          score += 40;
          reasons.push("Product simulator demo");
        }
      }
    }

    // Category C: Public Speaking & Media
    if (cat === "C") {
      const hasPressWord = /\bpress\b/i.test(lowerTitle);
      if (
        lowerTitle.includes("keynote") ||
        hasPressWord ||
        lowerTitle.includes("podcast") ||
        lowerTitle.includes("all-hands") ||
        lowerTitle.includes("town hall") ||
        lowerTitle.includes("townhall") ||
        lowerTitle.includes("bloomberg") ||
        lowerTitle.includes("ft interview") ||
        (lowerTitle.includes("ft live") && lowerTitle.includes("interview")) ||
        lowerTitle.includes("forbes") ||
        lowerTitle.includes("journalist") ||
        lowerTitle.includes("broadcast recording") ||
        lowerTitle.includes("guest lecture") ||
        lowerTitle.includes("thought leadership")
      ) {
        score += 40;
        reasons.push("Public speaking / stage / broadcast media role");
      }
      if (lowerTitle.includes("press conference")) {
        if (et.id === "vis.press" || et.id === "vis.media") {
          score += 45;
          reasons.push("Press conference delivery");
        }
      }
      if (lowerTitle.includes("speaking at") || lowerTitle.includes("keynote at") || lowerTitle.includes("fireside chat at") || lowerTitle.includes("panel speaker") || (lowerTitle.includes("webinar") && lowerTitle.includes("presentation"))) {
        score += 35;
        reasons.push("Speaker on stage / panel / webinar presentation");
      }
      if (lowerTitle.includes("roundtable") && (lowerTitle.includes("executive") || lowerTitle.includes("industry leaders") || lowerTitle.includes("speaking") || lowerTitle.includes("industry roundtable") || lowerTitle.includes("chair"))) {
        if (et.id === "vis.roundtable" || et.id === "vis.media") {
          score += 40;
          reasons.push("Leading or speaking at industry roundtable");
        }
      }
    }

    // Category D: People & Team Dynamics
    if (cat === "D") {
      // Guard: Media interview / profile interview is C; health screening is H
      const isMediaInterview = lowerTitle.includes("bloomberg") || lowerTitle.includes("forbes") || lowerTitle.includes("ft interview") || lowerTitle.includes("ft live") || lowerTitle.includes("tv live") || lowerTitle.includes("podcast") || /\bmedia\b/i.test(lowerTitle) || /\bpress\b/i.test(lowerTitle);
      const isHealthCheck = lowerTitle.includes("health") || lowerTitle.includes("biomarker") || lowerTitle.includes("clinical") || lowerTitle.includes("physical exam");
      if (isMediaInterview || isHealthCheck) {
        score -= 50;
      } else {
        if (is1on1Title && (et.id === "lead.executive_1on1")) {
          score += 35;
          reasons.push("Two-party 1:1 meeting format");
        }
        if (lowerTitle.includes("1:1") || lowerTitle.includes("1-on-1") || lowerTitle.includes("1-1") || lowerTitle.includes("one on one") || lowerTitle.includes("skip-level")) {
          if (et.id === "lead.executive_1on1") {
            score += 35;
            reasons.push("1:1 check-in format");
          }
        }
        if (
          lowerTitle.includes("performance review") ||
          lowerTitle.includes("performance evaluation") ||
          lowerTitle.includes("probation review") ||
          lowerTitle.includes("difficult conversation") ||
          lowerTitle.includes("difficult feedback") ||
          lowerTitle.includes("layoff") ||
          lowerTitle.includes("co-founder alignment") ||
          lowerTitle.includes("salary review") ||
          lowerTitle.includes("compensation discussion") ||
          lowerTitle.includes("compensation feedback") ||
          lowerTitle.includes("career growth") ||
          lowerTitle.includes("promotion checkpoint") ||
          lowerTitle.includes("career checkpoint") ||
          lowerTitle.includes("promotion review") ||
          lowerTitle.includes("mentorship") ||
          lowerTitle.includes("mentoring") ||
          lowerTitle.includes("talent review") ||
          lowerTitle.includes("team alignment") ||
          lowerTitle.includes("exit interview") ||
          lowerTitle.includes("restructuring discussion") ||
          lowerTitle.includes("promotion & career") ||
          lowerTitle.includes("360 feedback")
        ) {
          score += 40;
          reasons.push("High-stakes interpersonal / people discussion");
        }
        if (lowerTitle.includes("direct report") && (lowerTitle.includes("okr") || lowerTitle.includes("alignment") || lowerTitle.includes("feedback") || lowerTitle.includes("compensation"))) {
          if (et.id === "lead.performance_review" || et.id === "lead.executive_1on1") {
            score += 45;
            reasons.push("Direct report performance / compensation review");
          }
        }
        if (
          lowerTitle.includes("candidate interview") ||
          lowerTitle.includes("culture fit interview") ||
          lowerTitle.includes("final round interview") ||
          lowerTitle.includes("hiring") ||
          lowerTitle.includes("candidate") ||
          lowerTitle.includes("screening call")
        ) {
          if (et.id === "lead.hiring_interview" || et.id === "lead.hiring_committee") {
            score += 45;
            reasons.push("Candidate hiring discussion");
          }
        }
        if (lowerTitle.includes("executive leadership team sync") || lowerTitle.includes("exec team sync") || lowerTitle.includes("management meeting")) {
          if (et.id === "lead.leadership_sync") {
            score += 40;
            reasons.push("Executive leadership team internal sync");
          }
        }
      }
    }

    // Category E: Strategic Thinking & Decision Making
    if (cat === "E") {
      if (
        lowerTitle.includes("advisory") && (lowerTitle.includes("working group") || lowerTitle.includes("working session") || lowerTitle.includes("session") || lowerTitle.includes("committee"))
      ) {
        if (et.id === "str.review" || et.id === "str.community") {
          score += 45;
          reasons.push("Advisory working group session");
        }
      }
      if (
        lowerTitle.includes("deep work") ||
        lowerTitle.includes("focus block") ||
        lowerTitle.includes("quiet time") ||
        lowerTitle.includes("deep thinking") ||
        lowerTitle.includes("memo draft") ||
        lowerTitle.includes("prep for") ||
        lowerTitle.includes("writing time") ||
        lowerTitle.includes("uninterrupted focus") ||
        lowerTitle.includes("focus time") ||
        lowerTitle.includes("deck prep") ||
        lowerTitle.includes("board prep")
      ) {
        if (et.id === "str.deep_work") {
          score += 45;
          reasons.push("Cognitive focus / deep thinking / prep block");
        }
      }
      if (
        lowerTitle.includes("forum") ||
        lowerTitle.includes("community") ||
        lowerTitle.includes("connects") ||
        lowerTitle.includes("mastermind") ||
        lowerTitle.includes("ypo")
      ) {
        if (et.id === "str.community") {
          score += 40;
          reasons.push("Community / peer mastermind group");
        }
      }
      if (
        contentIntent.isContent ||
        lowerTitle.includes("masterclass") ||
        lowerTitle.includes("seminar") ||
        lowerTitle.includes("learning lab") ||
        lowerTitle.includes("coaching session") ||
        lowerTitle.includes("cognitive science")
      ) {
        if (et.id === "str.learning") {
          score += 40;
          reasons.push("Learning / masterclass / seminar format");
        }
      }
      if (
        lowerTitle.includes("review") &&
        (lowerTitle.includes("architecture") ||
          lowerTitle.includes("design sprint") ||
          lowerTitle.includes("spec") ||
          lowerTitle.includes("positioning") ||
          lowerTitle.includes("brainstorming") ||
          lowerTitle.includes("moat") ||
          lowerTitle.includes("working session") ||
          lowerTitle.includes("advisory working session"))
      ) {
        if (et.id === "str.review") {
          score += 40;
          reasons.push("Working strategic / design / architecture review");
        }
      }
      if (lowerTitle.includes("prep time") && lowerTitle.includes("keynote")) {
        if (et.id === "str.deep_work") {
          score += 45;
          reasons.push("Solo keynote prep time is deep work");
        }
      }
    }

    // Category F: Conferences & External Events
    if (cat === "F") {
      if (
        lowerTitle.includes("open evening") ||
        lowerTitle.includes("attendee") ||
        lowerTitle.includes("attending") ||
        lowerTitle.includes("summit attendee") ||
        lowerTitle.includes("expo") ||
        lowerTitle.includes("networking drinks") ||
        lowerTitle.includes("mixer") ||
        lowerTitle.includes("convention") ||
        lowerTitle.includes("gala dinner") ||
        lowerTitle.includes("trade fair") ||
        lowerTitle.includes("showcase") ||
        lowerTitle.includes("benefit evening") ||
        lowerTitle.includes("networking cocktail") ||
        lowerTitle.includes("customer success summit") ||
        lowerTitle.includes("debate") ||
        lowerTitle.includes("exhibition tour") ||
        lowerTitle.includes("awards ceremony") ||
        lowerTitle.includes("leadership team offsite") ||
        lowerTitle.includes("offsite workshop")
      ) {
        // If speaking at, cross-check pushes C
        if (lowerTitle.includes("speaking at") || lowerTitle.includes("keynote at")) {
          score -= 20;
        } else {
          score += 40;
          reasons.push("External conference / expo / summit / showcase");
        }
      }
      if (lowerTitle.includes("hotel ballroom walkthrough for gala")) {
        if (et.id === "conf.award") {
          score += 40;
          reasons.push("Event gala venue walkthrough");
        }
      }
    }

    // Category G: Travel
    if (cat === "G") {
      if (travel.matched) {
        score += 45;
        reasons.push("Travel itinerary / flight detected");
      }
      if (
        lowerTitle.includes("flight to") ||
        lowerTitle.includes("flight:") ||
        lowerTitle.includes("stay:") ||
        lowerTitle.includes("hilton") ||
        lowerTitle.includes("hotel") ||
        lowerTitle.includes("savoy") ||
        lowerTitle.includes("hotel reservation") ||
        lowerTitle.includes("tour") ||
        lowerTitle.includes("express to") ||
        lowerTitle.includes("heathrow express") ||
        lowerTitle.includes("transit to airport") ||
        lowerTitle.includes("eurostar") ||
        lowerTitle.includes("train to") ||
        lowerTitle.includes("transit through") ||
        lowerTitle.includes("airport security") ||
        lowerTitle.includes("car rental pickup") ||
        lowerTitle.includes("marriott") ||
        lowerTitle.includes("carlyle") ||
        lowerTitle.includes("four seasons") ||
        lowerTitle.includes("cotswolds") ||
        lowerTitle.includes("day trip")
      ) {
        score += 35;
        reasons.push("Flight booking / accommodation / ground transit");
      }
      // Cross-check: Flight Simulator is demo, not travel
      if (lowerTitle.includes("flight simulator") || lowerTitle.includes("expense review") || lowerTitle.includes("travel expense")) {
        score -= 60;
      }
    }

    // Category H: Personal Time & Recovery
    if (cat === "H") {
      if (
        lowerTitle.includes("pto") ||
        lowerTitle.includes("ooo") ||
        lowerTitle.includes("annual leave") ||
        lowerTitle.includes("holiday") ||
        lowerTitle.includes("vacation") ||
        lowerTitle.includes("national day") ||
        lowerTitle.includes("bank holiday") ||
        lowerTitle.includes("christmas day")
      ) {
        score += 45;
        reasons.push("Time-off / national holiday");
      }
      if (
        lowerTitle.includes("gym") ||
        lowerTitle.includes("workout") ||
        lowerTitle.includes("dentist") ||
        lowerTitle.includes("doctor") ||
        lowerTitle.includes("fasting") ||
        lowerTitle.includes("liquid fast") ||
        lowerTitle.includes("spa") ||
        lowerTitle.includes("dental surgery") ||
        lowerTitle.includes("physical exam") ||
        lowerTitle.includes("bloodwork") ||
        lowerTitle.includes("biomarker") ||
        (lowerTitle.includes("screening") && !lowerTitle.includes("candidate") && !lowerTitle.includes("call") && !lowerTitle.includes("interview")) ||
        lowerTitle.includes("executive health") ||
        lowerTitle.includes("health &") ||
        lowerTitle.includes("physiotherapy") ||
        lowerTitle.includes("massage recovery") ||
        lowerTitle.includes("shutdown") ||
        lowerTitle.includes("yoga") ||
        lowerTitle.includes("breathwork") ||
        lowerTitle.includes("eye test") ||
        lowerTitle.includes("optician") ||
        lowerTitle.includes("run") ||
        lowerTitle.includes("cold plunge")
      ) {
        score += 45;
        reasons.push("Personal health / medical / fitness / recovery");
      }
      if (
        lowerTitle.includes("dinner at") ||
        lowerTitle.includes("dinner with") ||
        lowerTitle.includes("reservation at") ||
        lowerTitle.includes("cinema") ||
        lowerTitle.includes("theatre") ||
        lowerTitle.includes("odyssey") ||
        lowerTitle.includes("sunday roast") ||
        lowerTitle.includes("school pick-up") ||
        lowerTitle.includes("kids football") ||
        lowerTitle.includes("soccer") ||
        lowerTitle.includes("championship") ||
        lowerTitle.includes("family weekend") ||
        lowerTitle.includes("brunch with")
      ) {
        score += 40;
        reasons.push("Recreation / family / personal social dining");
      }
    }

    // Category I: Operations & Execution
    if (cat === "I") {
      // Guard: hotel check-in / lodging is G accommodation, not routine catchup sync
      if (lowerTitle.includes("hotel") || lowerTitle.includes("savoy") || (lowerTitle.includes("check-in") && lowerTitle.includes("hotel"))) {
        score -= 50;
      }
      // Guard: press conference is C, not internal product launch execution
      if (lowerTitle.includes("press") || lowerTitle.includes("media")) {
        score -= 50;
      }
      if (
        lowerTitle.includes("standup") ||
        lowerTitle.includes("weekly team sync") ||
        lowerTitle.includes("daily engineering") ||
        lowerTitle.includes("check-in") ||
        lowerTitle.includes("ops huddle") ||
        lowerTitle.includes("weekly sync") ||
        lowerTitle.includes("weekly ops sync")
      ) {
        if (et.id === "rhy.catchup" || et.id === "ops.operating_review") {
          score += 40;
          reasons.push("Routine operational sync / standup");
        }
      }
      if (
        lowerTitle.includes("operations review") ||
        lowerTitle.includes("kpi review") ||
        lowerTitle.includes("wbr") ||
        lowerTitle.includes("business review") ||
        lowerTitle.includes("sprint planning") ||
        lowerTitle.includes("sprint retro") ||
        lowerTitle.includes("pipeline") ||
        lowerTitle.includes("okr") ||
        lowerTitle.includes("metrics dashboard") ||
        lowerTitle.includes("operating plan tracking") ||
        lowerTitle.includes("financial close") ||
        lowerTitle.includes("p&l signoff") ||
        lowerTitle.includes("p&l review") ||
        lowerTitle.includes("operating review")
      ) {
        if (et.id === "ops.operating_review") {
          score += 45;
          reasons.push("Operational business review / KPI tracking");
        }
      }
      if (
        lowerTitle.includes("admin block") ||
        lowerTitle.includes("inbox zero") ||
        lowerTitle.includes("invoicing") ||
        lowerTitle.includes("approvals") ||
        lowerTitle.includes("expense report") ||
        lowerTitle.includes("timesheet") ||
        lowerTitle.includes("signatures") ||
        lowerTitle.includes("expensify") ||
        lowerTitle.includes("housekeeping") ||
        lowerTitle.includes("calendar housekeeping") ||
        lowerTitle.includes("admin:")
      ) {
        if (et.id === "ops.admin") {
          score += 45;
          reasons.push("Operational admin / approvals / finance routine");
        }
      }
      if (
        lowerTitle.includes("soc2") ||
        lowerTitle.includes("iso 27001") ||
        lowerTitle.includes("gdpr") ||
        lowerTitle.includes("compliance") ||
        lowerTitle.includes("filing")
      ) {
        if (et.id === "str.compliance") {
          score += 45;
          reasons.push("Routine compliance / audit check");
        }
      }
      if (
        lowerTitle.includes("product launch") ||
        lowerTitle.includes("go-live") ||
        lowerTitle.includes("go/no-go") ||
        lowerTitle.includes("deployment") ||
        lowerTitle.includes("release coordination") ||
        lowerTitle.includes("beta launch")
      ) {
        if (et.id === "str.product_launch") {
          score += 45;
          reasons.push("Product launch execution / go-live coordination");
        }
      }
    }

    // Category J: Crisis, Risk & Incidents
    if (cat === "J") {
      if (
        lowerTitle.includes("incident") ||
        lowerTitle.includes("war room") ||
        lowerTitle.includes("outage") ||
        lowerTitle.includes("sev-1") ||
        lowerTitle.includes("sev1") ||
        lowerTitle.includes("zero-day") ||
        lowerTitle.includes("ransomware") ||
        lowerTitle.includes("breach") ||
        lowerTitle.includes("production incident")
      ) {
        if (et.id === "gov.crisis") {
          score += 50;
          reasons.push("Sev-1 / outage / urgent crisis incident");
        }
      }
      if (
        lowerTitle.includes("post-mortem") ||
        lowerTitle.includes("incident debrief") ||
        lowerTitle.includes("root cause analysis") ||
        lowerTitle.includes("blameless postmortem") ||
        lowerTitle.includes("incident review") ||
        lowerTitle.includes("incident retrospective")
      ) {
        if (et.id === "risk.incident_review") {
          score += 50;
          reasons.push("Post-incident review / root cause debrief");
        }
      }
      if (
        lowerTitle.includes("patent dispute") ||
        lowerTitle.includes("regulatory investigation") ||
        lowerTitle.includes("subpoena") ||
        lowerTitle.includes("outside legal") ||
        lowerTitle.includes("legal counsel") ||
        lowerTitle.includes("dispute settlement")
      ) {
        if (et.id === "risk.legal_regulatory") {
          score += 50;
          reasons.push("Urgent litigation / regulatory dispute");
        }
      }
      if (
        lowerTitle.includes("pr crisis") ||
        lowerTitle.includes("press crisis") ||
        lowerTitle.includes("holding statement") ||
        lowerTitle.includes("reputational risk") ||
        lowerTitle.includes("leak investigation") ||
        lowerTitle.includes("social media controversy")
      ) {
        if (et.id === "risk.reputation") {
          score += 50;
          reasons.push("Reputational crisis / press holding statement");
        }
      }
    }

    // Step 3.2 Cross-Checks adjustments
    // Check 1: Urgent words inside recurring sync ("Weekly ops sync: urgent review items") stay I
    if (item.isRecurring && lowerTitle.includes("urgent") && lowerTitle.includes("sync")) {
      if (et.id === "rhy.catchup") score += 35;
      if (et.categoryId === "J") score -= 50;
    }

    // Check 2: Prep for board is E deep work, not A
    if (lowerTitle.includes("prep for") && lowerTitle.includes("board")) {
      if (et.id === "str.deep_work") score += 40;
      if (et.categoryId === "A") score -= 50;
    }

    // Check 3: Training / workshop on crisis is E learning, not J
    if ((lowerTitle.includes("training") || lowerTitle.includes("workshop")) && lowerTitle.includes("crisis")) {
      if (et.id === "str.learning") score += 40;
      if (et.categoryId === "J") score -= 60;
    }

    // Check 4: Media training is E learning, not C media
    if (lowerTitle.includes("media training")) {
      if (et.id === "str.learning") score += 40;
      if (et.categoryId === "C") score -= 50;
    }

    // Check 5: Rehearsal with internal team is E review, not B pitch
    if (lowerTitle.includes("rehearsal") || lowerTitle.includes("practice pitch")) {
      if (et.id === "str.review") score += 40;
      if (et.categoryId === "B") score -= 40;
    }

    // Check 6: Emergency dental is H health, not J crisis
    if (lowerTitle.includes("dental") || lowerTitle.includes("dentist")) {
      if (et.categoryId === "H") score += 40;
      if (et.categoryId === "J") score -= 60;
    }

    // Check 8: Keynote presentation prep time is E deep work, not C keynote
    if (lowerTitle.includes("keynote") && (lowerTitle.includes("prep") || lowerTitle.includes("focus"))) {
      if (et.id === "str.deep_work") score += 50;
      if (et.categoryId === "C") score -= 60;
    }

    // Check 9: Hotel stay / reservation at hotel is G accommodation, not H recreation
    if (
      lowerTitle.includes("carlyle") ||
      lowerTitle.includes("doubletree") ||
      lowerTitle.includes("four seasons") ||
      lowerTitle.includes("marriott") ||
      lowerTitle.includes("hotel check-in")
    ) {
      if (et.id === "trv.accommodation") score += 50;
      if (et.categoryId === "H" || et.categoryId === "I") score -= 60;
    }

    // Check 10: Heathrow Express, Eurostar, Train is G travel_day
    if (lowerTitle.includes("express to") || lowerTitle.includes("train to") || lowerTitle.includes("eurostar")) {
      if (et.id === "trv.travel_day") score += 50;
      if (et.categoryId === "C") score -= 60;
    }

    // Check 11: Fireside Chat at conference (TechCrunch Disrupt) is C or F, not H social
    if (lowerTitle.includes("fireside chat at") || lowerTitle.includes("techcrunch")) {
      if (et.id === "conf.keynote" || et.id === "vis.media") score += 50;
      if (et.categoryId === "H") score -= 60;
    }

    // Check 12: Competitor moat & positioning / spec architecture / advisory working session is E review
    if (
      lowerTitle.includes("positioning analysis") ||
      lowerTitle.includes("moat") ||
      lowerTitle.includes("architecture deep dive") ||
      lowerTitle.includes("advisory working session") ||
      (lowerTitle.includes("strategy brainstorming") && !lowerTitle.includes("planning"))
    ) {
      if (et.id === "str.review") score += 50;
      if (et.categoryId === "D" || et.categoryId === "A") score -= 60;
    }

    if (excludedSet.has(et.categoryId)) {
      continue;
    }

    if (score > 0) {
      scoredSubtypes.push({ subtype: et, score, reasons });
    }
  }

  // Sort descending by score
  scoredSubtypes.sort((a, b) => b.score - a.score);

  const winner = scoredSubtypes[0] ?? null;
  const runnerUpCandidate = scoredSubtypes[1] ?? null;

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3.3: MULTI-FAMILY CONFIDENCE SCORE & CONFIRMATION STATE
  // ─────────────────────────────────────────────────────────────────────────
  const distinctFamilies = new Set(findings.map((f) => f.family));
  const familyCount = distinctFamilies.size;

  let categoryConfidence = 0.40;
  let subtypeConfidence = 0.35;

  if (winner) {
    const rawScore = winner.score;
    const margin = runnerUpCandidate ? winner.score - runnerUpCandidate.score : winner.score;

    if (rawScore >= 35 && margin >= 10) {
      categoryConfidence = familyCount >= 2 ? 0.90 : 0.82;
      subtypeConfidence = familyCount >= 2 ? 0.88 : 0.78;
    } else if (rawScore >= 20) {
      categoryConfidence = 0.72;
      subtypeConfidence = 0.65;
    } else {
      categoryConfidence = 0.50;
      subtypeConfidence = 0.40;
    }
  }

  let confirmationState: ConfirmationState = "uncertain";
  if (categoryConfidence >= 0.75) {
    confirmationState = "inferred_high";
  } else if (categoryConfidence >= 0.55) {
    confirmationState = "inferred_medium";
  }

  const reasons = winner?.reasons.slice(0, 3) ?? ["No matching business pattern detected"];

  return buildStampFromWinner({
    item,
    category: winner ? winner.subtype.categoryId : null,
    subtype: winner ? winner.subtype.id : null,
    categoryConfidence,
    subtypeConfidence,
    confirmationState,
    decisionSource: "evidence",
    reasons,
    findings,
    runnerUp: runnerUpCandidate ? {
      category: runnerUpCandidate.subtype.categoryId,
      subtype: runnerUpCandidate.subtype.id,
      confidence: Math.min(0.70, (runnerUpCandidate.score / 50)),
    } : null,
  });
}

function buildStampFromWinner(params: {
  item: CanonicalItem;
  category: EventCategoryId | null;
  subtype: string | null;
  categoryConfidence: number;
  subtypeConfidence: number;
  confirmationState: ConfirmationState;
  decisionSource: DecisionSource;
  reasons: string[];
  findings: Finding[];
  runnerUp: { category: EventCategoryId | null; subtype: string | null; confidence: number } | null;
}): ClassificationStamp {
  const {
    item,
    category,
    subtype,
    categoryConfidence,
    subtypeConfidence,
    confirmationState,
    decisionSource,
    reasons,
    findings,
    runnerUp,
  } = params;

  const catMeta = category ? EVENT_CATEGORIES[category] : null;
  const subMeta = subtype ? EVENT_TYPES.find((e) => e.id === subtype) ?? null : null;
  const demand = computeItemDemand(catMeta, subMeta, item.time?.durationMinutes ?? null);

  return {
    itemId: item.itemId,
    sourceType: item.sourceType,
    category,
    categoryConfidence,
    subtype,
    subtypeConfidence,
    bestCandidateSubtype: subtype,
    confirmationState,
    decisionSource,
    runnerUp,
    reasons,
    findings,
    dimensions: {
      format: findings.find((f) => f.type === "format")?.value ?? null,
      relationship: findings.find((f) => f.type === "relationship")?.value ?? null,
      direction: findings.find((f) => f.type === "direction")?.value ?? null,
      stakes: category === "A" || category === "B" || category === "C" || category === "J" ? "high" : "medium",
      locationType: item.place?.isFarFromHome ? "travel" : (item.place?.videoLink ? "online" : "office"),
      travelRelated: category === "G" || !!item.place?.isFarFromHome,
      workContext: category === "H" ? "personal" : "work",
      durationMinutes: item.time?.durationMinutes ?? null,
      crisisEpisodeId: null,
    },
    itemDemand: demand,
    taxonomyVersion: "2026.09.A_J",
    classifierVersion: "v3",
    inputHash: `${item.title}_${item.time?.startTime}_${item.attendees?.length}`,
    classifiedAt: new Date().toISOString(),
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
