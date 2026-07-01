import { useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import { initializeSession, updateSession } from "@/utils/onboardingStorage";

// v8 onboarding flow paths — these screens are full-bleed (fixed inset-0)
// and own their own main content. The shell only provides the shared back
// action where useful; legacy questionnaire gating/progress is retired.
const V8_PATHS = new Set([
  '/onboarding/app-intro',
  '/onboarding/leadership-context',
  '/onboarding/cognitive-load',
  '/onboarding/protect-goals',
  '/onboarding/brief-prefs',
  '/onboarding/permissions',
  '/onboarding/connect',
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

      // /onboarding itself redirects to the V8 app-intro route in App.tsx.
    };
    
    initOnboarding();
  }, []);

  useEffect(() => {
    if (gateChecked.current === location.pathname) return;
    gateChecked.current = location.pathname;
    if (!V8_PATHS.has(location.pathname)) {
      navigate('/onboarding/app-intro', { replace: true });
    }
  }, [location.pathname, navigate]);

  const V8_STAGE_INDEX: Record<string, number> = {
    '/onboarding/app-intro': 1,
    '/onboarding/leadership-context': 2,
    '/onboarding/cognitive-load': 3,
    '/onboarding/protect-goals': 4,
    '/onboarding/brief-prefs': 5,
    '/onboarding/permissions': 6,
    '/onboarding/connect': 7,
    '/onboarding/done': 8,
  };
  const currentStage = V8_STAGE_INDEX[location.pathname] ?? 1;

  useEffect(() => {
    updateSession({ currentStage });
  }, [currentStage]);

  const isV8 = V8_PATHS.has(location.pathname);
  const isV8Done = location.pathname === '/onboarding/done';
  const showBackButton = isV8 && !isV8Done;
  const handleBack = () => {
    if (location.pathname === '/onboarding/app-intro') {
      const event = new CustomEvent('onboarding:back', { cancelable: true });
      window.dispatchEvent(event);
      if (event.defaultPrevented) return;
    }
    if (location.pathname === '/onboarding/leadership-context') {
      navigate('/onboarding/app-intro', { state: { startAtLast: true } });
      return;
    }

    const backMap: Record<string, string> = {
      '/onboarding/app-intro': '/onboarding',
      '/onboarding/leadership-context': '/onboarding/app-intro',
      '/onboarding/cognitive-load': '/onboarding/leadership-context',
      '/onboarding/protect-goals': '/onboarding/cognitive-load',
      '/onboarding/brief-prefs': '/onboarding/protect-goals',
      '/onboarding/permissions': '/onboarding/brief-prefs',
      '/onboarding/connect': '/onboarding/permissions',
    };
    navigate(backMap[location.pathname] ?? '/onboarding');
  };

  return (
    <div data-scroll-container className="min-h-screen min-h-[100dvh] bg-transparent overflow-y-auto overscroll-contain scroll-pt-[calc(53px+env(safe-area-inset-top,0px))] scroll-pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">

      
      {/* Fixed Top Bar with Back Arrow */}
      {showBackButton && (
        <UnifiedTopBar hideCoach onBack={handleBack} showBrand={isV8} />
      )}
      
      <div className="relative z-10">
        <div className="max-w-2xl mx-auto px-4 pt-2 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
