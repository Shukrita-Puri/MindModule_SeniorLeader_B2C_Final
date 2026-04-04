
import { useState } from "react";
import { Compass, Calendar, Heart, Target, Users, X, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface SmartNudgeProps {
  id: string;
  title: string;
  message: string;
  type: "practice" | "recalibrate" | "sos";
  context?: string;
  urgency: "low" | "medium" | "high";
  onDismiss?: () => void;
  onAction?: () => void;
  timestamp: Date;
}

const SmartNudge = ({ 
  title, 
  message, 
  type, 
  context, 
  urgency, 
  onDismiss, 
  onAction,
  timestamp 
}: SmartNudgeProps) => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(true);

  const getIcon = () => {
    switch (type) {
      case "practice": return Users;
      case "recalibrate": return Heart;
      case "sos": return Heart;
      default: return Compass;
    }
  };

  const getAccentColor = () => {
    return "bg-hyper-coral";
  };

  const handleAction = () => {
    const routes = {
      practice: "/practice",
      recalibrate: "/recalibrate",
      sos: "/recalibrate"
    };
    
    navigate(routes[type]);
    onAction?.();
  };

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  const Icon = getIcon();

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
      {/* Notification Header */}
      <div className="flex items-center justify-between p-4 pb-3 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img src="/lovable-uploads/76cee14b-c6a7-4d75-8162-8a5ba6f74a9d.png" alt="Mind Module" className="w-8 h-8" />
            <div>
              <h4 className="font-bold text-black text-base">Mind Module</h4>
              <p className="text-gray-500 text-xs">
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <div className={`p-2.5 rounded-full ${getAccentColor()}`}>
            <Icon size={20} className="text-white" />
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Notification Content */}
      <div className="px-4 pb-4 bg-white">
        <h3 className="font-bold text-black text-[15px] mb-2 leading-tight">{title}</h3>
        <p className="text-gray-700 text-sm leading-relaxed mb-3">{message}</p>
        
        {context && (
          <div className="bg-gray-50 rounded-lg px-3 py-2 mb-4 border border-gray-100">
            <p className="text-gray-600 text-xs italic">
              {context}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleAction}
            size="sm"
            className="flex-1 font-semibold text-white border-0 bg-muted-foreground hover:bg-muted-foreground/80"
          >
            <ChevronRight size={14} className="mr-1" />
            Take Action
          </Button>
          <Button
            onClick={handleDismiss}
            variant="ghost"
            size="sm"
            className="text-gray-600 hover:text-gray-800 hover:bg-gray-100 font-medium px-4 border border-gray-200"
          >
            Later
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SmartNudge;
