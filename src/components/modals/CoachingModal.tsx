import { useState, useEffect } from "react";
import { X, Lightbulb, Star, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CoachingModalProps {
  message: string;
  type: "coaching" | "achievement" | "blindspot";
  isOpen: boolean;
  onClose: () => void;
  autoClose?: boolean;
  duration?: number;
}

const CoachingModal = ({
  message,
  type,
  isOpen,
  onClose,
  autoClose = true,
  duration = 4000
}: CoachingModalProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      if (autoClose) {
        const timer = setTimeout(() => {
          handleClose();
        }, duration);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, autoClose, duration]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const getModalConfig = () => {
    switch (type) {
      case "coaching":
        return {
          icon: <Lightbulb size={16} />,
          bgColor: "bg-blue-50 border-blue-200",
          iconColor: "text-blue-600 bg-blue-100",
          title: "Coaching Tip"
        };
      case "achievement":
        return {
          icon: <Star size={16} />,
          bgColor: "bg-yellow-50 border-yellow-200",
          iconColor: "text-yellow-600 bg-yellow-100",
          title: "Achievement!"
        };
      case "blindspot":
        return {
          icon: <Target size={16} />,
          bgColor: "bg-orange-50 border-orange-200",
          iconColor: "text-orange-600 bg-orange-100",
          title: "Blind Spot"
        };
      default:
        return {
          icon: <Lightbulb size={16} />,
          bgColor: "bg-gray-50 border-gray-200",
          iconColor: "text-gray-600 bg-gray-100",
          title: "Feedback"
        };
    }
  };

  const config = getModalConfig();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className={cn(
          "absolute inset-0 bg-black/20 transition-opacity duration-300",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div
        className={cn(
          "relative w-full max-w-sm bg-white rounded-lg border shadow-lg transition-all duration-300 transform",
          config.bgColor,
          isVisible 
            ? "translate-y-0 opacity-100 scale-100" 
            : "translate-y-4 opacity-0 scale-95"
        )}
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={cn("p-2 rounded-full", config.iconColor)}>
                {config.icon}
              </div>
              <Badge variant="secondary" className="text-xs font-medium">
                {config.title}
              </Badge>
            </div>
            
            <Button
              onClick={handleClose}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-white/50"
            >
              <X size={14} />
            </Button>
          </div>
          
          {/* Message */}
          <p className="text-sm text-gray-700 leading-relaxed mb-4">
            {message}
          </p>
          
          {/* Action */}
          <div className="flex justify-end">
            <Button
              onClick={handleClose}
              size="sm"
              variant="outline"
              className="px-4 py-2 text-xs bg-white hover:bg-gray-50"
            >
              Got it
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoachingModal;