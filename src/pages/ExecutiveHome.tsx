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
import { migrateOnboardingToDatabase } from "@/utils/onboardingMigration";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import CoachAccessButton from "@/components/navigation/CoachAccessButton";
import TodayStateCard from "@/components/home/TodayStateCard";
import StrategicIntentionCard from "@/components/home/StrategicIntentionCard";
import DailyRitual from "@/components/home/DailyRitual";
import PerformancePreparation from "@/components/home/PerformancePreparation";
import PrivacyFooter from "@/components/home/PrivacyFooter";

const ExecutiveHome = () => {
  const { user } = useAuth();
  const [migrationComplete, setMigrationComplete] = useState(false);
  
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

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-background">
        <LeftSidebar />
        
        <SidebarInset className="w-full overflow-x-hidden">
          {/* Top bar with sidebar trigger and coach button */}
          <header className="sticky top-0 z-40 flex items-center justify-between px-3 md:px-4 py-3 w-full">
            <SidebarTrigger className="h-9 w-9 rounded-full text-saffron icon-luxury" />
            <CoachAccessButton />
          </header>

          {/* Main Content */}
          <div className="flex-1 w-full pb-8">
            {/* Greeting - Simple, clean */}
            <div className="px-4 md:px-6 pt-4 pb-6 max-w-lg mx-auto">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-headline text-foreground tracking-tight">
                {getGreeting()}
              </h1>
            </div>

            {/* Three Core Sections */}
            <div className="px-4 md:px-6 space-y-5 max-w-lg mx-auto">
              {/* Section 1: Today's State - "Where am I today?" */}
              <section className="animate-in fade-in duration-500">
                <TodayStateCard />
              </section>

              {/* Section 2: Strategic Intention - "What matters today?" */}
              <section className="animate-in fade-in duration-500 delay-100">
                <StrategicIntentionCard />
              </section>

              {/* Section 3: Performance Plan - "What should I do now?" */}
              <section className="animate-in fade-in duration-500 delay-200">
                <div className="mb-3">
                  <h2 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
                    Your Performance Plan
                  </h2>
                </div>
              </section>
            </div>

            {/* Daily Ritual Carousel - Full width */}
            <div className="animate-in fade-in duration-500 delay-200">
              <DailyRitual />
            </div>

            {/* Just-in-Time Interventions - Only shows when triggered */}
            <div className="px-4 md:px-6 mt-6 max-w-lg mx-auto">
              <PerformancePreparation />
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
