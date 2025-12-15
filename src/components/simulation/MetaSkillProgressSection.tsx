import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
    if (change > 0) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (change < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const formatChange = (change: number) => {
    if (change > 0) return `+${change}`;
    return change.toString();
  };

  const renderClusterProgress = (title: string, data: ClusterProgress | null) => {
    if (!data) {
      return (
        <div className="p-4 bg-muted/30 rounded-lg">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide mb-2">{title}</h4>
          <p className="text-sm text-muted-foreground">No progress data yet</p>
        </div>
      );
    }

    const progressPercentage = Math.min(100, Math.max(0, data.currentScore));

    return (
      <div className="p-4 bg-muted/30 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">{title}</h4>
          <div className="flex items-center gap-2">
            {getTrendIcon(data.change)}
            <span className={`text-sm font-medium ${
              data.change > 0 ? 'text-green-600' : data.change < 0 ? 'text-red-500' : 'text-muted-foreground'
            }`}>
              {formatChange(data.change)} from baseline
            </span>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Progress value={progressPercentage} className="flex-1 h-3" />
            <span className="ml-3 text-lg font-semibold text-foreground">{data.currentScore}/100</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {data.scenariosPracticed} scenario{data.scenariosPracticed !== 1 ? 's' : ''} practiced
          </p>
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
          <div className="space-y-4 mt-4">
            {renderClusterProgress("Self Mastery", selfMastery)}
            {renderClusterProgress("Social Mastery", socialMastery)}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default MetaSkillProgressSection;
