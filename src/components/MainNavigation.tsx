
import { Users2, Home, Zap } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const MainNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Define all pages that should highlight the Practice button
  const practicePages = [
    "/practice",
    "/practice/simulation",
    "/practice/simulation-insights"
  ];

  // Define all pages that should highlight the Recalibrate button
  const recalibratePages = [
    "/recalibrate",
    "/recalibrate/emergency-reset",
    "/recalibrate/power-up",
    "/recalibrate/breathing",
    "/recalibrate/pause",
    "/recalibrate/flow-state"
  ];

  const navItems = [
    { 
      icon: Home, 
      label: "Home", 
      route: "/executive-home",
      isActive: location.pathname === "/executive-home"
    },
    { 
      icon: Users2, 
      label: "Practice", 
      route: "/practice",
      isActive: practicePages.includes(location.pathname)
    },
    { 
      icon: Zap, 
      label: "Recalibrate", 
      route: "/recalibrate",
      isActive: recalibratePages.some(path => location.pathname.startsWith(path.split('/').slice(0, 3).join('/'))) || location.pathname === "/recalibrate"
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
