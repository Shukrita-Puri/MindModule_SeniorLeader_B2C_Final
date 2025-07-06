
import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import SecurityWatermark from "@/components/home/SecurityWatermark";
import { Button } from "@/components/ui/button";
import { ArrowRight, Target, TrendingUp } from "lucide-react";
import resetSessionIllustration from "@/assets/reset-session-illustration.png";
import inkFocusIllustration from "@/assets/ink-focus-illustration.png";
import inkReflectionIllustration from "@/assets/ink-reflection-illustration.png";

const ExecutiveHome = () => {
  const navigate = useNavigate();
  
  // Get Daily Check-in data
  const checkInData = JSON.parse(localStorage.getItem('dailyCheckIn') || '{}');
  const hasCheckIn = checkInData.timestamp && new Date(checkInData.timestamp).toDateString() === new Date().toDateString();
  
  const getEnergyInsight = () => {
    if (!hasCheckIn) return "Ready to start your day with intention";
    
    const { mood, energy, focus } = checkInData;
    if (energy >= 7) return "Your energy is strong and steady";
    if (energy >= 4) return "Your energy is building quietly";
    return "Your energy needs gentle nurturing";
  };
  
  const getResetAction = () => {
    if (!hasCheckIn) return "Begin with Reset";
    const { energy, focus } = checkInData;
    if (energy < 4 || focus === 'drained') return "Reset with Breathing";
    if (focus === 'scattered') return "Ground with Reflection";
    return "Power-Up Session";
  };

  return (
    <div className="min-h-screen bg-background font-editorial pb-20">
      <SecurityWatermark />
      
      {/* Minimal Header */}
      <div className="px-8 py-16 text-center">
        <h1 className="text-3xl font-heading font-medium text-foreground mb-4">
          Good morning
        </h1>
        <p className="text-lg text-muted-foreground">
          Ready to architect your day?
        </p>
      </div>

      <div className="px-8 max-w-2xl mx-auto space-y-20">
        
        {/* Energy Check - Reset Pillar */}
        <section className="group cursor-pointer animate-fade-in" onClick={() => navigate('/recalibrate')}>
          <div className="flex items-start gap-6 mb-6">
            <div className="w-20 h-20 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0">
              <img 
                src={resetSessionIllustration} 
                alt="Reset and renewal"
                className="w-12 h-12 object-contain opacity-90"
              />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-heading font-medium text-foreground group-hover:text-primary transition-colors mb-3">
                Energy Check
              </h2>
              <p className="text-lg text-foreground leading-relaxed font-body mb-4">
                {getEnergyInsight()}
              </p>
              <Button 
                variant="outline" 
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              >
                {getResetAction()}
                <ArrowRight size={16} className="ml-2" />
              </Button>
            </div>
          </div>
        </section>

        {/* Today's Focus */}
        <section className="group cursor-pointer animate-fade-in" style={{ animationDelay: '200ms' }} onClick={() => navigate('/clarity')}>
          <div className="flex items-start gap-6 mb-6">
            <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
              <Target size={24} className="text-accent" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-heading font-medium text-foreground group-hover:text-primary transition-colors mb-3">
                Today's Focus
              </h2>
              <p className="text-base text-foreground leading-relaxed font-body">
                You have 3 important meetings. Consider a clarity session at 2:30 PM.
              </p>
            </div>
          </div>
        </section>

        {/* Progress Snapshot */}
        <section className="animate-fade-in" style={{ animationDelay: '400ms' }}>
          <div className="flex items-start gap-6 mb-6">
            <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0">
              <TrendingUp size={20} className="text-sage opacity-80" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-heading font-medium text-foreground mb-3">
                Building Rhythm
              </h2>
              <p className="text-base text-foreground leading-relaxed font-body">
                4 focused sessions this week. You're halfway to your reset streak.
              </p>
            </div>
          </div>
        </section>

        {/* Reflection - Keep Simple */}
        <section className="border-t border-border pt-12 animate-fade-in" style={{ animationDelay: '600ms' }}>
          <div className="flex items-start gap-6">
            <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0">
              <img 
                src={inkReflectionIllustration} 
                alt="Evening reflection"
                className="w-10 h-10 object-contain opacity-80"
              />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-heading font-medium text-foreground mb-3">
                Evening Reflection
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed font-body">
                Three wins from today. What made them possible?
              </p>
            </div>
          </div>
        </section>
      </div>

      <MainNavigation />
    </div>
  );
};

export default ExecutiveHome;
