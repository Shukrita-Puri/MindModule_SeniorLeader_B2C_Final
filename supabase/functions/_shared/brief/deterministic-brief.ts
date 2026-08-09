import type { DayShape } from "./day-shape.ts";

export type DeterministicBriefBand =
  | "firing"
  | "sharp"
  | "steady"
  | "stretched"
  | "depleted";

export type DeterministicBriefPillTier = "green" | "amber" | "red" | "unread";

export interface DeterministicBriefFallbackOpts {
  band: DeterministicBriefBand;
  hasWearable: boolean;
  /**
   * Current-window freshness contract (see _shared/signal-engine/signal-freshness.ts).
   * When false, no wearable-derived current claim may be emitted, regardless of
   * whether historical rows exist. Defaults to `hasWearable` for back-compat.
   */
  hasCurrentWearable?: boolean;
  /**
   * True only when a check-in exists for today's local date and this window.
   * When false, no felt-state / clarity claim may be emitted. Defaults to
   * `checkInOutcome != null` for back-compat.
   */
  hasCurrentCheckIn?: boolean;
  checkInOutcome: "sharp" | "holding" | "drained" | null;
  cognitivePillTier: DeterministicBriefPillTier;
  physicalPillTier: DeterministicBriefPillTier;
  wearableFact: string | null;
  window: "morning" | "afternoon" | "evening";
  todayHighStakes: string[];
  calendarLoad: "low" | "medium" | "high" | null;
  meetingCount: number;
  sleepScore: number | null;
  hasBackToBack: boolean;
  isWeekend?: boolean;
  /**
   * Non-workday shapes other than the weekend (public holiday, PTO / OOO,
   * personal holiday, personal travel). Reuses the existing weekend copy
   * branches so the fallback never emits work-directive prose on an off day.
   */
  isNonWorkday?: boolean;
  /**
   * Canonical day shape derived from the same signal matrix the Plan uses.
   * When present it takes priority over isWeekend / isNonWorkday for the
   * directive, read, evidence and close. Covers work_travel, personal_travel,
   * conference, public_holiday, pto, personal_holiday, weekend, workday.
   */
  dayShape?: DayShape | null;
  /** Travel phase for work_travel / personal_travel shapes. */
  travelPhase?: "pre" | "in_transit" | "post" | null;
  /** True when today's travel event is long-haul (>=6h). */
  longHaulFlight?: boolean;
  /** Conference day number when dayShape === 'conference'. */
  conferenceDayNumber?: number | null;
  /** Conference title when dayShape === 'conference'. */
  conferenceTitle?: string | null;
  /**
   * Title of today's travel event. The flight never appears in
   * todayHighStakes (category G is excluded), so it is passed separately.
   */
  travelEventTitle?: string | null;
}

export interface DeterministicBriefResult {
  phrase: string;
  body: string;
  topSignal: "baseline_quiet";
}

function shortRef(title: string): string {
  return shortRefImpl(title);
}

/** True for the two travel day shapes. */
function isTravelShape(shape: DayShape | null | undefined): boolean {
  return shape === "work_travel" || shape === "personal_travel";
}

function isConferenceShape(shape: DayShape | null | undefined): boolean {
  return shape === "conference";
}

/** Public holiday / PTO / personal holiday — off days that are not weekends. */
function isOffDayShape(shape: DayShape | null | undefined): boolean {
  return shape === "public_holiday" || shape === "pto" ||
    shape === "personal_holiday";
}

function shortRefImpl(title: string): string {
  const clean = title.replace(/^\d{1,2}:\d{2}\s+/, "").trim();
  // Travel first: flight titles carry airport codes and flight numbers that
  // truncate into unreadable fragments ("the flight to new york (ba...").
  if (/\bflight\b|\bdeparture\b|\bboarding\b/i.test(clean)) return "the flight";
  if (/\b[A-Z]{2}\s?\d{2,4}\b/.test(clean) && /\bto\b|\bfrom\b/i.test(clean)) {
    return "the flight";
  }
  if (/\btrain\b|\beurostar\b/i.test(clean)) return "the journey";
  if (/board|governance/i.test(clean)) return "the board call";
  if (/strategy|5.year|planning|deep work/i.test(clean)) {
    return "the strategy session";
  }
  if (/investor|pitch/i.test(clean)) return "the investor call";
  if (/keynote|speaking|media|press/i.test(clean)) return "the keynote";
  if (/all.?hands|town.?hall/i.test(clean)) return "the all-hands";
  if (/conference|summit/i.test(clean)) return "the conference";
  if (/feedback|difficult/i.test(clean)) return "the difficult conversation";
  if (/1.?1|one.?to.?one/i.test(clean)) return "the 1:1";
  return clean.length <= 25
    ? `the ${clean.toLowerCase()}`
    : `the ${clean.slice(0, 22).toLowerCase()}...`;
}

function phraseFor(opts: DeterministicBriefFallbackOpts): string {
  const divergence =
    opts.cognitivePillTier === "green" && opts.checkInOutcome === "drained";
  if (opts.band === "firing" && !divergence) return "Go get them";
  if (opts.band === "firing" && divergence) return "Better than it feels";
  if (opts.band === "sharp") return "Better than it feels";
  if (opts.band === "steady") return "Holding steady";
  if (opts.band === "stretched") return "Steady and selective";
  return "Pace it today";
}

function sanitizeWearableFact(fact: string | null): string | null {
  if (!fact) return null;
  return fact
    .replace(/HRV'?s running above baseline/gi, "Recovery is running above its usual range")
    .replace(/HRV is below baseline/gi, "Recovery is below its usual range")
    .replace(/Recovery is significantly below baseline/gi, "Recovery is significantly under its usual range")
    .replace(/\bHRV\b/g, "Recovery")
    .replace(/\bbaseline\b/gi, "usual range");
}

function buildEvidence(opts: DeterministicBriefFallbackOpts): string {
  const wearableFact = sanitizeWearableFact(opts.wearableFact);
  const hasHighStakes = opts.todayHighStakes.length > 0;
  const hasManyHighStakes = opts.todayHighStakes.length >= 2;
  const drainedIntoHighStakes = opts.checkInOutcome === "drained" &&
    hasHighStakes;
  const lowSleepIntoHighStakes =
    opts.sleepScore !== null && opts.sleepScore < 65 && hasHighStakes;

  // ── Travel evidence. The flight is the day's dominant demand but never
  // reaches todayHighStakes, so without this branch beat (a) reads as if the
  // calendar were empty.
  if (isTravelShape(opts.dayShape) && opts.travelEventTitle) {
    const ref = shortRef(opts.travelEventTitle);
    if (opts.hasWearable) {
      return `${
        wearableFact ?? "Recovery signals are in"
      } going into ${ref}${opts.longHaulFlight ? " — a long-haul day" : ""}.`;
    }
    if (opts.checkInOutcome) {
      const felt = opts.checkInOutcome === "holding"
        ? "steady"
        : opts.checkInOutcome;
      return `You've checked in ${felt} with ${ref} ahead this ${opts.window} — the transit is the demand, not the calendar.`;
    }
  }
  if (isConferenceShape(opts.dayShape)) {
    const dayRef = opts.conferenceDayNumber != null
      ? `Day ${opts.conferenceDayNumber} of the conference`
      : "A full conference day";
    if (opts.hasWearable) {
      return `${
        wearableFact ?? "Recovery signals are in"
      } going into ${dayRef.toLowerCase()} — sustained attention is the load being carried.`;
    }
  }

  if (drainedIntoHighStakes) {
    const eventRef = hasManyHighStakes
      ? opts.todayHighStakes.slice(0, 2).map(shortRef).join(" and ")
      : shortRef(opts.todayHighStakes[0]);
    return opts.hasWearable
      ? `Recovery signals are clear but the Mind checked in drained${
        hasManyHighStakes
          ? `, and ${eventRef} are why that gap matters.`
          : ` — ${eventRef} is why that gap matters.`
      }`
      : `The mind is drained but ${eventRef} ${
        hasManyHighStakes ? "are" : "is"
      } on today - the demand and the felt state aren't aligned.`;
  }

  if (lowSleepIntoHighStakes) {
    return `Sleep ran short last night going into ${
      shortRef(opts.todayHighStakes[0])
    } - on short sleep, depth matters more than volume.`;
  }

  if (opts.hasWearable && hasHighStakes) {
    return `${
      wearableFact ?? "Recovery signals are in"
    } going into ${shortRef(opts.todayHighStakes[0])}.`;
  }

  if (
    opts.hasWearable &&
    !hasHighStakes &&
    (opts.meetingCount >= 3 || opts.calendarLoad === "medium" || opts.calendarLoad === "high")
  ) {
    if (opts.meetingCount >= 3) {
      return `${
        wearableFact ?? "Recovery signals are in"
      } with ${opts.meetingCount} meetings stacked this ${opts.window}.`;
    }
    return `${
      wearableFact ?? "Recovery signals are in"
    } and the calendar is ${opts.calendarLoad} this ${opts.window}.`;
  }

  if (
    opts.hasWearable && opts.checkInOutcome &&
    opts.checkInOutcome !== "sharp"
  ) {
    return `${
      wearableFact ?? "The wearable read is in"
    } but you've checked in ${opts.checkInOutcome} - the signals are split.`;
  }

  if (opts.hasWearable) {
    // Spec Pattern 5: wearable only, no calendar. Must reach the 15-word floor.
    // wearableFact is null when HRV and sleep data are unavailable (stale wearable).
    const factPhrase = wearableFact ?? "Recovery signals are in";
    if (opts.isWeekend) {
      return `${factPhrase} this ${opts.window} with no work calendar — the physiological read is the anchor for the weekend.`;
    }
    return `${factPhrase} this ${opts.window} with no calendar demand in view — the physiological edge is the signal.`;
  }

  if (opts.checkInOutcome && hasHighStakes) {
    return `You've checked in ${opts.checkInOutcome} and ${
      shortRef(opts.todayHighStakes[0])
    } is the weight on the ${opts.window}.`;
  }

  if (opts.checkInOutcome && opts.meetingCount > 0) {
    const evidenceOutcome = opts.checkInOutcome === "holding"
      ? "steady"
      : opts.checkInOutcome;
    const meetingWord = opts.meetingCount === 1 ? "meeting" : "meetings";
    return `You've checked in ${evidenceOutcome} across ${opts.meetingCount} ${meetingWord} this ${opts.window}.`;
  }

  if (opts.checkInOutcome) {
    const evidenceOutcome = opts.checkInOutcome === "holding"
      ? "steady"
      : opts.checkInOutcome;
    return `You've checked in ${evidenceOutcome} and there's no wearable read yet this ${opts.window}.`;
  }

  return `Signal is thin this ${opts.window} - no wearable and no check-in yet.`;
}

function buildRead(opts: DeterministicBriefFallbackOpts): string {
  const hasHighStakes = opts.todayHighStakes.length > 0;
  const hasManyHighStakes = opts.todayHighStakes.length >= 2;
  const cogUnread = opts.cognitivePillTier === "unread";
  const physUnread = opts.physicalPillTier === "unread";
  const drainedIntoHighStakes = opts.checkInOutcome === "drained" &&
    hasHighStakes;
  const lowSleepIntoHighStakes =
    opts.sleepScore !== null && opts.sleepScore < 65 && hasHighStakes;

  // ── Day-shape read runs before the pillar map. On a travel or conference
  // day the shape is the story; a workday pillar comparison misreads it.
  if (isTravelShape(opts.dayShape)) {
    const strained = opts.cognitivePillTier === "amber" ||
      opts.cognitivePillTier === "red" ||
      opts.physicalPillTier === "amber" || opts.physicalPillTier === "red" ||
      opts.band === "stretched" || opts.band === "depleted";
    if (opts.travelPhase === "post") {
      return "The transit has already been paid for — what's left is re-entry, and that costs more than it looks.";
    }
    if (opts.travelPhase === "in_transit") {
      return "The day belongs to the journey — arriving intact is the outcome that matters.";
    }
    if (opts.dayShape === "personal_travel") {
      return "The journey is the shape of the day, not the work around it.";
    }
    return strained
      ? "Travel takes more than the timetable shows, and the reserves going in are already thin."
      : "Travel takes more than the timetable shows — the reserves going in are what the other side gets.";
  }
  if (isConferenceShape(opts.dayShape)) {
    return opts.conferenceDayNumber != null && opts.conferenceDayNumber > 1
      ? "Attention load accumulates across conference days — that carry is the real signal today."
      : "A conference day asks for sustained attention rather than bursts of output.";
  }

  if (drainedIntoHighStakes && hasManyHighStakes) {
    return "The felt state and the calendar don't match — sequencing is the day's real decision.";
  }
  if (drainedIntoHighStakes) {
    return "The felt state and the calendar don't match - that gap is what needs managing.";
  }
  if (lowSleepIntoHighStakes) return "That changes what preparation looks like.";
  if (opts.hasBackToBack && opts.physicalPillTier !== "green") {
    if (physUnread) {
      return "The calendar is compressed and there's no current physiological read to weigh against it.";
    }
    return "Physiology is carrying more load going into a compressed calendar.";
  }
  if (hasHighStakes && opts.cognitivePillTier === "green") {
    return "Mind is clear and the calendar is stacked — use the edge.";
  }

  // Unread is not a tier. Never convert a missing signal into a neutral read
  // or a two-pillar comparison.
  if (cogUnread && physUnread) {
    return hasHighStakes
      ? "Neither Mind nor body has a current read today — the calendar is the only evidence in view."
      : "Neither Mind nor body has a current read today — the signal is thin, so treat the day on its own terms.";
  }
  if (cogUnread) {
    return "There's no current Mind read today, so the physical signal is the only one to work from.";
  }
  if (physUnread) {
    return "There's no current physical read today, so the Mind signal is the only one to work from.";
  }

  const pillKey = `${opts.cognitivePillTier}+${opts.physicalPillTier}`;
  const readMap: Record<string, string> = {
    "green+green": "Cognitive focus and physical stamina are clear - the day is yours to lead.",
    "green+amber":
      "Mental Bandwidth is clear even though the body is carrying more physical load than usual.",
    "green+red":
      "Mental Bandwidth is clear even though the physical runway is running short.",
    "amber+green":
      "Physical stamina is the asset today, maintaining steady Mental Bandwidth.",
    "red+red": "Both Mind and body are under load - the day asks for Strategic Composure, not output.",
    "red+green": "Physical stamina is the lead - Mental Bandwidth needs protecting.",
    firing: "Mind and body are carrying more supply than the day is asking for.",
    steady: "Mental Bandwidth and physical stamina are evenly matched with what's ahead.",
    stretched: "The day is asking more than the physical runway can easily cover without cost.",
    depleted: "Physical Recovery is lower than the calendar assumes.",
  };
  return readMap[pillKey] ?? readMap[opts.band] ?? readMap.steady;
}

function buildDirective(opts: DeterministicBriefFallbackOpts): string {
  const tiersForShape = [opts.cognitivePillTier, opts.physicalPillTier];
  const shapeStrained = tiersForShape.some((t) => t === "amber" || t === "red") ||
    opts.band === "stretched" || opts.band === "depleted";

  // ── DAY SHAPE ROUTING — runs before the weekend and pillar branches so a
  // Sunday flight reads as travel, not as a plain weekend.
  if (opts.dayShape === "work_travel") {
    if (opts.travelPhase === "in_transit") {
      return "The transit has already taken something. Focus on arriving intact before thinking about what comes next";
    }
    if (opts.travelPhase === "post") {
      return "The trip left a lag — sequence the first block against it, not through it";
    }
    if (shapeStrained) {
      return "The journey will cost more than the timetable shows. Protect what's there before it spends what's left";
    }
    if (opts.longHaulFlight) {
      return "Long-haul takes more than it looks — bank what you have before boarding, so the other side gets you intact";
    }
    return "Protect what you have before the journey spends it. Arrive in the condition the next thing needs";
  }
  if (opts.dayShape === "personal_travel") {
    return "The journey is the day. Arriving whole is the outcome — nothing else needs to be produced";
  }
  if (opts.dayShape === "conference") {
    const dayRef = opts.conferenceDayNumber != null
      ? `Day ${opts.conferenceDayNumber}`
      : "Today";
    return shapeStrained
      ? `${dayRef}: sustain attention in the sessions that earn it and let the rest pass through — the accumulated load is real`
      : `${dayRef}: sustain attention across the sessions that earn it and let the others pass through`;
  }
  if (isOffDayShape(opts.dayShape)) {
    return shapeStrained
      ? "The system needs this day to actually recover — not half-work it. Let today be what it is"
      : "Reserves are holding. Protect them rather than spending them; a little forward thinking is fine";
  }

  // ── Non-workday branch, before any pillar/high-stakes branch.
  // Weekend, long weekend, public holiday, PTO / OOO, personal leave and
  // personal travel all collapse into `isWeekend` upstream, so this single
  // gate covers every off-day shape. Beat (c) must carry no work language:
  // no meetings, calls, deliverables, team or "the room". Direction only —
  // never a practice, duration or protocol (that stays the Plan's job).
  if (opts.isWeekend) {
    const tiers = [opts.cognitivePillTier, opts.physicalPillTier];
    const anyStrained = tiers.some((t) => t === "amber" || t === "red");
    const lowBand = opts.band === "stretched" || opts.band === "depleted";
    const allGreen = tiers.every((t) => t === "green");

    if (anyStrained || lowBand) {
      // System is still paying down. Recovery is the only productive move.
      // No work language. Direction only.
      return "The system is still paying down from the week. Let today actually recover — that is the productive move";
    }
    if (allGreen || opts.band === "firing" || opts.band === "sharp") {
      // Green on a non-workday = strategic asset to protect, not spend.
      // Light forward thinking allowed. Reactive output is not.
      return "Reserves are holding — protect them. A small amount of forward thinking is fine; reactive output is not what today is for";
    }
    // Mixed / partially unread: non-prescriptive, no work framing.
    return "Keep the pace light. The week ahead will ask for what today preserves";
  }

  const hasHighStakes = opts.todayHighStakes.length > 0;
  const hasManyHighStakes = opts.todayHighStakes.length >= 2;
  const drainedIntoHighStakes = opts.checkInOutcome === "drained" &&
    hasHighStakes;
  const lowSleepIntoHighStakes =
    opts.sleepScore !== null && opts.sleepScore < 65 && hasHighStakes;

  if (drainedIntoHighStakes) {
    return hasManyHighStakes
      ? "Set the intention before each room; conserve the edge for where decisions land"
      : `Protect the edge before ${
        shortRef(opts.todayHighStakes[0])
      }; trim what's peripheral and enter with what is there intact`;
  }
  if (lowSleepIntoHighStakes) {
    return `Protect the first thinking window before ${
      shortRef(opts.todayHighStakes[0])
    } rather than generating in the room`;
  }
  if (opts.cognitivePillTier === "green" && opts.physicalPillTier !== "green") {
    return hasHighStakes
      ? `Front-load the decision and analysis work before ${
        shortRef(opts.todayHighStakes[0])
      }; let the presence work ride on physical steadiness`
      : "Use the window for decisions and analysis, keep the relational work short";
  }
  if (opts.physicalPillTier === "green" && opts.cognitivePillTier !== "green") {
    return "Route the presence and stakeholder conversations through the physical runway; defer anything needing full processing";
  }
  if (opts.cognitivePillTier === "green" && opts.physicalPillTier === "green") {
    if (hasHighStakes) {
      return `Open with ${
        shortRef(opts.todayHighStakes[0])
      } while both pillars are clear`;
    }
    return "Use this for the one decision or analysis that compounds most and protect the most important block";
  }
  if (opts.band === "depleted" || opts.band === "stretched") {
    return "Pick the one priority that cannot wait and do only that";
  }
  return "Use this for the one decision or analysis that compounds most and protect the most important block";
}

function closeFor(opts: DeterministicBriefFallbackOpts): string {
  // Day-shape closes run before the weekend override.
  if (opts.dayShape === "work_travel") {
    if (opts.travelPhase === "in_transit") {
      return "and land in the condition the next thing needs.";
    }
    if (opts.travelPhase === "post") {
      return "and let the system settle before pushing.";
    }
    return "and arrive with something in the tank.";
  }
  if (opts.dayShape === "personal_travel") {
    return "and let the trip actually land.";
  }
  if (opts.dayShape === "conference") {
    return opts.band === "depleted" || opts.band === "stretched"
      ? "and protect what's left for the sessions that matter."
      : "and protect the state for what tomorrow's sessions need.";
  }
  if (isOffDayShape(opts.dayShape)) {
    return "and let the return start with something in the tank.";
  }
  // Weekend override — applies regardless of band or window.
  if (opts.isWeekend) {
    if (opts.band === "firing" || opts.band === "sharp") {
      return "and make sure today genuinely recovers, not just overflows.";
    }
    if (opts.band === "depleted") {
      return "and protect tomorrow's start — that's what today is for.";
    }
    return "and let this window close so the week starts clean.";
  }
  if (
    opts.window === "evening" &&
    (opts.band === "steady" || opts.band === "stretched" ||
      opts.band === "depleted")
  ) {
    return "and close the laptop so tomorrow doesn't start in residue.";
  }
  const map: Record<DeterministicBriefBand, string> = {
    firing: "and don't overextend.",
    sharp: "and don't let the smaller calls chip at what's there.",
    steady: "and hold the line.",
    stretched: "and protect the close.",
    depleted: "and shut the laptop early.",
  };
  return map[opts.band];
}

export function buildDeterministicBriefFallback(
  rawOpts: DeterministicBriefFallbackOpts,
): DeterministicBriefResult | null {
  // Enforce the freshness contract at the boundary: a signal that is not
  // current for this window cannot reach any sentence builder.
  const wearableCurrent = rawOpts.hasCurrentWearable ?? rawOpts.hasWearable;
  const checkInCurrent = rawOpts.hasCurrentCheckIn ??
    (rawOpts.checkInOutcome != null);

  // Personal-signal entry condition: a deterministic brief is only built when
  // at least one current personal signal exists. Calendar demand alone must
  // not produce deterministic prose; the caller falls back to awaiting.
  if (!wearableCurrent && !checkInCurrent) {
    return null;
  }

  const opts: DeterministicBriefFallbackOpts = {
    ...rawOpts,
    // Any non-workday shape takes the weekend copy branches: no meetings, no
    // calls, no workday tasks in the directive.
    isWeekend: rawOpts.isWeekend === true || rawOpts.isNonWorkday === true,
    hasWearable: rawOpts.hasWearable && wearableCurrent,
    wearableFact: wearableCurrent ? rawOpts.wearableFact : null,
    sleepScore: wearableCurrent ? rawOpts.sleepScore : null,
    checkInOutcome: checkInCurrent ? rawOpts.checkInOutcome : null,
  };
  const phrase = phraseFor(opts);
  const evidence = buildEvidence(opts);
  const read = buildRead(opts);
  const directive = buildDirective(opts);
  const close = closeFor(opts);
  return {
    phrase,
    body: `${evidence} ${read} - ${directive}, ${close}`,
    topSignal: "baseline_quiet",
  };
}

