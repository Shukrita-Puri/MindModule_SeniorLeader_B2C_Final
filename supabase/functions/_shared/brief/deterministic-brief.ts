import type { DayShape } from "./day-shape.ts";
import { withTiming } from "./time-phrase.ts";
import type { BriefCopyContext, PillarCluster } from "../brief-context.ts";
import { BEHAVIOUR_COPY } from "../personas/ceo/behaviour-copy.ts";
import { behaviourPriority } from "../behaviour-evaluator.ts";
import type { LeadNarrative } from "./lead-narrative.ts";
import {
  assembleNarrativeBody,
  renderNarrativeBeats,
} from "../personas/ceo/behaviour-copy.ts";
import {
  detectCluster,
  lexiconFallbackClause,
} from "../copy-vocabulary.ts";


export type DeterministicBriefBand =
  | "firing"
  | "sharp"
  | "steady"
  | "stretched"
  | "depleted";

export type DeterministicBriefPillTier = "green" | "amber" | "red" | "unread";

/**
 * Choose a lexicon cluster that matches the narrative family. Used as a
 * deterministic fallback when the assembled body does not already contain an
 * Elastic Lexicon concept.
 */
function preferredClusterForFamily(
  family: LeadNarrative["family"] | "baseline" | null,
): PillarCluster {
  switch (family) {
    case "travel_long_haul":
    case "travel_short_haul":
    case "travel_intercity":
    case "conference_arc":
      return "physiology";
    case "persuasion_pre":
    case "visibility_pre":
    case "visibility_post":
      return "resilience";
    case "back_to_back":
    case "weight_heavy":
    case "volume_heavy":
    case "context_switching":
      return "cognition";
    default:
      return "resilience";
  }
}

/**
 * Ensure the body carries at least one Elastic Lexicon concept. The fallback
 * clause is appended as a self-regulation close so it does not disturb the
 * existing four-beat structure or sentence count.
 */
function ensureLexiconCluster(
  body: string,
  family: LeadNarrative["family"] | "baseline" | null,
): string {
  if (detectCluster(body)) return body;
  const cluster = preferredClusterForFamily(family);
  const clause = lexiconFallbackClause(cluster);
  return body.endsWith(".") ? `${body.slice(0, -1)}, and ${clause}.` : `${body}, and ${clause}.`;
}

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
  /**
   * Known start timing for today's high-stakes events, keyed by verbatim title.
   * Drives every "in 45 minutes" / "in about 3 hours" clause. Titles absent
   * from this list stay time-neutral — copy never invents timing.
   */
  highStakesTiming?: Array<{ title: string; minutesUntil: number }> | null;
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
  /**
   * Active CEO behaviour flags from the Brief snapshot.
   * The deterministic path reads rule name + severity to produce
   * behaviour-aware copy when the LLM fails.
   * Source: briefBehaviourSnapshot.flagsBrief at the call site.
   */
  ceoFlags?:
    | Array<{
      rule: string;
      severity: "high" | "medium" | "low";
      copyHint?: string;
      stake?: string;
      evidence?: string[];
      anchorEvent?: string;
    }>
    | null;
  /**
   * Part 1A — the single resolved narrative for today (family, anchor event,
   * phase, depletion overlay). When present and non-baseline, the four beats
   * are rendered from the scenario copy pack instead of the generic builders.
   */
  leadNarrative?: LeadNarrative | null;
  /** Stable per-day variant seed: `${userId}|${localDate}|${window}`. */
  variantSeed?: string | null;
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
  if (/board|governance/i.test(clean)) return "the board call";
  if (/strategy|5.year|planning|deep work/i.test(clean)) return "the strategy session";
  if (/investor|pitch/i.test(clean)) return "the investor call";
  if (/keynote|speaking|media|press/i.test(clean)) return "the keynote";
  if (/all.?hands|town.?hall/i.test(clean)) return "the all-hands";
  if (/conference|summit/i.test(clean)) return "the conference";
  if (/feedback|difficult/i.test(clean)) return "the difficult conversation";
  if (/1.?1|one.?to.?one/i.test(clean)) return "the 1:1";

  // ── NEW: travel / flight detection ──
  if (/\b(flight|fly|flying|plane|airport|departing|boarding|long[- ]?haul|red[- ]?eye)\b/i.test(clean)) {
    return "the flight";
  }
  // Flight number pattern: BA 183, UA 456, QR 007 etc.
  if (/\b[A-Z]{2}\s*\d{2,4}\b/.test(clean)) return "the flight";

  return clean.length <= 25
    ? `the ${clean.toLowerCase()}`
    : `the ${clean.slice(0, 22).toLowerCase()}...`;
}

/** Minutes until a named event, when the caller supplied timing for it. */
function minutesUntilTitle(
  opts: DeterministicBriefFallbackOpts,
  title: string | null | undefined,
): number | null {
  if (!title) return null;
  const hit = (opts.highStakesTiming ?? []).find((t) => t.title === title);
  return typeof hit?.minutesUntil === "number" ? hit.minutesUntil : null;
}

/** Short reference carrying its time-to-event clause when the calendar has it. */
function shortRefTimed(
  opts: DeterministicBriefFallbackOpts,
  title: string,
): string {
  return withTiming(shortRef(title), minutesUntilTitle(opts, title));
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

function topCeoFlag(
  opts: DeterministicBriefFallbackOpts,
): NonNullable<DeterministicBriefFallbackOpts["ceoFlags"]>[number] | null {
  const SEV: Record<string, number> = { high: 3, medium: 2, low: 1 };
  return (opts.ceoFlags ?? [])
    .filter((f) => f.severity === "high" || f.severity === "medium")
    .sort(
      (a, b) =>
        (SEV[b.severity] ?? 0) - (SEV[a.severity] ?? 0) ||
        behaviourPriority(a.rule) - behaviourPriority(b.rule),
    )[0] ?? null;
}

/**
 * Build the narrow context the deterministic CEO behaviour copy pack expects.
 * Falls back to reasonable defaults when a field is not available on the
 * fallback options — the copy helpers already embed their own floor values.
 */
function buildBriefCopyContext(
  opts: DeterministicBriefFallbackOpts,
  flag: { rule: string; anchorEvent?: string; evidence?: string[] },
): BriefCopyContext {
  const anchorTitle = flag.anchorEvent ??
    opts.todayHighStakes[0] ??
    opts.travelEventTitle ??
    undefined;
  // The classifier-derived sequence is emitted by the rule as an evidence
  // string ("sequence: governance → finance → people"). Reuse it verbatim so
  // copy never re-derives categories.
  const seqLine = (flag.evidence ?? []).find((e) =>
    e.toLowerCase().startsWith("sequence:")
  );
  return {
    anchorEvent: anchorTitle
      ? { title: anchorTitle, minutesUntil: minutesUntilTitle(opts, anchorTitle) }
      : undefined,
    evidence: {
      categorySequence: seqLine
        ? seqLine.slice(seqLine.indexOf(":") + 1).trim()
        : undefined,
      attendeeCount: opts.meetingCount,
      decisionCount: opts.meetingCount,
      conferenceDayNumber: opts.conferenceDayNumber ?? undefined,
      backToBackHours: opts.hasBackToBack ? 4 : undefined,
    },
  };
}

/**
 * Qualitative calendar load, using the same vocabulary the calendar signal
 * pill renders (light / moderate / heavy). The brief never invents its own
 * load bands — `calendarLoad` is the demand-scorer SSOT value.
 */
function loadWord(
  opts: DeterministicBriefFallbackOpts,
): "light" | "moderate" | "heavy" {
  if (opts.calendarLoad === "high") return "heavy";
  if (opts.calendarLoad === "medium") return "moderate";
  if (opts.calendarLoad === "low") return "light";
  return effectiveMeetingCount(opts) >= 3 ? "moderate" : "light";
}

/**
 * Window-correct meeting count. Morning speaks to the whole day; afternoon and
 * evening speak only to what is still ahead. Counts are already deduplicated
 * upstream (cross-provider merge + overlap collapse) — never re-derived here.
 */
function effectiveMeetingCount(opts: DeterministicBriefFallbackOpts): number {
  if (opts.window === "morning") return opts.meetingCount;
  return typeof opts.remainingMeetings === "number"
    ? opts.remainingMeetings
    : opts.meetingCount;
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

  // ── CEO behaviour flag evidence ─ uses existing flagsBrief from the snapshot ──
  // Only fires when no travel shape has already produced evidence (travel wins).
  if (!isTravelShape(opts.dayShape) && !isConferenceShape(opts.dayShape)) {
    const flag = topCeoFlag(opts);
    if (flag) {
      const entry = BEHAVIOUR_COPY[flag.rule];
      if (entry) {
        return entry.evidence(buildBriefCopyContext(opts, flag));
      }
    }
  }

  if (drainedIntoHighStakes) {
    const eventRef = hasManyHighStakes
      ? opts.todayHighStakes.slice(0, 2).map(shortRef).join(" and ")
      : shortRefTimed(opts, opts.todayHighStakes[0]);
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
      shortRefTimed(opts, opts.todayHighStakes[0])
    } - on short sleep, depth matters more than volume.`;
  }

  if (opts.hasWearable && hasHighStakes) {
    return `${
      wearableFact ?? "Recovery signals are in"
    } going into ${shortRefTimed(opts, opts.todayHighStakes[0])}.`;
  }

  const effCount = effectiveMeetingCount(opts);
  const shapeWord = loadWord(opts);

  if (
    opts.hasWearable &&
    !hasHighStakes &&
    (effCount >= 3 || opts.calendarLoad === "medium" || opts.calendarLoad === "high")
  ) {
    if (effCount >= 3) {
      return `${
        wearableFact ?? "Recovery signals are in"
      } with a ${shapeWord} run of meetings stacked this ${opts.window}.`;
    }
    return `${
      wearableFact ?? "Recovery signals are in"
    } and the calendar is ${shapeWord} this ${opts.window}.`;
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
    // Spec Pattern 5: wearable read leads. Must reach the 15-word floor.
    // wearableFact is null when HRV and sleep data are unavailable (stale wearable).
    const factPhrase = wearableFact ?? "Recovery signals are in";
    if (effCount > 0) {
      // Volume is a fact: a light calendar is still a calendar, so this can
      // never claim the day is empty.
      return `${factPhrase} against a ${shapeWord} calendar this ${opts.window} — the demand is contained but real.`;
    }
    if (opts.isWeekend || opts.isNonWorkday) {
      return `${factPhrase} this ${opts.window} with no work calendar — the physiological read is the anchor for the weekend.`;
    }
    return `${factPhrase} this ${opts.window} with an open working day ahead — the time is unclaimed and yours to direct.`;
  }

  if (opts.checkInOutcome && hasHighStakes) {
    return `You've checked in ${opts.checkInOutcome} and ${
      shortRefTimed(opts, opts.todayHighStakes[0])
    } is the weight on the ${opts.window}.`;
  }

  if (opts.checkInOutcome && effCount > 0) {
    const evidenceOutcome = opts.checkInOutcome === "holding"
      ? "steady"
      : opts.checkInOutcome;
    return `You've checked in ${evidenceOutcome} against a ${shapeWord} calendar this ${opts.window}.`;
  }


  if (opts.checkInOutcome) {
    const evidenceOutcome = opts.checkInOutcome === "holding"
      ? "steady"
      : opts.checkInOutcome;
    return `You've checked in ${evidenceOutcome} and there's no wearable read yet this ${opts.window}.`;
  }

  // No current personal signal can reach this builder: buildDeterministicBriefFallback
  // returns null before any sentence is built (awaiting-signals contract).
  // This line exists only so the function is total.
  return `The calendar is the only read in view this ${opts.window}.`;
}

/**
 * Collapse a beat to one sentence with no dash breaks. `validateV61Output`
 * rejects em/en dashes anywhere between words, and the four-beat contract
 * caps the body at three sentences, so every beat is normalised here.
 */
function oneClause(s: string): string {
  return s
    .trim()
    .replace(/\s+[—–-]\s+/g, "; ")
    .replace(/([A-Za-z,])\s*[—–]\s*([A-Za-z])/g, "$1; $2")
    .replace(/\.\s+/g, "; ")
    .replace(/[.;,\s]+$/, "")
    .replace(/;\s+([A-Z][a-z])/g, (_m, w: string) => `; ${w.toLowerCase()}`)
    .trim();
}

function buildRead(opts: DeterministicBriefFallbackOpts): string {
  // ── Travel-aware reads — run before all pillar reads ──
  const shape = opts.dayShape ?? null;
  const phase = opts.travelPhase ?? null;

  if (shape === "work_travel") {
    if (phase === "pre") {
      return opts.longHaulFlight
        ? "Long-haul compounds everything — timezone, logistics, and decision load on the other side. That cost starts now."
        : "The flight changes the frame for the day. What you protect now is what you arrive with.";
    }
    if (phase === "in_transit") {
      return "The journey is already taking its toll. Arriving intact is the only metric that matters right now.";
    }
    if (phase === "post") {
      return "The trip left more lag than it looks. The body is still catching up even when the diary has moved on.";
    }
    return "Travel is the real load today — the work commitment after it amplifies that.";
  }

  if (shape === "personal_travel") {
    return "Travel draws on the system whether it's personal or not. The journey is the day's real demand.";
  }

  if (shape === "conference") {
    const anyStrained = ["amber", "red"].includes(opts.cognitivePillTier) ||
                        ["amber", "red"].includes(opts.physicalPillTier);
    return anyStrained
      ? "Sustained attention across sessions is the load — the body is carrying it."
      : "Conference days ask for sustained presence, not peak output. Pace accordingly.";
  }

  const hasHighStakes = opts.todayHighStakes.length > 0;
  const hasManyHighStakes = opts.todayHighStakes.length >= 2;
  const cogUnread = opts.cognitivePillTier === "unread";
  const physUnread = opts.physicalPillTier === "unread";
  const drainedIntoHighStakes = opts.checkInOutcome === "drained" &&
    hasHighStakes;
  const lowSleepIntoHighStakes =
    opts.sleepScore !== null && opts.sleepScore < 65 && hasHighStakes;

  // ── Conference day-shape read runs before the pillar map; a workday
  // pillar comparison misreads it. Travel shapes are handled above.
  if (isConferenceShape(opts.dayShape)) {
    return opts.conferenceDayNumber != null && opts.conferenceDayNumber > 1
      ? "Attention load accumulates across conference days — that carry is the real signal today."
      : "A conference day asks for sustained attention rather than bursts of output.";
  }

  // ── CEO behaviour flag read — workday only ──
  if (!isTravelShape(opts.dayShape) && !isConferenceShape(opts.dayShape)) {
    const flag = topCeoFlag(opts);
    if (flag) {
      const entry = BEHAVIOUR_COPY[flag.rule];
      if (entry) {
        return entry.read(buildBriefCopyContext(opts, flag));
      }
    }
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
  // ── DAY SHAPE ROUTING — always runs first.
  // Uses opts.dayShape when available (passed from briefDayShape in the
  // caller). Falls back to opts.isWeekend / opts.isNonWorkday for back-compat.
  // This is the only place that distinguishes work_travel (Sunday flight +
  // Monday meetings) from a plain weekend — without dayShape the two are
  // indistinguishable because isWeekend is true for both.

  const shape = opts.dayShape ?? null;
  const phase = opts.travelPhase ?? null;
  const tiers = [opts.cognitivePillTier, opts.physicalPillTier];
  const anyStrained = tiers.some((t) => t === "amber" || t === "red");
  const lowBand = opts.band === "stretched" || opts.band === "depleted";
  const allGreen = tiers.every((t) => t === "green");

  // ── WORK TRAVEL (flight + work commitment at destination) ──
  if (shape === "work_travel") {
    if (phase === "pre") {
      if (anyStrained || lowBand) {
        return "The journey will cost more than the timetable shows. Protect what's there before it spends what's left";
      }
      if (opts.longHaulFlight) {
        return "Long-haul takes more than it looks — bank what you have before boarding. The work on the other side needs you intact";
      }
      return "Protect what you have before the journey spends it. Arrive in the condition the next thing needs";
    }
    if (phase === "in_transit") {
      return "The transit has already taken something. Arrive intact before thinking about what comes next";
    }
    if (phase === "post") {
      return "The trip left a lag — sequence the first work block against it, not through it. Re-entry costs more than it looks";
    }
    return "Travel is the real cost today. Protect the state before the work starts";
  }

  // ── PERSONAL TRAVEL (no work commitment after landing) ──
  if (shape === "personal_travel") {
    return "The journey draws on the same system that runs the week. Arriving intact is the outcome — protect that, not the output";
  }

  // ── CONFERENCE (sustained attention load across sessions) ──
  if (shape === "conference") {
    const dayRef = typeof opts.conferenceDayNumber === "number"
      ? `Day ${opts.conferenceDayNumber}`
      : "Today";
    if (anyStrained || lowBand) {
      return `${dayRef}: sustain presence in the sessions that earn it. The accumulated load is real — let the rest pass through`;
    }
    return `${dayRef}: sustain presence across the sessions that earn it. Let the others pass through you`;
  }

  // ── PUBLIC HOLIDAY / PTO / PERSONAL HOLIDAY ──
  if (
    shape === "public_holiday" || shape === "pto" ||
    shape === "personal_holiday" || opts.isNonWorkday
  ) {
    if (anyStrained || lowBand) {
      return "The system needs this day to actually recover — not half-work it. Let today be what it is";
    }
    return "Keep what you have and let a little forward thinking be enough";
  }

  // ── WEEKEND (non-workday, no travel commitment) ──
  if (opts.isWeekend || shape === "weekend") {
    if (anyStrained || lowBand) {
      return "The system is still paying down from the week. Let today actually recover — that is the productive move";
    }
    if (allGreen || opts.band === "firing" || opts.band === "sharp") {
      return "Keep what you have. A small amount of forward thinking is fine; reactive output is not what today is for";
    }
    return "Keep the pace light. The week ahead will ask for what today protects";
  }

  // ── WORKDAY — pillar-based routing (unchanged from current code) ──
  // ── CEO behaviour flag directive — workday only ──
  {
    const flag = topCeoFlag(opts);
    if (flag) {
      const entry = BEHAVIOUR_COPY[flag.rule];
      if (entry) {
        return entry.directive(buildBriefCopyContext(opts, flag));
      }
    }
  }

  const hasHighStakes = opts.todayHighStakes.length > 0;
  const hasManyHighStakes = opts.todayHighStakes.length >= 2;
  const drainedIntoHighStakes =
    opts.checkInOutcome === "drained" && hasHighStakes;
  const lowSleepIntoHighStakes =
    opts.sleepScore !== null && opts.sleepScore < 65 && hasHighStakes;

  // Beat (c) — THE WORK DIRECTIVE. Names the cognitive posture (decide /
  // lead / listen / analyse / defer / execute / sequence / protect) AND the
  // kind of work it applies to today. Never a practice, never a duration,
  // never self-regulation — that is beat (d).
  if (drainedIntoHighStakes) {
    return hasManyHighStakes
      ? "Set the intention before each room; conserve the edge for where decisions land"
      : `Protect the edge before ${
        shortRefTimed(opts, opts.todayHighStakes[0])
      }; trim the peripheral work and walk in with what's intact`;
  }
  if (lowSleepIntoHighStakes) {
    return `Protect the first thinking window before ${
      shortRefTimed(opts, opts.todayHighStakes[0])
    } rather than generating in the room`;
  }
  if (opts.cognitivePillTier === "green" && opts.physicalPillTier !== "green") {
    return hasHighStakes
      ? `Front-load the decisions and the analysis before ${
        shortRefTimed(opts, opts.todayHighStakes[0])
      }; let the people work ride on presence, not fresh thinking`
      : "Take the decisions and the analysis while the head is clear. Keep the calls short and let the people work run on presence";
  }
  if (opts.physicalPillTier === "green" && opts.cognitivePillTier !== "green") {
    return "Lead the conversations and the stakeholder work today — that is where you're strong. Defer anything needing fresh analysis";
  }
  if (opts.cognitivePillTier === "green" && opts.physicalPillTier === "green") {
    if (hasHighStakes) {
      return `Open with ${
        shortRefTimed(opts, opts.todayHighStakes[0])
      } while both are clear. Decide in the room — don't gather more input first`;
    }
    if (opts.meetingCount >= 4) {
      return "Sequence the day around the two calls that actually decide something. Everything else can be short";
    }
    return "Spend the clear window on the one decision that compounds. Reactive work waits";
  }
  if (opts.band === "depleted" || opts.band === "stretched") {
    return hasHighStakes
      ? `Carry ${
        shortRefTimed(opts, opts.todayHighStakes[0])
      } and nothing else that needs a decision. Everything else moves`
      : "Pick the one priority that cannot wait and do only that. Everything else moves";
  }
  return "Spend the clear window on the one decision that compounds. Reactive work waits";
}


function ensureCloseLexicon(close: string): string {
  if (detectCluster(close)) return close;
  const clause = lexiconFallbackClause("resilience");
  return close.replace(/\.$/, "") + `, ${clause}.`;
}

function closeFor(opts: DeterministicBriefFallbackOpts): string {
  const shape = opts.dayShape ?? null;
  const phase = opts.travelPhase ?? null;

  // ── Travel closes — oriented toward arrival or re-entry ──
  if (shape === "work_travel") {
    if (phase === "pre")        return ensureCloseLexicon("and arrive with something in the tank.");
    if (phase === "in_transit") return ensureCloseLexicon("and land in the condition the next thing needs.");
    if (phase === "post")       return ensureCloseLexicon("and let the system settle before pushing.");
    return ensureCloseLexicon("and arrive intact.");
  }
  if (shape === "personal_travel") {
    return ensureCloseLexicon("and arrive with something left.");
  }

  // ── Conference close ──
  if (shape === "conference") {
    return ensureCloseLexicon(
      opts.band === "depleted" || opts.band === "stretched"
        ? "and protect what's left for the sessions that matter."
        : "and protect the state for what tomorrow opens with.",
    );
  }

  // ── Non-workday close (holiday / PTO) ──
  if (shape === "public_holiday" || shape === "pto" ||
      shape === "personal_holiday" || opts.isNonWorkday) {
    return ensureCloseLexicon("and start the return with something left.");
  }

  // ── Weekend close (existing strings — unchanged) ──
  if (opts.isWeekend || shape === "weekend") {
    if (opts.band === "firing" || opts.band === "sharp") {
      return ensureCloseLexicon("and make sure today genuinely recovers, not just overflows.");
    }
    if (opts.band === "depleted") {
      return ensureCloseLexicon("and protect tomorrow's start — that's what today is for.");
    }
    return ensureCloseLexicon("and let this window close so the week starts clean.");
  }

  // ── Workday close (existing logic — unchanged) ──
  // CEO behaviour flag close — workday only, when no off-day branch fired.
  {
    const flag = topCeoFlag(opts);
    if (flag) {
      const entry = BEHAVIOUR_COPY[flag.rule];
      if (!entry) {
        throw new Error(
          `[deterministic-brief] CEO flag=${flag.rule} has no BEHAVIOUR_COPY entry`,
        );
      }
      const close = entry.close(buildBriefCopyContext(opts, flag));
      // Copy pack closes are standalone clauses; prefix with "and" so the
      // final body sentence flows: "... directive, and close."
      return ensureCloseLexicon(close.startsWith("and ") ? close : `and ${close}`);
    }
  }

  // Beat (d) — THE CLOSE. Self-regulation only: how to hold yourself, never
  // another work instruction. 3–8 words, executive register.
  if (
    opts.window === "evening" &&
    (opts.band === "steady" || opts.band === "stretched" || opts.band === "depleted")
  ) {
    return ensureCloseLexicon("and close the laptop so tomorrow doesn't start in residue.");
  }
  const hasHighStakesLeft = opts.todayHighStakes.length > 0;
  if (hasHighStakesLeft && (opts.band === "stretched" || opts.band === "depleted")) {
    return ensureCloseLexicon("and settle yourself before you walk in.");
  }
  const map: Record<DeterministicBriefBand, string> = {
    firing:    "and hold your line when it speeds up.",
    sharp:     "and don't let small calls chip your edge.",
    steady:    "and steady yourself between the rooms.",
    stretched: "and take the gaps before they're gone.",
    depleted:  "and shut the laptop early tonight.",
  };
  return ensureCloseLexicon(map[opts.band]);

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
    // A travel or conference day is never routed as a weekend, even when it
    // falls on Saturday or Sunday — the shape outranks the calendar day.
    isWeekend: isTravelShape(rawOpts.dayShape) ||
        isConferenceShape(rawOpts.dayShape)
      ? false
      : rawOpts.isWeekend === true || rawOpts.isNonWorkday === true,
    hasWearable: rawOpts.hasWearable && wearableCurrent,
    wearableFact: wearableCurrent ? rawOpts.wearableFact : null,
    sleepScore: wearableCurrent ? rawOpts.sleepScore : null,
    checkInOutcome: checkInCurrent ? rawOpts.checkInOutcome : null,
  };
  const phrase = phraseFor(opts);

  // ── Scenario families (Part 1B) ──
  // A resolved, non-baseline narrative owns the body. Off-day shapes keep
  // their existing copy: no work directive may reach a holiday or weekend.
  const narrative = opts.leadNarrative ?? null;
  if (
    narrative && narrative.family !== "baseline" &&
    !opts.isWeekend && !opts.isNonWorkday && !isOffDayShape(opts.dayShape)
  ) {
    const anchorTitle = narrative.anchor?.title ?? null;
    const beats = renderNarrativeBeats({
      narrative,
      band: opts.band,
      wearableFact: sanitizeWearableFact(opts.wearableFact),
      sleepScore: opts.sleepScore,
      checkInOutcome: opts.checkInOutcome,
      hasCheckIn: checkInCurrent,
      window: opts.window,
      anchorRef: anchorTitle
        ? withTiming(shortRef(anchorTitle), narrative.anchor?.minutesUntil ?? null)
        : null,
      anchorRefPlain: anchorTitle ? shortRef(anchorTitle) : null,
      variantSeed: opts.variantSeed ?? `${opts.window}|${narrative.family}`,
    });
    if (!beats) {
      throw new Error(
        `[deterministic-brief] narrative family=${narrative.family} returned null beats; missing copy entry`,
      );
    }
    return {
      phrase,
      body: assembleNarrativeBody(beats),
      topSignal: "baseline_quiet",
    };
  }

  const evidence = buildEvidence(opts);
  // Read and Directive each occupy exactly one dash-free sentence so the
  // generic path honours the same 1–3 sentence four-beat budget as the
  // narrative path (beat d rides on the directive's sentence).
  const read = oneClause(buildRead(opts));
  const directive = oneClause(buildDirective(opts));
  const close = closeFor(opts);
  return {
    phrase,
    body: `${evidence} ${read}. ${directive}, ${close}`,
    topSignal: "baseline_quiet",
  };
}


