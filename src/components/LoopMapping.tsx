
import { useState } from 'react';
import { ArrowRight, RotateCcw, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface BehaviorLoop {
  id: string;
  name: string;
  trigger: string;
  response: string;
  result: string;
  type: 'empowering' | 'limiting' | 'neutral';
  frequency: number;
  strength: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  lastOccurrence: string;
}

const LoopMapping = () => {
  const [selectedLoop, setSelectedLoop] = useState<BehaviorLoop | null>(null);

  const behaviorLoops: BehaviorLoop[] = [
    {
      id: '1',
      name: 'Morning Momentum Loop',
      trigger: 'Wake up feeling groggy',
      response: 'Immediate 5-min breathing + intention setting',
      result: 'Clear, energized start + 40% better decisions',
      type: 'empowering',
      frequency: 6,
      strength: 8,
      trend: 'increasing',
      lastOccurrence: '2 hours ago'
    },
    {
      id: '2',
      name: 'Email Reactivity Spiral',
      trigger: 'Urgent email notification',
      response: 'Immediate context-switching to respond',
      result: 'Scattered focus + 3x longer task completion',
      type: 'limiting',
      frequency: 12,
      strength: 7,
      trend: 'decreasing',
      lastOccurrence: '1 day ago'
    },
    {
      id: '3',
      name: 'Deep Work Flow State',
      trigger: 'Calendar block for important project',
      response: 'Phone off + single focus for 90 min',
      result: 'Breakthrough insights + satisfaction boost',
      type: 'empowering',
      frequency: 4,
      strength: 9,
      trend: 'stable',
      lastOccurrence: 'Yesterday'
    },
    {
      id: '4',
      name: 'Social Comparison Trap',
      trigger: 'Scrolling LinkedIn/social media',
      response: 'Compare progress to others + self-doubt',
      result: 'Motivation drop + procrastination on goals',
      type: 'limiting',
      frequency: 8,
      strength: 6,
      trend: 'stable',
      lastOccurrence: '3 hours ago'
    },
    {
      id: '5',
      name: 'Victory Integration Ritual',
      trigger: 'Complete challenging task',
      response: 'Pause + acknowledge + extract lesson',
      result: 'Confidence boost + wisdom integration',
      type: 'empowering',
      frequency: 3,
      strength: 8,
      trend: 'increasing',
      lastOccurrence: '2 days ago'
    }
  ];

  const getLoopColor = (type: string) => {
    switch (type) {
      case 'empowering': return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
      case 'limiting': return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
      default: return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return <TrendingUp size={16} className="text-green-600" />;
      case 'decreasing': return <TrendingUp size={16} className="text-red-600 rotate-180" />;
      default: return <ArrowRight size={16} className="text-gray-600" />;
    }
  };

  const getStrengthColor = (strength: number) => {
    if (strength >= 8) return 'bg-red-500';
    if (strength >= 6) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-700">
              {behaviorLoops.filter(l => l.type === 'empowering').length}
            </div>
            <p className="text-sm text-green-600">Empowering Loops</p>
          </CardContent>
        </Card>
        
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-700">
              {behaviorLoops.filter(l => l.type === 'limiting').length}
            </div>
            <p className="text-sm text-red-600">Limiting Loops</p>
          </CardContent>
        </Card>
        
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-700">
              {Math.round(behaviorLoops.reduce((acc, l) => acc + l.frequency, 0) / 7)}
            </div>
            <p className="text-sm text-blue-600">Daily Average</p>
          </CardContent>
        </Card>
      </div>

      {/* Behavior Loops List */}
      <div className="space-y-4">
        <h3 className="font-bold text-gray-900 text-lg">Detected Behavior Loops</h3>
        
        {behaviorLoops.map((loop) => {
          const colors = getLoopColor(loop.type);
          
          return (
            <Card 
              key={loop.id} 
              className={`${colors.bg} ${colors.border} border cursor-pointer transition-all duration-200 hover:shadow-md ${
                selectedLoop?.id === loop.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => setSelectedLoop(selectedLoop?.id === loop.id ? null : loop)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <RotateCcw size={16} className={colors.text} />
                    <h4 className={`font-semibold ${colors.text}`}>{loop.name}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {getTrendIcon(loop.trend)}
                    <Badge variant="outline" className="text-xs">
                      {loop.frequency}/week
                    </Badge>
                  </div>
                </div>

                {/* Loop Flow Visualization */}
                <div className="flex items-center gap-2 text-sm mb-3">
                  <div className="flex-1 p-2 bg-white/60 rounded border">
                    <span className="text-xs text-gray-600">TRIGGER</span>
                    <p className={`font-medium ${colors.text}`}>{loop.trigger}</p>
                  </div>
                  
                  <ArrowRight size={16} className="text-gray-400" />
                  
                  <div className="flex-1 p-2 bg-white/60 rounded border">
                    <span className="text-xs text-gray-600">RESPONSE</span>
                    <p className={`font-medium ${colors.text}`}>{loop.response}</p>
                  </div>
                  
                  <ArrowRight size={16} className="text-gray-400" />
                  
                  <div className="flex-1 p-2 bg-white/60 rounded border">
                    <span className="text-xs text-gray-600">RESULT</span>
                    <p className={`font-medium ${colors.text}`}>{loop.result}</p>
                  </div>
                </div>

                {/* Loop Strength Indicator */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Strength:</span>
                    <div className="flex gap-1">
                      {[...Array(10)].map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full ${
                            i < loop.strength ? getStrengthColor(loop.strength) : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-semibold">{loop.strength}/10</span>
                  </div>
                  
                  <span className="text-xs text-gray-600">Last: {loop.lastOccurrence}</span>
                </div>

                {/* Expanded Details */}
                {selectedLoop?.id === loop.id && (
                  <div className="mt-4 pt-4 border-t border-white/50">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        {loop.type === 'limiting' ? (
                          <AlertTriangle size={16} className="text-amber-600" />
                        ) : (
                          <TrendingUp size={16} className="text-green-600" />
                        )}
                        <span className="text-sm font-medium">
                          {loop.type === 'limiting' ? 'Intervention Opportunity' : 'Amplification Strategy'}
                        </span>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          className={
                            loop.type === 'limiting' 
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'bg-green-600 hover:bg-green-700 text-white'
                          }
                        >
                          {loop.type === 'limiting' ? 'Create Circuit Breaker' : 'Strengthen Loop'}
                        </Button>
                        
                        <Button size="sm" variant="outline">
                          Smart Nudge
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default LoopMapping;
