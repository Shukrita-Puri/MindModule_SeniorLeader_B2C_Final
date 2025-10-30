
import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import SecurityWatermark from "@/components/home/SecurityWatermark";
import TopNavigation from "@/components/simulation/TopNavigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Target, TrendingUp, Calendar, BookOpen, Heart, Zap, Waves, Sparkles } from "lucide-react";
import resetSessionIllustration from "@/assets/reset-session-illustration.png";
import inkFocusIllustration from "@/assets/ink-focus-illustration.png";
import executiveHomeBanner from "@/assets/executive-home-banner.png";

const ExecutiveHome = () => {
  const navigate = useNavigate();
  
  // Get Daily Check-in data
  const checkInData = JSON.parse(localStorage.getItem('dailyCheckIn') || '{}');
  const hasCheckIn = checkInData.timestamp && new Date(checkInData.timestamp).toDateString() === new Date().toDateString();
  
  const getEnergyInsight = () => {
    if (!hasCheckIn || checkInData.skipped) {
      return "Ready to tackle your day with focus";
    }
    
    const { outcome } = checkInData;
    
    const insightMap = {
      "pause": "You're seeking calm and restoration today",
      "power-up": "You're building energy and activation",
      "presence": "You're entering deep focus and flow"
    };
    
    return insightMap[outcome as keyof typeof insightMap] || "Ready to tackle your day with focus";
  };
  
  const getResetAction = () => {
    if (!hasCheckIn || checkInData.skipped) {
      return "Take Daily Check-in";
    }
    
    const { outcome, context } = checkInData;
    
    const actionMap: Record<string, Record<string, string>> = {
      "pause": {
        "high_stakes_decision": "8-min Box Breathing",
        "managing_stress": "Stress Relief Practice",
        "quick_reset": "Quick Pause Reset",
        "default": "Pause Practice"
      },
      "power-up": {
        "low_energy_morning": "Wim Hof Power-Up",
        "sustainable_energy": "Energy Building Practice",
        "quick_boost": "3-min Energy Boost",
        "default": "Power-Up Practice"
      },
      "presence": {
        "big_task_ahead": "Pre-Performance Flow",
        "deep_concentration": "Focus Meditation",
        "flow_state": "Flow State Session",
        "default": "Presence Practice"
      }
    };
    
    const outcomeActions = actionMap[outcome] || actionMap["power-up"];
    return outcomeActions[context] || outcomeActions["default"];
  };

  const getResetRoute = () => {
    if (!hasCheckIn || checkInData.skipped) {
      return "/daily-check-in";
    }
    
    const { outcome } = checkInData;
    
    const routeMap: Record<string, string> = {
      "pause": "/recalibrate/pause",
      "power-up": "/recalibrate/power-up",
      "presence": "/recalibrate/presence"
    };
    
    return routeMap[outcome] || "/recalibrate";
  };

  // Enhanced intelligent priority generator with data triangulation
  const getIntelligentPriorities = () => {
    const journalEntries = JSON.parse(localStorage.getItem('journalEntries') || '[]');
    const simulationHistory = JSON.parse(localStorage.getItem('simulationHistory') || '[]');
    
    const { outcome, context } = checkInData;
    const priorities = [];
    
    // If user checked in as "power-up", add energy priority first
    if (outcome === "power-up" && context === "low_energy_morning") {
      priorities.push({
        id: 0,
        title: "Morning Energy Protocol",
        timeHorizon: "Start now",
        tagType: "wellbeing",
        whyMatters: "You indicated low energy this morning. Research shows breathwork can increase alertness by 40% within 3 minutes.",
        category: "Energy Management",
        icon: Zap,
        suggestion: "Build sustainable energy for your day",
        actionLabel: "3-min Power-Up",
        route: "/recalibrate/power-up",
        urgency: "high"
      });
    }
    
    // If user checked in as "presence" with big task context
    if (outcome === "presence" && context === "big_task_ahead") {
      priorities.push({
        id: 0,
        title: "Pre-Task Flow State",
        timeHorizon: "Before your task",
        tagType: "performance",
        whyMatters: "You have important work ahead. Studies show 8 minutes of focused breathing improves concentration by 35%.",
        category: "Performance Optimization",
        icon: Target,
        suggestion: "Enter optimal state before diving in",
        actionLabel: "Flow State Prep",
        route: "/recalibrate/presence",
        urgency: "high"
      });
    }
    
    // Always include Oxford College Interview
    priorities.push({
      id: 1,
      title: "Oxford College Interview",
      timeHorizon: "4 days away",
      tagType: "calendar",
      whyMatters: "Calendar shows interview in 4 days. Elevated HRV detected during Cambridge interview last week. Admissions counsellor emails show Oxford College in focus.",
      category: "Academic Performance",
      icon: BookOpen,
      suggestion: outcome === "pause" 
        ? "Take a gentle approach - manage pre-interview stress first"
        : "Scenario Simulate your practice with the assessor",
      actionLabel: "Prepare with Social Intelligence",
      route: "/practice",
      urgency: outcome === "pause" ? "medium" : "high"
    });

    // Always include Advanced Physics Exam
    priorities.push({
      id: 2,
      title: "Advanced Physics Exam",
      timeHorizon: "2 days away",
      tagType: "calendar",
      whyMatters: "Focus logs show dips during demanding work. WhatsApp conversation with friends shows exam anxiety. Problem-solving blocks flagged in chats.",
      category: "Academic Performance",
      icon: Target,
      suggestion: "Enter optimal learning state",
      actionLabel: "Practice Flow State",
      route: "/recalibrate/flow-state",
      urgency: "high"
    });
    
    // Always include Busy Day Overwhelm Management
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
    <div className="min-h-screen font-body pb-32">
      <TopNavigation backPath="/signup" />
      <SecurityWatermark />
      
      {/* Hero Banner with Watercolor */}
      <div className="relative w-full h-[400px] md:h-[60vh] overflow-hidden">
        {/* Background Image */}
        <img 
          src={executiveHomeBanner} 
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        
        {/* Stronger Warm Overlay for text visibility */}
        <div className="absolute inset-0 bg-[rgba(255,240,230,0.35)]" />
        
        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <h1 
            className="text-5xl md:text-7xl lg:text-8xl font-headline font-medium mb-4 bg-gradient-to-br from-[#6B5610] via-[#8B6914] to-[#B8860B] bg-clip-text text-transparent"
            style={{ filter: 'drop-shadow(0 2px 12px rgba(139, 105, 20, 0.4)) drop-shadow(0 4px 20px rgba(0, 0, 0, 0.2))' }}
          >
            Hey, Alex
          </h1>
          <p 
            className="text-lg md:text-xl text-foreground/90"
            style={{ textShadow: '0 2px 8px rgba(255, 240, 230, 0.8)' }}
          >
            Ready to architect your mind for the day?
          </p>
        </div>
      </div>

      <div className="px-4 max-w-lg mx-auto space-y-16">
        
        {/* Building Momentum - Leaderboard Style */}
        <section className="animate-fade-in">
          <h2 className="text-lg font-headline font-medium text-foreground mb-4">
            Building Momentum
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Sessions Completed */}
            <div className="bg-card border border-border rounded-sm p-4 text-center hover:border-gold/30 transition-all">
              <div className="text-2xl font-bold text-primary mb-1">47</div>
              <div className="text-xs text-muted-foreground">Sessions Completed</div>
            </div>
            {/* Days Streak */}
            <div className="bg-card border border-border rounded-sm p-4 text-center hover:border-gold/30 transition-all">
              <div className="text-2xl font-bold text-gold mb-1">15</div>
              <div className="text-xs text-muted-foreground">Days Streak</div>
            </div>
          </div>
        </section>

        {/* Check-in Badge */}
        {hasCheckIn && !checkInData.skipped && (
          <div className="px-4 max-w-lg mx-auto -mt-8 mb-8 animate-fade-in">
            <div className="bg-card/90 backdrop-blur-sm border border-gold/20 rounded-lg p-3 flex items-center gap-3 shadow-lg">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold/20 to-gold/10 flex items-center justify-center">
                {(checkInData.displayOutcome === 'pause' || checkInData.displayOutcome === 'calm') && <Waves className="w-5 h-5 text-primary" />}
                {checkInData.displayOutcome === 'power-up' && <Zap className="w-5 h-5 text-accent" />}
                {(checkInData.displayOutcome === 'presence' || checkInData.displayOutcome === 'ready') && <Target className="w-5 h-5 text-gold" />}
                {checkInData.displayOutcome === 'ready' && <Sparkles className="w-5 h-5 text-gold" />}
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Today's Focus
                </p>
                <p className="text-sm font-headline font-medium text-foreground">
                  {(checkInData.displayOutcome === 'pause' || checkInData.displayOutcome === 'calm') && "Pause & Reset"}
                  {checkInData.displayOutcome === 'power-up' && "Power Up & Energize"}
                  {(checkInData.displayOutcome === 'presence' || checkInData.displayOutcome === 'ready') && "Presence & Focus"}
                </p>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/daily-check-in')}
                className="text-xs text-primary hover:text-primary/80"
              >
                Update
              </Button>
            </div>
          </div>
        )}

        {/* Energy Check - Show Outcome */}
        <section 
          className="group animate-fade-in relative overflow-hidden" 
          style={{ animationDelay: '200ms' }}
        >
          {/* Background gradient based on outcome */}
          <div className={`absolute inset-0 transition-opacity duration-500 ${
            checkInData.outcome === 'pause' ? 'bg-gradient-to-br from-blue-500/10 to-indigo-500/10' :
            checkInData.outcome === 'power-up' ? 'bg-gradient-to-br from-orange-500/10 to-red-500/10' :
            checkInData.outcome === 'presence' ? 'bg-gradient-to-br from-purple-500/10 to-pink-500/10' :
            'bg-card'
          } opacity-40 rounded-lg`} />
          
          <div className="relative flex items-center gap-4 mb-4 p-4 rounded-lg border border-border bg-card/80 backdrop-blur-sm">
            {/* Outcome Icon */}
            <div className="w-12 h-12 rounded-full bg-background border border-border flex items-center justify-center flex-shrink-0">
              {(checkInData.displayOutcome === 'pause' || checkInData.displayOutcome === 'calm') && <Waves className="w-6 h-6 text-primary" />}
              {checkInData.displayOutcome === 'power-up' && <Zap className="w-6 h-6 text-accent" />}
              {checkInData.displayOutcome === 'presence' && <Target className="w-6 h-6 text-gold" />}
              {checkInData.displayOutcome === 'ready' && <Sparkles className="w-6 h-6 text-gold" />}
              {!checkInData.outcome && <Heart className="w-6 h-6 text-accent" />}
            </div>
            
            <div className="flex-1">
              <h2 className="text-lg font-headline font-medium text-foreground group-hover:text-primary transition-colors mb-2">
                {hasCheckIn && !checkInData.skipped ? "Your Path Today" : "Set Your Intention"}
              </h2>
              
              {/* Personalized insight */}
              <p className="text-base text-foreground leading-relaxed font-body mb-3">
                {getEnergyInsight()}
              </p>
              
              {/* Contextual sub-message if context was provided */}
              {checkInData.context && (
                <p className="text-xs text-muted-foreground italic mb-3">
                  {checkInData.context === "high_stakes_decision" && "Navigating your important decision"}
                  {checkInData.context === "managing_stress" && "Managing stress & energy"}
                  {checkInData.context === "low_energy_morning" && "Building your morning momentum"}
                  {checkInData.context === "big_task_ahead" && "Preparing for peak performance"}
                  {checkInData.context === "deep_concentration" && "Entering deep focus"}
                </p>
              )}
              
              {/* Action button */}
              <Button 
                variant="outline" 
                className={`border-primary text-primary hover:bg-primary hover:text-primary-foreground w-full text-sm py-2 ${
                  checkInData.outcome ? 'border-2' : ''
                }`}
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
              <h2 className="text-lg font-headline font-medium text-foreground mb-3">
                Today's Priorities
              </h2>
            </div>
          </div>
          
          <div className="space-y-4">
            {getIntelligentPriorities().map((priority) => (
              <div key={priority.id} className="bg-card border border-border rounded-sm p-4 hover:bg-primary/5 hover:border-gold/30 transition-all shadow-sm">
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
                    variant="outline"
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

      </div>

      <MainNavigation />
    </div>
  );
};

export default ExecutiveHome;
