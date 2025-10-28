import { useState } from "react";
import { Eye, EyeOff, Target, Lightbulb, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    {
      text: "Ask clarifying questions to avoid assumptions",
      examples: [
        "Can you help me understand what you mean by that?",
        "What would success look like for you in this situation?",
        "Could you give me an example of what you're describing?"
      ]
    },
    {
      text: "Practice pausing 3 seconds before responding when challenged",
      examples: [
        "That's an interesting point. Let me think about that for a moment...",
        "I appreciate that perspective. Give me a second to process...",
        "Good question. I want to give you a thoughtful answer..."
      ]
    },
    {
      text: "Use 'I feel...' statements to express emotions more clearly",
      examples: [
        "I feel uncertain about this approach because...",
        "I feel excited about the possibility of...",
        "I feel concerned when..."
      ]
    }
  ];

  // Extract real-time feedback for blind spots
  const realtimeBlindSpots = realtimeFeedback.filter(feedback => 
    feedback.type === "blindspot" || feedback.type === "coaching"
  );

  return (
    <div className="space-y-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group border-b border-gold/20 pb-3">
            <div>
              <h3 className="text-2xl font-heading font-medium text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1">
                Blind Spots & Growth Areas
              </h3>
              <p className="text-sm text-muted-foreground font-body">
                Areas where you can level up your edge
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-forest">
              {isExpanded ? <Eye size={18} /> : <EyeOff size={18} />}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-6 mt-6">
          {/* Real-time Feedback */}
          {realtimeBlindSpots.length > 0 && (
            <div className="bg-gradient-to-br from-indigo-50/50 to-cerulean-50/50 dark:from-indigo-950/20 dark:to-cerulean-950/20 rounded-lg p-6 border border-indigo-200/20 dark:border-indigo-800/20 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb size={18} className="text-indigo-600 dark:text-indigo-400" />
                <h4 className="font-heading font-medium text-foreground">Real-time Insights</h4>
              </div>
              <div className="space-y-3">
                {realtimeBlindSpots.map((feedback, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-background/60 rounded border border-border/10 hover:border-indigo-300/30 dark:hover:border-indigo-700/30 transition-colors">
                    <TrendingUp size={14} className="text-indigo-600 dark:text-indigo-400 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-foreground font-body">{feedback.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {feedback.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Blind Spots with Examples */}
          <div className="space-y-5">
            {blindSpots.map((blindSpot, index) => (
              <div 
                key={index} 
                className="bg-gradient-to-br from-background to-muted/20 rounded-lg p-5 border border-border/10 hover:border-cerulean-300/30 dark:hover:border-cerulean-700/30 transition-all duration-300 hover:shadow-md"
              >
                <div className="flex items-start gap-3 mb-3">
                  <Target size={16} className="text-cerulean-600 dark:text-cerulean-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-medium text-foreground font-body">{blindSpot.text}</p>
                </div>
                <div className="ml-7 pl-4 border-l-2 border-gold/30 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Example questions:</p>
                  {blindSpot.examples.map((example, exIndex) => (
                    <p key={exIndex} className="text-sm text-muted-foreground font-body italic">
                      "{example}"
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default BlindSpotsSection;