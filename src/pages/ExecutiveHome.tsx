/**
 * Executive Home – Decision Engine Dashboard
 * Three-tab layout: State / Compass / Action
 * Uses display:none toggling (not unmount) to preserve component state.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import CoachAccessButton from "@/components/navigation/CoachAccessButton";

import TodayStateCard from "@/components/home/TodayStateCard";
import StrategicIntentionCard from "@/components/home/StrategicIntentionCard";
import DailyRitual from "@/components/home/DailyRitual";
import JitCarousel from "@/components/home/JitCarousel";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import MetricInfoModal from "@/components/home/MetricInfoModal";

import PlanFeedbackModal from "@/components/home/PlanFeedbackModal";
import { computeEnergyState } from "@/utils/energyStateEngine";
import { useOuterReadiness } from "@/hooks/useOuterReadiness";
import { submitPlanFeedback, consumePlanFeedbackFlag } from "@/utils/relevanceFeedback";
import FirstSessionGuide from "@/components/onboarding/FirstSessionGuide";

// Tier-based CSS gradient colors for poster placeholder (no bundled images)
const TIER_GRADIENTS: Record<string, string> = {
  depleted: 'from-blue-900/50 via-slate-800/35 to-background',
  managing: 'from-amber-900/45 via-stone-800/30 to-background',
  strong: 'from-emerald-900/45 via-teal-800/30 to-background',
  peak: 'from-violet-900/45 via-purple-800/30 to-background',
  default: 'from-stone-800/40 via-stone-700/25 to-background',
};

interface PreEventPlan {
  eventTitle: string;
  eventType: string;
  minutesUntil: number;
  timePill: string;
  contextDescription: string;
  modules: Array<{
    type: string;
    contentId: string;
    title: string;
    contentType: string;
    duration: number;
    focus: string;
    intensity: string;
    isFavorite: boolean;
    isCoachCard?: boolean;
    reasoning: string;
  }>;
  coachCard: unknown;
  progressTracked: boolean;
}

const TAB_LABELS = [
  { key: 'state' as const, label: 'State' },
  { key: 'compass' as const, label: 'Compass' },
  { key: 'action' as const, label: 'Action' },
];

const ExecutiveHome = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'state' | 'compass' | 'action'>('state');
  const [preEventPlan, setPreEventPlan] = useState<PreEventPlan | null>(null);
  const [jitPriority, setJitPriority] = useState(false);
  const [planFeedback, setPlanFeedback] = useState<{ planType: 'tod' | 'jit' } | null>(null);

  // First session guide: show if mid-flow (navigated from check-in page)
  const [showGuide, setShowGuide] = useState(() => {
    const step = sessionStorage.getItem('first_session_guide_step');
    return step !== null && !sessionStorage.getItem('first_session_done');
  });

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
      default: {
        morning: '/all-visuals/videos/default-morning.mp4',
        afternoon: '/all-visuals/videos/default-afternoon.mp4',
        evening: '/all-visuals/videos/default-evening.mp4',
      },
    };
    return videoMap[tier]?.[timeOfDay] || videoMap.default[timeOfDay];
  }, [energyState?.energyTier]);
  
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
              <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/50 to-background pointer-events-none" />
            </div>
            
            <header className="relative z-40 flex items-center justify-between px-3 md:px-4 py-3 w-full pointer-events-auto">
              <div data-tour="sidebar-trigger-wrap" className="p-2 -m-2 rounded-full">
                <SidebarTrigger data-tour="sidebar-trigger" className="h-9 w-9 rounded-full text-white bg-black/70 backdrop-blur-sm border border-white/10 hover:bg-black/80 shadow-lg shadow-black/20" />
              </div>
              <div data-tour="coach-access-wrap" className="p-2 -m-2 rounded-full">
                <div data-tour="coach-access"><CoachAccessButton /></div>
              </div>
            </header>
            
            <div className="relative z-10 pt-6 pb-32 max-w-lg mx-auto text-center">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-headline text-foreground tracking-tight">
                {getGreeting()}
              </h1>
              <p className="text-base text-muted-foreground mt-2 font-body">
                {getSubheadline()}
              </p>
            </div>
          </div>

          {/* Sticky Tab Bar */}
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
            <div className="max-w-lg mx-auto grid grid-cols-3 h-12">
              {TAB_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`text-sm font-medium font-body transition-all relative ${
                    activeTab === key
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground/70'
                  }`}
                >
                  {label}
                  {activeTab === key && (
                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content – all rendered, toggle via display */}
          <div className="flex-1 w-full pb-8">

            {/* STATE tab */}
            <div style={{ display: activeTab === 'state' ? 'block' : 'none' }}>
              <div className="px-4 md:px-6 max-w-lg mx-auto pt-4">
                <section data-tour="today-state" className="animate-in fade-in duration-500">
                  <TodayStateCard />
                </section>
              </div>
            </div>

            {/* COMPASS tab */}
            <div style={{ display: activeTab === 'compass' ? 'block' : 'none' }}>
              <div className="px-4 md:px-6 max-w-lg mx-auto pt-4">
                <section data-tour="compass" className="animate-in fade-in duration-500">
                  <StrategicIntentionCard jitEvent={jitPriority && preEventPlan ? { title: preEventPlan.eventTitle, minutesUntil: preEventPlan.minutesUntil } : undefined} />
                </section>
              </div>
            </div>

            {/* ACTION tab */}
            <div style={{ display: activeTab === 'action' ? 'block' : 'none' }}>
              <div data-tour="daily-plan">
                <div className="px-4 md:px-6 max-w-lg mx-auto pt-4">
                  <section className="animate-in fade-in duration-500">
                    <div className="flex items-center justify-between py-2">
                      <h2 className="text-xs tracking-widest uppercase text-muted-foreground/60 font-body">Performance Readiness Plan</h2>
                      <MetricInfoModal
                        title="Your Performance Readiness Plan"
                        description="Your Performance Readiness Plan is built from your Decision Readiness Score and Outer Readiness Brief – what your system needs right now, matched to the shape of your day. Each session is designed to close the gap between where you are and where the day needs you to be."
                      />
                    </div>
                  </section>
                </div>

                {/* JIT Preparation – rendered ABOVE ToD when JIT is primary */}
                {jitPriority && (
                  <div className="animate-in fade-in duration-500 mt-4">
                    <JitCarousel preEventPlan={preEventPlan} />
                  </div>
                )}

                {/* Time-of-Day Plan */}
                <div className="animate-in fade-in duration-500">
                  <DailyRitual
                    onPreEventPlanReady={setPreEventPlan}
                    onJitPriorityChange={setJitPriority}
                    jitPriority={jitPriority}
                  />
                </div>

                {/* JIT Preparation – below ToD when NOT primary */}
                {!jitPriority && (
                  <div className="animate-in fade-in duration-500 mt-4">
                    <JitCarousel preEventPlan={preEventPlan} />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8">
              <PrivacyFooter />
            </div>
          </div>

          {/* First Session Guide */}
          {showGuide && (
            <FirstSessionGuide onComplete={() => setShowGuide(false)} />
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
