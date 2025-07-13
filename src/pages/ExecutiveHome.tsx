
import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import SecurityWatermark from "@/components/home/SecurityWatermark";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Target, TrendingUp, Calendar, Brain, Heart, Zap } from "lucide-react";
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
    if (mood === 'tired' && energy <= 3 && focus === 'scattered') return "/recalibrate/power-up";
    if (energy >= 9 && mood === 'content' && focus === 'charged') return "/breathwork";
    if (energy < 4 || focus === 'drained') return "/recalibrate/power-up";
    if (focus === 'scattered') return "/recalibrate/power-up";
    return "/recalibrate/power-up"; // Default to power-up session
  };

  // Enhanced intelligent priority generator with data triangulation
  const getIntelligentPriorities = () => {
    const journalEntries = JSON.parse(localStorage.getItem('journalEntries') || '[]');
    const simulationHistory = JSON.parse(localStorage.getItem('simulationHistory') || '[]');
    const navigationHistory = JSON.parse(localStorage.getItem('navigationHistory') || '[]');
    
    // Analyze recent journal entries for emotional patterns
    const recentEntries = journalEntries.slice(-5);
    const stressKeywords = ['stressed', 'overwhelmed', 'pressure', 'anxious', 'worried', 'nervous'];
    const confidenceKeywords = ['confident', 'ready', 'prepared', 'excited', 'motivated'];
    const hasStressIndicators = recentEntries.some(entry => 
      stressKeywords.some(keyword => entry.content?.toLowerCase().includes(keyword))
    );
    const hasConfidenceIndicators = recentEntries.some(entry => 
      confidenceKeywords.some(keyword => entry.content?.toLowerCase().includes(keyword))
    );
    
    // Analyze current energy and focus state
    const { mood, energy = 5, focus = 'steady' } = checkInData;
    const isLowEnergy = energy < 4;
    const isHighStress = mood === 'tired' || focus === 'scattered' || hasStressIndicators;
    const needsCalibration = isLowEnergy || isHighStress;
    
    // Mock realistic calendar and context data
    const currentDate = new Date();
    const priorities = [];
    
    // Always include Oxford College Interview as first priority
    priorities.push({
      id: 1,
      title: "Oxford College Interview",
      timeHorizon: "4 days away",
      tagType: "calendar",
      whyMatters: "Calendar shows interview in 4 days. Elevated HRV detected during Cambridge interview. Admissions counselor emails show Oxford focus.",
      category: "Academic Performance",
      icon: Brain,
      suggestion: "Scenario Simulate your practice with the assessor",
      actionLabel: "Prepare with Social Intelligence",
      route: "/social-intelligence-lab",
      urgency: "high"
    });

    // Always include Advanced Physics Exam as second priority  
    priorities.push({
      id: 2,
      title: "Advanced Physics Exam",
      timeHorizon: "2 days away",
      tagType: "calendar",
      whyMatters: "Focus logs show dips during demanding work. WhatsApp shows exam anxiety. Problem-solving blocks flagged.",
      category: "Academic Performance",
      icon: Brain,
      suggestion: "Enter optimal learning state",
      actionLabel: "Practice Flow State",
      route: "/flow-state-lab",
      urgency: "high"
    });
    
    // Always include Busy Day Overwhelm Management as third priority
    priorities.push({
      id: 3,
      title: "Busy Day Overwhelm Management",
      timeHorizon: "Today",
      tagType: "calendar", 
      whyMatters: "Calendar shows 6 back-to-back commitments. Wearable data shows elevated stress during school hours. Recent WhatsApp chats flagged pressure and overwhelm.",
      category: "Performance Optimization",
      icon: Zap,
      suggestion: "Build resilience for high-demand days",
      actionLabel: "Guided Breathing", 
      route: "/recalibrate/breathing",
      urgency: "medium"
    });
    
    return priorities.slice(0, 4); // Return max 4 priorities
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
          
          <div className="space-y-4">
            {getIntelligentPriorities().map((priority) => (
              <div key={priority.id} className="bg-card border border-border rounded-lg p-4 hover:bg-accent/5 transition-colors">
                {/* Priority Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <priority.icon size={14} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-body font-medium text-foreground text-sm leading-tight">
                        {priority.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge 
                          variant="outline" 
                          className={`text-xs px-2 py-0.5 ${
                            priority.tagType === 'calendar' ? 'border-primary/30 text-primary' :
                            priority.tagType === 'wellbeing' ? 'border-accent/30 text-accent' :
                            priority.tagType === 'focus' ? 'border-secondary/30 text-secondary' :
                            'border-muted/30 text-muted-foreground'
                          }`}
                        >
                          <Calendar size={10} className="mr-1" />
                          {priority.timeHorizon}
                        </Badge>
                        {priority.timeDescription && (
                          <span className="text-xs text-muted-foreground/70 font-light">
                            {priority.timeDescription}
                          </span>
                        )}
                        <Badge 
                          variant="secondary" 
                          className={`text-xs px-2 py-0.5 ${
                            priority.urgency === 'high' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                            priority.urgency === 'medium' ? 'bg-primary/10 text-primary border-primary/20' :
                            'bg-muted/10 text-muted-foreground border-muted/20'
                          }`}
                        >
                          {priority.urgency === 'high' ? 'High Priority' : 
                           priority.urgency === 'medium' ? 'Medium Priority' : 'Growth Opportunity'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Why This Matters */}
                <div className="mb-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                    Why this matters
                  </p>
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    {priority.whyMatters}
                  </p>
                </div>
                
                {/* Suggestion & Action */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground italic">
                    {priority.suggestion}
                  </p>
                  <Button 
                    size="sm" 
                    variant={priority.urgency === 'high' ? 'default' : 'outline'}
                    onClick={() => navigate(priority.route)}
                    className="text-xs w-full py-2"
                  >
                    {priority.actionLabel}
                    <ArrowRight size={12} className="ml-2" />
                  </Button>
                </div>
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
                onClick={() => navigate('/clarity/journal')}
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
