import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import SecurityWatermark from "@/components/home/SecurityWatermark";
import InsightProgressCard from "@/components/home/InsightProgressCard";
import EnergyStateHeader from "@/components/home/EnergyStateHeader";
import DailyRitual from "@/components/home/DailyRitual";
import PerformancePreparation from "@/components/home/PerformancePreparation";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import MetricInfoModal from "@/components/home/MetricInfoModal";
import { useAuth } from "@/hooks/useAuth";
import { migrateOnboardingToDatabase } from "@/utils/onboardingMigration";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import CoachAccessButton from "@/components/navigation/CoachAccessButton";

const ExecutiveHome = () => {
  const navigate = useNavigate();
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
        
        <SidebarInset>
          {/* Top bar with sidebar trigger and coach button */}
          <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur-sm border-b border-border">
            <SidebarTrigger className="h-9 w-9" />
            <CoachAccessButton />
          </header>

          {/* Main Content */}
          <div className="flex-1">
            {/* Simple Hero Header */}
            <div className="relative pt-4 md:pt-6 pb-4 md:pb-6 px-3 md:px-4">
              <div className="text-center max-w-2xl mx-auto">
                <h1 className="text-3xl md:text-5xl font-headline mb-2 text-foreground tracking-tight">
                  {getGreeting()}
                </h1>
                <p className="text-sm md:text-lg font-subheadline italic text-muted-foreground">
                  Welcome to Your Contextual Mind Atelier
                </p>
              </div>
            </div>

            {/* Main Content with improved spacing */}
            <div className="px-3 md:px-4 space-y-6 md:space-y-8 max-w-lg mx-auto overflow-x-hidden">
              {/* Your Intelligence - First Thing User Sees */}
              <section>
                <h2 className="text-xl md:text-2xl font-headline mb-3 md:mb-4 text-foreground">Your Progress This Week</h2>
                <InsightProgressCard />
              </section>

              {/* Divider */}
              <div className="h-px bg-black/[0.08]" />

              {/* Energy State Section */}
              <section>
                <h2 className="text-xl md:text-2xl font-headline mb-3 md:mb-4 text-foreground">Your Energy State Today</h2>
                <EnergyStateHeader />
              </section>
            </div>

            {/* Divider - full width */}
            <div className="h-px bg-black/[0.08] max-w-lg mx-auto my-6 md:my-8" />

            {/* Recommended for You - FULL WIDTH for carousels */}
            <section className="pb-6 md:pb-8">
              <div className="px-3 md:px-4 max-w-lg mx-auto">
                <h2 className="text-xl md:text-2xl font-headline mb-3 md:mb-4 text-foreground">Recommended for You</h2>
              </div>
              
              {/* Sub-section 1: Daily Ritual */}
              <div className="mb-6 md:mb-8">
                <div className="px-3 md:px-4 max-w-lg mx-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-base md:text-lg font-semibold text-foreground">Your Daily Ritual</h3>
                    <MetricInfoModal
                      title="How Your Ritual is Created"
                      description={
                        user?.subscription_status === 'active'
                          ? "Your ritual is personalized based on your Energy State Score (check-in + recovery data + circadian rhythm) and upcoming calendar demands."
                          : "Your ritual is personalized based on your Energy State Score (check-in + circadian rhythm). Upgrade to access calendar integration."
                      }
                    />
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground mb-3">
                    A curated sequence of practices designed to shift your energy state and build lasting mental fitness.
                  </p>
                </div>
                {/* Carousel extends full width */}
                <DailyRitual />
              </div>

              {/* Sub-section 2: Performance Preparation */}
              <div className="space-y-3">
                <div className="px-3 md:px-4 max-w-lg mx-auto">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base md:text-lg font-semibold text-foreground">
                      Your Performance Preparation
                    </h3>
                    <MetricInfoModal
                      title="How Performance Preparation Works"
                      description="Your preparation packs are intelligently generated by analyzing your calendar for upcoming high-stakes events (exams, interviews, presentations, competitions). We suggest practice 2-3 days before important events or same-day preparation when you need it most."
                    />
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1">
                    Contextual preparation for your upcoming moments that matter
                  </p>
                </div>
                <PerformancePreparation />
              </div>
            </section>

            <SecurityWatermark />
            <PrivacyFooter />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default ExecutiveHome;
