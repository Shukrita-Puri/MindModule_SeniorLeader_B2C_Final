import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import SecurityWatermark from "@/components/home/SecurityWatermark";
import TopNavigation from "@/components/simulation/TopNavigation";
import InsightProgressCard from "@/components/home/InsightProgressCard";
import DailyRitualCard from "@/components/home/DailyRitualCard";
import IntelligentPriorityCard from "@/components/home/IntelligentPriorityCard";
import PrivacyFooter from "@/components/home/PrivacyFooter";
import { ResumeOnboardingBanner } from "@/components/onboarding/ResumeOnboardingBanner";
import { generateIntelligentPriorities } from "@/utils/intelligenceEngine";
import executiveHomeBanner from "@/assets/executive-home-banner.png";

const ExecutiveHome = () => {
  const navigate = useNavigate();
  
  // Generate intelligent priorities (max 2)
  const priorities = generateIntelligentPriorities();
  
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
    <div className="min-h-screen font-body pb-32">
      <TopNavigation backPath="/signup" />
      <SecurityWatermark />
      
      {/* SECTION 1: Hero - Compressed to 30vh */}
      <div className="relative w-full h-[30vh] overflow-hidden">
        {/* Background Image */}
        <img 
          src={executiveHomeBanner} 
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        
        {/* Warm Overlay */}
        <div className="absolute inset-0 bg-[rgba(255,240,230,0.35)]" />
        
        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <h1 
            className="text-5xl md:text-7xl font-headline font-medium mb-2 bg-gradient-to-br from-[#6B5610] via-[#8B6914] to-[#B8860B] bg-clip-text text-transparent"
            style={{ filter: 'drop-shadow(0 2px 12px rgba(139, 105, 20, 0.4)) drop-shadow(0 4px 20px rgba(0, 0, 0, 0.2))' }}
          >
            {getGreeting()}
          </h1>
          <p 
            className="text-base md:text-lg text-foreground/90"
            style={{ textShadow: '0 2px 8px rgba(255, 240, 230, 0.8)' }}
          >
            {getSubtitle()}
          </p>
        </div>
      </div>

      <div className="px-4 max-w-lg mx-auto">
        
        {/* Gold Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent my-8" />
        
        {/* Resume Onboarding Banner - only shows if incomplete */}
        <ResumeOnboardingBanner />
        
        {/* SECTION 2: Insights & Progress */}
        <section className="animate-fade-in mb-8">
          <h2 className="text-lg font-headline font-medium text-foreground mb-4">
            Your Intelligence
          </h2>
          <InsightProgressCard />
        </section>
        
        {/* Gold Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent my-8" />
        
        {/* SECTION 3: Recommended Plan */}
        <section className="animate-fade-in mb-8" style={{ animationDelay: '200ms' }}>
          <h2 className="text-lg font-headline font-medium text-foreground mb-4">
            Your Plan Today
          </h2>
          <DailyRitualCard />
        </section>
        
        {/* Gold Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent my-8" />
        
        {/* SECTION 4: Your Path Today */}
        <section className="animate-fade-in mb-8" style={{ animationDelay: '400ms' }}>
          <h2 className="text-lg font-headline font-medium text-foreground mb-4">
            Your Path Today
          </h2>
          <div className="space-y-4">
            {priorities.map((priority, idx) => (
              <IntelligentPriorityCard key={idx} priority={priority} />
            ))}
          </div>
        </section>
        
        {/* Privacy Footer */}
        <PrivacyFooter />
      </div>

      <MainNavigation />
    </div>
  );
};

export default ExecutiveHome;
