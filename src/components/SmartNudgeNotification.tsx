
import { useState, useEffect } from "react";
import { X, Brain, Users, Target, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface SmartNudgeNotificationProps {
  id: string;
  title: string;
  message: string;
  type: "clarity" | "scenario-lab" | "futurescape" | "mentor" | "sos";
  urgency: "low" | "medium" | "high";
  onDismiss?: () => void;
  onAction?: () => void;
  timestamp: Date;
  isVisible: boolean;
}

const SmartNudgeNotification = ({ 
  title, 
  message, 
  type, 
  urgency, 
  onDismiss, 
  onAction,
  timestamp,
  isVisible
}: SmartNudgeNotificationProps) => {
  const navigate = useNavigate();
  const [show, setShow] = useState(isVisible);

  useEffect(() => {
    setShow(isVisible);
  }, [isVisible]);

  const getIcon = () => {
    switch (type) {
      case "clarity": return Brain;
      case "scenario-lab": return Users;
      case "futurescape": return Target;
      case "mentor": return Brain;
      case "sos": return Heart;
      default: return Brain;
    }
  };

  const getUrgencyColor = () => {
    switch (urgency) {
      case "high": return "border-red-500 bg-red-50";
      case "medium": return "border-orange-500 bg-orange-50";
      case "low": return "border-blue-500 bg-blue-50";
      default: return "border-gray-300 bg-gray-50";
    }
  };

  const handleAction = () => {
    const routes = {
      clarity: "/clarity",
      "scenario-lab": "/scenario-lab",
      futurescape: "/futurescape",
      mentor: "/mentor",
      sos: "/breathwork"
    };
    
    navigate(routes[type]);
    onAction?.();
    setShow(false);
  };

  const handleDismiss = () => {
    setShow(false);
    onDismiss?.();
  };

  if (!show) return null;

  const Icon = getIcon();

  return (
    <div className={`fixed top-4 left-4 right-4 z-50 rounded-xl border-2 ${getUrgencyColor()} shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-300`}>
      {/* Lock Screen Style Header */}
      <div className="flex items-center justify-between p-3 bg-white/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-hyper-coral">
            <Icon size={16} className="text-white" />
          </div>
          <div>
            <h4 className="font-bold text-black text-sm">Mind Module</h4>
            <p className="text-gray-600 text-xs">
              {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <X size={18} />
        </button>
      </div>

      {/* Notification Content */}
      <div className="p-4 bg-white/95 backdrop-blur-sm">
        <h3 className="font-bold text-black text-base mb-2">{title}</h3>
        <p className="text-gray-700 text-sm mb-4 leading-relaxed">{message}</p>
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleAction}
            size="sm"
            className="flex-1 bg-hyper-coral hover:bg-red-600 text-white font-medium"
          >
            Open
          </Button>
          <Button
            onClick={handleDismiss}
            variant="ghost"
            size="sm"
            className="text-gray-600 hover:text-gray-800 hover:bg-gray-100"
          >
            Later
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SmartNudgeNotification;
