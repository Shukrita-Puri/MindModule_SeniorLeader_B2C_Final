import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import MainNavigation from "@/components/MainNavigation";
import SecurityWatermark from "@/components/home/SecurityWatermark";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import InsightProgressCard from "@/components/home/InsightProgressCard";
import EnergyStateHeader from "@/components/home/EnergyStateHeader";
import DailyRitual from "@/components/home/DailyRitual";
import PerformancePreparationInterventions from "@/components/home/MicroInterventions";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import MetricInfoModal from "@/components/home/MetricInfoModal";
import executiveHomeBanner from "@/assets/executive-home-banner.png";
import { useAuth } from "@/hooks/useAuth";
import { migrateOnboardingToDatabase } from "@/utils/onboardingMigration";

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
    <div className="min-h-screen bg-background pb-20">
      <UnifiedTopBar backPath="/signup" />
      
      {/* Simple Hero Header - No animated greeting */}
      <div className="relative pt-16 pb-6 px-4">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-5xl font-headline mb-2 text-foreground tracking-tight">
            {getGreeting()}
          </h1>
          <p className="text-lg font-subheadline italic text-muted-foreground">
            Welcome to Your Contextual Mind Atelier
          </p>
        </div>
      </div>

      {/* Main Content with improved spacing */}
      <div className="px-4 space-y-8 max-w-lg mx-auto">
        {/* Your Intelligence - First Thing User Sees */}
        <section>
          <h2 className="text-2xl font-headline mb-4 text-foreground">Your Progress This Week</h2>
          <InsightProgressCard />
        </section>

        {/* Divider */}
        <div className="h-px bg-black/[0.08]" />

        {/* Energy State Section */}
        <section>
          <h2 className="text-2xl font-headline mb-4 text-foreground">Your Energy State Today</h2>
          <EnergyStateHeader />
        </section>
      </div>

      {/* Divider - full width */}
      <div className="h-px bg-black/[0.08] max-w-lg mx-auto my-8" />

      {/* Recommended for You - FULL WIDTH for carousels */}
      <section className="pb-8">
        <div className="px-4 max-w-lg mx-auto">
          <h2 className="text-2xl font-headline mb-4 text-foreground">Recommended for You</h2>
        </div>
        
        {/* Sub-section 1: Daily Ritual */}
        <div className="mb-8">
          <div className="px-4 max-w-lg mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-semibold text-foreground">Your Daily Ritual</h3>
              <MetricInfoModal
                title="How Your Ritual is Created"
                description={
                  user?.subscription_status === 'active'
                    ? "Your ritual is personalized based on your Energy State Score (check-in + recovery data + circadian rhythm) and upcoming calendar demands."
                    : "Your ritual is personalized based on your Energy State Score (check-in + circadian rhythm). Upgrade to access calendar integration."
                }
              />
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              A curated sequence of practices designed to shift your energy state and build lasting mental fitness.
            </p>
          </div>
          {/* Carousel extends full width */}
          <DailyRitual />
        </div>

        {/* Sub-section 2: Performance Preparation */}
        <div>
          <PerformancePreparationInterventions />
        </div>
      </section>

      <SecurityWatermark />
      <PrivacyFooter />
      <MainNavigation />
    </div>
  );
};

export default ExecutiveHome;
