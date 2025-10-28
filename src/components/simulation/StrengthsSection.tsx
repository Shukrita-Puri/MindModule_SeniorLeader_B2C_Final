import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const StrengthsSection = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const strengths = [
    {
      category: "Communication",
      strength: "Excellent active listening and reading of emotional cues",
      example: "You paused thoughtfully before responding to the professor's challenging question, showing you were truly listening."
    },
    {
      category: "Empathy",
      strength: "Natural ability to make others feel understood",
      example: "When your peer expressed uncertainty, you validated their feelings before offering your perspective."
    },
    {
      category: "Cognition",
      strength: "Strong critical thinking; articulates complex ideas with clarity",
      example: "You broke down the philosophical concept into relatable examples that made the discussion accessible."
    },
    {
      category: "Adaptability",
      strength: "Adjusts to group dynamics intuitively",
      example: "You shifted your communication style when the conversation became more formal, matching the room's energy."
    }
  ];

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

      <div className="border-l-2 border-gold/40 pl-4 space-y-6">
        <TooltipProvider>
          {strengths.map((item, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <div 
                  className="cursor-pointer hover:border-gold/60 transition-colors animate-fade-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <h4 className="text-sm font-medium text-foreground font-body mb-1">
                    {item.category}
                  </h4>
                  <p className="text-sm text-muted-foreground font-body leading-relaxed">
                    {item.strength}
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs bg-card border-gold/30">
                <p className="text-sm font-body leading-relaxed">
                  <span className="font-medium text-gold">Example:</span> {item.example}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default StrengthsSection;
