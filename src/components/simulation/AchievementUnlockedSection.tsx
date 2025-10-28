import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import MetaSkillsWreath from "@/components/MetaSkillsWreath";

interface AchievementUnlockedSectionProps {
  metaSkills?: Array<{
    cluster: string;
    metaSkill: string;
    subSkills: string[];
  }>;
  growthPercentage?: number;
}

const AchievementUnlockedSection = ({ 
  metaSkills = [
    {
      cluster: "Communication Excellence",
      metaSkill: "Active Listening",
      subSkills: ["Empathetic response", "Clarifying questions", "Non-verbal cues"]
    },
    {
      cluster: "Emotional Intelligence",
      metaSkill: "Self-Regulation",
      subSkills: ["Pause before responding", "Managing stress", "Staying composed"]
    },
    {
      cluster: "Strategic Thinking",
      metaSkill: "Adaptive Reasoning",
      subSkills: ["Context awareness", "Flexible approach", "Growth mindset"]
    }
  ],
  growthPercentage = 15
}: AchievementUnlockedSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="space-y-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group pb-3">
            <div>
              <h3 className="text-lg md:text-xl font-heading font-medium text-foreground group-hover:text-forest transition-colors duration-200 mb-1">
                Achievement Unlocked
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground font-body">
                Meta-skills developed in this session
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-forest">
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="flex justify-center py-6">
            <MetaSkillsWreath 
              metaSkills={metaSkills}
              growthPercentage={growthPercentage}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default AchievementUnlockedSection;
