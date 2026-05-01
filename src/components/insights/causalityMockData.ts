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
    weekly: number[];
    trajectory: 'escalating' | 'stable' | 'improving';
  }>;
  cardTrajectory: 'escalating' | 'stable' | 'improving';
  bannerCopy: string;
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
}

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
};