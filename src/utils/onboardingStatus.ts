import { getSession, getAllResponses } from "./onboardingStorage";
import { fetchOnboardingProgressSnapshot, hasValidBetaAccess, isOnboardingCompleteSnapshot } from "./onboardingCompletion";
import { resolveOnboardingAccessFromSnapshot } from "./subscriptionHelpers";
import { PAYMENT_PAGE_SUPPRESSED } from "@/config/payments";

export interface OnboardingStatus {
  isComplete: boolean;
  currentStage: number;
  completedStages: string[];
  totalStages: number;
  percentComplete: number;
  hasStarted: boolean;
  lastUpdated?: string;
}

const TOTAL_STAGES = PAYMENT_PAGE_SUPPRESSED ? 8 : 9; // Welcome, questionnaire, Results, optional Payment, Context Connection
const CHECKOUT_RETURN_GRACE_KEY = 'onboarding_checkout_return_at';
const CHECKOUT_RETURN_GRACE_MS = 10 * 60 * 1000;

function markCheckoutReturnGrace(): void {
  try {
    sessionStorage.setItem(CHECKOUT_RETURN_GRACE_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures; the live session_id still gates this navigation.
  }
}

function hasRecentCheckoutReturn(): boolean {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_RETURN_GRACE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    if (Date.now() - ts > CHECKOUT_RETURN_GRACE_MS) {
      sessionStorage.removeItem(CHECKOUT_RETURN_GRACE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const session = getSession();
  const responses = getAllResponses();

  if (!session) {
    return {
      isComplete: false,
      currentStage: 0,
      completedStages: [],
      totalStages: TOTAL_STAGES,
      percentComplete: 0,
      hasStarted: false,
    };
  }

  // Check if they've completed daily check-in (lightweight non-sensitive flag)
  const hasCompletedCheckIn = localStorage.getItem('hasEverCheckedIn') === 'true';

  // Calculate completed stages
  const completedStages: string[] = [];
  let currentStage = 1;

  if (session.startedAt) {
    completedStages.push('welcome');
    currentStage = 2;
  }
  
  if (responses.identity_type) {
    completedStages.push('identity');
    currentStage = 3;
  }
  
  if (responses.emotional_awareness_response) {
    completedStages.push('emotional-awareness');
    currentStage = 4;
  }
  
  if (responses.stress_response_response) {
    completedStages.push('stress-response');
    currentStage = 5;
  }
  
  if (responses.recovery_patterns_response) {
    completedStages.push('recovery-patterns');
    currentStage = 6;
  }
  
  if (responses.mental_clarity_response) {
    completedStages.push('mental-clarity');
    currentStage = 7;
  }
  
  if (responses.growth_intention || responses.practice_priority_tag) {
    completedStages.push('growth-intention');
    currentStage = 8;
  }
  
  // Post-auth stages: results, payment, context-connection
  // These are now tracked via Cloud DB only – don't check localStorage

  const isComplete = hasCompletedCheckIn;
  const percentComplete = Math.round((completedStages.length / TOTAL_STAGES) * 100);

  return {
    isComplete,
    currentStage: isComplete ? TOTAL_STAGES : Math.min(currentStage, TOTAL_STAGES),
    completedStages,
    totalStages: TOTAL_STAGES,
    percentComplete: isComplete ? 100 : percentComplete,
    hasStarted: completedStages.length > 0,
    lastUpdated: session.startedAt,
  };
}

export async function getResumeRoute(): Promise<string> {
  // Try DB-backed progress first for authenticated users
  const dbRoute = await getResumeRouteFromDB();
  if (dbRoute) return dbRoute;

  // Fall back to localStorage
  return getResumeRouteFromLocal();
}

/**
 * Fetch onboarding progress from DB and determine resume route.
 * Returns null if unauthenticated or no DB record exists.
 */
async function getResumeRouteFromDB(): Promise<string | null> {
  try {
    const data = await fetchOnboardingProgressSnapshot();
    if (!data) return null;

    console.log('[onboardingStatus] DB progress found, current_step:', data.current_step);

    // Walk backwards from the end to find the latest incomplete step.
    // For signed-in users, also infer results-stage progress from persisted profile data
    // if the onboarding_progress row is missing or incomplete.
    const isBetaValid = hasValidBetaAccess(data);
    const hasPersistedResults = !!(data.mental_fitness_baseline || data.onboarding_insight || data.user_archetype);

    if (isOnboardingCompleteSnapshot(data)) return '/executive-home';
    if (!data.context_connection_at && ((PAYMENT_PAGE_SUPPRESSED && data.results_at) || data.payment_at || isBetaValid)) return '/onboarding/app-intro';
    if (!data.payment_at && !isBetaValid && data.results_at) return '/onboarding/payment';
    if (!data.results_at && data.signup_step_at) return '/onboarding/results';
    if (!data.results_at && hasPersistedResults) return '/onboarding/results';
    if (!data.signup_step_at && data.growth_intention_at) return '/onboarding/signup-step';
    if (!data.growth_intention_at && data.mental_clarity_at) return '/onboarding/growth-intention';
    if (!data.mental_clarity_at && data.recovery_patterns_at) return '/onboarding/mental-clarity';
    if (!data.recovery_patterns_at && data.stress_response_at) return '/onboarding/recovery-patterns';
    if (!data.stress_response_at && data.emotional_awareness_at) return '/onboarding/stress-response';
    if (!data.emotional_awareness_at && data.identity_at) return '/onboarding/emotional-awareness';
    if (!data.identity_at) return '/onboarding/identity';

    return '/onboarding';
  } catch (err) {
    console.warn('[onboardingStatus] DB resume check failed, falling back to local:', err);
    return null;
  }
}

/**
 * Original localStorage-based resume logic (kept as fallback).
 */
function getResumeRouteFromLocal(): string {
  const session = getSession();
  const responses = getAllResponses();

  if (!session) {
    return '/onboarding';
  }

  if (!responses.identity_type) return '/onboarding/identity';
  if (!responses.emotional_awareness_response) return '/onboarding/emotional-awareness';
  if (!responses.stress_response_response) return '/onboarding/stress-response';
  if (!responses.recovery_patterns_response) return '/onboarding/recovery-patterns';
  if (!responses.mental_clarity_response) return '/onboarding/mental-clarity';
  if (!responses.growth_intention && !responses.practice_priority_tag) return '/onboarding/growth-intention';
  
  // Post-auth stages are gated by DB only – if we reach here, send to signup-step
  return '/onboarding/signup-step';
}

/**
 * Validate whether a user can access a given onboarding step.
 * Returns the correct redirect route if they can't, or null if access is allowed.
 */
export async function validateStageAccess(targetPath: string): Promise<string | null> {
  // v8 onboarding flow paths are the new entry path for fresh users and
  // are not gated by the legacy questionnaire prerequisites.
  const V8_PATHS = new Set([
    '/onboarding/app-intro',
    '/onboarding/leadership-context',
    '/onboarding/cognitive-load',
    '/onboarding/protect-goals',
    '/onboarding/brief-prefs',
    '/onboarding/permissions',
    '/onboarding/done',
  ]);
  if (V8_PATHS.has(targetPath)) return null;

  if (PAYMENT_PAGE_SUPPRESSED && targetPath === '/onboarding/payment') {
    return '/onboarding/app-intro';
  }

  const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
  const searchParams = new URLSearchParams(currentSearch);
  const isStripeCheckoutReturn =
    targetPath === '/onboarding/context-connection' &&
    !!searchParams.get('session_id');

  if (isStripeCheckoutReturn) {
    markCheckoutReturnGrace();
  }

  const stageOrder = [
    '/onboarding',
    '/onboarding/identity',
    '/onboarding/emotional-awareness',
    '/onboarding/stress-response',
    '/onboarding/recovery-patterns',
    '/onboarding/mental-clarity',
    '/onboarding/growth-intention',
    '/onboarding/signup-step',
    '/onboarding/results',
    '/onboarding/payment',
    '/onboarding/app-intro',
    '/onboarding/context-connection',
  ];

  const targetIndex = stageOrder.indexOf(targetPath);
  if (targetIndex <= 0) return null; // Welcome is always accessible

  // For post-signup stages, check DB
  if (targetIndex >= 7) {
    try {
      const data = await fetchOnboardingProgressSnapshot();
      if (!data) return await getResumeRoute();

      // Canonical access decision – single source of truth shared with the
      // onboarding pages (Stage6Payment, Stage8Results) so route-level gating
      // cannot diverge from page-level gating.
      const access = resolveOnboardingAccessFromSnapshot(data);

      // SHORT-CIRCUIT: If onboarding is already completed, redirect away.
      // The single intentional exception is /onboarding/payment, which must
      // remain reachable for completed-user UPGRADE flows. We still defer to
      // the page itself to render upgrade vs initial-purchase UI.
      if (isOnboardingCompleteSnapshot(data)) {
        if (targetPath === '/onboarding/payment') {
          return null; // Allow upgrade flow – Stage6Payment renders upgrade UI
        }
        console.log('[validateStageAccess] Onboarding completed, redirecting to /daily-check-in');
        return '/executive-home';
      }

      // Progression gates – these are about questionnaire completion, NOT
      // subscription access, so they stay route-local.
      if (targetPath === '/onboarding/results' && !data?.signup_step_at) {
        return '/onboarding/signup-step';
      }
      if (targetPath === '/onboarding/payment' && !data?.results_at) {
        return await getResumeRoute();
      }

      if (
        isStripeCheckoutReturn ||
        ((targetPath === '/onboarding/app-intro' || targetPath === '/onboarding/context-connection') && hasRecentCheckoutReturn())
      ) {
        return null;
      }

      if (PAYMENT_PAGE_SUPPRESSED && (targetPath === '/onboarding/app-intro' || targetPath === '/onboarding/context-connection')) {
        if (!data.results_at) return await getResumeRoute();
        return null;
      }

      // Subscription/beta access gates – delegated to the canonical helper.
      // /onboarding/app-intro and /onboarding/context-connection are the
      // post-payment stages and require the same "allow forward" verdict
      // that the page-level helper produces from the user profile.
      if (
        (targetPath === '/onboarding/app-intro' || targetPath === '/onboarding/context-connection')
      ) {
        if (access === 'pending') {
          // Defer routing – do not flash the wrong screen while access state
          // is still being reconciled. The flow page will retry on next nav.
          return null;
        }
        if (access !== 'allow') {
          return await getResumeRoute();
        }
      }
    } catch {
      return await getResumeRoute();
    }
  }

  // For pre-signup stages, use localStorage validation
  const responses = getAllResponses();
  const localGates: Record<string, () => boolean> = {
    '/onboarding/identity': () => true,
    '/onboarding/emotional-awareness': () => !!responses.identity_type,
    '/onboarding/stress-response': () => !!responses.emotional_awareness_response,
    '/onboarding/recovery-patterns': () => !!responses.stress_response_response,
    '/onboarding/mental-clarity': () => !!responses.recovery_patterns_response,
    '/onboarding/growth-intention': () => !!responses.mental_clarity_response,
    '/onboarding/signup-step': () => !!responses.growth_intention || !!responses.practice_priority_tag,
  };

  const gate = localGates[targetPath];
  if (gate && !gate()) {
    return await getResumeRoute();
  }

  return null;
}

export function markOnboardingComplete() {
  const session = getSession();
  if (session) {
    session.responses.onboardingCompleted = true;
    session.responses.completedAt = new Date().toISOString();
    localStorage.setItem('mind_module_onboarding', JSON.stringify(session));
  }
}
