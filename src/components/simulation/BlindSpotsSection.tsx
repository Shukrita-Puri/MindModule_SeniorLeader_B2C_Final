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
    "Practice pausing 3 seconds before responding when challenged",
    "Use 'I feel...' statements to express emotions more clearly", 
    "Start responses with 'I believe...' instead of 'I think maybe...'",
    "Don't let others' stress become your stress - maintain boundaries",
    "Trust your instincts in difficult conversations",
    "Ask clarifying questions instead of making assumptions"
  ];

  // Extract real-time feedback for blind spots
  const realtimeBlindSpots = realtimeFeedback.filter(feedback => 
    feedback.type === "blindspot" || feedback.type === "coaching"
  );

  return (
    <div className="space-y-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <EyeOff size={16} className="text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-heading font-medium text-foreground group-hover:text-primary transition-colors">
                Blind Spots & Growth Areas
              </h3>
              <p className="text-sm text-muted-foreground">
                Areas where you can level up your communication game
              </p>
            </div>
          </div>
            <Button variant="ghost" size="sm">
              {isExpanded ? "Hide" : "Show"}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-4 mt-6">
          {/* Real-time Feedback */}
          {realtimeBlindSpots.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb size={16} className="text-primary" />
                  Real-time Insights from Your Session
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {realtimeBlindSpots.map((feedback, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                      <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0"></div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground font-medium">{feedback.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {feedback.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Blind Spots Analysis */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target size={16} className="text-primary" />
                Development Areas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {blindSpots.map((blindSpot, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-foreground">{blindSpot}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default BlindSpotsSection;