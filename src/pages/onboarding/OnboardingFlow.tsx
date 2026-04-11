import { useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { ProgressIndicator } from "@/components/onboarding/ProgressIndicator";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import { initializeSession, getSession, updateSession } from "@/utils/onboardingStorage";
import { getResumeRoute, validateStageAccess } from "@/utils/onboardingStatus";

const STAGE_ROUTES = [
  "/onboarding",
  "/onboarding/identity",
  "/onboarding/emotional-awareness",
  "/onboarding/stress-response",
  "/onboarding/recovery-patterns",
  "/onboarding/mental-clarity",
  "/onboarding/growth-intention",
  "/onboarding/signup-step",
  "/onboarding/results",
  "/onboarding/payment",
  "/onboarding/app-intro",
  "/onboarding/context-connection",
];

// Only tracking time for questionnaire stages (1-6)
const TIME_ESTIMATES = [0.5, 0.75, 0.75, 0.75, 0.75, 0.75];

// Weighted progress calculation - shows completion of PREVIOUS stages
const calculateWeightedProgress = (stageIndex: number): number => {
  const weights = {
    0: 0,    // Welcome - 0%
    1: 10,   // Identity - 10%
    2: 25,   // Self-Awareness - 25%
    3: 40,   // Stress Response - 40%
    4: 55,   // Recovery Patterns - 55%
    5: 70,   // Mental Clarity - 70%
    6: 85,   // Growth Intention - 85%
  };
  return weights[stageIndex as keyof typeof weights] || 0;
};

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const gateChecked = useRef<string | null>(null);

  useEffect(() => {
    const initOnboarding = async () => {
      const sessionId = initializeSession();
      console.log("Onboarding session initialized:", sessionId);

      // Never auto-redirect from /onboarding root – always show Welcome.
      // Resume logic only applies to deep-linked sub-routes (handled by stage gating).
    };
    
    initOnboarding();
  }, []);

  // Stage gating: validate access on route change
  useEffect(() => {
    if (location.pathname === '/onboarding') return;
    // Skip gating for payment page (upgrade flow for completed users)
    if (location.pathname === '/onboarding/payment') return;
    if (gateChecked.current === location.pathname) return;
    gateChecked.current = location.pathname;

    (async () => {
      const redirect = await validateStageAccess(location.pathname);
      if (redirect && redirect !== location.pathname) {
        console.log('[OnboardingFlow] Stage gating redirect:', location.pathname, '->', redirect);
        navigate(redirect, { replace: true });
      }
    })();
  }, [location.pathname]);

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
  const estimatedTimeRemaining = currentStageIndex <= 6 
    ? TIME_ESTIMATES.slice(currentStageIndex).reduce((sum, time) => sum + time, 0)
    : 0;

  useEffect(() => {
    updateSession({ currentStage });
  }, [currentStage]);

  // Hide progress bar on Stage 1 (welcome), after questionnaire stages, or signup
  const hideProgress = currentStageIndex === 0 || currentStageIndex > 6 || location.pathname.includes('/signup');

  // Determine if we should show back button
  const isPaymentPage = location.pathname === '/onboarding/payment';
  const showBackButton = (currentStageIndex >= 1 && currentStageIndex <= 6) || isPaymentPage;
  const getBackPath = () => {
    if (isPaymentPage) {
      // Upgrade visit (completed onboarding or explicit source) → executive home
      const querySource = new URLSearchParams(location.search).get('source');
      const stateSource = location.state && typeof location.state === 'object' && 'source' in location.state
        ? (location.state as Record<string, string>).source : null;
      const hasUpgradeSource = [querySource, stateSource].some(s => typeof s === 'string' && s.length > 0);
      // If user already completed onboarding or arrived via upgrade link, go to home
      // Otherwise they're in initial onboarding flow → go to results
      return hasUpgradeSource ? '/executive-home' : '/onboarding/results';
    }
    if (currentStageIndex === 1) return "/onboarding";
    if (currentStageIndex === 2) return "/onboarding/identity";
    if (currentStageIndex === 3) return "/onboarding/emotional-awareness";
    if (currentStageIndex === 4) return "/onboarding/stress-response";
    if (currentStageIndex === 5) return "/onboarding/recovery-patterns";
    if (currentStageIndex === 6) return "/onboarding/mental-clarity";
    return "/onboarding";
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background overflow-y-auto">

      
      {/* Fixed Top Bar with Back Arrow */}
      {showBackButton && (
        <UnifiedTopBar hideCoach onBack={() => navigate(getBackPath())} />
      )}
      
      <div className="relative z-10">
        {/* Progress Bar - below top bar */}
        <div className={showBackButton ? "pt-[calc(53px+env(safe-area-inset-top,0px))]" : ""}>
          {!hideProgress && (
            <ProgressIndicator
              percentage={percentage}
              estimatedTimeRemaining={Math.ceil(estimatedTimeRemaining)}
            />
          )}
        </div>

        <div className={`max-w-2xl mx-auto px-4 ${isPaymentPage ? 'py-2' : 'py-8'}`}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
