import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ClusterProgress {
  currentScore: number;
  baselineScore: number;
  change: number;
  scenariosPracticed: number;
}

interface MetaSkillProgressSectionProps {
  selfMastery: ClusterProgress | null;
  socialMastery: ClusterProgress | null;
}

const MetaSkillProgressSection = ({ selfMastery, socialMastery }: MetaSkillProgressSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

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
    accentColor: string
  ) => {
    if (!data) {
      return (
        <div className={`relative overflow-hidden rounded-2xl p-6 ${gradientClass}`}>
          <div className="relative z-10">
            <h4 className="font-medium text-sm text-white/70 uppercase tracking-wider mb-4">{title}</h4>
            <p className="text-sm text-white/60">No progress data yet</p>
          </div>
        </div>
      );
    }

    const progressPercentage = Math.min(100, Math.max(0, data.currentScore));

    return (
      <div className={`relative overflow-hidden rounded-2xl p-6 ${gradientClass}`}>
        {/* Subtle glow effect */}
        <div className={`absolute top-0 right-0 w-32 h-32 ${accentColor} rounded-full blur-3xl opacity-30`} />
        
        <div className="relative z-10 space-y-4">
          {/* Header */}
          <h4 className="font-medium text-sm text-white/70 uppercase tracking-wider">{title}</h4>
          
          {/* Large Score Display */}
          <div className="flex items-end gap-3">
            <span className="text-5xl font-bold text-white leading-none">
              {data.currentScore}
            </span>
            <span className="text-white/50 text-lg mb-1">/100</span>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white/80 rounded-full transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between pt-2">
            <div className={`flex items-center gap-1.5 ${
              data.change > 0 ? 'text-emerald-300' : data.change < 0 ? 'text-rose-300' : 'text-white/60'
            }`}>
              {getTrendIcon(data.change)}
              <span className="text-sm font-medium">
                {formatChange(data.change)} from baseline
              </span>
            </div>
            <span className="text-sm text-white/60">
              {data.scenariosPracticed} scenario{data.scenariosPracticed !== 1 ? 's' : ''}
            </span>
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
              <h3 className="text-lg md:text-xl font-heading font-medium text-foreground group-hover:text-forest transition-colors duration-200 mb-1">
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
              "bg-saffron/40"
            )}
            {renderClusterProgress(
              "Social Mastery", 
              socialMastery, 
              "bg-gradient-to-br from-slate-700/90 via-slate-600/80 to-slate-500/70 border border-slate-500/30",
              "bg-slate-400/40"
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default MetaSkillProgressSection;
