// OWNERSHIP: coaching + engineering. Chief-of-Staff copy for the eight
// deterministic narrative families resolved by ./lead-narrative.ts.
//
// Contract (verbatim from _shared/brief/copy-vocabulary.ts):
//   (a) EVIDENCE   — 1–2 short sentences, two signals from DIFFERENT buckets,
//                    stated not explained.
//   (b) THE READ   — one sentence, one judgment, no hedge.
//   (c) THE WORK DIRECTIVE — 1–2 sentences naming a cognitive posture
//                    (decide / lead / listen / analyse / defer / execute /
//                    sequence / protect) applied to today's real work.
//                    Category-level event reference only.
//   (d) THE CLOSE  — 3–8 words, self-regulation only, never another work
//                    instruction.
//
// Register: CHIEF_OF_STAFF_PERSONA / HOW_YOU_SPEAK / VOICE_SOUND_LIKE /
// REPLACEMENT_VOCABULARY. Plain executive English. No wellness words, no
// clinical terms (HRV, cortisol, baseline), no score or tier leakage, never
// the literal A–H letters.

import type { BriefNarrativeFamily, LeadNarrative } from "./lead-narrative.ts";

export type FamilyBand = "firing" | "sharp" | "steady" | "stretched" | "depleted";

export interface FamilyCopyInput {
  narrative: LeadNarrative;
  band: FamilyBand;
  /** Already sanitised recovery sentence, e.g. "Recovery is below its usual range". */
  wearableFact: string | null;
  sleepScore: number | null;
  checkInOutcome: "sharp" | "holding" | "drained" | null;
  window: "morning" | "afternoon" | "evening";
  /** Anchor reference carrying its timing clause, e.g. "the investor call in 45 minutes". */
  anchorRef: string | null;
  /** Anchor reference without timing, e.g. "the investor call". */
  anchorRefPlain: string | null;
  /** Stable within a day, varied across days: `${userId}|${localDate}|${window}`. */
  variantSeed: string;
}

export interface FamilyBeats {
  evidence: string;
  read: string;
  directive: string;
  close: string;
}

const LOW = (b: FamilyBand) => b === "stretched" || b === "depleted";

function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function pick<T>(variants: T[], seed: string, salt: string): T {
  return variants[hash(`${seed}|${salt}`) % variants.length];
}

// ── Beat (a) — evidence ─────────────────────────────────────────────────────
// Two signals from different buckets: body (recovery / sleep) + felt state or
// day shape. Never explains, never scores.

function bodySignal(i: FamilyCopyInput): string | null {
  if (i.wearableFact) return i.wearableFact;
  if (typeof i.sleepScore === "number") {
    if (i.sleepScore < 65) return "Sleep ran short last night";
    if (i.sleepScore >= 80) return "Sleep was solid last night";
    return "Sleep was about normal";
  }
  return null;
}

function feltSignal(i: FamilyCopyInput): string | null {
  if (i.checkInOutcome === "drained") return "you checked in drained";
  if (i.checkInOutcome === "sharp") return "you checked in sharp";
  if (i.checkInOutcome === "holding") return "you checked in holding";
  return null;
}

function shapeSignal(i: FamilyCopyInput): string {
  const a = i.narrative.aggregates;
  const n = i.narrative;
  switch (n.family) {
    case "travel_long_haul":
      return a.meetingsAfterTravel > 0
        ? `a long flight today and work waiting on the other side`
        : `a long flight today`;
    case "travel_short_haul":
      return a.meetingsBeforeTravel > 0 && a.meetingsAfterTravel > 0
        ? `work either side of the flight`
        : `a flight and work around it`;
    case "travel_intercity":
      return `out and back in one day`;
    case "persuasion_pre":
      return i.anchorRef ? `${i.anchorRef} on the calendar` : `a pitch on the calendar`;
    case "visibility_pre":
      return i.anchorRef ? `${i.anchorRef} ahead` : `a room to hold today`;
    case "visibility_post":
      return `you have just come off the stage`;
    case "conference_arc":
      return a.conferenceDayNumber && a.conferenceDayNumber > 1
        ? `day ${a.conferenceDayNumber} of the event`
        : `the first full day of the event`;
    case "back_to_back":
      return a.backToBackHours >= 3
        ? `${a.backToBackHours} hours of the day run without a gap`
        : `${a.meetingCount} meetings with almost nothing between them`;
    case "weight_heavy":
      return `${a.highStakesCount} rooms today that actually decide something`;
    case "volume_heavy":
      return `${a.meetingCount} meetings, most of which decide nothing`;
    case "context_switching":
      return `${a.distinctCategories} different kinds of room in one day`;
    default:
      return `${a.meetingCount} meetings today`;
  }
}

function buildEvidence(i: FamilyCopyInput): string {
  const body = bodySignal(i);
  const felt = feltSignal(i);
  const shape = shapeSignal(i);
  if (body && felt) return `${body} and ${felt}. Then ${shape}.`;
  if (body) return `${body}. ${cap(shape)}.`;
  if (felt) return `${cap(felt)}. ${cap(shape)}.`;
  return `${cap(shape)}.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Beat (b) — the read ─────────────────────────────────────────────────────

const READS: Record<BriefNarrativeFamily, { ok: string[]; low: string[] }> = {
  travel_long_haul: {
    ok: [
      "The flight is the cost today, not the meetings.",
      "The day is a transit day with work bolted on the end.",
    ],
    low: [
      "You are spending the day in a seat and arriving to real work — that is the squeeze.",
      "There is not enough in the tank to lose the whole flight to email.",
    ],
  },
  travel_short_haul: {
    ok: [
      "The travel is short; the switching around it is the real load.",
      "Two transitions, not one long one — that is what costs you.",
    ],
    low: [
      "The flight is short but the day is long, and you are starting it down.",
      "Short hops on a thin tank are where the edge quietly goes.",
    ],
  },
  travel_intercity: {
    ok: [
      "Out and back in a day: the re-entry is the cost, not the distance.",
      "The distance is nothing. Getting your head back is the work.",
    ],
    low: [
      "A same-day return on this much sleep leaves nothing for the evening.",
      "You will land back with less than you left with.",
    ],
  },
  persuasion_pre: {
    ok: [
      "This is a room you win on clarity, not effort.",
      "The pitch does not need more preparation. It needs you unhurried.",
    ],
    low: [
      "You are going into a persuasion room with less than usual to spend.",
      "There is enough for the pitch. There is not enough for the pitch plus everything else.",
    ],
  },
  visibility_pre: {
    ok: [
      "Being watched costs more than the content does.",
      "The room reads your state before it reads your argument.",
    ],
    low: [
      "Visibility on a thin day is where the tightness shows.",
      "You can hold the room, but not if you walk in cold and rushed.",
    ],
  },
  visibility_post: {
    ok: [
      "Coming off a stage leaves you wired, not finished.",
      "That kind of exposure keeps running long after the room empties.",
    ],
    low: [
      "You are past the room and still running hot on nothing.",
      "The stage is done; the charge it left is still spending you.",
    ],
  },
  conference_arc: {
    ok: [
      "These days do not spike — they accumulate.",
      "The sessions are not the load. The people between them are.",
    ],
    low: [
      "The event has been drawing on you for days and today asks for more.",
      "You are further into this than your reserves are.",
    ],
  },
  back_to_back: {
    ok: [
      "The compression is the problem, not the meetings.",
      "Nothing today is hard. All of it together is.",
    ],
    low: [
      "A day without gaps on a body without reserve is where quality slips.",
      "There is no room in this day to recover inside it.",
    ],
  },
  weight_heavy: {
    ok: [
      "Few rooms, large consequence. Today is about depth, not throughput.",
      "This is a day where two conversations carry everything.",
    ],
    low: [
      "The rooms are heavy and you are starting light.",
      "There is enough for the big rooms only if nothing else takes from them.",
    ],
  },
  volume_heavy: {
    ok: [
      "This is volume, not weight — and volume is what eats the day.",
      "Most of today is attendance, not decision.",
    ],
    low: [
      "A full calendar of low-yield rooms on a thin day is pure leakage.",
      "You cannot afford to spend this state on meetings that decide nothing.",
    ],
  },
  context_switching: {
    ok: [
      "Every switch costs you a few minutes of real thinking.",
      "The jumps between these rooms are what will tire you, not the rooms.",
    ],
    low: [
      "Re-orienting this many times on this much sleep is where mistakes come from.",
      "The switching cost is high and your margin for it is low.",
    ],
  },
  baseline: {
    ok: ["The day is workable as it stands."],
    low: ["There is less to spend today than the calendar assumes."],
  },
};

// ── Beat (c) — the work directive ───────────────────────────────────────────

function buildDirective(i: FamilyCopyInput): string {
  const n = i.narrative;
  const a = n.aggregates;
  const ref = i.anchorRef ?? i.anchorRefPlain;
  const low = LOW(i.band);

  switch (n.family) {
    case "travel_long_haul":
      if (n.phase === "post") {
        return a.meetingsAfterTravel > 0
          ? `Take the listening work first and defer anything irreversible until tomorrow`
          : `Execute the light work and defer decisions until you have slept in place`;
      }
      if (n.phase === "in_transit") {
        return `Use the first hour to decide what actually matters on landing, then stop working`;
      }
      return a.meetingsAfterTravel > 0
        ? `Front-load the decisions before you board, and land with only the listening left${ref ? ` for ${ref}` : ""}`
        : `Clear the decisions before you board and let the flight be the gap`;
    case "travel_short_haul":
      if (n.phase === "post") {
        return `Lead the conversations that are already scheduled and defer new analysis to tomorrow`;
      }
      return `Sequence the day around the transitions: decisions before the flight, listening after it`;
    case "travel_intercity":
      return `Do the deciding on the way out while you are fresh, and keep the return for execution, not judgement`;
    case "persuasion_pre":
      return low
        ? `Protect the hour before ${ref ?? "the pitch"} and carry nothing else into it. Everything else moves`
        : `Go in with the outcome and the first move clear${ref ? `, and give ${ref} the clean hour before it` : ""}`;
    case "visibility_pre":
      return low
        ? `Cut the preparation short and arrive early instead${ref ? `; ${ref} needs presence, not more notes` : ""}`
        : `Lead the room on presence, not volume of content, and keep the last thirty minutes before it clear`;
    case "visibility_post":
      return `Do not decide anything consequential for the next hour. Take the routine execution work while the charge comes down`;
    case "conference_arc":
      if (a.presentingInsideConference) {
        return `Protect the block before you present and treat the corridors as optional`;
      }
      if (a.eveningSocialLoad) {
        return `Pick the two sessions and the one dinner that matter and let the rest go`;
      }
      return low
        ? `Choose the two sessions that justify being here and skip the rest without guilt`
        : `Lead the conversations you came for and stop collecting the ones you did not`;
    case "back_to_back":
      return low
        ? `Sequence the day so the one room that decides something comes first${ref ? ` — ${ref}` : ""}. Everything after it can be listening`
        : `Sequence the irreversible calls into the early gaps and let the rest run as they are`;
    case "weight_heavy":
      return low
        ? `Carry ${ref ?? "the heavy room"} and nothing else that needs a decision. Everything else moves`
        : `Give the two rooms with consequence your full attention and let the rest run light`;
    case "volume_heavy":
      return low
        ? `Cut two meetings before lunch and protect the one hour that actually produces something`
        : `Decline or shorten what decides nothing, and spend the reclaimed hour on the work that compounds`;
    case "context_switching":
      return low
        ? `Group the similar rooms together where you still can and put five minutes between the ones you cannot move`
        : `Order the day so the deciding happens before the switching starts, and leave a gap either side of ${ref ?? "the big room"}`;
    default:
      return low
        ? `Pick the one priority that cannot wait and do only that`
        : `Spend the clear window on the one decision that compounds`;
  }
}

// ── Beat (d) — the close. Self-regulation only. 3–8 words. ──────────────────

const CLOSES: Record<BriefNarrativeFamily, { ok: string[]; low: string[] }> = {
  travel_long_haul: {
    ok: ["and land in some kind of shape.", "and keep something back for the other side."],
    low: ["and sleep on the plane, properly.", "and stop working before you land."],
  },
  travel_short_haul: {
    ok: ["and settle yourself between the legs.", "and take the gate time as a gap."],
    low: ["and let the flight be genuinely empty.", "and stop pushing once you land."],
  },
  travel_intercity: {
    ok: ["and give yourself the train back.", "and come home before you get home."],
    low: ["and let the evening be nothing.", "and shut it down on the way back."],
  },
  persuasion_pre: {
    ok: ["and settle yourself before you walk in.", "and go in unhurried."],
    low: ["and steady yourself in the last ten minutes.", "and slow your first sentence down."],
  },
  visibility_pre: {
    ok: ["and arrive early enough to breathe.", "and steady yourself before the lights."],
    low: ["and get quiet before you go on.", "and keep the ten minutes before it silent."],
  },
  visibility_post: {
    ok: ["and let the charge come down.", "and give yourself twenty quiet minutes."],
    low: ["and shut the laptop early tonight.", "and stop before the adrenaline stops you."],
  },
  conference_arc: {
    ok: ["and take the breaks you are given.", "and keep one hour to yourself."],
    low: ["and skip the drinks tonight.", "and get back to the room early."],
  },
  back_to_back: {
    ok: ["and steady yourself between the rooms.", "and take the gaps before they go."],
    low: ["and stand up between two of them.", "and stop at the end, not after."],
  },
  weight_heavy: {
    ok: ["and hold your line in the big room.", "and settle yourself before you walk in."],
    low: ["and keep your edge for the one room.", "and steady yourself beforehand."],
  },
  volume_heavy: {
    ok: ["and don't let small calls chip your edge.", "and keep one hour genuinely yours."],
    low: ["and shut the laptop early tonight.", "and stop answering after six."],
  },
  context_switching: {
    ok: ["and reset yourself between the jumps.", "and take a minute before each one."],
    low: ["and stop switching after the last room.", "and give yourself a quiet evening."],
  },
  baseline: {
    ok: ["and hold your line when it speeds up.", "and steady yourself between the rooms."],
    low: ["and shut the laptop early tonight.", "and take the gaps before they're gone."],
  },
};

/**
 * Render the four beats for a resolved narrative family.
 * Returns null for the `baseline` family so the caller keeps its existing
 * generic path (weekend / off-day / no-calendar copy is unchanged).
 */
export function renderFamilyBeats(i: FamilyCopyInput): FamilyBeats | null {
  const family = i.narrative.family;
  if (family === "baseline") return null;

  const low = LOW(i.band) || i.narrative.depletion;
  const reads = READS[family];
  const closes = CLOSES[family];

  return {
    evidence: buildEvidence(i),
    read: pick(low ? reads.low : reads.ok, i.variantSeed, `read:${family}`),
    directive: buildDirective(i),
    close: pick(low ? closes.low : closes.ok, i.variantSeed, `close:${family}`),
  };
}

/** Assemble the four beats into the body string the Brief renders. */
export function assembleFamilyBody(b: FamilyBeats): string {
  return `${b.evidence} ${b.read} ${b.directive}, ${b.close}`;
}
