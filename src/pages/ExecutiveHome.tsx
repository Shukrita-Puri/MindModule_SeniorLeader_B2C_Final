/**
 * Executive Home – Decision Engine Dashboard
 * Three-tab layout: State / Compass / Action
 * Uses display:none toggling (not unmount) to preserve component state.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
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
import StrategicIntentionCard from "@/components/home/StrategicIntentionCard";
import TodayThreePriorities from "@/components/home/TodayThreePriorities";
import DailyRitual from "@/components/home/DailyRitual"; // preserved as fallback
import JitCarousel from "@/components/home/JitCarousel"; // preserved in codebase
import CheckInBanner from "@/components/home/CheckInBanner";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import HistoricalBriefOverlay from "@/components/home/HistoricalBriefOverlay";
import GenerateTodaysPlanLink from "@/components/home/GenerateTodaysPlanLink";


import PlanFeedbackModal from "@/components/home/PlanFeedbackModal";
import { useOuterReadiness } from "@/hooks/useOuterReadiness";
import { submitPlanFeedback, consumePlanFeedbackFlag } from "@/utils/relevanceFeedback";
import FirstSessionGuide from "@/components/onboarding/FirstSessionGuide";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";

// Tier-based CSS gradient colors for poster placeholder (no bundled images)
const TIER_GRADIENTS: Record<string, string> = {
  depleted: 'from-blue-900/50 via-slate-800/35 to-background',
  managing: 'from-amber-900/45 via-stone-800/30 to-background',
  strong: 'from-emerald-900/45 via-teal-800/30 to-background',
  peak: 'from-violet-900/45 via-purple-800/30 to-background',
  default: 'from-stone-800/40 via-stone-700/25 to-background',
};



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
  const heroEnergyTier = outerBrief?.innerReadinessTier || 'default';
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
  
  const getTierGradient = () => {
    return TIER_GRADIENTS[heroEnergyTier] || TIER_GRADIENTS.default;
  };
  
  const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  };

  const heroVideoUrl = useMemo(() => {
    const timeOfDay = getTimeOfDay();
    const tier = heroEnergyTier;
    const videoMap: Record<string, Record<string, string>> = {
      depleted: {
        morning: '/all-visuals/videos/depleted-morning.mp4',
        afternoon: '/all-visuals/videos/depleted-afternoon.mp4',
        evening: '/all-visuals/videos/depleted-evening.mp4',
      },
      managing: {
        morning: '/all-visuals/videos/managing-morning.mp4',
        afternoon: '/all-visuals/videos/managing-afternoon.mp4',
        evening: '/all-visuals/videos/managing-evening.mp4',
      },
      strong: {
        morning: '/all-visuals/videos/strong-morning.mp4',
        afternoon: '/all-visuals/videos/strong-afternoon.mp4',
        evening: '/all-visuals/videos/strong-evening.mp4',
      },
      peak: {
        morning: '/all-visuals/videos/peak-morning.mp4',
        afternoon: '/all-visuals/videos/peak-afternoon.mp4',
        evening: '/all-visuals/videos/peak-evening.mp4',
      },
      very_high: {
        morning: '/all-visuals/videos/veryhigh-morning.mp4',
        afternoon: '/all-visuals/videos/veryhigh-afternoon.mp4',
        evening: '/all-visuals/videos/veryhigh-evening.mp4',
      },
      default: {
        morning: '/all-visuals/videos/strong-morning.mp4',
        afternoon: '/all-visuals/videos/strong-afternoon.mp4',
        evening: '/all-visuals/videos/strong-evening.mp4',
      },
    };

    // Divergence variant override: when wearable/check-in signals diverge
    const divergenceMode = String(heroDivergenceMode || '').toLowerCase();
    if (divergenceMode.includes('recovery')) {
      return `/all-visuals/videos/recovery-${timeOfDay}.mp4`;
    }
    if (divergenceMode.includes('masked')) {
      return `/all-visuals/videos/masked-${timeOfDay}.mp4`;
    }

    return videoMap[tier]?.[timeOfDay] || videoMap.default[timeOfDay];
  }, [heroEnergyTier, heroDivergenceMode]);
  
  const videoFadedIn = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const fadeInVideo = useCallback((el?: HTMLVideoElement | null) => {
    const target = el || videoRef.current;
    if (!videoFadedIn.current && target) {
      target.style.opacity = '0.4';
      videoFadedIn.current = true;
    }
  }, []);

  useEffect(() => {
    videoFadedIn.current = false;
    const timer = setTimeout(() => fadeInVideo(), 3000);
    return () => clearTimeout(timer);
  }, [heroVideoUrl, fadeInVideo]);

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="h-[100dvh] max-h-[100dvh] min-h-0 flex w-full bg-background overflow-hidden">
        <LeftSidebar />
        
        <SidebarInset
          data-scroll-container
          className="w-full h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
        >
          {/* Immersive Hero Visual */}
          <div className="relative">
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <div className={`absolute inset-0 bg-gradient-to-b ${getTierGradient()}`} />
              <video 
                ref={videoRef}
                key={heroVideoUrl}
                src={heroVideoUrl}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                onCanPlay={(e) => fadeInVideo(e.currentTarget)}
                onLoadedData={(e) => fadeInVideo(e.currentTarget)}
                className="w-full h-full object-cover video-warm-luxury"
                style={{ opacity: 0 }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/5 via-background/30 to-background pointer-events-none" />
            </div>
            
            <header className="relative z-40 flex items-center justify-between px-3 md:px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 w-full pointer-events-auto">
              <div data-tour="sidebar-trigger-wrap" className="p-2 -m-2 rounded-full">
                <SidebarDiscoveryPulse />
              </div>
              <div data-tour="coach-access-wrap" className="hidden p-2 -m-2 rounded-full">
                <div data-tour="coach-access"><CoachAccessButton /></div>
              </div>
            </header>
            
            <div className="relative z-10 pt-0 pb-2 max-w-lg mx-auto text-center">
            <h1 className="text-[28px] sm:text-3xl md:text-4xl font-headline font-bold text-foreground tracking-tight">
                {getGreeting()}
              </h1>
              {/* TEMP_SUPPRESSED: subheadline phrase hidden to avoid duplication with brief italic line */}
              {false && (
                <p className="text-sm text-muted-foreground/70 mt-1 font-body">
                  {getSubheadline()}
                </p>
              )}
            </div>
          </div>

          {/* All sections stacked on one page */}
          <div className="flex-1 w-full pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)]">

            {/* DECISION READINESS BRIEF (replaces State + Compass) */}
            <div className="px-4 md:px-6 max-w-lg mx-auto pt-0">
              <section data-tour="today-state" className="animate-in fade-in duration-500">
                <PerformanceReadinessBrief onCtaReadyChange={setBriefCtaReady} />
              </section>
              {briefCtaReady && (
                 <div data-tour="daily-plan" className="mt-5 pt-1 flex justify-end animate-in fade-in duration-300">
                   <GenerateTodaysPlanLink onClick={() => navigate('/plan')} />
                 </div>
               )}
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
