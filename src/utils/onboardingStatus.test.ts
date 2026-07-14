import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadOnboardingV8ResumeState = vi.fn();

vi.mock('./onboardingV8Resume', () => ({
  loadOnboardingV8ResumeState: () => loadOnboardingV8ResumeState(),
  getResumeRouteFromState: (state: { nextRoute?: string | null }) => state.nextRoute ?? '/onboarding/leadership-context',
}));

describe('onboarding route behavior', () => {
  beforeEach(() => {
    loadOnboardingV8ResumeState.mockReset();
  });

  it('resumes incomplete users at the first incomplete v8 stage', async () => {
    loadOnboardingV8ResumeState.mockResolvedValue({
      completed: false,
      currentStep: 'protect_goals',
      nextRoute: '/onboarding/protect-goals',
      stepStatus: {
        leadership_context: 'completed',
        cognitive_load: 'completed',
        protect_goals: 'not_started',
        brief_prefs: 'not_started',
        permissions: 'not_started',
        connect: 'not_started',
      },
    });

    const { getResumeRoute } = await import('./onboardingStatus');
    await expect(getResumeRoute()).resolves.toBe('/onboarding/protect-goals');
  });

  it('allows connections only after permissions are complete', async () => {
    loadOnboardingV8ResumeState.mockResolvedValue({
      completed: false,
      currentStep: 'connect',
      nextRoute: '/onboarding/connect',
      stepStatus: {
        leadership_context: 'completed',
        cognitive_load: 'completed',
        protect_goals: 'completed',
        brief_prefs: 'completed',
        permissions: 'completed',
        connect: 'not_started',
      },
    });

    const { validateStageAccess } = await import('./onboardingStatus');
    await expect(validateStageAccess('/onboarding/connect')).resolves.toBeNull();
  });

  it('keeps done behind the current incomplete step', async () => {
    loadOnboardingV8ResumeState.mockResolvedValue({
      completed: false,
      currentStep: 'permissions',
      nextRoute: '/onboarding/permissions',
      stepStatus: {
        leadership_context: 'completed',
        cognitive_load: 'completed',
        protect_goals: 'completed',
        brief_prefs: 'completed',
        permissions: 'in_progress',
        connect: 'not_started',
      },
    });

    const { validateStageAccess } = await import('./onboardingStatus');
    await expect(validateStageAccess('/onboarding/done')).resolves.toBe('/onboarding/permissions');
  });

  it('redirects completed users to the app', async () => {
    loadOnboardingV8ResumeState.mockResolvedValue({
      completed: true,
      currentStep: null,
      nextRoute: '/executive-home',
      stepStatus: {
        leadership_context: 'completed',
        cognitive_load: 'completed',
        protect_goals: 'completed',
        brief_prefs: 'completed',
        permissions: 'completed',
        connect: 'completed',
      },
    });

    const { validateStageAccess } = await import('./onboardingStatus');
    await expect(validateStageAccess('/onboarding/connect')).resolves.toBe('/executive-home');
  });
});
