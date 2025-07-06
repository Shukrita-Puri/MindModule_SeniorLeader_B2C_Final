
import { User, Home, BarChart3 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const MainNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Define all pages that should highlight the Inner Architect button
  const innerArchitectPages = [
    "/inner-architect",
    "/clarity",
    "/clarity-summary", 
    "/scenario-lab",
    "/simulation",
    "/simulation-insights",
    "/futurescape",
    "/mentor",
    "/mentor-chat",
    "/recalibrate",
    "/memory-archive",
    "/nudge-settings",
    "/nudge-simulator"
  ];

  const navItems = [
    { 
      icon: Home, 
      label: "Home", 
      route: "/executive-home",
      isActive: location.pathname === "/executive-home"
    },
    { 
      icon: User, 
      label: "Practice", 
      route: "/inner-architect",
      isActive: innerArchitectPages.includes(location.pathname)
    },
    { 
      icon: BarChart3, 
      label: "Insights", 
      route: "/mind-vault",
      isActive: location.pathname === "/mind-vault"
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50">
      <div className="flex justify-around items-center py-6 px-4 max-w-md mx-auto">
        {navItems.map((item, index) => (
          <button
            key={index}
            onClick={() => navigate(item.route)}
            className={`flex flex-col items-center gap-2 py-3 px-4 rounded-xl transition-all duration-300 ${
              item.isActive 
                ? "text-primary" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className={`transition-transform duration-200 ${item.isActive ? 'scale-110' : ''}`}>
              <item.icon 
                size={20} 
                fill={item.isActive ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={item.isActive ? 1.5 : 1.5}
              />
            </div>
            <span className={`text-xs font-body transition-all duration-200 ${
              item.isActive ? 'font-medium' : ''
            }`}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MainNavigation;
