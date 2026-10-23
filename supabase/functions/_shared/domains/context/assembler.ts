// [KIND: assembler] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Context Assembler Pipeline.
// Pure assembler executing Pass 2 then Pass 3 in strict one-way dependency order.
// Source: Part 2 Layer 2 (Section 1.1, Section 5).

import { toCanonicalCalendarItem, type CanonicalCalendarItem } from "../calendar/canonical.ts";
import { evaluateDayProfile } from "../day-profile/index.ts";
import { evaluateImportance, adjustImportanceForWindow } from "../importance/index.ts";
import { evaluateStateProfile } from "../state-profile/index.ts";
import { evaluateWindowProfile } from "../window-profile/index.ts";
import type { ContextBundle, RawDatabaseContextBundle } from "./types.ts";
import type { ClassificationStamp } from "../events/types.ts";
import type { ScheduledMomentItem } from "../remaining/types.ts";
import type { RawBiometrics } from "../physiology/types.ts";
import type { CheckInReading } from "../self-report/types.ts";

export interface AssembleContextOptions {
  nowUtc?: Date;
  localHour?: number;
}

export function assembleContextFromRaw(
  raw: RawDatabaseContextBundle,
  options?: AssembleContextOptions
): ContextBundle {
  const now = options?.nowUtc ?? new Date();
  const localHour = options?.localHour ?? now.getUTCHours();

  // 1. Pass 1: Canonicalize calendar items
  const canonicalItems: CanonicalCalendarItem[] = (raw.calendarEvents ?? []).map((rawEvt) =>
    toCanonicalCalendarItem({
      userId: raw.userId,
      raw: rawEvt,
      provenance: { source: "db", traceId: "context_assemble" },
    })
  );

  // Minimal classification stamps fallback (or mapped from items)
  const stamps: ClassificationStamp[] = canonicalItems.map((item, idx) => {
    const rawEvt = (raw.calendarEvents ?? [])[idx] ?? {};
    const cat = (rawEvt.category as any) ?? "E";
    return {
      itemId: item.externalId,
      sourceType: "calendar",
      category: cat,
      categoryConfidence: 0.9,
      subtype: null,
      subtypeConfidence: 0.9,
      bestCandidateSubtype: null,
      confirmationState: "confirmed",
      decisionSource: "provider_label",
      runnerUp: null,
      reasons: [],
      findings: [],
      dimensions: {
        stakes: cat === "A" || cat === "B" || cat === "J" ? "high" : "medium",
        travelRelated: cat === "G",
        workContext: "work",
        durationMinutes: 60,
      },
      itemDemand: null,
      taxonomyVersion: "1.0",
      classifierVersion: "1.0",
      classifiedAt: now.toISOString(),
    };
  });

  // 2. Pass 2: The Day (Day Profile & Base Importance)
  const dayProfile = evaluateDayProfile({
    localDate: raw.localDate,
    items: canonicalItems,
    stamps,
    userLocale: "en-US",
    nowUtc: now,
  });

  const baseImportance = evaluateImportance({
    items: canonicalItems,
    stamps,
    nowUtc: now,
  });

  // 3. Pass 3: The Moment
  // 3a. Prepare state inputs
  const rawBiometrics: RawBiometrics = {
    hrvMs: (raw.wearableReadings?.hrv_rmssd as number) ?? null,
    restingHrBpm: (raw.wearableReadings?.resting_hr as number) ?? null,
    sleepMinutes: (raw.wearableReadings?.sleep_minutes as number) ?? null,
    readingTimestampUtc: (raw.wearableReadings?.created_at as string) ?? null,
  };

  const checkIns: CheckInReading[] = (raw.checkIns ?? []).map((c) => ({
    timestampUtc: (c.created_at as string) ?? now.toISOString(),
    emotionLevel: c.emotion_level as number,
    regulationLevel: c.regulation_level as number,
    clarityLevel: c.clarity_level as number,
    energyLevel: c.energy_level as number,
    pressureLevel: c.pressure_level as number,
  }));

  const scheduledMomentItems: ScheduledMomentItem[] = canonicalItems.map((item, idx) => {
    const rawEvt = (raw.calendarEvents ?? [])[idx] ?? {};
    return {
      id: item.externalId,
      title: item.title,
      category: (rawEvt.category as string) ?? "E",
      startUtc: item.startUtc,
      endUtc: item.endUtc,
    };
  });

  // 3b. State Profile
  const stateProfile = evaluateStateProfile({
    rawBiometrics,
    checkIns,
    scheduledItems: scheduledMomentItems,
    hasCalendar: raw.hasCalendar ?? true,
    hasWearable: raw.hasWearable ?? false,
    nowUtc: now,
  });

  // 3c. Importance Window Adjustment
  const adjustedImportance = adjustImportanceForWindow({
    base: baseImportance,
    stateProfile,
    nowUtc: now,
    recoveryOwed: dayProfile.contextualFacts.recoveryOwed,
  });

  // 3d. Window Profile
  const windowProfile = evaluateWindowProfile({
    modeInput: {
      localHour,
      localMinute: now.getUTCMinutes(),
    },
    items: scheduledMomentItems,
    stateProfile,
    dayProfile,
    nowUtc: now,
  });

  return {
    userId: raw.userId,
    localDate: raw.localDate,
    windowName: raw.windowName,
    dayProfile,
    stateProfile,
    windowProfile,
    importance: adjustedImportance,
    assembledAt: now.toISOString(),
    isCached: false,
  };
}
