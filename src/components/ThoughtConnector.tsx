
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ThoughtNode {
  id: string;
  thought: string;
  category: 'trigger' | 'belief' | 'outcome';
  strength: number;
  x: number;
  y: number;
  color: string;
}

interface Connection {
  from: string;
  to: string;
  strength: number;
  type: 'positive' | 'negative' | 'neutral';
}

const ThoughtConnector = () => {
  const [selectedNode, setSelectedNode] = useState<ThoughtNode | null>(null);

  const nodes: ThoughtNode[] = [
    {
      id: 'trigger1',
      thought: 'Big Decision',
      category: 'trigger',
      strength: 8,
      x: 20,
      y: 30,
      color: '#ef4444'
    },
    {
      id: 'belief1',
      thought: 'I need perfect info',
      category: 'belief',
      strength: 7,
      x: 50,
      y: 20,
      color: '#f59e0b'
    },
    {
      id: 'belief2',
      thought: 'Trust intuition',
      category: 'belief',
      strength: 9,
      x: 50,
      y: 60,
      color: '#10b981'
    },
    {
      id: 'outcome1',
      thought: 'Analysis paralysis',
      category: 'outcome',
      strength: 6,
      x: 80,
      y: 25,
      color: '#ef4444'
    },
    {
      id: 'outcome2',
      thought: 'Swift clarity',
      category: 'outcome',
      strength: 8,
      x: 80,
      y: 65,
      color: '#10b981'
    }
  ];

  const connections: Connection[] = [
    { from: 'trigger1', to: 'belief1', strength: 7, type: 'negative' },
    { from: 'trigger1', to: 'belief2', strength: 8, type: 'positive' },
    { from: 'belief1', to: 'outcome1', strength: 9, type: 'negative' },
    { from: 'belief2', to: 'outcome2', strength: 9, type: 'positive' }
  ];

  const getNodeSize = (strength: number) => 10 + strength * 3;

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'trigger': return 'Trigger';
      case 'belief': return 'Belief';
      case 'outcome': return 'Outcome';
      default: return category;
    }
  };

  const getConnectionColor = (type: string) => {
    switch (type) {
      case 'positive': return '#10b981';
      case 'negative': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <Card className="bg-white/60 backdrop-blur-sm border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">Thought Pattern Connections</CardTitle>
        <p className="text-sm text-gray-600">How your thoughts link trigger → belief → outcome</p>
      </CardHeader>
      <CardContent>
        <div className="relative h-64 bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl overflow-hidden">
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-10">
            <svg width="100%" height="100%">
              <defs>
                <radialGradient id="nodeGradient">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8"/>
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2"/>
                </radialGradient>
              </defs>
            </svg>
          </div>

          {/* Connections */}
          <svg className="absolute inset-0 w-full h-full">
            {connections.map((conn, index) => {
              const fromNode = nodes.find(n => n.id === conn.from);
              const toNode = nodes.find(n => n.id === conn.to);
              if (!fromNode || !toNode) return null;

              return (
                <line
                  key={index}
                  x1={`${fromNode.x}%`}
                  y1={`${fromNode.y}%`}
                  x2={`${toNode.x}%`}
                  y2={`${toNode.y}%`}
                  stroke={getConnectionColor(conn.type)}
                  strokeWidth={conn.strength / 2}
                  strokeDasharray={conn.type === 'negative' ? '5,5' : '0'}
                  opacity="0.7"
                  className="animate-pulse"
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map((node) => (
            <div
              key={node.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300 hover:scale-110"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
              }}
              onClick={() => setSelectedNode(selectedNode?.id === node.id ? null : node)}
            >
              <div
                className="rounded-full flex items-center justify-center text-white text-xs font-semibold shadow-lg border-2 border-white"
                style={{
                  backgroundColor: node.color,
                  width: `${getNodeSize(node.strength)}px`,
                  height: `${getNodeSize(node.strength)}px`,
                }}
              >
                {node.strength}
              </div>
              
              {/* Node label */}
              <div className="absolute top-full mt-1 left-1/2 transform -translate-x-1/2 text-xs text-center whitespace-nowrap">
                <div className="bg-white/90 px-2 py-1 rounded-lg shadow-sm border">
                  <div className="font-semibold text-gray-900">{node.thought}</div>
                  <div className="text-gray-600 text-xs">{getCategoryLabel(node.category)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Selected node details */}
        {selectedNode && (
          <div className="mt-4 p-4 bg-white/80 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-lg" style={{ color: selectedNode.color }}>
                {selectedNode.thought}
              </h4>
              <Badge variant="outline">
                {getCategoryLabel(selectedNode.category)}
              </Badge>
            </div>
            <div className="text-sm">
              <span className="text-gray-600">Pattern Strength:</span>
              <span className="ml-2 font-semibold">{selectedNode.strength}/10</span>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                <div 
                  className="h-2 rounded-full"
                  style={{ 
                    backgroundColor: selectedNode.color,
                    width: `${selectedNode.strength * 10}%` 
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex justify-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span>Triggers</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
            <span>Limiting Beliefs</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span>Empowering Beliefs</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ThoughtConnector;
