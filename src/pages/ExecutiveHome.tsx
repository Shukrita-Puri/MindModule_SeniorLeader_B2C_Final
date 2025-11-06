import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import SecurityWatermark from "@/components/home/SecurityWatermark";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import InsightProgressCard from "@/components/home/InsightProgressCard";
import EnergyStateHeader from "@/components/home/EnergyStateHeader";
import RecommendedPlan from "@/components/home/RecommendedPlan";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import executiveHomeBanner from "@/assets/executive-home-banner.png";
import { useAuth } from "@/hooks/useAuth";

const ExecutiveHome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const fullName = user?.user_metadata?.full_name || user?.email || 'there';
  const firstName = fullName.split(' ')[0];
  
  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return `Good morning, ${firstName}`;
    if (hour < 18) return `Hey, ${firstName}`;
    return `Evening, ${firstName}`;
  };
  
  const getSubtitle = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Ready to architect your mind for the day?";
    if (hour < 18) return "How's your mental game today?";
    return "Time to restore and reflect";
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <UnifiedTopBar backPath="/signup" />
      
      {/* Simple Hero Header - No animated greeting */}
      <div className="relative pt-16 pb-6 px-4">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-5xl font-headline mb-2 text-foreground tracking-tight">
            Mind Atelier
          </h1>
          <p className="text-lg font-subheadline italic text-muted-foreground">
            Your daily practice
          </p>
        </div>
      </div>

      {/* Main Content with improved spacing */}
      <div className="px-4 space-y-8 max-w-lg mx-auto">
        {/* Energy State Section */}
        <section>
          <h2 className="text-2xl font-headline mb-4 text-foreground">Your Energy State Today</h2>
          <EnergyStateHeader />
        </section>

        {/* Divider */}
        <div className="h-px bg-black/[0.08]" />

        {/* Recommended Section */}
        <section>
          <h2 className="text-2xl font-headline mb-4 text-foreground">Recommended for You</h2>
          <RecommendedPlan />
        </section>

        {/* Divider */}
        <div className="h-px bg-black/[0.08]" />

        {/* Intelligence Overview */}
        <section>
          <h2 className="text-2xl font-headline mb-4 text-foreground">Your Intelligence</h2>
          <InsightProgressCard />
        </section>
      </div>

      <SecurityWatermark />
      <PrivacyFooter />
      <MainNavigation />
    </div>
  );
};

export default ExecutiveHome;
