import { getSession, getAllResponses } from "./onboardingStorage";
import { supabase } from "@/integrations/supabase/client";

export interface OnboardingStatus {
  isComplete: boolean;
  currentStage: number;
  completedStages: string[];
  totalStages: number;
  percentComplete: number;
  hasStarted: boolean;
  lastUpdated?: string;
}

const TOTAL_STAGES = 8; // Welcome, Identity, Behavioral, Self-Assessment, Signup, Results, Payment, Context Connection

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

  // Check if user has completed all critical stages
  const hasCompletedQuestions = !!(
    responses.q2_identity &&
    responses.q3_behavioral_responses &&
    responses.q4_self_assessed_strength
  );

  // Check if they've gone through signup using server-side authentication
  const { data: { user } } = await supabase.auth.getUser();
  const hasSignedUp = user !== null;
  
  // Check if they've completed payment selection
  const hasSelectedPlan = localStorage.getItem('selectedPlan') !== null;
  
  // Check if they've completed context connection
  const contextConnections = localStorage.getItem('contextConnections');
  const hasCompletedContextConnection = contextConnections !== null;

  // Calculate completed stages
  const completedStages: string[] = [];
  let currentStage = 1;

  if (session.startedAt) {
    completedStages.push('welcome');
    currentStage = 2;
  }
  
  if (responses.q2_identity) {
    completedStages.push('identity');
    currentStage = 3;
  }
  
  if (responses.q3_behavioral_responses) {
    completedStages.push('behavioral');
    currentStage = 4;
  }
  
  if (responses.q4_self_assessed_strength) {
    completedStages.push('self-assessment');
    currentStage = 5;
  }
  
  if (hasSignedUp) {
    completedStages.push('signup');
    currentStage = 6;
  }
  
  if (responses.metaSkillScores || completedStages.includes('signup')) {
    completedStages.push('results');
    currentStage = 7;
  }
  
  if (hasSelectedPlan) {
    completedStages.push('payment');
    currentStage = 8;
  }
  
  if (hasCompletedContextConnection) {
    completedStages.push('context-connection');
    currentStage = 9; // Completed!
  }

  const isComplete = completedStages.length === TOTAL_STAGES || hasCompletedContextConnection;
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
  const session = getSession();
  const responses = getAllResponses();

  if (!session) {
    return '/onboarding';
  }

  // Resume from where they left off
  if (!responses.q2_identity) {
    return '/onboarding/identity';
  }
  
  if (!responses.q3_behavioral_responses) {
    return '/onboarding/behavioral';
  }
  
  if (!responses.q4_self_assessed_strength) {
    return '/onboarding/self-assessment';
  }

  // Check authentication using server-side verification
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return '/onboarding/signup-step';
  }

  if (!responses.metaSkillScores) {
    return '/onboarding/results';
  }

  const hasSelectedPlan = localStorage.getItem('selectedPlan') !== null;
  if (!hasSelectedPlan) {
    return '/onboarding/payment';
  }

  const contextConnections = localStorage.getItem('contextConnections');
  if (!contextConnections) {
    return '/onboarding/context-connection';
  }

  // Check if user has completed their first daily check-in
  const firstCheckIn = localStorage.getItem('dailyCheckIn');
  if (!firstCheckIn) {
    return '/daily-check-in';
  }

  // Onboarding complete
  return '/executive-home';
}

export function markOnboardingComplete() {
  const session = getSession();
  if (session) {
    session.responses.onboardingCompleted = true;
    session.responses.completedAt = new Date().toISOString();
    localStorage.setItem('mind_module_onboarding', JSON.stringify(session));
  }
}
