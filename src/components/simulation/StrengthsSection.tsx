import { Trophy, Star, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const StrengthsSection = () => {
  const strengths = [
    "Excellent active listening - you pick up on emotional cues quickly",
    "Natural empathy that makes others feel heard and understood", 
    "Strong ability to think critically and express complex ideas",
    "Thoughtful communication that demonstrates intellectual maturity",
    "Good at reading room dynamics and adjusting your approach"
  ];

  const sessionAchievements = [
    {
      title: "Conversation Master",
      description: "Delivered excellent responses that impressed the AI",
      icon: <Trophy className="w-4 h-4 text-primary" />,
      unlocked: true
    },
    {
      title: "Empathy Champion", 
      description: "Showed exceptional understanding of others' perspectives",
      icon: <Star className="w-4 h-4 text-primary" />,
      unlocked: true
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Star size={16} className="text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-heading font-medium text-foreground">
            Your Strengths
          </h3>
          <p className="text-sm text-muted-foreground">
            What you're already doing well
          </p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target size={16} className="text-primary" />
            Communication Strengths
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {strengths.map((strength, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-sm text-foreground">{strength}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy size={16} className="text-primary" />
            Session Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sessionAchievements.map((achievement, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {achievement.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-foreground">{achievement.title}</h4>
                    <Badge variant="secondary" className="text-xs">Unlocked!</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{achievement.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StrengthsSection;