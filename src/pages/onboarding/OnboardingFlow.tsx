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
  "/onboarding/practice-setup",
];

const TIME_ESTIMATES = [0.5, 1, 2.5, 0.5, 1, 1, 2, 2, 0.5];

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

  const estimatedTimeRemaining = TIME_ESTIMATES.slice(currentStageIndex).reduce(
    (sum, time) => sum + time,
    0
  );

  useEffect(() => {
    updateSession({ currentStage });
  }, [currentStage]);

  const hideProgress = [5, 6, 7].includes(currentStage) || location.pathname.includes('/signup');

  return (
    <div className="min-h-screen bg-background">
      {!hideProgress && (
        <ProgressIndicator
          currentStage={currentStage}
          totalStages={9}
          estimatedTimeRemaining={Math.ceil(estimatedTimeRemaining)}
        />
      )}

      <div className="max-w-2xl mx-auto px-4 py-8">
        <Outlet />
      </div>
    </div>
  );
}
