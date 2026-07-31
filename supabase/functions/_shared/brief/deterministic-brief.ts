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
}

export interface DeterministicBriefResult {
  phrase: string;
  body: string;
  topSignal: "baseline_quiet";
}

function shortRef(title: string): string {
  const clean = title.replace(/^\d{1,2}:\d{2}\s+/, "").trim();
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
    return `${wearableFact ?? "Recovery signals are in"} this ${opts.window}.`;
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
  const drainedIntoHighStakes = opts.checkInOutcome === "drained" &&
    hasHighStakes;
  const lowSleepIntoHighStakes =
    opts.sleepScore !== null && opts.sleepScore < 65 && hasHighStakes;

  if (drainedIntoHighStakes && hasManyHighStakes) {
    return "The felt state and the calendar don't match — sequencing is the day's real decision.";
  }
  if (drainedIntoHighStakes) {
    return "The felt state and the calendar don't match - that gap is what needs managing.";
  }
  if (lowSleepIntoHighStakes) return "That changes what preparation looks like.";
  if (opts.hasBackToBack && opts.physicalPillTier !== "green") {
    return "Physiology is carrying more load going into a compressed calendar.";
  }
  if (hasHighStakes && opts.cognitivePillTier === "green") {
    return "Mind is clear and the calendar is stacked — use the edge.";
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
    return hasHighStakes
      ? `Open with ${shortRef(opts.todayHighStakes[0])} while both pillars are clear`
      : "Use this for the one decision or analysis that compounds most";
  }
  if (opts.band === "depleted" || opts.band === "stretched") {
    return "Pick the one priority that cannot wait and do only that";
  }
  return "Keep pace and protect the most important block";
}

function closeFor(opts: DeterministicBriefFallbackOpts): string {
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
  opts: DeterministicBriefFallbackOpts,
): DeterministicBriefResult {
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
