
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
    const { mood, energy, focus } = checkInData;
    if (mood === 'tired' && energy <= 3 && focus === 'scattered') return "Power Up";
    if (energy >= 9 && mood === 'content' && focus === 'charged') return "Grounding Practice";
    if (energy < 4 || focus === 'drained') return "60-sec Power Up";
    if (focus === 'scattered') return "Inner Calibrate";
    return "Flow State Session";
  };

  const getResetRoute = () => {
    if (!hasCheckIn) return "/daily-check-in";
    const { mood, energy, focus } = checkInData;
    if (mood === 'tired' && energy <= 3 && focus === 'scattered') return "/recalibrate?mode=power-up";
    if (energy >= 9 && mood === 'content' && focus === 'charged') return "/breathwork";
    if (energy < 4 || focus === 'drained') return "/recalibrate?mode=power-up";
    if (focus === 'scattered') return "/recalibrate";
    return "/flow-state-lab";
  };

  const getTopPriorities = () => {
    // Mock data - in real app this would come from user's actual priorities
    return [
      {
        id: 1,
        title: "Oxford College Interview",
        subtitle: "High-pressure interview in 4 days",
        secondSubtitle: "Scenario Simulate your practice with the assessor+",
        suggestion: "Prepare with Social Intelligence",
        route: "/social-intelligence-lab"
      },
      {
        id: 2, 
        title: "Advanced Physics Exam",
        subtitle: "Complex problem-solving needed",
        secondSubtitle: "Enter optimal learning state",
        suggestion: "Flow State Practice",
        route: "/flow-state-lab"
      }
    ];
  };

  return (
    <div className="min-h-screen bg-background font-editorial pb-32">
      <SecurityWatermark />
      
      {/* Minimal Header */}
      <div className="px-8 py-16 text-center">
        <h1 className="text-3xl font-heading font-medium text-foreground mb-4">
          Hey, Alex
        </h1>
        <p className="text-lg text-muted-foreground">
          Ready to architect your mind for the day?
        </p>
      </div>

      <div className="px-4 max-w-lg mx-auto space-y-16">
        
        {/* Building Momentum - Leaderboard Style */}
        <section className="animate-fade-in">
          <h2 className="text-lg font-heading font-medium text-foreground mb-4">
            Building Momentum
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Sessions Completed */}
            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary mb-1">47</div>
              <div className="text-xs text-muted-foreground">Sessions Completed</div>
            </div>
            {/* Days Streak */}
            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-accent mb-1">15</div>
              <div className="text-xs text-muted-foreground">Days Streak</div>
            </div>
          </div>
        </section>

        {/* Energy Check - Show Outcome */}
        <section className="group cursor-pointer animate-fade-in" style={{ animationDelay: '200ms' }} onClick={() => navigate(getResetRoute())}>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0">
              <img 
                src={resetSessionIllustration} 
                alt="Reset and recharge"
                className="w-8 h-8 object-contain opacity-90"
              />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-heading font-medium text-foreground group-hover:text-primary transition-colors mb-2">
                Energy Check
              </h2>
              <p className="text-base text-foreground leading-relaxed font-body mb-3">
                {getEnergyInsight()}
              </p>
              <Button 
                variant="outline" 
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground w-full text-sm py-2"
              >
                {getResetAction()}
                <ArrowRight size={14} className="ml-2" />
              </Button>
            </div>
          </div>
        </section>

        {/* Today's Priorities - Mobile First */}
        <section className="animate-fade-in" style={{ animationDelay: '400ms' }}>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
              <Target size={16} className="text-accent" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-heading font-medium text-foreground mb-3">
                Today's Priorities
              </h2>
            </div>
          </div>
          
          <div className="space-y-3">
            {getTopPriorities().map((priority) => (
              <div key={priority.id} className="bg-card border border-border rounded-lg p-3">
                <h3 className="font-body font-medium text-foreground mb-1 text-sm">
                  {priority.title}
                </h3>
                <p className="text-xs text-muted-foreground mb-1">
                  {priority.subtitle}
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  {priority.secondSubtitle}
                </p>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => navigate(priority.route)}
                  className="text-xs w-full py-1"
                >
                  {priority.suggestion}
                  <ArrowRight size={10} className="ml-2" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Journal & Reflection */}
        <section className="border-t border-border pt-8 pb-6 animate-fade-in" style={{ animationDelay: '600ms' }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center flex-shrink-0">
              <img 
                src={inkReflectionIllustration} 
                alt="Evening reflection"
                className="w-8 h-8 object-contain opacity-80"
              />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-heading font-medium text-foreground mb-2">
                Evening Reflection
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed font-body mb-3">
                3 wins or moments you're grateful for today? What made them possible?
              </p>
              <Button 
                variant="outline"
                onClick={() => navigate('/clarity', { state: { mode: 'journal', autoStart: true } })}
                className="text-sm w-full py-2 mb-2"
              >
                Journal now
                <ArrowRight size={12} className="ml-2" />
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
