import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface BlindSpotsSectionProps {
  realtimeFeedback?: Array<{
    type: string;
    message: string;
    timestamp: Date;
  }>;
}

const BlindSpotsSection = ({ realtimeFeedback = [] }: BlindSpotsSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const blindSpots = [
    "Practice strategic pauses before responding under pressure",
    "Use 'I feel…' statements to express emotions clearly",
    "Begin responses with 'I believe…' rather than tentative phrasing",
    "Maintain composure; avoid absorbing others' stress",
    "Trust instincts in challenging conversations",
    "Ask clarifying questions to avoid assumptions"
  ];

  const clarifyingQuestions = [
    "Can you help me understand what you mean by that?",
    "What would success look like for you?",
    "What concerns you most about this situation?",
    "How do you see this playing out?"
  ];

  return (
    <div className="space-y-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group pb-3">
            <div>
              <h3 className="text-lg md:text-xl font-heading font-medium text-foreground group-hover:text-forest transition-colors duration-200 mb-1">
                Blind Spots & Development Areas
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

        <CollapsibleContent className="mt-6">
          <div className="border-l-2 border-gold/40 pl-4 hover:border-gold/60 transition-colors space-y-3">
            {blindSpots.map((spot, index) => (
              <p 
                key={index}
                className="text-sm text-foreground font-body leading-relaxed animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {spot}
              </p>
            ))}
            
            <div className="mt-6 pt-4 border-t border-gold/20">
              <p className="text-sm font-medium text-foreground font-body mb-3">
                Clarifying questions to ask
              </p>
              <div className="ml-4 space-y-2 bg-muted/20 rounded-md p-3">
                {clarifyingQuestions.map((question, idx) => (
                  <p key={idx} className="text-sm text-muted-foreground font-body leading-relaxed italic">
                    "{question}"
                  </p>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default BlindSpotsSection;