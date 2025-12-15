import { useState } from "react";
import { ChevronDown, ChevronUp, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface BlindSpot {
  metaSkill: string;
  subSkill?: string;
  observation: string;
  actionSuggested?: string;
}

interface BlindSpotsSectionProps {
  blindSpots?: BlindSpot[];
  isGenerating?: boolean;
}

const BlindSpotsSection = ({ blindSpots = [], isGenerating = false }: BlindSpotsSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (isGenerating) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-heading font-medium text-foreground">
          Blind Spots
        </h3>
        <div className="animate-pulse space-y-3">
          <div className="h-24 bg-muted/30 rounded-xl" />
          <div className="h-24 bg-muted/30 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!blindSpots.length) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-heading font-medium text-foreground">
          Blind Spots
        </h3>
        <p className="text-sm text-muted-foreground font-body">
          No blind spots identified in this session. Great work!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group pb-3">
            <div>
              <h3 className="text-lg md:text-xl font-heading font-medium text-foreground group-hover:text-forest transition-colors duration-200 mb-1">
                Blind Spots
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground font-body">
                Areas where you can level up your edge
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-forest">
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4">
          <div className="space-y-4">
            {blindSpots.map((item, index) => (
              <div 
                key={index}
                className="bg-muted/30 rounded-xl p-4 space-y-3 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Target size={16} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground font-body">
                      {item.metaSkill}
                      {item.subSkill && (
                        <span className="text-muted-foreground font-normal"> → {item.subSkill}</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground font-body mt-1">
                      {item.observation}
                    </p>
                  </div>
                </div>
                
                {item.actionSuggested && (
                  <div className="ml-11 bg-forest/5 dark:bg-forest/10 rounded-lg px-3 py-2">
                    <p className="text-xs font-medium text-forest mb-1">Suggested Action</p>
                    <p className="text-sm text-foreground font-body">
                      {item.actionSuggested}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default BlindSpotsSection;
