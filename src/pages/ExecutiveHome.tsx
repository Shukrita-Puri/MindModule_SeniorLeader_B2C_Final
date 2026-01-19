/**
 * Executive Home - Decision Engine Dashboard
 * Answers 3 questions:
 * 1. Where am I today? (TodayStateCard)
 * 2. What matters today? (StrategicIntentionCard)
 * 3. What should I do now? (DailyRitual - Performance Plan)
 * + Just-in-time interventions when triggered (PerformancePreparation)
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { migrateOnboardingToDatabase } from "@/utils/onboardingMigration";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import CoachAccessButton from "@/components/navigation/CoachAccessButton";
import TodayStateCard from "@/components/home/TodayStateCard";
import StrategicIntentionCard from "@/components/home/StrategicIntentionCard";
import DailyRitual from "@/components/home/DailyRitual";
import JustInTimeIntervention from "@/components/home/JustInTimeIntervention";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import MetricInfoModal from "@/components/home/MetricInfoModal";
import { computeEnergyState } from "@/utils/energyStateEngine";

const ExecutiveHome = () => {
  const { user } = useAuth();
  const [migrationComplete, setMigrationComplete] = useState(false);
  
  // Fetch energy state for subheadline
  const { data: energyState } = useQuery({
    queryKey: ['energy-state', user?.id],
    queryFn: async () => computeEnergyState(user?.id),
    enabled: !!user?.id,
    staleTime: 60000,
  });
  
  // Migrate onboarding data from localStorage to database on first visit
  useEffect(() => {
    const migrateData = async () => {
      if (user?.id && !migrationComplete) {
        const success = await migrateOnboardingToDatabase(user.id);
        if (success) {
          console.log('✅ Onboarding data persisted to database');
          setMigrationComplete(true);
        }
      }
    };

    migrateData();
  }, [user?.id, migrationComplete]);
  
  const fullName = user?.name || user?.email || 'there';
  const firstName = fullName.split(' ')[0];
  
  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return `Morning, ${firstName}`;
    if (hour < 18) return `Afternoon, ${firstName}`;
    return `Evening, ${firstName}`;
  };
  
  // Get motivational subheadline based on energy tier
  const getSubheadline = () => {
    if (!energyState) return "Let's make today count.";
    
    switch (energyState.energyTier) {
      case 'depleted': return "Protect and restore today.";
      case 'managing': return "One step at a time.";
      case 'strong': return "Ready to perform.";
      case 'peak': return "Time to execute.";
      default: return "Let's make today count.";
    }
  };
  
  // Get calming visual fallback based on energy state
  const getHeroVisual = () => {
    if (!energyState) return '/all-visuals/src-assets/luxury-watercolor-hero.jpeg';
    
    switch (energyState.energyTier) {
      case 'depleted': 
        return '/all-visuals/src-assets/softness-release.jpg';
      case 'managing': 
        return '/all-visuals/src-assets/harmonic-calm-singing-bowl.jpg';
      case 'strong': 
        return '/all-visuals/src-assets/flow-meditation-colorful.jpg';
      case 'peak': 
        return '/all-visuals/src-assets/vibrant-flow-state-hero.png';
      default: 
        return '/all-visuals/src-assets/luxury-watercolor-hero.jpeg';
    }
  };
  
  // Get time of day for video selection
  const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
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
          {/* Immersive Hero Visual - flows behind header */}
          <div className="relative">
            {/* Nature visual underlay - full bleed */}
            <div className="absolute inset-0 z-0 overflow-hidden">
              <video 
                src={getHeroVideo()}
                poster={getHeroVisual()}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover video-warm-luxury opacity-40 transition-opacity duration-1000 ease-out"
              />
              {/* Warm luxury gradient - enhanced for text readability */}
              <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/50 to-background" />
            </div>
            
            {/* Header - now INSIDE the visual */}
            <header className="relative z-40 flex items-center justify-between px-3 md:px-4 py-3 w-full">
              <SidebarTrigger className="h-9 w-9 rounded-full text-white bg-black/70 backdrop-blur-sm border border-white/10 hover:bg-black/80 shadow-lg shadow-black/20" />
              <CoachAccessButton />
            </header>
            
            {/* Greeting content - elevated above visual */}
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

            {/* Three Core Sections - Liquid flowing layout with separators */}
            <div className="px-4 md:px-6 max-w-lg mx-auto">
              {/* Section 1: Today's State - "Where am I today?" */}
              <section className="animate-in fade-in duration-500">
                <TodayStateCard />
              </section>

              {/* Subtle separator */}
              <div className="border-t border-black/[0.06] my-8" />

              {/* Section 2: Strategic Intention - "What matters today?" */}
              <section className="animate-in fade-in duration-500 delay-100">
                <StrategicIntentionCard />
              </section>

              {/* Subtle separator */}
              <div className="border-t border-black/[0.06] my-8" />

              {/* Section 3: Performance Plan - "What should I do now?" */}
              <section className="animate-in fade-in duration-500 delay-200">
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
                    Today's Performance Plan
                  </span>
                  <MetricInfoModal
                    title="How Your Plan is Built"
                    description="Your performance plan is intelligently assembled from your energy state, calendar demands, and completion history. The system selects the right protocols, durations, and sequence to optimize your day. You don't choose—the system deploys the right intervention at the right time."
                  />
                </div>
              </section>
            </div>

            {/* Daily Ritual Carousel - Full width */}
            <div className="animate-in fade-in duration-500 delay-200">
              <DailyRitual />
            </div>

            {/* Just-in-Time Interventions - Only shows when triggered */}
            <div className="px-4 md:px-6 mt-6 max-w-lg mx-auto">
              <JustInTimeIntervention />
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
