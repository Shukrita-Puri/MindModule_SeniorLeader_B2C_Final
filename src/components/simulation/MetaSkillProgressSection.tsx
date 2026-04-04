import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ClusterProgress {
  currentScore: number;
  baselineScore: number;
  change: number;
  scenariosPracticed: number;
}

// Debrief shows session counts to avoid confusion with homepage points

interface MetaSkillProgressSectionProps {
  selfMastery: ClusterProgress | null;
  socialMastery: ClusterProgress | null;
}

const MetaSkillProgressSection = ({ selfMastery, socialMastery }: MetaSkillProgressSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [animatedSelfScore, setAnimatedSelfScore] = useState(0);
  const [animatedSocialScore, setAnimatedSocialScore] = useState(0);

  // Animate scores on mount and when data changes
  useEffect(() => {
    const targetSelf = selfMastery?.currentScore || 0;
    const targetSocial = socialMastery?.currentScore || 0;
    
    // Reset to 0 first for animation effect
    setAnimatedSelfScore(0);
    setAnimatedSocialScore(0);
    
    // Animate after short delay
    const timer = setTimeout(() => {
      const duration = 1000; // 1 second animation
      const steps = 30;
      const stepDuration = duration / steps;
      
      let currentStep = 0;
      const interval = setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;
        const easeOut = 1 - Math.pow(1 - progress, 3); // Cubic ease out
        
        setAnimatedSelfScore(Math.round(targetSelf * easeOut));
        setAnimatedSocialScore(Math.round(targetSocial * easeOut));
        
        if (currentStep >= steps) {
          clearInterval(interval);
          setAnimatedSelfScore(targetSelf);
          setAnimatedSocialScore(targetSocial);
        }
      }, stepDuration);
      
      return () => clearInterval(interval);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [selfMastery?.currentScore, socialMastery?.currentScore]);

  const getTrendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4" />;
    if (change < 0) return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const formatChange = (change: number) => {
    if (change > 0) return `+${change}`;
    return change.toString();
  };

  const renderClusterProgress = (
    title: string, 
    data: ClusterProgress | null, 
    gradientClass: string,
    accentColor: string,
    animatedScore: number
  ) => {
    if (!data) {
      return (
        <div className={`relative overflow-hidden rounded-2xl p-6 ${gradientClass}`}>
          <div className="relative z-10">
            <h4 className="font-medium text-sm text-white/70 uppercase tracking-wider mb-4">{title}</h4>
            <p className="text-sm text-white/60">No sessions completed yet</p>
          </div>
        </div>
      );
    }

    return (
      <div className={`relative overflow-hidden rounded-2xl p-6 ${gradientClass}`}>
        {/* Subtle glow effect */}
        <div className={`absolute top-0 right-0 w-32 h-32 ${accentColor} rounded-full blur-3xl opacity-30`} />
        
        <div className="relative z-10 space-y-4">
          {/* Header */}
          <h4 className="font-medium text-sm text-white/70 uppercase tracking-wider">{title}</h4>
          
          {/* Large Session Count Display with animation */}
          <div className="flex items-end gap-3">
            <span className="text-5xl font-bold text-white leading-none transition-all duration-300">
              {data.scenariosPracticed}
            </span>
            <span className="text-white/50 text-lg mb-1">session{data.scenariosPracticed !== 1 ? 's' : ''}</span>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-2 pt-2">
            <div className={`flex items-center gap-1.5 ${
              data.change > 0 ? 'text-emerald-300' : data.change < 0 ? 'text-rose-300' : 'text-white/60'
            }`}>
              {getTrendIcon(data.change)}
              <span className="text-sm font-medium">
                {formatChange(data.change)} skill growth
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group pb-3">
            <div>
              <h3 className="text-[20px] md:text-2xl font-heading font-bold text-primary mb-1">
                Your Meta-Skill Progress
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground font-body">
                Track your growth across mastery clusters
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-forest">
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            {renderClusterProgress(
              "Self Mastery", 
              selfMastery, 
              "bg-gradient-to-br from-taupe-rich/90 via-taupe/80 to-taupe-highlight/70 border border-taupe/30",
              "bg-saffron/40",
              animatedSelfScore
            )}
            {renderClusterProgress(
              "Social Mastery", 
              socialMastery, 
              "bg-gradient-to-br from-slate-700/90 via-slate-600/80 to-slate-500/70 border border-slate-500/30",
              "bg-slate-400/40",
              animatedSocialScore
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default MetaSkillProgressSection;
