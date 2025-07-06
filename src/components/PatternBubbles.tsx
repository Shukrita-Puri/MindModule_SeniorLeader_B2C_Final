
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Bubble {
  id: string;
  emotion: string;
  intensity: number;
  frequency: number;
  trend: 'up' | 'down' | 'stable';
  color: string;
  size: number;
  x: number;
  y: number;
}

const PatternBubbles = () => {
  const [selectedBubble, setSelectedBubble] = useState<Bubble | null>(null);

  const bubbles: Bubble[] = [
    {
      id: '1',
      emotion: 'Confidence',
      intensity: 85,
      frequency: 12,
      trend: 'up',
      color: '#10b981',
      size: 60,
      x: 25,
      y: 30
    },
    {
      id: '2', 
      emotion: 'Anxiety',
      intensity: 45,
      frequency: 8,
      trend: 'down',
      color: '#f59e0b',
      size: 40,
      x: 70,
      y: 20
    },
    {
      id: '3',
      emotion: 'Focus',
      intensity: 92,
      frequency: 15,
      trend: 'up',
      color: '#8b5cf6',
      size: 65,
      x: 45,
      y: 60
    },
    {
      id: '4',
      emotion: 'Clarity',
      intensity: 78,
      frequency: 10,
      trend: 'stable',
      color: '#06b6d4',
      size: 50,
      x: 15,
      y: 75
    },
    {
      id: '5',
      emotion: 'Overwhelm',
      intensity: 32,
      frequency: 5,
      trend: 'down',
      color: '#ef4444',
      size: 35,
      x: 80,
      y: 70
    }
  ];

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return '↗';
      case 'down': return '↘';
      default: return '→';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return 'text-green-600';
      case 'down': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <Card className="bg-white/60 backdrop-blur-sm border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">Emotional Pattern Map</CardTitle>
        <p className="text-sm text-gray-600">Bubble size = intensity, position = frequency clusters</p>
      </CardHeader>
      <CardContent>
        <div className="relative h-64 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl overflow-hidden">
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-20">
            <svg width="100%" height="100%">
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#cbd5e1" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          {/* Bubbles */}
          {bubbles.map((bubble) => (
            <div
              key={bubble.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300 hover:scale-110"
              style={{
                left: `${bubble.x}%`,
                top: `${bubble.y}%`,
                width: `${bubble.size}px`,
                height: `${bubble.size}px`,
              }}
              onClick={() => setSelectedBubble(selectedBubble?.id === bubble.id ? null : bubble)}
            >
              <div
                className="w-full h-full rounded-full flex items-center justify-center text-white font-semibold shadow-lg animate-pulse"
                style={{
                  backgroundColor: bubble.color,
                  opacity: 0.8,
                }}
              >
                <span className="text-xs text-center leading-tight">
                  {bubble.emotion}
                </span>
              </div>
              
              {/* Trend indicator */}
              <div className={`absolute -top-1 -right-1 text-lg ${getTrendColor(bubble.trend)}`}>
                {getTrendIcon(bubble.trend)}
              </div>
            </div>
          ))}

          {/* Connection lines for related emotions */}
          <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
            <line
              x1="25%" y1="30%"
              x2="45%" y2="60%"
              stroke="#8b5cf6"
              strokeWidth="2"
              strokeDasharray="5,5"
              opacity="0.3"
            />
            <line
              x1="70%" y1="20%"
              x2="80%" y2="70%"
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="5,5"
              opacity="0.3"
            />
          </svg>
        </div>

        {/* Selected bubble details */}
        {selectedBubble && (
          <div className="mt-4 p-4 bg-white/80 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-lg" style={{ color: selectedBubble.color }}>
                {selectedBubble.emotion}
              </h4>
              <Badge variant="outline" className={getTrendColor(selectedBubble.trend)}>
                {selectedBubble.trend} {getTrendIcon(selectedBubble.trend)}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Intensity:</span>
                <span className="ml-2 font-semibold">{selectedBubble.intensity}%</span>
              </div>
              <div>
                <span className="text-gray-600">Frequency:</span>
                <span className="ml-2 font-semibold">{selectedBubble.frequency}/week</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PatternBubbles;
