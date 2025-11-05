import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { ProgressIndicator } from "@/components/onboarding/ProgressIndicator";
import { initializeSession, getSession, updateSession } from "@/utils/onboardingStorage";
import { getResumeRoute } from "@/utils/onboardingStatus";

const STAGE_ROUTES = [
  "/onboarding",
  "/onboarding/identity",
  "/onboarding/behavioral",
  "/onboarding/self-assessment",
  "/onboarding/signup-step",
  "/onboarding/results",
  "/onboarding/payment",
  "/onboarding/context-connection",
];

// Only tracking time for questionnaire stages (1-4)
const TIME_ESTIMATES = [0.5, 0.75, 2.5, 0.5];

// Weighted progress calculation - shows completion of PREVIOUS stages
const calculateWeightedProgress = (stageIndex: number): number => {
  const weights = {
    0: 0,    // Welcome - 0% (just starting)
    1: 10,   // Identity - 10% (welcome completed)
    2: 30,   // Behavioral - 30% (identity completed)
    3: 80,   // Self-Assessment - 80% (behavioral completed)
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
    const resumeRoute = getResumeRoute();
    if (location.pathname !== resumeRoute && !location.pathname.includes('/signup')) {
      navigate(resumeRoute);
    }
  }, []);

  // Match routes from longest to shortest to avoid "/onboarding" matching before "/onboarding/behavioral"
  const currentStageIndex = [...STAGE_ROUTES]
    .map((route, index) => ({ route, index }))
    .reverse()
    .find(({ route }) => location.pathname === route || location.pathname.startsWith(route + "/"))
    ?.index ?? 0;
  
  const currentStage = currentStageIndex + 1;

  // Calculate weighted progress percentage for questionnaire stages
  const percentage = calculateWeightedProgress(currentStageIndex);

  // Calculate time remaining only for questionnaire stages
  const estimatedTimeRemaining = currentStageIndex <= 3 
    ? TIME_ESTIMATES.slice(currentStageIndex).reduce((sum, time) => sum + time, 0)
    : 0;

  useEffect(() => {
    updateSession({ currentStage });
  }, [currentStage]);

  // Hide progress bar on Stage 1 (welcome), after questionnaire stages, or signup
  const hideProgress = currentStageIndex === 0 || currentStageIndex > 3 || location.pathname.includes('/signup');

  return (
    <div className="min-h-screen bg-background relative">
      {/* Radial gradient overlay for visual consistency */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gold/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10">
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
    </div>
  );
}
