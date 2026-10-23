// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step DP2: Day Profile Headline and Character Composition.
// Source: Part 2 Layer 2 (Section 4.11).

import type { AvailabilityFacts } from "../../availability/types.ts";
import type { TravelFacts } from "../../travel/types.ts";
import type { ConferenceFacts } from "../../conference/types.ts";
import type { LoadFacts } from "../../load/types.ts";
import type { MixFacts } from "../../mix/types.ts";
import type { CrisisFacts } from "../../crisis/types.ts";
import type { WeekAheadFacts } from "../../week-ahead/types.ts";
import type { DayProfileContextualFacts } from "../types.ts";

export interface HeadlineCompositionInputs {
  availability: AvailabilityFacts;
  travel: TravelFacts;
  conference: ConferenceFacts;
  load: LoadFacts;
  mix: MixFacts;
  crisis: CrisisFacts;
  weekAhead: WeekAheadFacts;
  contextualFacts: DayProfileContextualFacts;
}

export function stepComposeHeadline(params: HeadlineCompositionInputs): {
  headline: string;
  character: string;
} {
  const parts: string[] = [];

  // 1. Travel prefix (always first if travelling)
  if (params.travel.isTravelling) {
    parts.push("Travel");
  }

  // 2. Crisis prefix (if active crisis episode)
  if (params.crisis.isCrisisDay) {
    parts.push("Crisis");
  }

  // 3. Non-working frame
  if (!params.availability.isWorkingDay) {
    const frameName = params.availability.frame === "weekend"
      ? "Weekend"
      : params.availability.frame === "leave"
      ? "Leave"
      : params.availability.frame === "long_weekend"
      ? "Long weekend"
      : "Public holiday";

    if (params.load.workOnNonWorkingDay?.isFullWorkingDay) {
      parts.push(`${frameName} · ${params.load.workOnNonWorkingDay.label}`);
    } else if (params.weekAhead.isActive) {
      parts.push(`${frameName} · Week ahead`);
    } else {
      parts.push(frameName);
    }

    const headline = parts.join(" · ");
    return {
      headline,
      character: frameName,
    };
  }

  // 4. Working day character
  let character = "Normal day";

  if (params.conference.isConferenceDay) {
    const dayPart = (params.conference.dayNumber && params.conference.totalDays && params.conference.totalDays > 1)
      ? `day ${params.conference.dayNumber} of ${params.conference.totalDays}`
      : "";
    const rolePart = params.conference.role === "speaking" ? "speaking" : "";
    const detail = [dayPart, rolePart].filter(Boolean).join(", ");
    character = detail ? `Conference day ${detail}` : "Conference day";
  } else if (params.contextualFacts.dualEmotionalStakes) {
    character = "High-stakes day: board and people";
  } else if (params.mix.predominant?.active) {
    const name = params.mix.predominant.name;
    const isHeavy = params.load.level === "heavy";
    const prefix = isHeavy ? `Heavy ${name} day` : `${name.charAt(0).toUpperCase() + name.slice(1)} day`;

    const modifiers: string[] = [];
    if (params.load.highStakesAnchor) modifiers.push("high-stakes");
    if (params.mix.backToBack.isBackToBackDay) modifiers.push("back-to-back");

    character = modifiers.length > 0 ? `${prefix}: ${modifiers.join(", ")}` : prefix;
  } else if (params.load.highStakesAnchor) {
    character = `High-stakes day: ${params.load.highStakesAnchor.title.toLowerCase()}`;
  } else if (params.mix.mixed?.active) {
    character = params.mix.mixed.label;
  } else if (params.load.level === "light") {
    character = params.load.personalDay ? "Personal day" : "Light day";
  } else if (params.load.level === "heavy") {
    character = "Heavy day";
  } else {
    character = "Normal day";
  }

  // Modifier: Half day prefix
  if (params.load.halfDay) {
    character = `Half day · ${character}`;
  }

  parts.push(character);
  const headline = parts.join(" · ");

  return {
    headline,
    character,
  };
}
