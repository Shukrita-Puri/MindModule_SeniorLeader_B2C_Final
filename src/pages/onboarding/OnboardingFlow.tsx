import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { ProgressIndicator } from "@/components/onboarding/ProgressIndicator";
import { initializeSession, getSession, updateSession } from "@/utils/onboardingStorage";

const STAGE_ROUTES = [
  "/onboarding",
  "/onboarding/identity",
  "/onboarding/behavioral",
  "/onboarding/self-assessment",
  "/signup",
  "/onboarding/results",
  "/onboarding/payment",
  "/onboarding/context-connection",
];

// Only tracking time for questionnaire stages (1-4)
const TIME_ESTIMATES = [0.5, 0.75, 2.5, 0.5];

// Weighted progress calculation for questionnaire stages
const calculateWeightedProgress = (stageIndex: number): number => {
  const weights = {
    0: 10,   // Welcome - 10%
    1: 30,   // Identity - 30%
    2: 80,   // Behavioral (heaviest) - 80%
    3: 100,  // Self-Assessment - 100%
  };
  return weights[stageIndex as keyof typeof weights] || 0;
};

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const sessionId = initializeSession();
    console.log("Onboarding session initialized:", sessionId);

    const session = getSession();
    if (session && session.currentStage > 1) {
      const resumeRoute = STAGE_ROUTES[session.currentStage - 1];
      if (location.pathname !== resumeRoute && !location.pathname.includes('/signup')) {
        navigate(resumeRoute);
      }
    }
  }, []);

  const currentStageIndex = STAGE_ROUTES.findIndex(route => 
    location.pathname.startsWith(route)
  );
  const currentStage = currentStageIndex >= 0 ? currentStageIndex + 1 : 1;

  // Calculate weighted progress percentage for questionnaire stages
  const percentage = calculateWeightedProgress(currentStageIndex);

  // Calculate time remaining only for questionnaire stages
  const estimatedTimeRemaining = currentStageIndex <= 3 
    ? TIME_ESTIMATES.slice(currentStageIndex).reduce((sum, time) => sum + time, 0)
    : 0;

  useEffect(() => {
    updateSession({ currentStage });
  }, [currentStage]);

  // Hide progress bar after questionnaire stages (index > 3)
  const hideProgress = currentStageIndex > 3 || location.pathname.includes('/signup');

  return (
    <div className="min-h-screen bg-background">
      {!hideProgress && (
        <ProgressIndicator
          percentage={percentage}
          estimatedTimeRemaining={Math.ceil(estimatedTimeRemaining)}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 py-8">
        <Outlet />
      </div>
    </div>
  );
}
