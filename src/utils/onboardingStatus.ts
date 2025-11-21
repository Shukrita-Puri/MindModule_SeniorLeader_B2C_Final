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
  
  if (responses.energy_regulation_response) {
    completedStages.push('energy-regulation');
    currentStage = 4;
  }
  
  if (responses.focus_recovery_response) {
    completedStages.push('focus-recovery');
    currentStage = 5;
  }
  
  if (responses.energy_renewal_response) {
    completedStages.push('energy-renewal');
    currentStage = 6;
  }
  
  if (responses.growth_priority) {
    completedStages.push('growth-assessment');
    currentStage = 7;
  }
  
  if (responses.metaSkillScores) {
    completedStages.push('results');
    currentStage = 8;
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
  const session = getSession();
  const responses = getAllResponses();

  if (!session) {
    return '/onboarding';
  }

  // Resume from where they left off based on actual stage responses
  if (!responses.identity_type) {
    return '/onboarding/identity';
  }
  
  if (!responses.energy_regulation_response) {
    return '/onboarding/energy-regulation';
  }
  
  if (!responses.focus_recovery_response) {
    return '/onboarding/focus-recovery';
  }
  
  if (!responses.energy_renewal_response) {
    return '/onboarding/energy-renewal';
  }
  
  if (!responses.growth_priority) {
    return '/onboarding/growth-assessment';
  }

  // No need to check Auth0 here - signup-step handles that internally
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
