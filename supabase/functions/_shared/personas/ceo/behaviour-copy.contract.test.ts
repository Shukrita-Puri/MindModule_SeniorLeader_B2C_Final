// CI contract: every brief-scoped behaviour rule must have deterministic copy.
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { missingCopyEntries } from "./behaviour-copy.ts";
import { ALL_RULES } from "../../ceo-behaviour/index.ts";

Deno.test("contract: all brief-scoped rules have deterministic copy", () => {
  const missing = missingCopyEntries(
    ALL_RULES.map((r) => ({
      rule: String(r.id ?? r.fn.name),
      scopes: r.scopes as string[],
    })),
  );
  assertEquals(missing, []);
});

// ── Narrative copy (scenario families) ──────────────────────────────────────
import {
  assembleNarrativeBody,
  renderNarrativeBeats,
  type NarrativeCopyInput,
  type NarrativeWindow,
} from "./behaviour-copy.ts";
import type { BriefNarrativeFamily, LeadNarrative } from "../../brief/lead-narrative.ts";

const FAMILIES: BriefNarrativeFamily[] = [
  "travel_long_haul",
  "travel_short_haul",
  "travel_intercity",
  "persuasion_pre",
  "visibility_pre",
  "visibility_post",
  "conference_arc",
  "back_to_back",
  "weight_heavy",
  "volume_heavy",
  "context_switching",
];

function narrativeFor(family: BriefNarrativeFamily): LeadNarrative {
  return {
    family,
    anchor: {
      title: "the board call",
      categoryId: "A",
      subtypeId: null,
      minutesUntil: 45,
      durationMinutes: 60,
    },
    phase: "pre",
    depletion: true,
    aggregates: {
      meetingCount: 7,
      distinctCategories: 4,
      categorySequence: ["A", "B", "C", "D"],
      highStakesCount: 3,
      stakesWeight: 9,
      backToBackHours: 5,
      conferenceDayNumber: 2,
      conferenceTotalDays: 3,
      presentingInsideConference: false,
      eveningSocialLoad: false,
      travelTier: "long_haul",
      travelDurationHours: 9,
      meetingsAfterTravel: 2,
      meetingsBeforeTravel: 1,
    },
    reason: "test",
  } as LeadNarrative;
}

function inputFor(
  family: BriefNarrativeFamily,
  window: NarrativeWindow,
): NarrativeCopyInput {
  return {
    narrative: narrativeFor(family),
    band: "depleted",
    wearableFact: "Recovery is below its usual range",
    sleepScore: 48,
    checkInOutcome: "drained",
    window,
    anchorRef: "the board call in 45 minutes",
    anchorRefPlain: "the board call",
    variantSeed: `test|2026-08-26|${window}`,
  };
}

function bodyFor(family: BriefNarrativeFamily, window: NarrativeWindow): string {
  const beats = renderNarrativeBeats(inputFor(family, window));
  if (!beats) throw new Error(`no beats for ${family}`);
  return assembleNarrativeBody(beats);
}

Deno.test("narrative copy: sleep and overnight recovery never speak after the morning", () => {
  for (const family of FAMILIES) {
    for (const window of ["afternoon", "evening"] as NarrativeWindow[]) {
      const body = bodyFor(family, window);
      if (/sleep ran short|sleep was|last night|recovery is below|recovery is/i.test(body)) {
        throw new Error(`${family}/${window} quoted overnight signal: ${body}`);
      }
    }
  }
});

Deno.test("narrative copy: morning-only directives never reach afternoon or evening", () => {
  for (const family of FAMILIES) {
    for (const window of ["afternoon", "evening"] as NarrativeWindow[]) {
      const body = bodyFor(family, window);
      if (/front-load/i.test(body)) {
        throw new Error(`${family}/${window} used a morning-only directive: ${body}`);
      }
    }
    const evening = bodyFor(family, "evening");
    if (/before you board|before lunch|the day ahead/i.test(evening)) {
      throw new Error(`${family}/evening looked forward into a day that has run: ${evening}`);
    }
  }
});

Deno.test("narrative copy: the anchor's timing clause is spent at most once", () => {
  for (const family of FAMILIES) {
    for (const window of ["morning", "afternoon", "evening"] as NarrativeWindow[]) {
      const body = bodyFor(family, window);
      const hits = body.match(/in 45 minutes/g)?.length ?? 0;
      if (hits > 1) {
        throw new Error(`${family}/${window} repeated the timing clause: ${body}`);
      }
    }
  }
});

Deno.test("narrative copy: no '<event> ahead' construction", () => {
  for (const family of FAMILIES) {
    for (const window of ["morning", "afternoon", "evening"] as NarrativeWindow[]) {
      const body = bodyFor(family, window);
      if (/board call ahead/i.test(body)) {
        throw new Error(`${family}/${window} kept the 'ahead' suffix: ${body}`);
      }
    }
  }
});

Deno.test("narrative copy: baseline family stays on the generic path", () => {
  assertEquals(renderNarrativeBeats(inputFor("baseline", "morning")), null);
});
