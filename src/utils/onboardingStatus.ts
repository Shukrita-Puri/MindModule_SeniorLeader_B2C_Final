import { getSession, getAllResponses } from "./onboardingStorage";
import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/services/authTokenService";

export interface OnboardingStatus {
  isComplete: boolean;
  currentStage: number;
  completedStages: string[];
  totalStages: number;
  percentComplete: number;
  hasStarted: boolean;
  lastUpdated?: string;
}

const TOTAL_STAGES = 9; // Welcome, Identity, Energy Regulation, Focus Recovery, Energy Renewal, Growth Assessment, Results, Payment, Context Connection

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

  // Check if they've completed payment selection
  const hasSelectedPlan = localStorage.getItem('selectedPlan') !== null;
  
  // Check if they've completed context connection
  const contextConnections = localStorage.getItem('contextConnections');
  const hasCompletedContextConnection = contextConnections !== null;

  // Check if they've completed daily check-in
  const firstCheckIn = localStorage.getItem('dailyCheckIn');
  const hasCompletedCheckIn = firstCheckIn !== null;

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
  
  if (responses.growth_intention) {
    completedStages.push('growth-intention');
    currentStage = 8;
  }
  
  if (responses.mental_fitness_baseline) {
    completedStages.push('results');
    currentStage = 9;
  }
  
  if (hasSelectedPlan) {
    completedStages.push('payment');
    currentStage = 9;
  }
  
  if (hasCompletedContextConnection) {
    completedStages.push('context-connection');
    currentStage = 10;
  }

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
    const token = await getAuthToken();
    if (!token) return null;

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/onboarding-progress`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'GET' }),
      }
    );

    if (!res.ok) return null;
    const { data } = await res.json();
    if (!data) return null;

    console.log('[onboardingStatus] DB progress found, current_step:', data.current_step);

    // Walk backwards from the end to find the latest incomplete step
    if (data.completed_at) return '/daily-check-in';
    if (!data.context_connection_at && data.payment_at) return '/onboarding/context-connection';
    if (!data.payment_at && data.results_at) return '/onboarding/payment';
    if (!data.results_at && data.signup_step_at) return '/onboarding/results';
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
  if (!responses.growth_intention) return '/onboarding/growth-intention';
  if (!responses.mental_fitness_baseline) return '/onboarding/signup-step';
  if (!responses.resultsViewed) return '/onboarding/results';

  const hasSelectedPlan = localStorage.getItem('selectedPlan') !== null;
  if (!hasSelectedPlan) return '/onboarding/payment';

  const contextConnections = localStorage.getItem('contextConnections');
  if (!contextConnections) return '/onboarding/context-connection';

  const firstCheckIn = localStorage.getItem('dailyCheckIn');
  if (!firstCheckIn) return '/daily-check-in';

  return '/daily-check-in';
}

/**
 * Validate whether a user can access a given onboarding step.
 * Returns the correct redirect route if they can't, or null if access is allowed.
 */
export async function validateStageAccess(targetPath: string): Promise<string | null> {
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
    '/onboarding/context-connection',
  ];

  const targetIndex = stageOrder.indexOf(targetPath);
  if (targetIndex <= 0) return null; // Welcome is always accessible

  // For post-signup stages, check DB
  if (targetIndex >= 7) {
    try {
      const token = await getAuthToken();
      if (!token) return '/onboarding/signup-step'; // Must auth first

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/onboarding-progress`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'GET' }),
        }
      );

      if (!res.ok) return null; // Allow through on error (don't block)
      const { data } = await res.json();

      // Gate: results requires signup_step
      if (targetPath === '/onboarding/results' && !data?.signup_step_at) {
        return '/onboarding/signup-step';
      }
      // Gate: payment requires results
      if (targetPath === '/onboarding/payment' && !data?.results_at) {
        return await getResumeRoute();
      }
      // Gate: context-connection requires payment (or skip)
      if (targetPath === '/onboarding/context-connection' && !data?.payment_at) {
        return await getResumeRoute();
      }
    } catch {
      return null; // Allow through on error
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
    '/onboarding/signup-step': () => !!responses.growth_intention,
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
