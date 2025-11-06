
import { UsersRound, Home, Zap } from "lucide-react";
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
      label: "Mind Atelier", 
      route: "/executive-home",
      isActive: location.pathname === "/executive-home"
    },
    { 
      icon: Zap, 
      label: "Sanctuary", 
      route: "/recalibrate",
      isActive: recalibratePages.some(path => location.pathname.startsWith(path.split('/').slice(0, 3).join('/'))) || location.pathname === "/recalibrate"
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-[40px] border-t border-black/[0.08] shadow-[0_-2px_16px_rgba(0,0,0,0.06)]">
      <div className="flex justify-around items-center py-2 px-4 max-w-md mx-auto">
        {navItems.map((item) => (
          <button
            key={item.route}
            onClick={() => navigate(item.route)}
            className={`flex flex-col items-center justify-center min-w-[60px] py-2 px-3 rounded-lg transition-all duration-300 relative ${
              item.isActive 
                ? "" 
                : "opacity-60 hover:opacity-100 hover:bg-black/[0.03]"
            }`}
          >
            {/* Active Indicator Line - Taupe color */}
            {item.isActive && (
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
            )}
            
            <item.icon 
              size={item.isActive ? 26 : 24}
              className={`mb-1 transition-all duration-300 ${
                item.isActive 
                  ? "text-foreground" 
                  : "text-muted-foreground"
              }`}
            />
            <span 
              className={`text-xs transition-all duration-300 ${
                item.isActive 
                  ? "font-semibold text-foreground" 
                  : "text-muted-foreground"
              }`}
            >
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MainNavigation;
