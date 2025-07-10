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
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <Trophy size={16} className="text-purple-600" />
              </div>
              <div>
                <h3 className="text-lg font-heading font-medium text-foreground group-hover:text-primary transition-colors">
                  Your Communication Progress
                </h3>
                <p className="text-sm text-muted-foreground">
                  Track your growth and celebrate achievements
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm">
              {isExpanded ? "Hide" : "Show"}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-4 mt-6">
          {/* Progress Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
              <CardContent className="p-4 text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-purple-100 flex items-center justify-center">
                  <Target size={20} className="text-purple-600" />
                </div>
                <div className="text-2xl font-bold text-purple-700">{practiceStreak}</div>
                <div className="text-sm text-purple-600">Day Streak</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
              <CardContent className="p-4 text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-blue-100 flex items-center justify-center">
                  <TrendingUp size={20} className="text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-blue-700">{totalSessions}</div>
                <div className="text-sm text-blue-600">Total Sessions</div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
              <CardContent className="p-4 text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-green-100 flex items-center justify-center">
                  <Star size={20} className="text-green-600" />
                </div>
                <div className="text-2xl font-bold text-green-700">Level {skillLevel}</div>
                <div className="text-sm text-green-600">Skill Level</div>
              </CardContent>
            </Card>
          </div>

          {/* Level Progress */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Level {skillLevel} Progress</span>
                <Badge variant="secondary">{nextLevelProgress}% to Level {skillLevel + 1}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={nextLevelProgress} className="h-3" />
              <p className="text-sm text-muted-foreground mt-2">
                Complete 3 more practice sessions to reach Level {skillLevel + 1}
              </p>
            </CardContent>
          </Card>

          {/* Achievements */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Award size={16} className="text-yellow-600" />
                Recent Achievements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {achievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                      achievement.unlocked
                        ? "bg-yellow-50 border-yellow-200"
                        : "bg-gray-50 border-gray-200 opacity-60"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      achievement.unlocked ? "bg-yellow-100" : "bg-gray-100"
                    }`}>
                      {achievement.unlocked ? achievement.icon : <Award size={16} className="text-gray-400" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className={`font-medium ${
                          achievement.unlocked ? "text-foreground" : "text-muted-foreground"
                        }`}>
                          {achievement.title}
                        </h4>
                        <Badge 
                          variant={achievement.unlocked ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {achievement.rarity}
                        </Badge>
                        {achievement.unlocked && (
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                            Unlocked!
                          </Badge>
                        )}
                      </div>
                      <p className={`text-sm ${
                        achievement.unlocked ? "text-muted-foreground" : "text-gray-400"
                      }`}>
                        {achievement.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Next Goals */}
          <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target size={16} className="text-indigo-600" />
                Next Goals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-indigo-700">Practice 3 more difficult conversations</span>
                  <Badge variant="outline" className="text-xs">In Progress</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-indigo-700">Unlock "Negotiation Master" achievement</span>
                  <Badge variant="outline" className="text-xs">Coming Soon</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-indigo-700">Maintain 7-day practice streak</span>
                  <Badge variant="outline" className="text-xs">2 days to go</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default GameProgressSection;