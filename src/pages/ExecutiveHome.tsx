/**
 * Executive Home – Decision Engine Dashboard
 * Three-tab layout: State / Compass / Action
 * Uses display:none toggling (not unmount) to preserve component state.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { trackBriefView } from "@/utils/engagementTracking";
import { useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { DEV_MODE, DEV_USER } from "@/config/devMode";
import { useAuth } from "@/hooks/useAuth";
import { getAuthToken, getEdgeFunctionHeaders } from "@/services/authTokenService";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import CoachAccessButton from "@/components/navigation/CoachAccessButton";
import SidebarDiscoveryPulse from "@/components/navigation/SidebarDiscoveryPulse";

import TodayStateCard from "@/components/home/TodayStateCard"; // kept in codebase
import PerformanceReadinessBrief from "@/components/home/DecisionReadinessBrief";
import TodayStepper from "@/components/today/TodayStepper";
import TodayHero from "@/components/today/TodayHero";
import TodayGreeting from "@/components/today/TodayGreeting";
import StrategicIntentionCard from "@/components/home/StrategicIntentionCard";
import TodayThreePriorities from "@/components/home/TodayThreePriorities";
import DailyRitual from "@/components/home/DailyRitual"; // preserved as fallback
import JitCarousel from "@/components/home/JitCarousel"; // preserved in codebase
import CheckInBanner from "@/components/home/CheckInBanner";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import HistoricalBriefOverlay from "@/components/home/HistoricalBriefOverlay";
import PlanFeedbackModal from "@/components/home/PlanFeedbackModal";
import { useOuterReadiness } from "@/hooks/useOuterReadiness";
import { submitPlanFeedback, consumePlanFeedbackFlag } from "@/utils/relevanceFeedback";
import FirstSessionGuide from "@/components/onboarding/FirstSessionGuide";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";

// Tier-based CSS gradient colors for poster placeholder (no bundled images)
const ACTIVE_TOUR_KEY = 'first_session_guide_active';
const ACTIVE_TOUR_USER_KEY = 'first_session_guide_user';
const RETAKE_TOUR_KEY = 'first_session_guide_retake';

const ExecutiveHome = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { recordStep } = useOnboardingProgress();
  const [searchParams, setSearchParams] = useSearchParams();
  const historicalBriefId = searchParams.get('briefId');

  const closeHistoricalBrief = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('briefId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  
  const [planFeedback, setPlanFeedback] = useState<{ planType: 'tod' | 'jit' } | null>(null);
  const [prioritiesEmpty, setPrioritiesEmpty] = useState(false);
  const [briefCtaReady, setBriefCtaReady] = useState(false);

  // First session guide: show if tour is actively in progress (cross-page from check-in)
  const [showGuide, setShowGuide] = useState(false);

  // Immediate sessionStorage check on mount/navigation — catches cross-page tour handoff
  useEffect(() => {
    const effectiveId = user?.id || (DEV_MODE ? DEV_USER.id : undefined);
    if (!effectiveId) return;
    const isActive =
      sessionStorage.getItem(ACTIVE_TOUR_KEY) === '1' &&
      sessionStorage.getItem(ACTIVE_TOUR_USER_KEY) === effectiveId;
    const isRetake = sessionStorage.getItem(RETAKE_TOUR_KEY) === effectiveId;
    if (isActive || isRetake) setShowGuide(true);
  }, [location.pathname, user?.id]);

  useEffect(() => {
    let cancelled = false;

    const effectiveId = user?.id || (DEV_MODE ? DEV_USER.id : undefined);
    const isRetakeForUser = effectiveId ? sessionStorage.getItem(RETAKE_TOUR_KEY) === effectiveId : false;
    const isActiveForUser = effectiveId
      ? sessionStorage.getItem(ACTIVE_TOUR_KEY) === '1' && sessionStorage.getItem(ACTIVE_TOUR_USER_KEY) === effectiveId
      : false;
    const hasTourSignal = isRetakeForUser || isActiveForUser;

    if (!DEV_MODE && !user?.id) {
      setShowGuide(false);
      return;
    }

    if (!DEV_MODE && !user?.onboarding_completed_at && !hasTourSignal) {
      setShowGuide(false);
      return;
    }

    if (!DEV_MODE && hasTourSignal) {
      setShowGuide(true);
      return;
    }

    // effectiveId already defined above

    if (DEV_MODE) {
      const tourDone = sessionStorage.getItem('first_session_guide_done') === '1';
      const isActiveForUser =
        sessionStorage.getItem(ACTIVE_TOUR_KEY) === '1' &&
        sessionStorage.getItem(ACTIVE_TOUR_USER_KEY) === effectiveId;
      const isRetakeForUser = sessionStorage.getItem(RETAKE_TOUR_KEY) === effectiveId;

      if (tourDone && !isRetakeForUser) {
        if (!cancelled) setShowGuide(false);
        return;
      }

      if (!cancelled) setShowGuide(isActiveForUser || isRetakeForUser);
      return;
    }

    getAuthToken().then(async (token) => {
      if (!token) return;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      try {
        const headers = await getEdgeFunctionHeaders();
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/onboarding-progress`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'GET' }),
          }
        );

        if (!res.ok) return;

        const data = await res.json();
        const walkthroughDone = !!data?.data?.first_session_walkthrough_at;
        const isActiveForUser =
          sessionStorage.getItem(ACTIVE_TOUR_KEY) === '1' &&
          sessionStorage.getItem(ACTIVE_TOUR_USER_KEY) === effectiveId;
        const isRetakeForUser = sessionStorage.getItem(RETAKE_TOUR_KEY) === effectiveId;

        if (walkthroughDone && !isRetakeForUser) {
          sessionStorage.removeItem(ACTIVE_TOUR_KEY);
          sessionStorage.removeItem(ACTIVE_TOUR_USER_KEY);
          sessionStorage.removeItem('first_session_guide_step');
          if (!cancelled) setShowGuide(false);
          return;
        }

        if (!cancelled) setShowGuide(isActiveForUser || isRetakeForUser);
      } catch {
        if (!cancelled) setShowGuide(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.onboarding_completed_at, location.pathname]);

  // Check for plan feedback flag on mount
  useEffect(() => {
    const result = consumePlanFeedbackFlag();
    if (result) {
      setPlanFeedback(result);
    }
  }, []);

  // Fetch outer readiness brief. This payload already echoes inner readiness,
  // so the home hero must not start a second computeEnergyState/check-in chain.
  const { data: outerBrief } = useOuterReadiness();
  // MRS v3 — prefer the soft-guard displayed tier so chronic-load capping
  // shows in the hero. Falls back to the raw inner tier when not present.
  const heroEnergyTier = outerBrief?.innerReadinessTierDisplayed || outerBrief?.innerReadinessTier || 'default';
  const heroDivergenceMode = outerBrief?.divergenceMode || null;

  // Track brief view once per persisted brief snapshot (keyed by briefId).
  // We ONLY track when:
  //   - The brief was persisted server-side (briefId present)
  //   - It's a real generated brief (phrase + body present)
  //   - It's not an awaiting-signals empty state
  // This guarantees every Recent sidebar row maps to a real brief_snapshots
  // row that HistoricalBriefOverlay can open.
  const trackedBriefIdRef = useRef<string | null>(null);
  useEffect(() => {
    const briefId = outerBrief?.briefId;
    const phrase = outerBrief?.phrase;
    const body = outerBrief?.bodyText || outerBrief?.context;
    const isAwaiting = outerBrief?.awaitingSignals === true;
    if (
      !isAwaiting &&
      briefId &&
      phrase &&
      body &&
      briefId !== trackedBriefIdRef.current
    ) {
      trackedBriefIdRef.current = briefId;
      trackBriefView({
        briefId,
        phrase,
        body,
        leanOn: outerBrief?.leanOn,
        watchFor: outerBrief?.watchFor,
      });
    }
  }, [
    outerBrief?.briefId,
    outerBrief?.phrase,
    outerBrief?.bodyText,
    outerBrief?.context,
    outerBrief?.leanOn,
    outerBrief?.watchFor,
    outerBrief?.awaitingSignals,
  ]);
  
  const fullName = user?.name || user?.email || 'there';
  const firstName = fullName.split(' ')[0];
  
  const getGreeting = () => {
    // Chief-of-Staff salutations — short, capable, time-neutral.
    // Rotates deterministically by day-of-week so it feels stable per session but not templated.
    const phrases = [
      `Ready, ${firstName}`,
      `Standing by, ${firstName}`,
      `Ready to roll, ${firstName}`,
    ];
    return phrases[new Date().getDay() % phrases.length];
  };
  
  const getSubheadline = () => {
    if (!outerBrief) return "Let's make today count.";
    return outerBrief.phrase || "Let's make today count.";
  };
  
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="h-[100dvh] max-h-[100dvh] min-h-0 flex w-full bg-background overflow-hidden">
        <LeftSidebar />
        
        <SidebarInset
          data-scroll-container
          className="w-full h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
        >
          {/* Unified Today header bar + shared hero (header overlays hero) */}
          <div className="relative">
            <TodayHero />
            <TodayGreeting />
            <header className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-3 md:px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 w-full pointer-events-auto">
              <div data-tour="sidebar-trigger-wrap" className="p-2 -m-2 rounded-full">
                <SidebarDiscoveryPulse />
              </div>
              <div data-tour="coach-access-wrap" className="hidden p-2 -m-2 rounded-full">
                <div data-tour="coach-access"><CoachAccessButton /></div>
              </div>
            </header>
          </div>

          {/* All sections stacked on one page */}
          <div className="flex-1 w-full pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)]">

            <TodayStepper current={2} nextHint={briefCtaReady ? 3 : undefined} />

            {/* DECISION READINESS BRIEF (replaces State + Compass) */}
            <div className="max-w-lg mx-auto md:px-6 pt-0">
              <h1 className="sr-only">{getGreeting()}</h1>
              <section data-tour="today-state" className="animate-in fade-in duration-500">
                <PerformanceReadinessBrief onCtaReadyChange={setBriefCtaReady} />
              </section>
            </div>


            <div className="mt-8 hidden sm:block">
              <PrivacyFooter />
            </div>
          </div>

          {/* First Session Guide */}
          {showGuide && (
            <FirstSessionGuide onComplete={() => {
              setShowGuide(false);
              recordStep('first_session_walkthrough', { completed: true });
            }} />
          )}

          {/* Historical Brief Overlay (frosted glass over live home) */}
          {historicalBriefId && (
            <HistoricalBriefOverlay
              briefId={historicalBriefId}
              onClose={closeHistoricalBrief}
            />
          )}

          {/* Plan Feedback Modal */}
          {planFeedback && (
            <PlanFeedbackModal
              planType={planFeedback.planType}
              energyTier={heroEnergyTier === 'default' ? undefined : heroEnergyTier}
              onSubmit={async (rating, feedback) => {
                try {
                  await submitPlanFeedback(
                    planFeedback.planType,
                    rating,
                    feedback,
                    heroEnergyTier === 'default' ? undefined : heroEnergyTier
                  );
                } catch (e) {
                  console.error('Failed to save plan feedback:', e);
                }
                setPlanFeedback(null);
              }}
              onSkip={() => setPlanFeedback(null)}
            />
          )}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default ExecutiveHome;
