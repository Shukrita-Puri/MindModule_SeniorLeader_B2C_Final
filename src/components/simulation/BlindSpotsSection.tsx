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
    { text: "Practice strategic pauses before responding under pressure" },
    { text: "Use 'I feel…' statements to express emotions clearly" },
    { text: "Begin responses with 'I believe…' rather than tentative phrasing" },
    { text: "Maintain composure; avoid absorbing others' stress" },
    { text: "Trust instincts in challenging conversations" }
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
              <h3 className="text-lg md:text-xl font-heading font-medium text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1">
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
          <div className="space-y-5">
            {blindSpots.map((spot, index) => (
              <div 
                key={index}
                className="border-l-2 border-gold/40 pl-4 hover:border-gold/60 transition-colors animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <p className="text-sm text-foreground font-body leading-relaxed flex items-start gap-2">
                  <span className="text-gold mt-0.5">•</span>
                  <span>{spot.text}</span>
                </p>
              </div>
            ))}
            
            <div 
              className="border-l-2 border-gold/40 pl-4 hover:border-gold/60 transition-colors animate-fade-in"
              style={{ animationDelay: `${blindSpots.length * 100}ms` }}
            >
              <p className="text-sm text-foreground font-body leading-relaxed flex items-start gap-2 mb-3">
                <span className="text-gold mt-0.5">•</span>
                <span>Ask clarifying questions to avoid assumptions</span>
              </p>
              <div className="ml-5 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-body mb-2">
                  Clarifying questions to ask:
                </p>
                {clarifyingQuestions.map((question, idx) => (
                  <p key={idx} className="text-sm text-muted-foreground font-body leading-relaxed flex items-start gap-2">
                    <span className="text-gold/60 mt-0.5">•</span>
                    <span>"{question}"</span>
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