import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchOnboardingProgressSnapshot = vi.fn();

vi.mock('@/utils/onboardingCompletion', () => ({
  fetchOnboardingProgressSnapshot: () => fetchOnboardingProgressSnapshot(),
  hasValidBetaAccess: (snapshot: any) =>
    !!snapshot?.beta_user && !!snapshot?.beta_expires_at && new Date(snapshot.beta_expires_at) > new Date(),
  isOnboardingCompleteSnapshot: (snapshot: any) =>
    !!(snapshot?.onboarding_completed_at || snapshot?.completed_at || snapshot?.context_connection_at),
}));

vi.mock('@/utils/onboardingStorage', () => ({
  getSession: () => ({ startedAt: '2026-04-30T00:00:00.000Z' }),
  getAllResponses: () => ({
    identity_type: 'leader',
    emotional_awareness_response: 'aware',
    stress_response_response: 'steady',
    recovery_patterns_response: 'recover',
    mental_clarity_response: 'clear',
    growth_intention: 'focus',
  }),
}));

describe('onboarding route behavior', () => {
  beforeEach(() => {
    fetchOnboardingProgressSnapshot.mockReset();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('allows Stripe checkout success returns to reach context connection while webhook progress catches up', async () => {
    window.history.replaceState({}, '', '/onboarding/context-connection?session_id=cs_test_123');
    fetchOnboardingProgressSnapshot.mockResolvedValue({
      signup_step_at: '2026-04-30T00:00:00.000Z',
      results_at: '2026-04-30T00:01:00.000Z',
      payment_at: null,
      beta_user: false,
    });

    const { validateStageAccess } = await import('./onboardingStatus');

    await expect(validateStageAccess('/onboarding/context-connection')).resolves.toBeNull();
  });

  it('keeps a short checkout-return grace window after the session_id is removed', async () => {
    window.history.replaceState({}, '', '/onboarding/context-connection?session_id=cs_test_123');
    fetchOnboardingProgressSnapshot.mockResolvedValue({
      signup_step_at: '2026-04-30T00:00:00.000Z',
      results_at: '2026-04-30T00:01:00.000Z',
      payment_at: null,
      beta_user: false,
    });

    const { validateStageAccess } = await import('./onboardingStatus');
    await expect(validateStageAccess('/onboarding/context-connection')).resolves.toBeNull();

    window.history.replaceState({}, '', '/onboarding/context-connection');
    await expect(validateStageAccess('/onboarding/context-connection')).resolves.toBeNull();
  });

  it('keeps suppressed-payment app intro behind persisted results progress', async () => {
    fetchOnboardingProgressSnapshot.mockResolvedValue({
      signup_step_at: '2026-04-30T00:00:00.000Z',
      results_at: null,
      payment_at: null,
      beta_user: false,
    });

    const { validateStageAccess } = await import('./onboardingStatus');

    await expect(validateStageAccess('/onboarding/app-intro')).resolves.toBe('/onboarding/results');
  });

  it('allows suppressed-payment app intro once results progress is persisted', async () => {
    fetchOnboardingProgressSnapshot.mockResolvedValue({
      signup_step_at: '2026-04-30T00:00:00.000Z',
      results_at: '2026-04-30T00:01:00.000Z',
      payment_at: null,
      beta_user: false,
    });

    const { validateStageAccess } = await import('./onboardingStatus');

    await expect(validateStageAccess('/onboarding/app-intro')).resolves.toBeNull();
  });
});
