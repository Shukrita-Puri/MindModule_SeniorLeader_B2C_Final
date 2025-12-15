import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
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
        <h3 className="text-lg font-heading font-medium text-foreground">
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
        <h3 className="text-lg font-heading font-medium text-foreground">
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
              <h3 className="text-lg md:text-xl font-heading font-medium text-foreground group-hover:text-forest transition-colors duration-200 mb-1">
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

        <CollapsibleContent className="mt-4">
          <div className="space-y-4">
            {strengths.map((item, index) => (
              <div 
                key={index}
                className="bg-forest/5 dark:bg-forest/10 rounded-xl p-4 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-forest/20 flex items-center justify-center">
                    <Sparkles size={16} className="text-forest" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground font-body">
                      {item.metaSkill}
                      {item.subSkill && (
                        <span className="text-muted-foreground font-normal"> → {item.subSkill}</span>
                      )}
                    </p>
                    {/* LLM-generated description takes priority */}
                    {item.description ? (
                      <p className="text-sm text-muted-foreground font-body mt-1">
                        {item.description}
                      </p>
                    ) : item.indicators && item.indicators.length > 0 ? (
                      <p className="text-sm text-muted-foreground font-body mt-1">
                        {item.indicators.join(', ')}
                      </p>
                    ) : null}
                    {item.transcriptExample && (
                      <p className="text-xs text-muted-foreground/80 font-body mt-2 italic border-l-2 border-forest/30 pl-2">
                        "{item.transcriptExample}"
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default StrengthsSection;
