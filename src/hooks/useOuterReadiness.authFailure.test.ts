import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/devMode', () => ({
  DEV_MODE: false,
  DEV_USER: { id: 'dev-user' },
}));

const computeEnergyStateMock = vi.fn();
vi.mock('@/utils/energyStateEngine', () => ({
  computeEnergyState: (...args: unknown[]) => computeEnergyStateMock(...args),
}));

const getAuthTokenMock = vi.fn();
vi.mock('@/services/authTokenService', () => ({
  getAuthToken: (...args: unknown[]) => getAuthTokenMock(...args),
}));

const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

vi.mock('@/utils/persistentBriefCache', () => ({
  read: () => null,
  write: () => {},
  clear: () => {},
  clearByPrefixes: () => {},
  msUntilWindowEnd: () => 60_000,
  cacheKeys: {
    brief: (u: string, p: string, d: string) => `brief:${u}:${p}:${d}`,
    briefAwaiting: (u: string, p: string, d: string) => `awaiting:${u}:${p}:${d}`,
  },
  localISODate: () => '2026-07-05',
  currentPeriod: () => 'morning',
}));

import {
  clearOuterReadinessCache,
  fetchOuterReadiness,
} from '@/hooks/useOuterReadiness';

const HEALTHY_ENERGY_STATE = {
  engineStatus: 'ready',
  energyTier: 'managing',
  overallBalance: 55,
  clarityLevel: 3,
  confidenceLevel: 3,
  mentalSharpnessLevel: 3,
  emotionLevel: 3,
  pressureLevel: 3,
  regulationLevel: 3,
  checkInOutcome: null,
  tierDisplayed: 'managing',
  tierCapReason: null,
  scoreBaseline: 55,
  scoreRefined: null,
  readinessState: 'baseline',
  refinedContribution: null,
  weightProvenance: null,
};

beforeEach(() => {
  computeEnergyStateMock.mockReset();
  getAuthTokenMock.mockReset();
  invokeMock.mockReset();
  clearOuterReadinessCache('user-1');
  computeEnergyStateMock.mockResolvedValue(HEALTHY_ENERGY_STATE);
});

afterEach(() => {
  clearOuterReadinessCache('user-1');
});

describe('useOuterReadiness auth-failure classification', () => {
  it('returns structured auth-failure (not null) when no Auth0 token is available', async () => {
    getAuthTokenMock.mockResolvedValue(null);
    const result = await fetchOuterReadiness('user-1');
    expect(result).not.toBeNull();
    expect(result?.engineStatus).toBe('auth-failure');
    expect(result?.engineFailureReason).toBe('missing-auth-token');
    expect(result?.innerReadinessScore).toBeNull();
    expect(result?.awaitingSignals).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('returns auth-failure with timeout reason when getAuthToken throws timeout', async () => {
    getAuthTokenMock.mockRejectedValue(new Error('Token retrieval failed: timeout'));
    const result = await fetchOuterReadiness('user-1');
    expect(result?.engineStatus).toBe('auth-failure');
    expect(result?.engineFailureReason).toBe('auth-token-timeout');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('maps HTTP 401 to auth-failure', async () => {
    getAuthTokenMock.mockResolvedValue('token-abc');
    invokeMock.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Unauthorized'), { context: { status: 401 } }),
    });
    const result = await fetchOuterReadiness('user-1');
    expect(result?.engineStatus).toBe('auth-failure');
    expect(result?.engineFailureReason).toBe('http-401');
  });

  it('maps HTTP 403 to session-failure', async () => {
    getAuthTokenMock.mockResolvedValue('token-abc');
    invokeMock.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Forbidden'), { context: { status: 403 } }),
    });
    const result = await fetchOuterReadiness('user-1');
    expect(result?.engineStatus).toBe('session-failure');
    expect(result?.engineFailureReason).toBe('http-403');
  });

  it('keeps HTTP 500 mapped to outer-failure', async () => {
    getAuthTokenMock.mockResolvedValue('token-abc');
    invokeMock.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Server error'), { context: { status: 500 } }),
    });
    const result = await fetchOuterReadiness('user-1');
    expect(result?.engineStatus).toBe('outer-failure');
    expect(result?.engineFailureReason).toBe('http-5xx');
  });

  it('classifies a status-less invoke error as edge-invoke-error / outer-failure', async () => {
    getAuthTokenMock.mockResolvedValue('token-abc');
    invokeMock.mockResolvedValue({ data: null, error: new Error('network down') });
    const result = await fetchOuterReadiness('user-1');
    expect(result?.engineStatus).toBe('outer-failure');
    expect(result?.engineFailureReason).toBe('edge-invoke-error');
  });

  it('does not misclassify a valid backend response as failure', async () => {
    getAuthTokenMock.mockResolvedValue('token-abc');
    invokeMock.mockResolvedValue({
      data: {
        phrase: 'Steady.',
        context: 'Context',
        leanOn: 'Lean',
        watchFor: 'Watch',
        driver: 'state',
        dataSources: ['decision readiness score'],
      },
      error: null,
    });
    const result = await fetchOuterReadiness('user-1');
    expect(result?.engineStatus).toBe('ready');
    expect(result?.engineFailureReason).toBeUndefined();
    expect(result?.phrase).toBe('Steady.');
  });
});
