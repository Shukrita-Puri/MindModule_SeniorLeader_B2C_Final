// OWNERSHIP: engineering.
// Daily Question candidate selector (Spec §6 Step 3.4, §10, §14 Step 21).
//
// At most one question a day, selected during the evening run, about an unconfirmed event.
// Selection hierarchy:
//   1. Post-incident crisis reflection (if event had inferred J or incident debrief)
//   2. Recurring meetings (where one answer fixes the whole series)
//   3. High-importance / high-stakes events
//   4. Imminent events in the next 72 hours
//
// The candidate provides 1-tap options with explicit scope:
//   - For recurring: THIS_SERIES is primary, THIS_EVENT is secondary
//   - For single events: THIS_EVENT is primary, TITLE_PATTERN is optional

import type { EventCategoryId } from "./event-categories.ts";
import type { CanonicalItem, ClassificationStamp, MemoryScopeType } from "./spine-contracts.ts";
import { isNoiseTitle } from "./event-classifier.ts";
import { resolveEvent } from "./resolve-event-category.ts";

export interface DailyQuestionOption {
  label: string;
  scope: "THIS_SERIES" | "THIS_EVENT" | "TITLE_PATTERN" | "PERSON" | "ORGANISATION";
  category: EventCategoryId;
  subtypeId?: string | null;
}

export interface DailyQuestionCandidate {
  eventId: string;
  seriesId?: string | null;
  title: string;
  startTime?: string | null;
  proposedCategory: EventCategoryId | null;
  proposedSubtype: string | null;
  runnerUpCategory?: EventCategoryId | null;
  status: "uncertain" | "inferred_medium" | "inferred_high" | "crisis_reflective";
  confidence: number;
  questionText: string;
  options: DailyQuestionOption[];
  urgencyScore: number;
  reason: string;
}

export interface SelectDailyQuestionOptions {
  now?: Date;
  timezone?: string;
  previouslyAskedEventIds?: Set<string>;
}

export function selectDailyQuestionCandidate(
  events: (CanonicalItem | Record<string, unknown>)[],
  opts?: SelectDailyQuestionOptions,
): DailyQuestionCandidate | null {
  if (!Array.isArray(events) || events.length === 0) return null;

  const nowMs = (opts?.now ?? new Date()).getTime();
  const previouslyAsked = opts?.previouslyAskedEventIds ?? new Set<string>();
  const horizonPastMs = nowMs - 24 * 3600 * 1000;   // looked back 24h for today's reflection
  const horizonFutureMs = nowMs + 72 * 3600 * 1000; // look ahead 72h

  const candidates: {
    candidate: DailyQuestionCandidate;
    score: number;
  }[] = [];

  for (const raw of events) {
    const title = String((raw as any)?.title ?? "").trim();
    if (!title || isNoiseTitle(title)) continue;

    const eventId = String((raw as any)?.itemId ?? (raw as any)?.id ?? "");
    if (!eventId || previouslyAsked.has(eventId)) continue;

    const seriesId = (raw as any)?.seriesId ?? (raw as any)?.series_id ?? (raw as any)?.recurring_event_id ?? null;
    const isRecurring = Boolean(seriesId || (raw as any)?.isRecurring || (raw as any)?.is_recurring);

    const startStr = (raw as any)?.startTime ?? (raw as any)?.start_time ?? null;
    const startMs = startStr ? new Date(startStr).getTime() : 0;

    // Filter to window: past 24h (reflection) to next 72h (preparation)
    if (startMs > 0 && (startMs < horizonPastMs || startMs > horizonFutureMs)) {
      continue;
    }

    // Resolve event via Spine
    const resolved = resolveEvent(raw);
    const stamp: ClassificationStamp | null = resolved.stamp ?? null;

    // Already user-confirmed items do not need clarification questions
    if (resolved.source === "user_override" || stamp?.confirmationState === "confirmed") {
      continue;
    }

    const category = resolved.categoryId;
    const subtypeId = resolved.subtype?.id ?? null;
    const confidence = stamp?.categoryConfidence ?? (resolved.confidence === "high" ? 0.8 : resolved.confidence === "medium" ? 0.6 : 0.4);
    const confirmationState = stamp?.confirmationState ?? (confidence < 0.55 ? "uncertain" : "inferred_medium");
    const runnerUp = stamp?.runnerUp?.category ?? null;

    let score = 0;
    let isCrisisReflective = false;
    let reason = "";

    // 1. Post-incident crisis reflection (Spec §10, §14 Step 21)
    const lowerTitle = title.toLowerCase();
    const hasCrisisCues = category === "J" ||
      lowerTitle.includes("incident") ||
      lowerTitle.includes("post-mortem") ||
      lowerTitle.includes("outage") ||
      lowerTitle.includes("war room");

    if (hasCrisisCues) {
      isCrisisReflective = true;
      score += 150; // Top priority
      reason = "Incident reflection and post-incident practice";
    }

    // 2. Recurring meetings (Spec §10: "where one answer fixes the series")
    if (isRecurring) {
      score += 80;
      if (!reason) reason = "Recurring series: 1 answer categorises all future occurrences";
    }

    // 3. High stakes / importance
    const stakes = stamp?.dimensions?.stakes;
    if (stakes === "critical" || stakes === "high" || category === "A" || category === "B" || category === "C") {
      score += 50;
      if (!reason) reason = "High stakes event requires classification clarity";
    }

    // 4. Uncertainty / close margin
    if (confirmationState === "uncertain" || confidence < 0.55) {
      score += 40;
      if (!reason) reason = "Classifier uncertain of intent";
    } else if (confirmationState === "inferred_medium") {
      score += 20;
    }

    // 5. Imminent in next 24 hours
    if (startMs > nowMs && startMs <= nowMs + 24 * 3600 * 1000) {
      score += 25;
    }

    if (score < 30) continue;

    // Build user-friendly question prompt & options
    const questionText = isCrisisReflective
      ? `Did you just handle an incident or crisis with "${title}"?`
      : `How would you categorise "${title}"?`;

    const options: DailyQuestionOption[] = [];

    if (isRecurring && seriesId) {
      if (category) {
        options.push({
          label: `Yes, for every week (${category})`,
          scope: "THIS_SERIES",
          category,
          subtypeId,
        });
        options.push({
          label: `Only for this week (${category})`,
          scope: "THIS_EVENT",
          category,
          subtypeId,
        });
      }
      if (runnerUp && runnerUp !== category) {
        options.push({
          label: `Actually ${runnerUp} (every week)`,
          scope: "THIS_SERIES",
          category: runnerUp,
        });
      }
    } else {
      if (category) {
        options.push({
          label: `Yes, this is ${category}`,
          scope: "THIS_EVENT",
          category,
          subtypeId,
        });
      }
      if (runnerUp && runnerUp !== category) {
        options.push({
          label: `No, this is ${runnerUp}`,
          scope: "THIS_EVENT",
          category: runnerUp,
        });
      }
      options.push({
        label: "Always this pattern",
        scope: "TITLE_PATTERN",
        category: category ?? "I",
        subtypeId,
      });
    }

    candidates.push({
      score,
      candidate: {
        eventId,
        seriesId,
        title,
        startTime: startStr,
        proposedCategory: category,
        proposedSubtype: subtypeId,
        runnerUpCategory: runnerUp,
        status: isCrisisReflective ? "crisis_reflective" : confirmationState,
        confidence,
        questionText,
        options,
        urgencyScore: score,
        reason,
      },
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].candidate;
}
