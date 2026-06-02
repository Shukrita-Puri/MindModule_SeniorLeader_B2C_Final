// MRS v3 — Evening window context (18:00–04:59 local).
//
// Answers: "Total today cost, body depletion signal, tomorrow's opening
// demand." Implements the §3.1 evening JIT gear-shift: when any JIT event
// for today remains unactioned, mode flips to 'jit_remaining' and Close
// framing is suppressed by the consumer.

import type { EveningContext, EveningMode, RecoveryNote, WindowContextInput } from './window-context-types.ts';
import {
  categoryOf,
  deviationPct,
  firstHighStakes,
  hasConflict,
  loadScore,
  meetingCount,
} from './_event-utils.ts';
import type { StakesCategory } from './window-context-types.ts';

function uniqueCategories(events: { title?: string | null }[]): StakesCategory[] {
  const seen = new Set<StakesCategory>();
  for (const e of events) {
    const c = categoryOf(e.title ?? null);
    if (c) seen.add(c);
  }
  return Array.from(seen);
}

function deriveRecoveryNote(
  todayLevel: 'low' | 'medium' | 'high',
  tomorrowPressureHeavy: boolean,
): RecoveryNote {
  const todayHeavy = todayLevel === 'high';
  if (todayHeavy && tomorrowPressureHeavy) return 'rest';
  if (todayHeavy || tomorrowPressureHeavy) return 'light';
  if (todayLevel === 'medium') return 'light';
  return 'normal';
}

/**
 * Build the evening context. Pure. Implements the §3.1 JIT gear-shift.
 */
export function buildEveningContext(input: WindowContextInput): EveningContext {
  const today = input.todayEvents;
  const completedToday = today.filter((e) => {
    const end = new Date(e.end_time).getTime();
    return Number.isFinite(end) && end <= input.now.getTime();
  });

  const todayLoad = loadScore(completedToday.length ? completedToday : today);

  const wear = input.wearable ?? null;

  // body_load_elevated: afternoon avg HR > 10% above resting baseline.
  const bodyLoadDev = deviationPct(wear?.hrAvgAfternoon ?? null, wear?.rhrBaseline30d ?? null);
  const bodyLoadElevated = typeof bodyLoadDev === 'number' && bodyLoadDev > 10;

  // Evening HRV deviation: latest reading vs personal baseline.
  const hrvEveningDev = deviationPct(
    wear?.hrvLatest ?? wear?.hrvToday ?? null,
    wear?.hrvBaseline30d ?? null,
  );

  // JIT gear-shift trigger.
  const jitRemainingEvening = (input.jitEventsToday ?? []).some((j) => {
    if (j.actioned) return false;
    const s = new Date(j.event_start_time).getTime();
    // Only count JIT for events that haven't yet started — once past, JIT is moot.
    return Number.isFinite(s) && s > input.now.getTime();
  });
  const mode: EveningMode = jitRemainingEvening ? 'jit_remaining' : 'close';

  const tomorrowEvents = input.tomorrowEvents ?? [];
  const tomorrowMeetings = meetingCount(tomorrowEvents);
  const tomorrowFirstHs = firstHighStakes(tomorrowEvents, input.now);
  const tomorrowIsHeavy = tomorrowMeetings >= 4 || !!tomorrowFirstHs;

  const dayKind = input.dayKind ?? null;

  return {
    window: 'evening',
    mode,
    todayCompletedCount: meetingCount(completedToday),
    todayCompletedCategories: uniqueCategories(completedToday),
    todayHadHighStakes: todayLoad.hasHighStakes,
    todayHadConflict: hasConflict(completedToday.length ? completedToday : today),
    bodyLoadElevated,
    hrvEveningDeviationPct: hrvEveningDev,
    prioritiesAllCompleted: input.plan?.allCompleted ?? false,
    prioritiesRemainingCount: input.plan?.remainingCount ?? 0,
    jitRemainingEvening,
    wasTravelDay: dayKind === 'travel',
    wasConferenceDay: dayKind === 'conference',
    conferenceDayNumber: input.conferenceDayNumber ?? null,
    tomorrowFirstHighStakes: tomorrowFirstHs,
    tomorrowMeetingCount: tomorrowMeetings,
    tomorrowIsHeavy,
    recoveryNote: deriveRecoveryNote(todayLoad.level, tomorrowIsHeavy),
    chargeResidueEvening: input.checkin?.chargeResidue ?? null,
  };
}