/**
 * Executive Home – Decision Engine Dashboard
 * Three-tab layout: State / Compass / Action
 * Uses display:none toggling (not unmount) to preserve component state.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { DEV_MODE, DEV_USER } from "@/config/devMode";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { getAuthToken } from "@/services/authTokenService";

import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
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


import PlanFeedbackModal from "@/components/home/PlanFeedbackModal";
import { computeEnergyState } from "@/utils/energyStateEngine";
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
  const { recordStep } = useOnboardingProgress();
  
  const [planFeedback, setPlanFeedback] = useState<{ planType: 'tod' | 'jit' } | null>(null);

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

    if (!DEV_MODE && (!user?.id || !user?.onboarding_completed_at)) {
      setShowGuide(false);
      return;
    }

    const effectiveId = user?.id || (DEV_MODE ? DEV_USER.id : undefined);

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
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/onboarding-progress`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
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

  // Fetch energy state for hero visual
  const { data: energyState } = useQuery({
    queryKey: ['energy-state', user?.id],
    queryFn: async () => computeEnergyState(user?.id),
    enabled: !!user?.id,
    staleTime: 60000,
  });
  
  // Fetch outer readiness brief (shared cache with StrategicIntentionCard)
  const { data: outerBrief } = useOuterReadiness();
  
  const fullName = user?.name || user?.email || 'there';
  const firstName = fullName.split(' ')[0];
  
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return `Morning, ${firstName}`;
    if (hour >= 12 && hour < 18) return `Afternoon, ${firstName}`;
    return `Evening, ${firstName}`;
  };
  
  const getSubheadline = () => {
    if (!outerBrief) return "Let's make today count.";
    return outerBrief.phrase || "Let's make today count.";
  };
  
  const getTierGradient = () => {
    const tier = energyState?.energyTier || 'default';
    return TIER_GRADIENTS[tier] || TIER_GRADIENTS.default;
  };
  
  const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  };

  const heroVideoUrl = useMemo(() => {
    const timeOfDay = getTimeOfDay();
    const tier = energyState?.energyTier || 'default';
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
    const divergenceFlag = energyState?.divergenceFlag;
    if (divergenceFlag === 'RECOVERY_UNDERWAY') {
      return `/all-visuals/videos/recovery-${timeOfDay}.mp4`;
    }
    if (divergenceFlag === 'MASKED_HIGH') {
      return `/all-visuals/videos/masked-${timeOfDay}.mp4`;
    }

    return videoMap[tier]?.[timeOfDay] || videoMap.default[timeOfDay];
  }, [energyState?.energyTier, energyState?.divergenceFlag]);
  
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
      <div className="min-h-screen flex w-full bg-background">
        <LeftSidebar />
        
        <SidebarInset className="w-full overflow-x-hidden">
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
            
            <header className="relative z-40 flex items-center justify-between px-3 md:px-4 py-3 w-full pointer-events-auto">
              <div data-tour="sidebar-trigger-wrap" className="p-2 -m-2 rounded-full">
                <SidebarDiscoveryPulse />
              </div>
              <div data-tour="coach-access-wrap" className="hidden p-2 -m-2 rounded-full">
                <div data-tour="coach-access"><CoachAccessButton /></div>
              </div>
            </header>
            
            <div className="relative z-10 pt-6 pb-16 max-w-lg mx-auto text-center">
            <h1 className="text-[28px] sm:text-4xl md:text-5xl font-headline text-foreground tracking-tight">
                {getGreeting()}
              </h1>
              <p className="text-[15px] text-muted-foreground/70 mt-2 font-body">
                {getSubheadline()}
              </p>
            </div>
          </div>

          {/* All sections stacked on one page */}
          <div className="flex-1 w-full pb-[100px]">

            {/* DECISION READINESS BRIEF (replaces State + Compass) */}
            <div className="px-4 md:px-6 max-w-lg mx-auto pt-4">
              <section data-tour="today-state" className="animate-in fade-in duration-500">
                <PerformanceReadinessBrief />
              </section>
            </div>

            {/* ACTION — Today's 3 Performance Priorities */}
            <div data-tour="daily-plan">
              {/* Unified 3-slot horizon system */}
              <div className="animate-in fade-in duration-500">
                <TodayThreePriorities />
              </div>
            </div>

            <div className="mt-8">
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

          {/* Plan Feedback Modal */}
          {planFeedback && (
            <PlanFeedbackModal
              planType={planFeedback.planType}
              energyTier={energyState?.energyTier}
              onSubmit={async (rating, feedback) => {
                try {
                  await submitPlanFeedback(
                    planFeedback.planType,
                    rating,
                    feedback,
                    energyState?.energyTier
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
