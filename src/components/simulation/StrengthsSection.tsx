import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const StrengthsSection = () => {
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
      <div className="border-b border-gold/20 pb-3">
        <h3 className="text-2xl font-heading font-medium text-foreground mb-1">
          Your Strengths
        </h3>
        <p className="text-sm text-muted-foreground font-body">
          What you did exceptionally well
        </p>
      </div>

      <TooltipProvider>
        <div className="flex flex-wrap gap-4">
          {strengths.map((item, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <div className="group cursor-pointer">
                  <Badge 
                    variant="forest"
                    className="px-4 py-3 text-sm font-medium transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-forest/20 animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <Sparkles size={14} className="mr-2 animate-pulse" />
                    {item.category}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2 max-w-[200px] leading-relaxed">
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
        </div>
      </TooltipProvider>
    </div>
  );
};

export default StrengthsSection;
