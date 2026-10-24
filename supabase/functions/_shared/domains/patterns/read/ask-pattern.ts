// [KIND: engine] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// On-Demand Pattern Query (E-L4-10, 9A, Scenario L4-17).
// Answers specific pattern questions for Chief of Staff chat without writing to DB.
// Source: Part 2 Layer 4 (Section 9A, Scenario L4-17).

import { MIN_MEASURED_N_EMERGING } from "../constants.ts";
import type { AskPatternResult, Finding, History } from "../types.ts";

export interface AskPatternInput {
  question: string;
  category: string; // e.g. "A" (board)
  metric: "hrv" | "rhr" | "deep_sleep" | "total_sleep" | "prs" | "focus";
  history: History;
  existingFindings?: Finding[];
}

/**
 * Evaluates an ad-hoc pattern question (Scenario L4-17).
 * Never writes to DB. Returns finding or exact count explanation ("not enough yet: X of 3 occurrences").
 */
export function askPattern(input: AskPatternInput): AskPatternResult {
  const catUpper = input.category.toUpperCase();

  // 1. Check if a precomputed finding already exists
  if (input.existingFindings) {
    const match = input.existingFindings.find(
      (f) =>
        f.bucketKey.toUpperCase().startsWith(catUpper) &&
        f.metric === input.metric &&
        f.confidence !== "insufficient_data"
    );
    if (match) {
      return {
        status: "found",
        question: input.question,
        occurrences: match.occurrences,
        requiredOccurrences: MIN_MEASURED_N_EMERGING,
        dates: match.sampleDates,
        finding: match,
        explanation: match.reason,
      };
    }
  }

  // 2. Count matching occurrences in history
  const occurrences: string[] = [];
  for (const day of input.history.days) {
    const hasCategory = day.events?.some(
      (e) => e.stamp?.category?.toUpperCase() === catUpper
    );
    if (hasCategory) {
      occurrences.push(day.date);
    }
  }

  if (occurrences.length === 0) {
    return {
      status: "no_data",
      question: input.question,
      occurrences: 0,
      requiredOccurrences: MIN_MEASURED_N_EMERGING,
      dates: [],
      explanation: `No events in category ${catUpper} recorded in the current history window.`,
    };
  }

  // Scenario L4-17: 2 boards in window -> "not enough yet: 2 of 3 occurrences", with dates
  if (occurrences.length < MIN_MEASURED_N_EMERGING) {
    return {
      status: "not_enough_yet",
      question: input.question,
      occurrences: occurrences.length,
      requiredOccurrences: MIN_MEASURED_N_EMERGING,
      dates: occurrences,
      explanation: `Not enough yet: ${occurrences.length} of ${MIN_MEASURED_N_EMERGING} occurrences recorded (${occurrences.join(", ")}).`,
    };
  }

  return {
    status: "found",
    question: input.question,
    occurrences: occurrences.length,
    requiredOccurrences: MIN_MEASURED_N_EMERGING,
    dates: occurrences,
    explanation: `${occurrences.length} occurrences observed in window (${occurrences.join(", ")}).`,
  };
}
