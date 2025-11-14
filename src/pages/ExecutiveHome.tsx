import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import MainNavigation from "@/components/MainNavigation";
import SecurityWatermark from "@/components/home/SecurityWatermark";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import InsightProgressCard from "@/components/home/InsightProgressCard";
import EnergyStateHeader from "@/components/home/EnergyStateHeader";
import DailyRitual from "@/components/home/DailyRitual";
import MicroInterventions from "@/components/home/MicroInterventions";
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
  
  const fullName = user?.user_metadata?.full_name || user?.email || 'there';
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

        {/* Divider */}
        <div className="h-px bg-black/[0.08]" />

        {/* Recommended for You - Split into TWO sub-sections */}
      <section>
        <h2 className="text-2xl font-headline mb-4 text-foreground">Recommended for You</h2>
        
        {/* Sub-section 1: Daily Ritual */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-semibold text-foreground">Your Daily Ritual</h3>
            <MetricInfoModal
              title="How Your Ritual is Created"
              description={
                user?.user_metadata?.plan_tier === 'super_pro' 
                  ? "Your ritual is personalized based on your daily check-in, recovery data from your wearable, and upcoming calendar demands."
                  : "Your ritual is personalized based on your daily check-in and upcoming calendar demands."
              }
            />
          </div>
          <DailyRitual />
        </div>

          {/* Sub-section 2: Micro Interventions */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Micro Interventions</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Personalised to align your inner world for what matters today.
            </p>
            <MicroInterventions />
          </div>
        </section>
      </div>

      <SecurityWatermark />
      <PrivacyFooter />
      <MainNavigation />
    </div>
  );
};

export default ExecutiveHome;
