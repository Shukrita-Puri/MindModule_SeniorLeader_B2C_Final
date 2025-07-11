import { useState } from "react";
import { Trophy, Target, Zap, Star, TrendingUp, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface GameProgressSectionProps {
  realtimeFeedback?: Array<{
    type: string;
    message: string;
    timestamp: Date;
  }>;
}

const GameProgressSection = ({ realtimeFeedback = [] }: GameProgressSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const achievements = [
    {
      id: "excellent-response",
      title: "Conversation Master",
      description: "Delivered an excellent response that impressed the AI",
      icon: <Trophy className="w-5 h-5 text-yellow-600" />,
      unlocked: realtimeFeedback.some(f => f.type === "achievement"),
      rarity: "Rare"
    },
    {
      id: "empathy-champion",
      title: "Empathy Champion", 
      description: "Showed exceptional understanding of others' perspectives",
      icon: <Star className="w-5 h-5 text-purple-600" />,
      unlocked: true,
      rarity: "Common"
    },
    {
      id: "confident-communicator",
      title: "Confident Communicator",
      description: "Maintained composure under pressure",
      icon: <Zap className="w-5 h-5 text-blue-600" />,
      unlocked: true,
      rarity: "Uncommon"
    }
  ];

  const practiceStreak = 5;
  const totalSessions = 12;
  const skillLevel = 7;
  const nextLevelProgress = 68;

  return (
    <div className="space-y-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Trophy size={16} className="text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-heading font-medium text-foreground group-hover:text-primary transition-colors">
                Track Practice Progress
              </h3>
              <p className="text-sm text-muted-foreground">
                Track your practice progress
              </p>
            </div>
          </div>
            <Button variant="ghost" size="sm">
              {isExpanded ? "Hide" : "Show"}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-4 mt-6">
          {/* Progress Bar for Development Areas */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target size={16} className="text-primary" />
                Development Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Practice sessions to overcome development areas</span>
                  <span className="text-sm font-medium text-primary">7 of 10</span>
                </div>
                <Progress value={70} className="h-3" />
                <p className="text-sm text-muted-foreground">
                  Complete 3 more practice sessions to master all development areas
                </p>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default GameProgressSection;