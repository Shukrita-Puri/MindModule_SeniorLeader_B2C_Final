/**
 * Tour mock data — best-in-class demo content shown ONLY for genuine
 * first-time users during the App Tour, when their real Brief and Plan
 * are still empty (no check-in submitted yet).
 *
 * Strict gating lives in TourMockContext / useTourMock. This file is
 * pure data; nothing here is wired automatically.
 *
 * Copy follows the Chief-of-Staff voice:
 *  - Prevent / Prepare framing (CEO Self-Regulation Framework §1, §6)
 *  - Why lines ≤25 words
 *  - Sub-lines ≤6 words
 *  - No wellness vocabulary
 */

import type { OuterReadinessData } from '@/hooks/useOuterReadiness';

export const MOCK_BRIEF: OuterReadinessData = {
  phrase: 'Channel the peak.',
  context:
    'HRV +9% over baseline, sleep banked at 7h32m, and a calm window before your 2pm investor call. Push the harder decision early — your nervous system is primed for it.',
  bodyText:
    'HRV +9% over baseline, sleep banked at 7h32m, and a calm window before your 2pm investor call. Push the harder decision early — your nervous system is primed for it.',
  leanOn: 'Decisive clarity',
  leanOnSource: 'HRV +9% · Sleep 7h32m',
  watchFor: 'Energy dip ~3pm',
  watchForSource: 'Post-lunch circadian',
  driver: 'wearable+calendar',
  dataSources: ['hrv', 'sleep', 'calendar'],
  calendarState: 'active',
  hasWearable: true,
  hasCalendar: true,
  awaitingSignals: false,
  awaitingReason: null,
  innerReadinessScore: 78,
  innerReadinessTier: 'peak',
  hasCurrentPeriodCheckIn: true,
  hasFreshWearable: true,
  hasCurrentPeriodSignal: true,
  briefSource: 'llm',
  briefId: 'tour-mock-brief',
  hrvDeviation: 9,
  sleepDuration: 452,
  meetingCount: 5,
  remainingMeetings: 3,
};

export const MOCK_MRS = {
  score: 78,
  tier: 'peak',
  readinessState: 'refined' as const,
  oneLiner: 'High-control window',
  stateLabel: 'Refined by check-in',
  stateSubtitle: 'Wearable, calendar, and check-in aligned',
  weeklyDelta: 6,
};

/**
 * Mock plan in the same shape `TodayThreePriorities` already renders. We
 * deliberately reuse common sanctuary content ids so thumbnails and the
 * Start button look authentic, but the consumer renders these read-only
 * during the tour (no completions, no analytics, no DB writes).
 */
export interface MockPriority {
  horizon: 'immediate' | 'tactical' | 'strategic';
  title: string;        // PREVENT / PREPARE line, ≤8 words
  subLine: string;      // ≤6 words, italicised in the card
  whyLine: string;      // ≤25 words
  practice: {
    contentId: string;
    title: string;
    duration: number;
    type: 'regulate' | 'align' | 'prepare' | 'integrate';
  };
}

export const MOCK_PLAN_PRIORITIES: MockPriority[] = [
  {
    horizon: 'immediate',
    title: 'Prime presence before investor call',
    subLine: 'Lock coherent boardroom presence',
    whyLine:
      'HRV is +9% and your 2pm investor call is the day\'s highest-stakes block. Activate coherence now to land each answer with measured authority.',
    practice: {
      contentId: 'box-breathing-3min',
      title: 'Coherent breathing',
      duration: 3,
      type: 'align',
    },
  },
  {
    horizon: 'tactical',
    title: 'Prevent the 3pm energy dip',
    subLine: 'Re-energise post-lunch focus',
    whyLine:
      'Your post-lunch window typically loses 12% on focus signals. A short reenergise protocol before 3pm prevents the dip contaminating the afternoon block.',
    practice: {
      contentId: 'energising-breath-4min',
      title: 'Reenergise reset',
      duration: 4,
      type: 'prepare',
    },
  },
  {
    horizon: 'strategic',
    title: 'Prepare clean handover tomorrow',
    subLine: 'Bank recovery for tomorrow',
    whyLine:
      'Tomorrow opens with a 9am board read-out. Tonight\'s wind-down protects sleep depth so you arrive sharp, not residual from today\'s investor pressure.',
    practice: {
      contentId: 'evening-wind-down-5min',
      title: 'Evening wind-down',
      duration: 5,
      type: 'integrate',
    },
  },
];
