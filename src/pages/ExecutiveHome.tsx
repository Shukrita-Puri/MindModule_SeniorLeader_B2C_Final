
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
    if (!hasCheckIn) return "Ready to tackle your day with focus";
    
    const { mood, energy, focus } = checkInData;
    if (energy >= 7) return "You're feeling energized and ready";
    if (energy >= 4) return "Your energy is building steadily";
    return "Your energy could use a gentle boost";
  };
  
  const getResetAction = () => {
    if (!hasCheckIn) return "Take Daily Check-in";
    const { energy, focus } = checkInData;
    if (energy < 4 || focus === 'drained') return "60-sec Power Up";
    if (focus === 'scattered') return "Inner Calibrate";
    return "Flow State Session";
  };

  const getResetRoute = () => {
    if (!hasCheckIn) return "/daily-check-in";
    const { energy, focus } = checkInData;
    if (energy < 4 || focus === 'drained') return "/recalibrate";
    if (focus === 'scattered') return "/recalibrate";
    return "/flow-state-lab";
  };

  const getTopPriorities = () => {
    // Mock data - in real app this would come from user's actual priorities
    return [
      {
        id: 1,
        title: "AP Chemistry midterm tomorrow",
        suggestion: "Try Mental Clarity",
        route: "/clarity"
      },
      {
        id: 2, 
        title: "Prepare for College Interview",
        suggestion: "Use Social Intelligence to practice with the assessor",
        route: "/social-intelligence-lab"
      }
    ];
  };

  return (
    <div className="min-h-screen bg-background font-editorial pb-20">
      <SecurityWatermark />
      
      {/* Minimal Header */}
      <div className="px-8 py-16 text-center">
        <h1 className="text-3xl font-heading font-medium text-foreground mb-4">
          Hey there
        </h1>
        <p className="text-lg text-muted-foreground">
          Ready to design your day?
        </p>
      </div>

      <div className="px-4 max-w-lg mx-auto space-y-16">
        
        {/* Building Momentum - Leaderboard Style */}
        <section className="animate-fade-in">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-heading font-medium text-foreground mb-2">
                Building Momentum
              </h2>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">3 focused clarity sessions</span>
                  <span className="text-sm font-medium text-primary">Top 10 in your class</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Keep the momentum going! 🚀
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Energy Check - Show Outcome */}
        <section className="group cursor-pointer animate-fade-in" style={{ animationDelay: '200ms' }} onClick={() => navigate(getResetRoute())}>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0">
              <img 
                src={resetSessionIllustration} 
                alt="Reset and recharge"
                className="w-10 h-10 object-contain opacity-90"
              />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-heading font-medium text-foreground group-hover:text-primary transition-colors mb-3">
                Energy Check
              </h2>
              <p className="text-base text-foreground leading-relaxed font-body mb-4">
                {hasCheckIn ? `Let's do ${getResetAction()}` : getEnergyInsight()}
              </p>
              <Button 
                variant="outline" 
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground w-full sm:w-auto"
              >
                {getResetAction()}
                <ArrowRight size={16} className="ml-2" />
              </Button>
            </div>
          </div>
        </section>

        {/* Today's Priorities - Mobile First */}
        <section className="animate-fade-in" style={{ animationDelay: '400ms' }}>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
              <Target size={20} className="text-accent" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-heading font-medium text-foreground mb-4">
                Today's Priorities
              </h2>
            </div>
          </div>
          
          <div className="space-y-4">
            {getTopPriorities().map((priority) => (
              <div key={priority.id} className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-body font-medium text-foreground mb-2 text-sm sm:text-base">
                  {priority.title}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                  {priority.suggestion}
                </p>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => navigate(priority.route)}
                  className="text-xs w-full sm:w-auto"
                >
                  {priority.id === 1 ? 'Mental Clarity' : 'Social Intelligence'}
                  <ArrowRight size={12} className="ml-2" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Journal & Reflection */}
        <section className="border-t border-border pt-12 animate-fade-in" style={{ animationDelay: '600ms' }}>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0">
              <img 
                src={inkReflectionIllustration} 
                alt="Evening reflection"
                className="w-10 h-10 object-contain opacity-80"
              />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-heading font-medium text-foreground mb-3">
                Journal & Reflect
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed font-body mb-4">
                Use clarity sessions for journaling - toggle to journal mode for private reflection.
              </p>
              <Button 
                variant="outline"
                onClick={() => navigate('/clarity')}
                className="text-sm w-full sm:w-auto"
              >
                Open Journal
                <ArrowRight size={14} className="ml-2" />
              </Button>
            </div>
          </div>
        </section>
      </div>

      <MainNavigation />
    </div>
  );
};

export default ExecutiveHome;
