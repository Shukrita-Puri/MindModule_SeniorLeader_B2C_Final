// MRS v3 — Morning window context (05:00–11:59 local).
//
// Answers: "What did yesterday cost, what did sleep restore, and what does
// today demand?" Pure derivation over pre-fetched inputs; no DB calls.

import type { MorningContext, WindowContextInput, SleepQuality } from './window-context-types.ts';
import {
  backToBackHours,
  categoryOf,
  deviationPct,
  firstHighStakes,
  hasConflict,
  HIGH_STAKES_CATEGORIES,
  loadScore,
  meetingCount,
  toEventLite,
} from './_event-utils.ts';

function sleepQualityLabel(score: number | null, baseline: number | null): SleepQuality {
  if (score == null) return null;
  // Without a baseline, fall back to absolute bands (0-100).
  if (baseline == null || !Number.isFinite(baseline) || baseline === 0) {
    if (score < 50) return 'poor';
    if (score < 70) return 'fair';
    if (score < 85) return 'good';
    return 'peak';
  }
  const dev = (score - baseline) / baseline;
  if (dev <= -0.15) return 'poor';
  if (dev <= -0.05) return 'fair';
  if (dev < 0.10) return 'good';
  return 'peak';
}

/**
 * Build the morning context. Pure. Safe to call with empty/null inputs —
 * fields degrade to 0 / null. Never throws.
 */
export function buildMorningContext(input: WindowContextInput): MorningContext {
  const yEvents = input.yesterdayEvents ?? [];
  const yLoad = loadScore(yEvents);

  const wear = input.wearable ?? null;
  const hrvDev = deviationPct(wear?.hrvToday, wear?.hrvBaseline30d ?? null);
  const rhrDev = deviationPct(wear?.rhrToday ?? null, wear?.rhrBaseline30d ?? null);

  const todayMeetings = meetingCount(input.todayEvents);
  const firstHs = firstHighStakes(input.todayEvents, input.now);

  // vetoRisk: HRV ≤ −15% AND a Cat A/B/C event today.
  const vetoRisk =
    typeof hrvDev === 'number' && hrvDev <= -15 &&
    input.todayEvents.some((e) => {
      const c = categoryOf(e.title);
      return !!c && HIGH_STAKES_CATEGORIES.has(c);
    });

  // Touch back-to-back here so morning carries the cost of yesterday too;
  // afternoon recomputes for the remainder.
  // (Unused in output today; kept for future morning fragmentation signal.)
  void backToBackHours(yEvents);

  return {
    window: 'morning',
    yesterdayLoadScore: yLoad.score,
    yesterdayLoad: yLoad.level,
    yesterdayHadHighStakes: yLoad.hasHighStakes,
    yesterdayHadConflict: hasConflict(yEvents),
    sleepHours: wear?.sleepHours ?? null,
    sleepQuality: sleepQualityLabel(
      wear?.sleepScore ?? null,
      wear?.sleepScoreBaseline30d ?? null,
    ),
    hrvDeviationPct: hrvDev,
    rhrDeviationPct: rhrDev,
    todayMeetingCount: todayMeetings,
    todayClassifiedEvents: input.todayEvents.map((e) => toEventLite(e, input.now)),
    todayFirstHighStakes: firstHs,
    vetoRisk,
    dayKind: input.dayKind ?? null,
    conferenceDayNumber: input.conferenceDayNumber ?? null,
  };
}