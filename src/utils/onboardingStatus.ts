import { PAYMENT_PAGE_SUPPRESSED } from "@/config/payments";
import { loadOnboardingV8ResumeState, getResumeRouteFromState } from "./onboardingV8Resume";

const V8_PATHS = new Set([
  "/onboarding",
  "/onboarding/app-intro",
  "/onboarding/leadership-context",
  "/onboarding/cognitive-load",
  "/onboarding/protect-goals",
  "/onboarding/brief-prefs",
  "/onboarding/permissions",
  "/onboarding/connect",
  "/onboarding/done",
]);

export interface OnboardingStatus {
  isComplete: boolean;
  currentStage: number;
  completedStages: string[];
  totalStages: number;
  percentComplete: number;
  hasStarted: boolean;
  lastUpdated?: string;
}

const TOTAL_STAGES = 6;

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const state = await loadOnboardingV8ResumeState();
  const completedStages = Object.entries(state.stepStatus)
    .filter(([, status]) => status === "completed")
    .map(([step]) => step);
  const currentStage = state.currentStep
    ? completedStages.length + 1
    : TOTAL_STAGES;

  return {
    isComplete: state.completed,
    currentStage,
    completedStages,
    totalStages: TOTAL_STAGES,
    percentComplete: Math.round((completedStages.length / TOTAL_STAGES) * 100),
    hasStarted: completedStages.length > 0,
  };
}

export async function getResumeRoute(): Promise<string> {
  try {
    const state = await loadOnboardingV8ResumeState();
    return getResumeRouteFromState(state);
  } catch (err) {
    console.warn("[onboardingStatus] resume loader failed:", err);
    return "/onboarding/leadership-context";
  }
}

export async function validateStageAccess(targetPath: string): Promise<string | null> {
  if (targetPath === "/upgrade" || (!PAYMENT_PAGE_SUPPRESSED && targetPath === "/onboarding/payment")) {
    return null;
  }

  if (!V8_PATHS.has(targetPath)) {
    return "/onboarding/leadership-context";
  }

  if (targetPath === "/onboarding" || targetPath === "/onboarding/app-intro") {
    return null;
  }

  try {
    const state = await loadOnboardingV8ResumeState();
    if (state.completed) {
      return "/executive-home";
    }

    const resumeRoute = getResumeRouteFromState(state);
    if (targetPath === "/onboarding/done") {
      const canEnterDone = state.currentStep === null || state.nextRoute === "/onboarding/done";
      return canEnterDone ? null : resumeRoute;
    }

    if (targetPath === "/onboarding/connect") {
      return state.stepStatus.permissions === "completed" ? null : resumeRoute;
    }

    return targetPath === resumeRoute ? null : resumeRoute;
  } catch (err) {
    console.warn("[onboardingStatus] validate access failed:", err);
    return null;
  }
}

export function markOnboardingComplete() {
  // Legacy localStorage completion markers are no longer authoritative.
}
