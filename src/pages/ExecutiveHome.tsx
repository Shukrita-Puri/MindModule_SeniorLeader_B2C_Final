import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import SecurityWatermark from "@/components/home/SecurityWatermark";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import InsightProgressCard from "@/components/home/InsightProgressCard";
import EnergyStateHeader from "@/components/home/EnergyStateHeader";
import RecommendedPlan from "@/components/home/RecommendedPlan";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import executiveHomeBanner from "@/assets/executive-home-banner.png";

const ExecutiveHome = () => {
  const navigate = useNavigate();
  
  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning, Alex";
    if (hour < 18) return "Hey, Alex";
    return "Evening, Alex";
  };
  
  const getSubtitle = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Ready to architect your mind for the day?";
    if (hour < 18) return "How's your mental game today?";
    return "Time to restore and reflect";
  };

  return (
    <div className="min-h-screen font-body pb-32 bg-background">
      <UnifiedTopBar backPath="/signup" />
      <SecurityWatermark />
      
      {/* SECTION 1: Hero with Radial Glow */}
      <div className="relative w-full h-[35vh] overflow-hidden">
        {/* Gradient Background with Radial Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-card to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,217,255,0.15)_0%,_transparent_70%)]" />
        
        {/* Animated Mesh Gradient */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        
        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center z-10">
          <h1 
            className="text-5xl md:text-7xl font-headline font-bold mb-2 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-shimmer"
            style={{ backgroundSize: '200% auto' }}
          >
            {getGreeting()}
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            {getSubtitle()}
          </p>
        </div>
      </div>

      <div className="px-4 max-w-lg mx-auto">
        
        {/* Cyan Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent my-8" />
        
        {/* SECTION 2: Energy State Today */}
        <section className="animate-fade-in mb-8">
          <h2 className="text-xl font-headline font-semibold text-foreground mb-4 tracking-tight">
            Your Energy State Today
          </h2>
          <EnergyStateHeader />
        </section>
        
        {/* Cyan Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent my-8" />
        
        {/* SECTION 3: Recommended for You */}
        <section className="animate-fade-in mb-8" style={{ animationDelay: '200ms' }}>
          <h2 className="text-xl font-headline font-semibold text-foreground mb-4 tracking-tight">
            Recommended for You
          </h2>
          <RecommendedPlan />
        </section>
        
        {/* Cyan Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent my-8" />
        
        {/* SECTION 4: Your Intelligence */}
        <section className="animate-fade-in mb-8" style={{ animationDelay: '400ms' }}>
          <h2 className="text-xl font-headline font-semibold text-foreground mb-4 tracking-tight">
            Your Intelligence
          </h2>
          <InsightProgressCard />
        </section>
        
        {/* Privacy Footer */}
        <PrivacyFooter />
      </div>

      <MainNavigation />
    </div>
  );
};

export default ExecutiveHome;
