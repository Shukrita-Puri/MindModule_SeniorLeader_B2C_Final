import { X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface EmotionBreakdownModalProps {
  emotion: "neutral" | "positive" | "negative" | "excited";
  exchangeCount: number;
  isOpen: boolean;
  onClose: () => void;
}

const EmotionBreakdownModal = ({
  emotion,
  exchangeCount,
  isOpen,
  onClose
}: EmotionBreakdownModalProps) => {
  if (!isOpen) return null;

  const getEmotionData = () => {
    switch (emotion) {
      case "positive":
        return {
          engagement: 85,
          tension: 25,
          receptivity: 90,
          trend: "improving",
          description: "The conversation is going well. They're engaged and receptive to your ideas."
        };
      case "negative":
        return {
          engagement: 45,
          tension: 75,
          receptivity: 30,
          trend: "declining",
          description: "Tension is rising. Consider acknowledging their concerns and finding common ground."
        };
      case "excited":
        return {
          engagement: 95,
          tension: 10,
          receptivity: 95,
          trend: "excellent",
          description: "Excellent! They're very engaged and excited about the direction of the conversation."
        };
      default:
        return {
          engagement: 60,
          tension: 40,
          receptivity: 65,
          trend: "stable",
          description: "Neutral state. Good opportunity to make a stronger impression."
        };
    }
  };

  const data = getEmotionData();

  const getTrendIcon = () => {
    switch (data.trend) {
      case "improving":
      case "excellent":
        return <TrendingUp size={14} className="text-green-600" />;
      case "declining":
        return <TrendingDown size={14} className="text-red-600" />;
      default:
        return <Minus size={14} className="text-gray-600" />;
    }
  };

  const getTrendColor = () => {
    switch (data.trend) {
      case "improving":
      case "excellent":
        return "text-green-600 bg-green-50 border-green-200";
      case "declining":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-sm bg-white rounded-lg border shadow-lg animate-fade-in">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Emotional Analysis
            </h3>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
            >
              <X size={14} />
            </Button>
          </div>
          
          {/* Current State */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600">Current State</span>
              <Badge 
                variant="secondary" 
                className={cn("text-xs", getTrendColor())}
              >
                <div className="flex items-center gap-1">
                  {getTrendIcon()}
                  {emotion}
                </div>
              </Badge>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              {data.description}
            </p>
          </div>
          
          {/* Metrics */}
          <div className="space-y-3 mb-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-600">Engagement</span>
                <span className="font-medium">{data.engagement}%</span>
              </div>
              <Progress value={data.engagement} className="h-2" />
            </div>
            
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-600">Tension Level</span>
                <span className="font-medium">{data.tension}%</span>
              </div>
              <Progress 
                value={data.tension} 
                className="h-2"
              />
            </div>
            
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-600">Receptivity</span>
                <span className="font-medium">{data.receptivity}%</span>
              </div>
              <Progress value={data.receptivity} className="h-2" />
            </div>
          </div>
          
          {/* Stats */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Exchanges completed</span>
              <span className="font-medium">{exchangeCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmotionBreakdownModal;