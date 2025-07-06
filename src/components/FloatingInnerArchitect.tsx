
import { useState } from "react";
import { Brain, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const FloatingInnerArchitect = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [insights] = useState([
    "This question relates to your leadership development goals from last month",
    "Consider connecting this insight to your Futurescape vision",
    "This mentor's perspective aligns with the CRAFT framework's Awareness stage"
  ]);

  return (
    <div className="fixed bottom-20 right-4 z-40">
      {isExpanded ? (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-80 max-h-60 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Brain size={16} className="text-white" />
              </div>
              <span className="font-medium text-gray-800">Inner Architect</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsExpanded(false)}
              className="h-6 w-6 p-0"
            >
              <X size={14} />
            </Button>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-2">Contextual insights:</p>
            {insights.map((insight, index) => (
              <div key={index} className="bg-amber-50 p-2 rounded text-xs text-gray-700 border-l-2 border-amber-400">
                {insight}
              </div>
            ))}
            <Button size="sm" className="w-full mt-3 bg-amber-500 hover:bg-amber-600 text-white text-xs">
              Explore These Connections
            </Button>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setIsExpanded(true)}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white shadow-lg"
        >
          <Brain size={20} />
        </Button>
      )}
    </div>
  );
};

export default FloatingInnerArchitect;
