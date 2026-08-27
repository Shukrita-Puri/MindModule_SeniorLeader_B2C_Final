import { buildDeterministicBriefFallback } from "./supabase/functions/_shared/brief/deterministic-brief.ts";
import { validateBrief } from "./supabase/functions/_shared/brief-validators.ts";
import type { BriefNarrativeFamily, LeadNarrative } from "./supabase/functions/_shared/brief/lead-narrative.ts";
import type { DeterministicBriefBand, DeterministicBriefFallbackOpts } from "./supabase/functions/_shared/brief/deterministic-brief.ts";

const FAMILIES: BriefNarrativeFamily[] = [
  "travel_long_haul", "travel_short_haul", "travel_intercity",
  "persuasion_pre", "visibility_pre", "visibility_post",
  "conference_arc", "back_to_back", "weight_heavy", "volume_heavy",
  "context_switching", "baseline",
];
const WINDOWS: Array<"morning" | "afternoon" | "evening"> = ["morning", "afternoon", "evening"];
const BANDS: DeterministicBriefBand[] = ["firing", "sharp", "steady", "stretched", "depleted"];

function narrativeFor(family: BriefNarrativeFamily): LeadNarrative {
  const isTravel = family.startsWith("travel");
  return {
    family,
    anchor: {
      title: isTravel ? "the flight" : "the board call",
      categoryId: family === "conference_arc" ? "F" : "A",
      subtypeId: null,
      minutesUntil: 45,
      durationMinutes: 60,
    },
    phase: "pre",
    depletion: false,
    aggregates: {
      meetingCount: 7, distinctCategories: 4, categorySequence: ["A", "B", "C", "D"],
      highStakesCount: 3, stakesWeight: 9, backToBackHours: 5,
      conferenceDayNumber: 2, conferenceTotalDays: 3, presentingInsideConference: false,
      eveningSocialLoad: false,
      travelTier: family === "travel_long_haul" ? "long_haul" : family === "travel_short_haul" ? "short_haul" : "short_haul_round_trip",
      travelDurationHours: family === "travel_long_haul" ? 9 : 3,
      meetingsAfterTravel: 2, meetingsBeforeTravel: 1,
    },
    reason: "diagnose",
  };
}

function baseOpts(family: BriefNarrativeFamily, window: typeof WINDOWS[number], band: DeterministicBriefBand): DeterministicBriefFallbackOpts {
  const isTravel = family.startsWith("travel");
  const isConference = family === "conference_arc";
  return {
    band, hasWearable: true, hasCurrentWearable: true, hasCurrentCheckIn: true,
    checkInOutcome: band === "depleted" ? "drained" : band === "firing" ? "sharp" : "holding",
    cognitivePillTier: band === "depleted" ? "red" : band === "stretched" ? "amber" : "green",
    physicalPillTier: band === "depleted" ? "red" : band === "stretched" ? "amber" : "green",
    wearableFact: window === "morning" ? "Recovery is in its usual range" : null,
    window,
    todayHighStakes: family === "baseline" ? [] : ["the board call"],
    highStakesTiming: family === "baseline" ? [] : [{ title: "the board call", minutesUntil: 45 }],
    calendarLoad: "medium", meetingCount: 5, sleepScore: 78,
    hasBackToBack: family === "back_to_back",
    isWeekend: false, isNonWorkday: false,
    dayShape: isTravel ? "work_travel" : isConference ? "conference" : null,
    travelPhase: isTravel ? "pre" : null, longHaulFlight: family === "travel_long_haul",
    conferenceDayNumber: isConference ? 2 : null, conferenceTitle: isConference ? "the conference" : null,
    travelEventTitle: isTravel ? "the flight" : null,
    ceoFlags: [], leadNarrative: family === "baseline" ? null : narrativeFor(family),
    variantSeed: `diagnose|${family}|${window}|${band}`,
  };
}

const failures: string[] = [];
let total = 0;
for (const family of FAMILIES) {
  for (const window of WINDOWS) {
    const bands = family === "baseline" ? (["steady", "depleted"] as DeterministicBriefBand[]) : BANDS;
    for (const band of bands) {
      total++;
      const opts = baseOpts(family, window, band);
      const result = buildDeterministicBriefFallback(opts);
      if (!result) {
        failures.push(`${family}/${window}/${band}: null result`);
        continue;
      }
      const v = validateBrief(result.phrase, result.body, {
        signals: { highStakesEventInNext24h: opts.todayHighStakes.length > 0 ? { title: opts.todayHighStakes[0], minutesUntil: 45 } : null, emotionalDrainEventInNext4h: null },
        behaviourFlags: [], lexiconClusters: [], forbiddenWords: [], allowedPatternKeywords: [],
      } as any, { mrsScore: 55, pillContext: null });
      if (!v.ok) failures.push(`${family}/${window}/${band}: ${v.reason} | ${result.body}`);
    }
  }
}

console.log(`Total: ${total}, Failures: ${failures.length}`);
for (const f of failures.slice(0, 30)) console.log(f);
if (failures.length > 30) console.log(`... and ${failures.length - 30} more`);
