// MRS v3 — Window context dispatcher.
//
// Single entry point used by Brief / Plan / Nudges. Picks the right window
// builder for the user's local time-of-day and returns the typed slice.

import { getTimeOfDay, type TimeWindow } from './day-kind-detector.ts';
import { buildMorningContext } from './morning-context.ts';
import { buildAfternoonContext } from './afternoon-context.ts';
import { buildEveningContext } from './evening-context.ts';
import type { WindowContext, WindowContextInput } from './window-context-types.ts';

export { buildMorningContext } from './morning-context.ts';
export { buildAfternoonContext } from './afternoon-context.ts';
export { buildEveningContext } from './evening-context.ts';
export type {
  WindowContext,
  WindowContextInput,
  MorningContext,
  AfternoonContext,
  EveningContext,
  EveningMode,
  RecoveryNote,
  EventLite,
  StakesCategory,
  SleepQuality,
  BehaviourSnapshot,
  WearableSnapshotInput,
  JitEventLite,
  PlanStatusInput,
  CheckinSnapshotInput,
} from './window-context-types.ts';

/**
 * Build the window context that matches the user's local clock at `now`.
 * Pure. Never throws. Safe to call with empty inputs.
 */
export function buildWindowContext(input: WindowContextInput): WindowContext {
  const tod: TimeWindow = getTimeOfDay(input.now.getHours());
  switch (tod) {
    case 'morning':   return buildMorningContext(input);
    case 'afternoon': return buildAfternoonContext(input);
    case 'evening':   return buildEveningContext(input);
  }
}