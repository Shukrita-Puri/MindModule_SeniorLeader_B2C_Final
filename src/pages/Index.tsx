import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import { Shield } from "lucide-react";
import clarityIllustration from "@/assets/clarity-illustration.png";
import recalibrateIllustration from "@/assets/recalibrate-illustration.png";
import practiceIllustration from "@/assets/practice-session-illustration.png";
import inkFocusIllustration from "@/assets/ink-focus-illustration.png";
import futurescapeIllustration from "@/assets/futurescape-illustration.png";

const Index = () => {
  const navigate = useNavigate();

  const handleModeSelect = (route: string) => {
    // Skip breathwork for Recalibrate mode - go directly
    if (route === "/recalibrate") {
      navigate('/recalibrate');
      return;
    }
    
    // Navigate to breathwork first, then to the actual mode for other modes
    navigate('/breathwork', { state: { targetRoute: route } });
  };

  const modes = [
    {
      id: "mental-clarity",
      title: "Mental Clarity",
      subtitle: "Drag mental noise into a trash zone",
      illustration: clarityIllustration,
      route: "/clarity"
    },
    {
      id: "inner-calibration",
      title: "Inner Calibration",
      subtitle: "Reset when you're feeling: Stressed • Overthinking • Looking to Level Up",
      illustration: recalibrateIllustration,
      route: "/recalibrate"
    },
    {
      id: "social-intelligence",
      title: "Social Intelligence",
      subtitle: "Practice difficult conversations before they happen",
      illustration: practiceIllustration,
      route: "/social-intelligence-lab"
    },
    {
      id: "flow-state",
      title: "Flow State",
      subtitle: "Focus zones with Pomodoro and ambient visuals",
      illustration: inkFocusIllustration,
      route: "/flow-state-lab"
    },
    {
      id: "identity-growth",
      title: "Identity + Growth",
      subtitle: "Visual map of traits, values, milestones",
      illustration: futurescapeIllustration,
      route: "/futurescape"
    }
  ];

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
      {/* Security Watermark */}
      <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-2 rounded-full text-xs text-muted-foreground border border-border">
        <Shield size={14} />
        <span>Secure</span>
      </div>

      {/* Hero Section - Mobile Optimized */}
      <div className="px-6 py-8 sm:px-8 sm:py-16 text-center max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-heading font-medium text-foreground mb-4 sm:mb-6 leading-tight">
          Inner Architect
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Your cognitive companion for clarity and growth
        </p>
      </div>

      {/* Simplified Mode Selection */}
      <div className="flex-1 px-6 sm:px-8 pb-32">
        <div className="max-w-lg mx-auto space-y-6 sm:space-y-8">
          {modes.map((mode, index) => (
            <div
              key={mode.id}
              onClick={() => handleModeSelect(mode.route)}
              className="group cursor-pointer animate-fade-in"
              style={{ animationDelay: `${index * 200}ms` }}
            >
              {/* Ink Illustration for contemplative modes */}
              <div className="mb-4 sm:mb-6 flex justify-center">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-card border border-border overflow-hidden group-hover:scale-105 transition-transform duration-300">
                  <img 
                    src={mode.illustration} 
                    alt={mode.title}
                    className="w-full h-full object-contain p-2 opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                </div>
              </div>
              
              {/* Minimal Text */}
              <div className="text-center space-y-1 sm:space-y-2">
                <h3 className="text-lg sm:text-xl font-heading font-medium text-foreground group-hover:text-primary transition-colors">
                  {mode.title}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground px-2">
                  {mode.subtitle}
                </p>
              </div>
              
              {/* Subtle Divider */}
              {index < modes.length - 1 && (
                <div className="mt-8 sm:mt-12 flex justify-center">
                  <div className="w-6 h-px bg-border"></div>
                </div>
              )}
            </div>
          ))}
          
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default Index;
