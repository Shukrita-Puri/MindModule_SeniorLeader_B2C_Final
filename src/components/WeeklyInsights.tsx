
import { Calendar, TrendingUp, Target, Zap, Compass, Heart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const WeeklyInsights = () => {
  const currentWeek = new Date().toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric' 
  });

  const insights = [
    {
      id: 1,
      type: 'breakthrough',
      title: 'Decision Velocity Breakthrough',
      description: 'Your decision-making speed improved 40% this week. The pattern: morning clarity sessions before big choices.',
      icon: Zap,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      confidence: 92,
      actionable: true
    },
    {
      id: 2,
      type: 'pattern',
      title: 'Evening Energy Dip Pattern',
      description: 'Consistent 3pm energy drops correlate with skipped lunch breaks. Your focus recovers with 10-min nature walks.',
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      confidence: 85,
      actionable: true
    },
    {
      id: 3,
      type: 'emotional',
      title: 'Confidence Surge Trigger',
      description: 'Sharing wins publicly boosts your confidence by 60% for 2-3 days. Consider weekly win-sharing ritual.',
      icon: Heart,
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
      confidence: 78,
      actionable: true
    },
    {
      id: 4,
      type: 'cognitive',
      title: 'Deep Work Optimization',
      description: 'Your peak cognitive performance window: 9-11am. 89% of breakthrough ideas emerge during this period.',
      icon: Compass,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      confidence: 94,
      actionable: false
    }
  ];

  const weeklyROI = {
    emotional: '+23%',
    cognitive: '+31%',
    behavioral: '+18%',
    overall: '+247%'
  };

  return (
    <div className="space-y-6">
      {/* Weekly Summary Header */}
      <Card className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white text-xl">Weekly Growth Report</CardTitle>
              <p className="text-white/80">Week of {currentWeek}</p>
            </div>
            <Calendar size={32} className="text-white/80" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-white/80 text-sm">Overall Growth ROI</p>
              <p className="text-3xl font-bold text-white">{weeklyROI.overall}</p>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-white/80">Emotional</span>
                <span className="text-white font-semibold">{weeklyROI.emotional}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/80">Cognitive</span>
                <span className="text-white font-semibold">{weeklyROI.cognitive}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/80">Behavioral</span>
                <span className="text-white font-semibold">{weeklyROI.behavioral}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Insights */}
      <div className="space-y-4">
        <h3 className="font-bold text-gray-900 text-lg">Key Insights & Patterns</h3>
        
        {insights.map((insight) => (
          <Card key={insight.id} className="bg-white/60 backdrop-blur-sm border-0 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={`p-3 rounded-lg ${insight.bgColor}`}>
                  <insight.icon size={20} className={insight.color} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-900">{insight.title}</h4>
                    <Badge variant="outline" className="text-xs">
                      {insight.confidence}% confidence
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">{insight.description}</p>
                  
                  {insight.actionable && (
                    <Button 
                      size="sm" 
                      className={`text-white ${
                        insight.type === 'breakthrough' ? 'bg-yellow-600 hover:bg-yellow-700' :
                        insight.type === 'pattern' ? 'bg-blue-600 hover:bg-blue-700' :
                        insight.type === 'emotional' ? 'bg-pink-600 hover:bg-pink-700' :
                        'bg-purple-600 hover:bg-purple-700'
                      }`}
                    >
                      Create Ritual
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Inner Architect Recommendations */}
      <Card className="bg-white/60 backdrop-blur-sm border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Compass size={20} className="text-forest" />
            Inner Architect Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <h4 className="font-semibold text-purple-900 mb-1">Power Hour Ritual</h4>
            <p className="text-sm text-purple-700">
              Based on your peak cognitive window (9-11am), create a "Power Hour" ritual for your most important work.
            </p>
            <Button size="sm" className="mt-2 bg-purple-600 hover:bg-purple-700 text-white">
              Set Up Ritual
            </Button>
          </div>
          
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <h4 className="font-semibold text-green-900 mb-1">Energy Reset Protocol</h4>
            <p className="text-sm text-green-700">
              Your 3pm energy dips can be prevented with lunch + 10min nature walks. Auto-schedule?
            </p>
            <Button size="sm" className="mt-2 bg-green-600 hover:bg-green-700 text-white">
              Auto-Schedule
            </Button>
          </div>
          
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-1">Confidence Compound Effect</h4>
            <p className="text-sm text-blue-700">
              Weekly win-sharing creates 60% confidence boosts. Consider Friday "Victory Share" ritual.
            </p>
            <Button size="sm" className="mt-2 bg-blue-600 hover:bg-blue-700 text-white">
              Create Nudge
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WeeklyInsights;
