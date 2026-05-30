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

// v8 onboarding flow paths — these screens are full-bleed (fixed inset-0)
// and own their own back/skip navigation, so the OnboardingFlow chrome
// (top bar + progress) is suppressed for them. Stage gating is also
// bypassed because they are the new entry path for fresh users.
const V8_PATHS = new Set([
  '/onboarding/app-intro',
  '/onboarding/leadership-context',
  '/onboarding/cognitive-load',
  '/onboarding/protect-goals',
  '/onboarding/brief-prefs',
  '/onboarding/permissions',
  '/onboarding/done',
]);

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

  // Stage gating: validate access on route change.
  // /onboarding/payment is no longer special-cased here — `validateStageAccess`
  // is now the single source of truth and explicitly allows the payment page
  // for completed users (upgrade flow) and for users who have reached the
  // results step. This removes the duplicate, route-level bypass that
  // previously diverged from the canonical decision.
  useEffect(() => {
    if (location.pathname === '/onboarding') return;
    if (V8_PATHS.has(location.pathname)) return;
    if (gateChecked.current === location.pathname) return;
    gateChecked.current = location.pathname;

    (async () => {
      const redirect = await validateStageAccess(location.pathname);
      if (redirect && redirect !== location.pathname) {
        console.log('[OnboardingFlow] Stage gating redirect:', location.pathname, '->', redirect);
        navigate(redirect, { replace: true });
      }
    })();
  }, [location.pathname, navigate]);

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
  const hideProgress = currentStageIndex === 0 || currentStageIndex > 6 || location.pathname.includes('/signup') || V8_PATHS.has(location.pathname);

  // Determine if we should show back button.
  // Stages 1–6 (questionnaire) and the payment page always show one.
  // Stages 7+ (signup, results, payment, app-intro, context-connection) also
  // get a back button so users aren't trapped at any post-questionnaire step.
  // The signup stage is the one exception – going back from there would
  // discard a freshly-created session, which is more confusing than helpful.
  const isPaymentPage = location.pathname === '/onboarding/payment';
  const isSignupStep = location.pathname === '/onboarding/signup-step';
  const isV8 = V8_PATHS.has(location.pathname);
  const isV8Done = location.pathname === '/onboarding/done';
  const showBackButton = (currentStageIndex >= 1 && !isSignupStep && !isV8Done) || (isV8 && !isV8Done);
  const handleBack = () => {
    if (isPaymentPage) {
      // Upgrade visit (completed onboarding or explicit source) → executive home
      const querySource = new URLSearchParams(location.search).get('source');
      const stateSource = location.state && typeof location.state === 'object' && 'source' in location.state
        ? (location.state as Record<string, string>).source : null;
      const hasUpgradeSource = [querySource, stateSource].some(s => typeof s === 'string' && s.length > 0);
      navigate(hasUpgradeSource ? '/executive-home' : '/onboarding/results');
      return;
    }
    // Stage 2 (Identity) has an internal Q1→Q2 step; let the page handle its
    // own back navigation via a custom event before we leave the route.
    if (location.pathname === '/onboarding/identity' || location.pathname === '/onboarding/app-intro') {
      const event = new CustomEvent('onboarding:back', { cancelable: true });
      window.dispatchEvent(event);
      // If the page called preventDefault, it absorbed the back press.
      if (event.defaultPrevented) return;
    }
    // Questionnaire stages – walk back exactly one step.
    if (location.pathname === '/onboarding/emotional-awareness') {
      navigate('/onboarding/identity', { state: { returnToQuestion: 2 } });
      return;
    }

    const backMap: Record<string, string> = {
      '/onboarding/identity': '/onboarding',
      '/onboarding/stress-response': '/onboarding/emotional-awareness',
      '/onboarding/recovery-patterns': '/onboarding/stress-response',
      '/onboarding/mental-clarity': '/onboarding/recovery-patterns',
      '/onboarding/growth-intention': '/onboarding/mental-clarity',
      // Post-questionnaire stages
      '/onboarding/results': '/onboarding/growth-intention',
      '/onboarding/app-intro': '/onboarding',
      '/onboarding/context-connection': '/onboarding/app-intro',
      // v8 chain
      '/onboarding/leadership-context': '/onboarding/app-intro',
      '/onboarding/cognitive-load': '/onboarding/leadership-context',
      '/onboarding/protect-goals': '/onboarding/cognitive-load',
      '/onboarding/brief-prefs': '/onboarding/protect-goals',
      '/onboarding/permissions': '/onboarding/brief-prefs',
    };
    navigate(backMap[location.pathname] ?? '/onboarding');
  };

  return (
    <div data-scroll-container className="min-h-screen min-h-[100dvh] bg-background overflow-y-auto overscroll-contain scroll-pt-[calc(53px+env(safe-area-inset-top,0px))] scroll-pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">

      
      {/* Fixed Top Bar with Back Arrow */}
      {showBackButton && (
        <UnifiedTopBar hideCoach onBack={handleBack} showBrand={isV8} />
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

        <div className="max-w-2xl mx-auto px-4 pt-2 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
