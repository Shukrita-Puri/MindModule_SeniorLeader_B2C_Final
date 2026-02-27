import { useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ProgressIndicator } from "@/components/onboarding/ProgressIndicator";
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
  "/onboarding/context-connection",
];

// Only tracking time for questionnaire stages (1-6)
const TIME_ESTIMATES = [0.5, 0.75, 0.75, 0.75, 0.75, 0.75];

// Weighted progress calculation - shows completion of PREVIOUS stages
const calculateWeightedProgress = (stageIndex: number): number => {
  const weights = {
    0: 0,    // Welcome - 0%
    1: 10,   // Identity - 10%
    2: 25,   // Emotional Awareness - 25%
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

      // Only apply resume logic if user directly visits /onboarding root
      if (location.pathname === '/onboarding') {
        const session = getSession();
        const resumeRoute = await getResumeRoute();
        if (resumeRoute !== '/onboarding') {
          console.log('[OnboardingFlow] Resuming to:', resumeRoute);
          navigate(resumeRoute);
        }
      }
    };
    
    initOnboarding();
  }, []);

  // Stage gating: validate access on route change
  useEffect(() => {
    if (location.pathname === '/onboarding') return;
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

  // Determine if we should show back button (stages 1-6: identity through growth intention)
  const showBackButton = currentStageIndex >= 1 && currentStageIndex <= 6;
  const getBackPath = () => {
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
        <div className="fixed top-0 left-0 right-0 z-50 safe-area-top bg-white/85 backdrop-blur-[30px] border-b border-black/[0.08]">
          <div className="flex items-center px-4 py-2">
            <button 
              onClick={() => navigate(getBackPath())}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="text-sm">Back</span>
            </button>
          </div>
        </div>
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

        <div className="max-w-2xl mx-auto px-4 py-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
