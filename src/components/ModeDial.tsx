import { useState } from "react";
import { Brain, Users, Target, Heart, MessageCircle, CircleChevronUp as Zap } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { LucideIcon } from "lucide-react";

interface Mode {
  id: string;
  title: string;
  icon: LucideIcon;
  route: string;
  color: string;
}

const modes: Mode[] = [
  { id: "clarity", title: "Clarity", icon: Brain, route: "/clarity", color: "from-gray-400 to-gray-600" },
  { id: "scenario-lab", title: "Scenario", icon: Users, route: "/scenario-lab", color: "from-gray-400 to-gray-600" },
  { id: "futurescape", title: "Future", icon: Target, route: "/futurescape", color: "from-gray-400 to-gray-600" },
  { id: "mentor", title: "Mentor", icon: MessageCircle, route: "/mentor", color: "from-gray-400 to-gray-600" },
  { id: "recalibrate", title: "Recalibrate", icon: Heart, route: "/recalibrate", color: "from-gray-400 to-gray-600" },
];

const ModeDial = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  const getCurrentMode = () => {
    const currentPath = location.pathname;
    return modes.find(mode => currentPath.includes(mode.id))?.id || "clarity";
  };

  const currentMode = getCurrentMode();

  const handleModeSelect = (route: string) => {
    navigate(route);
  };

  const getCurrentModeIndex = () => {
    return modes.findIndex(mode => mode.id === currentMode);
  };

  
  return (
    <div 
      className="flex flex-col items-center gap-1 transition-all duration-300"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className={`flex flex-col items-center gap-1 transition-all duration-300 ${isExpanded ? 'opacity-100' : 'opacity-80'}`}>
        {modes.map((mode, index) => {
          const isActive = mode.id === currentMode;
          const Icon = mode.icon;
          
          return (
            <div
              key={mode.id}
              className={`
                flex items-center gap-2 cursor-pointer transition-all duration-300 group
                ${isExpanded ? 'translate-x-0' : index === getCurrentModeIndex() ? 'translate-x-0' : 'translate-x-6 opacity-0'}
                ${isActive ? 'scale-110' : 'scale-100 hover:scale-105'}
              `}
              onClick={() => handleModeSelect(mode.route)}
            >
              <div
                className={`
                  transition-all duration-300
                  ${isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-3'}
                `}
              >
                <span className={`
                  text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap
                  ${isActive 
                    ? 'bg-gray-100 text-black' 
                    : 'bg-white/90 text-gray-700 group-hover:bg-gray-50'
                  }
                `}>
                  {mode.title}
                </span>
              </div>
              
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all duration-300
                  ${isActive 
                    ? 'bg-hyper-coral text-white' 
                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-700'
                  }
                `}
              >
                <Icon size={16} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ModeDial;
