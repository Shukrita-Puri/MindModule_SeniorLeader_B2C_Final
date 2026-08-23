/**
 * Mock causality payload used by `PerformanceCausalityCard` when the app is
 * rendered in a preview context (iframe / *.lovable.app / DEV_MODE) without a
 * signed-in user. Mirrors the shape returned by the `cause-effect-engine`
 * edge function so the UI renders identically to a real session.
 */

export type MockLens = 'A' | 'B' | 'C' | 'D';
export type MockDirection = 'negative' | 'positive';

export interface MockFinding {
  lens: MockLens;
  cause: string;
  effectSignal: string;
  unit: string;
  baseline: number;
  observed: number;
  deltaAbs: number;
  deltaPct: number;
  n: number;
  recoveryDays: number | null;
  direction: MockDirection;
  longText: string;
}

export interface MockCoverage {
  hasCalendar: boolean;
  hasWearable: boolean;
  checkinCount: number;
  briefCount: number;
  wearableDayCount: number;
  eventCount: number;
}

export interface MockStressMatrix {
  events: string[];
  days: string[];
  cells: (number | null)[][];
  n: number[][];
  confidence: ('strong' | 'emerging' | null)[][];
  maxObserved: number;
  topCell: { event: string; day: string; value: number } | null;
  lowCell: { event: string; day: string; value: number } | null;
  topDay: { day: string; total: number } | null;
}
export interface MockBurnoutMatrix {
  weeks: string[];
  dims: Array<{
    key: 'load' | 'rhr' | 'hrv' | 'sleep';
    label: string;
    color: string;
    weekly: Array<number | null>;
    trajectory: 'escalating' | 'stable' | 'improving';
  }>;
  cardTrajectory: 'escalating' | 'stable' | 'improving';
  bannerCopy: string;
}

export interface MockRecoveryByEvent {
  entries: Array<{
    eventType: string;
    recoveryDays: number;
    rhrDeltaBpm: number;
    n: number;
    confidence: 'strong' | 'emerging';
    lastSeen: string;
  }>;
  maxRecoveryDays: number;
  topEntry: {
    eventType: string;
    recoveryDays: number;
    rhrDeltaBpm: number;
    n: number;
    confidence: 'strong' | 'emerging';
    lastSeen: string;
  } | null;
}

export interface MockCausalityPayload {
  top: MockFinding | null;
  lensA: MockFinding[];
  lensB: MockFinding[];
  lensC: MockFinding[];
  lensD: MockFinding[];
  coverage: MockCoverage;
  generatedAt: string;
  isMock: true;
  stressMatrix?: MockStressMatrix;
  burnoutMatrix?: MockBurnoutMatrix;
  recoveryByEvent?: MockRecoveryByEvent | null;
  dayTypeHrvMatrix?: MockDayTypeHrvMatrix | null;
}

interface MockDayTypeHrvCell {
  hrvDelta: number | null;
  n: number;
  confidence: 'strong' | 'emerging' | null;
  hasData: boolean;
}
interface MockDayTypeHrvMatrix {
  dayTypes: string[];
  days: string[];
  cells: MockDayTypeHrvCell[][];
  hrvBaseline: number | null;
  maxAbsDelta: number;
  bannerCopy: string;
  streakSummary: {
    currentStreakDays: number;
    currentStreakType: string | null;
    streakHrvDeltaMean: number | null;
  } | null;
}

const mockCell = (
  hrvDelta: number | null,
  n: number,
): MockDayTypeHrvCell => ({
  hrvDelta,
  n,
  confidence: n >= 5 ? 'strong' : n >= 3 ? 'emerging' : null,
  hasData: n >= 1,
});
const emptyCell = (): MockDayTypeHrvCell => ({ hrvDelta: null, n: 0, confidence: null, hasData: false });

const lensA: MockFinding[] = [
  {
    lens: 'A',
    cause: 'Board reviews',
    effectSignal: 'HRV',
    unit: 'ms',
    baseline: 62,
    observed: 48,
    deltaAbs: -14,
    deltaPct: -23,
    n: 4,
    recoveryDays: 2,
    direction: 'negative',
    longText: 'Board reviews suppress HRV by ~23% vs your 30-day baseline; recovery in ~2 days.',
  },
  {
    lens: 'A',
    cause: 'Back-to-back 1:1s',
    effectSignal: 'RHR',
    unit: 'bpm',
    baseline: 58,
    observed: 65,
    deltaAbs: 7,
    deltaPct: 12,
    n: 6,
    recoveryDays: 1,
    direction: 'negative',
    longText: 'Back-to-back 1:1s lift resting HR by ~12% vs baseline.',
  },
];

const lensB: MockFinding[] = [
  {
    lens: 'B',
    cause: 'Investor calls',
    effectSignal: 'Sharpness',
    unit: 'tier',
    baseline: 4.0,
    observed: 2.8,
    deltaAbs: -1.2,
    deltaPct: -30,
    n: 5,
    recoveryDays: 1,
    direction: 'negative',
    longText: 'Sharpness drops ~30% on the afternoon of investor calls.',
  },
  {
    lens: 'B',
    cause: 'Town halls',
    effectSignal: 'Clarity',
    unit: 'tier',
    baseline: 3.6,
    observed: 2.6,
    deltaAbs: -1.0,
    deltaPct: -28,
    n: 3,
    recoveryDays: 1,
    direction: 'negative',
    longText: 'Clarity dips ~28% the day after town halls.',
  },
];

const lensC: MockFinding[] = [
  {
    lens: 'C',
    cause: 'Sleep score < 70',
    effectSignal: 'Decision Readiness',
    unit: 'pts',
    baseline: 72,
    observed: 58,
    deltaAbs: -14,
    deltaPct: -19,
    n: 7,
    recoveryDays: 1,
    direction: 'negative',
    longText: 'Low-sleep nights drop next-day Decision Readiness by ~19%.',
  },
];

const lensD: MockFinding[] = [
  {
    lens: 'D',
    cause: '3+ heavy days in a row',
    effectSignal: 'Decision Readiness',
    unit: 'pts',
    baseline: 71,
    observed: 55,
    deltaAbs: -16,
    deltaPct: -22,
    n: 3,
    recoveryDays: 2,
    direction: 'negative',
    longText: 'Three consecutive heavy-load days drop readiness ~22%; ~2 days to recover.',
  },
];

export const MOCK_CAUSALITY_PAYLOAD: MockCausalityPayload = {
  top: lensB[0],
  lensA,
  lensB,
  lensC,
  lensD,
  coverage: {
    hasCalendar: true,
    hasWearable: true,
    checkinCount: 28,
    briefCount: 21,
    wearableDayCount: 24,
    eventCount: 47,
  },
  generatedAt: new Date().toISOString(),
  isMock: true,
  stressMatrix: {
    events: ['Board reviews', 'Investor calls', '1:1s', 'Town halls', 'Client meetings', 'Deep work', 'Interviews'],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    cells: [
      [38, 22, 12, null, 18, 4, 14],
      [12, 28, 14, 32, 16,  6, 18],
      [10, 16, 10, 12, 14,  8, 12],
      [20, 34, 16, 14, 22,  6, 26],
      [ 8, 12, 10, null,10,  4, 12],
    ],
    n: [
      [3, 2, 4, 0, 2, 3, 2],
      [2, 3, 4, 2, 3, 4, 2],
      [3, 3, 5, 2, 3, 3, 2],
      [2, 3, 4, 2, 2, 3, 3],
      [2, 2, 4, 0, 2, 3, 2],
    ],
    confidence: [
      ['emerging','emerging','emerging',null,'emerging','emerging','emerging'],
      ['emerging','emerging','emerging','emerging','emerging','emerging','emerging'],
      ['emerging','emerging','strong','emerging','emerging','emerging','emerging'],
      ['emerging','emerging','emerging','emerging','emerging','emerging','emerging'],
      ['emerging','emerging','emerging',null,'emerging','emerging','emerging'],
    ],
    maxObserved: 38,
    topCell: { event: 'Board reviews', day: 'Mon', value: 38 },
    lowCell: { event: 'Deep work', day: 'Mon', value: 4 },
    topDay: { day: 'Thu', total: 20 },
  },
  burnoutMatrix: {
    weeks: ['4 wks ago', '3 wks ago', '2 wks ago', 'Last week', 'This week'],
    dims: [
      { key: 'load',  label: 'Calendar load', color: '#D85A30', weekly: [2, 3, 3, 4, 5], trajectory: 'escalating' },
      { key: 'rhr',   label: 'RHR trend ↑',   color: '#EF9F27', weekly: [2, 2, 3, 4, 4], trajectory: 'escalating' },
      { key: 'hrv',   label: 'HRV trend ↓',   color: '#534AB7', weekly: [2, 2, 3, 3, 4], trajectory: 'escalating' },
      { key: 'sleep', label: 'Sleep deficit', color: '#185FA5', weekly: [1, 2, 2, 3, 4], trajectory: 'escalating' },
    ],
    cardTrajectory: 'escalating',
    bannerCopy: 'Risk trajectory: escalating',
  },
  recoveryByEvent: {
    entries: [
      { eventType: 'Board reviews', recoveryDays: 3, rhrDeltaBpm: 7, n: 4, confidence: 'emerging', lastSeen: '2026-06-29' },
      { eventType: 'Investor calls', recoveryDays: 2, rhrDeltaBpm: 5, n: 3, confidence: 'emerging', lastSeen: '2026-06-27' },
      { eventType: '1:1s', recoveryDays: 1, rhrDeltaBpm: 3, n: 2, confidence: 'emerging', lastSeen: '2026-06-30' },
    ],
    maxRecoveryDays: 3,
    topEntry: { eventType: 'Board reviews', recoveryDays: 3, rhrDeltaBpm: 7, n: 4, confidence: 'emerging', lastSeen: '2026-06-29' },
  },
  },
  dayTypeHrvMatrix: {
    dayTypes: ['Governance', 'Travel', 'Mixed', 'Deep Work', 'Rhythm'],
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    cells: [
      // Governance
      [mockCell(-18, 5), emptyCell(), mockCell(-12, 3), emptyCell(), mockCell(-9, 2), emptyCell(), emptyCell()],
      // Travel
      [emptyCell(), mockCell(-15, 3), emptyCell(), emptyCell(), mockCell(-11, 1), mockCell(-7, 2), emptyCell()],
      // Mixed
      [emptyCell(), mockCell(-6, 4), mockCell(-4, 3), mockCell(-2, 1), emptyCell(), emptyCell(), emptyCell()],
      // Deep Work
      [emptyCell(), emptyCell(), mockCell(2, 3), mockCell(1, 2), emptyCell(), emptyCell(), emptyCell()],
      // Rhythm
      [emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell(), mockCell(6, 5), mockCell(4, 3)],
    ],
    hrvBaseline: 62,
    maxAbsDelta: 18,
    bannerCopy: 'Governance days suppress your next-day HRV the most (−18ms on average).',
    streakSummary: {
      currentStreakDays: 3,
      currentStreakType: 'Governance',
      streakHrvDeltaMean: -14,
    },
  },
};
