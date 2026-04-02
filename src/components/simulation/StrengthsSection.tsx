import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface EnhancedStrength {
  metaSkill: string;
  subSkill?: string;
  description?: string;
  indicators?: string[];
  transcriptExample?: string;
}

interface StrengthsSectionProps {
  strengths?: EnhancedStrength[];
  isGenerating?: boolean;
}

const StrengthsSection = ({ strengths = [], isGenerating = false }: StrengthsSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (isGenerating) {
    return (
      <div className="space-y-4">
        <h3 className="text-xl md:text-2xl font-heading font-bold text-primary">
          Your Strengths
        </h3>
        <div className="animate-pulse space-y-3">
          <div className="h-24 bg-forest/5 rounded-xl" />
          <div className="h-24 bg-forest/5 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!strengths.length) {
    return (
      <div className="space-y-4">
        <h3 className="text-xl md:text-2xl font-heading font-bold text-primary">
          Your Strengths
        </h3>
        <p className="text-sm text-muted-foreground font-body">
          Complete more dialogue sessions to identify your strengths.
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
              <h3 className="text-xl md:text-2xl font-heading font-bold text-primary mb-1">
                Your Strengths
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground font-body">
                What you did exceptionally well
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-forest">
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2">
          <div className="space-y-2">
            {strengths.slice(0, 4).map((item, index) => (
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
                  {(item.description || (item.indicators && item.indicators.length > 0)) && (
                    <span className="text-muted-foreground">
                      {" – "}{item.description || item.indicators?.join(', ')}
                    </span>
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

export default StrengthsSection;
