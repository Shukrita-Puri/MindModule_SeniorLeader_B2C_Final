import { ArrowLeft, Brain, TrendingUp, AlertTriangle, Target, Compass, Zap, Clock, Shield, Users, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MainNavigation from "@/components/_archived/MainNavigation";

const MindVault = () => {
  const navigate = useNavigate();

  const domains = [
    {
      name: "Mental Clarity",
      progress: 78,
      icon: Brain,
      insight: "Strong analytical thinking, room to improve decision speed",
      trend: "improving"
    },
    {
      name: "Inner Calibration", 
      progress: 65,
      icon: Compass,
      insight: "Good self-awareness, work on emotional regulation",
      trend: "stable"
    },
    {
      name: "Social Intelligence",
      progress: 82,
      icon: Users,
      insight: "Excellent reading of social dynamics",
      trend: "improving"
    },
    {
      name: "Flow State",
      progress: 71,
      icon: Zap,
      insight: "Consistent focus periods, optimize transition times",
      trend: "improving"
    },
    {
      name: "Self-Directed Growth",
      progress: 89,
      icon: Target,
      insight: "Outstanding goal-setting and execution",
      trend: "strong"
    },
    {
      name: "Time & Energy Management",
      progress: 54,
      icon: Clock,
      insight: "Energy awareness needs development",
      trend: "focus_area"
    },
    {
      name: "Resilience & Identity",
      progress: 75,
      icon: Shield,
      insight: "Solid foundation, strengthen core values",
      trend: "stable"
    }
  ];

  const blindSpots = [
    "Tendency to overthink social situations despite strong social intelligence",
    "Energy crashes in afternoon - not optimizing circadian rhythms",
    "High standards creating perfectionism loops in academic work"
  ];

  const patterns = [
    {
      pattern: "Performance → Pressure → Procrastination",
      frequency: "Weekly",
      domain: "Time & Energy Management"
    },
    {
      pattern: "Social validation seeking when stressed", 
      frequency: "Daily",
      domain: "Inner Calibration"
    },
    {
      pattern: "Deep work sessions followed by social media scrolling",
      frequency: "Daily", 
      domain: "Flow State"
    }
  ];

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "improving": return "text-green-600";
      case "strong": return "text-blue-600";
      case "focus_area": return "text-orange-600";
      default: return "text-muted-foreground";
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "improving": case "strong": return "↗";
      case "focus_area": return "⚠";
      default: return "→";
    }
  };

  return (
    <div className="min-h-screen bg-background font-serif pb-20">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="text-foreground hover:bg-muted rounded-lg p-2"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="text-center">
            <h1 className="text-2xl font-serif font-medium text-foreground">Mind Vault</h1>
            <p className="text-sm text-muted-foreground">Growth Insights & Patterns</p>
          </div>
          <div className="w-10 h-10" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Growth Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6 text-center">
              <TrendingUp size={24} className="mx-auto mb-2 text-primary" />
              <h3 className="font-serif font-medium text-foreground">Overall Growth</h3>
              <p className="text-2xl font-bold text-primary">73%</p>
              <p className="text-xs text-muted-foreground">Across all domains</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6 text-center">
              <Brain size={24} className="mx-auto mb-2 text-primary" />
              <h3 className="font-serif font-medium text-foreground">Active Patterns</h3>
              <p className="text-2xl font-bold text-primary">3</p>
              <p className="text-xs text-muted-foreground">Need attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <AlertTriangle size={24} className="mx-auto mb-2 text-orange-600" />
              <h3 className="font-serif font-medium text-foreground">Blind Spots</h3>
              <p className="text-2xl font-bold text-orange-600">3</p>
              <p className="text-xs text-muted-foreground">Discovered</p>
            </CardContent>
          </Card>
        </div>

        {/* Domain Mastery */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-foreground">Domain Mastery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {domains.map((domain, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <domain.icon size={20} className="text-primary" />
                    <span className="font-serif font-medium text-foreground">{domain.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${getTrendColor(domain.trend)}`}>
                      {getTrendIcon(domain.trend)}
                    </span>
                    <span className="text-sm font-medium text-foreground">{domain.progress}%</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-muted rounded-full">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${domain.progress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground italic pl-8">{domain.insight}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Patterns */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-foreground">Behavioral Patterns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {patterns.map((item, index) => (
              <div key={index} className="border-l-4 border-l-primary pl-4 py-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-serif font-medium text-foreground">{item.pattern}</h4>
                  <Badge variant="secondary" className="text-xs">{item.frequency}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">Domain: {item.domain}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Blind Spots */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-foreground flex items-center gap-2">
              <AlertTriangle size={20} className="text-orange-600" />
              Current Blind Spots
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {blindSpots.map((spot, index) => (
              <div key={index} className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border-l-4 border-l-orange-500">
                <p className="text-sm text-foreground leading-relaxed">{spot}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <MainNavigation />
    </div>
  );
};

export default MindVault;