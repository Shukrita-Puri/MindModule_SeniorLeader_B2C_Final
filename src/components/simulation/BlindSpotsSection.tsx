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
      category: "Communication Patterns",
      insights: [
        "You tend to over-explain when feeling defensive",
        "Practice pausing before responding when challenged",
        "Your natural empathy is a strength - lean into it more"
      ],
      improvement: "Try the 3-second pause technique before responding",
      icon: <Target className="w-4 h-4" />
    },
    {
      category: "Emotional Awareness", 
      insights: [
        "You're good at reading others' emotions",
        "Work on expressing your own needs more clearly",
        "Don't let others' stress become your stress"
      ],
      improvement: "Use 'I feel...' statements to express your emotions",
      icon: <Eye className="w-4 h-4" />
    },
    {
      category: "Confidence Building",
      insights: [
        "Your ideas are valuable - don't undersell them",
        "Practice stating your opinion without apologizing first",
        "Trust your instincts in difficult conversations"
      ],
      improvement: "Start responses with 'I believe...' instead of 'I think maybe...'",
      icon: <TrendingUp className="w-4 h-4" />
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
          <div className="flex items-center justify-between cursor-pointer group">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <EyeOff size={16} className="text-amber-600" />
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
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb size={16} className="text-amber-500" />
                  Real-time Insights from Your Session
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {realtimeBlindSpots.map((feedback, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="w-2 h-2 bg-amber-400 rounded-full mt-1.5 flex-shrink-0"></div>
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
          <div className="grid gap-4">
            {blindSpots.map((spot, index) => (
              <Card key={index} className="border border-amber-200 bg-amber-50/30">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      {spot.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium text-foreground">{spot.category}</h4>
                        <Badge variant="secondary" className="text-xs">Growth Area</Badge>
                      </div>
                      
                      <div className="space-y-2">
                        {spot.insights.map((insight, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <div className="w-1 h-1 bg-amber-400 rounded-full mt-2 flex-shrink-0"></div>
                            <p className="text-sm text-muted-foreground">{insight}</p>
                          </div>
                        ))}
                      </div>
                      
                      <div className="mt-3 p-3 bg-white rounded-lg border border-amber-200">
                        <p className="text-sm font-medium text-amber-700 mb-1">Try This:</p>
                        <p className="text-sm text-amber-600">{spot.improvement}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Wins */}
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp size={16} className="text-green-600" />
                Quick Wins for Your Next Conversation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <p className="text-sm text-green-700">Start with "I appreciate you bringing this up..."</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <p className="text-sm text-green-700">Ask "What would success look like for you?" to understand their perspective</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <p className="text-sm text-green-700">Practice saying "I need to think about that" instead of immediately agreeing</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default BlindSpotsSection;