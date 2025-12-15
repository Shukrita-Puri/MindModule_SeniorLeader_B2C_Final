import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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
        <h3 className="text-lg md:text-xl font-heading font-bold text-forest">
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
        <h3 className="text-lg md:text-xl font-heading font-bold text-forest">
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
              <h3 className="text-lg md:text-xl font-heading font-bold text-forest mb-1">
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

        <CollapsibleContent className="mt-2">
          <div className="space-y-2">
            {blindSpots.slice(0, 4).map((item, index) => (
              <div 
                key={index}
                className="py-2 animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <p className="text-sm text-foreground font-body leading-relaxed">
                  <span className="font-medium">{item.metaSkill}</span>
                  {item.subSkill && (
                    <span className="text-muted-foreground"> → {item.subSkill}</span>
                  )}
                  <span className="text-muted-foreground">{" — "}{item.observation}</span>
                  {item.actionSuggested && (
                    <span className="text-forest font-medium">{" → "}{item.actionSuggested}</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default BlindSpotsSection;
