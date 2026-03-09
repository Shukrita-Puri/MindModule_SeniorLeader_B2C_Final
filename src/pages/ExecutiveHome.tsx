/**
 * Executive Home - Decision Engine Dashboard
 * Answers 3 questions:
 * 1. Where am I today? (TodayStateCard)
 * 2. What matters today? (StrategicIntentionCard)
 * 3. What should I do now? (DailyRitual - Performance Plan)
 * + Just-in-time interventions when triggered (JitCarousel)
 */

import { useState } from "react";
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
import { computeEnergyState } from "@/utils/energyStateEngine";
import { useOuterReadiness } from "@/hooks/useOuterReadiness";

// Tier-based CSS gradient colors for poster placeholder (no bundled images)
const TIER_GRADIENTS: Record<string, string> = {
  depleted: 'from-blue-900/30 via-slate-800/20 to-background',
  managing: 'from-amber-900/25 via-stone-800/15 to-background',
  strong: 'from-emerald-900/25 via-teal-800/15 to-background',
  peak: 'from-violet-900/25 via-purple-800/15 to-background',
  default: 'from-stone-800/20 via-stone-700/10 to-background',
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

const ExecutiveHome = () => {
  const { user } = useAuth();
  const [preEventPlan, setPreEventPlan] = useState<PreEventPlan | null>(null);

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
  
  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return `Morning, ${firstName}`;
    if (hour >= 12 && hour < 18) return `Afternoon, ${firstName}`;
    return `Evening, ${firstName}`;
  };
  
  // Get subheadline from Outer Readiness Brief (shared cache)
  const getSubheadline = () => {
    if (!outerBrief) return "Let's make today count.";
    return outerBrief.phrase || "Let's make today count.";
  };
  
  // Get tier gradient class for poster placeholder
  const getTierGradient = () => {
    const tier = energyState?.energyTier || 'default';
    return TIER_GRADIENTS[tier] || TIER_GRADIENTS.default;
  };
  
  // Get time of day for video selection
  const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  };
  
  // Get looping video based on energy state AND time of day
  const getHeroVideo = () => {
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
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-background">
        <LeftSidebar />
        
        <SidebarInset className="w-full overflow-x-hidden">
          {/* Immersive Hero Visual */}
          <div className="relative">
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <div className={`absolute inset-0 bg-gradient-to-b ${getTierGradient()} transition-opacity duration-700`} />
              <video 
                key={getHeroVideo()}
                src={getHeroVideo()}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                onCanPlay={(e) => {
                  (e.currentTarget as HTMLVideoElement).style.opacity = '0.4';
                }}
                className="w-full h-full object-cover video-warm-luxury transition-opacity duration-1000 ease-out"
                style={{ opacity: 0 }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/50 to-background pointer-events-none" />
            </div>
            
            <header className="relative z-40 flex items-center justify-between px-3 md:px-4 py-3 w-full pointer-events-auto">
              <SidebarTrigger className="h-9 w-9 rounded-full text-white bg-black/70 backdrop-blur-sm border border-white/10 hover:bg-black/80 shadow-lg shadow-black/20" />
              <CoachAccessButton />
            </header>
            
            <div className="relative z-10 pt-6 pb-16 max-w-lg mx-auto text-center">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-headline text-foreground tracking-tight">
                {getGreeting()}
              </h1>
              <p className="text-base text-muted-foreground mt-2 font-body">
                {getSubheadline()}
              </p>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 w-full pb-8">

            <div className="px-4 md:px-6 max-w-lg mx-auto">
              <section className="animate-in fade-in duration-500">
                <TodayStateCard />
              </section>

              <div className="border-t border-black/[0.06] my-8" />

              <section className="animate-in fade-in duration-500 delay-100">
                <StrategicIntentionCard />
              </section>

              <div className="border-t border-black/[0.06] my-8" />

              <section className="animate-in fade-in duration-500 delay-200">
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
                      Your Proactive Mastery Plan
                    </span>
                  </div>
                  <MetricInfoModal
                    title="Your Proactive Mastery Plan"
                    description="Your Proactive Mastery Plan is built from your Inner Readiness Score and Outer Readiness Brief — what your system needs right now, matched to the shape of your day. Each session is designed to close the gap between where you are and where the day needs you to be."
                  />
                </div>
              </section>
            </div>

            {/* Time-of-Day Plan */}
            <div className="animate-in fade-in duration-500 delay-200">
              <DailyRitual onPreEventPlanReady={setPreEventPlan} />
            </div>

            {/* JIT Preparation - driven by plan data */}
            <div className="animate-in fade-in duration-500 delay-300 mt-4">
              <JitCarousel preEventPlan={preEventPlan} />
            </div>

            <div className="mt-8">
              <PrivacyFooter />
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default ExecutiveHome;
