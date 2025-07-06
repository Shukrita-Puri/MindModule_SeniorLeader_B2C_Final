import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import { Shield } from "lucide-react";
import clarityIllustration from "@/assets/clarity-illustration.png";
import recalibrateIllustration from "@/assets/recalibrate-illustration.png";
import mentorIllustration from "@/assets/mentor-illustration.png";
import scenarioIllustration from "@/assets/scenario-illustration.png";
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
      subtitle: "Tap how you feel → get matching practices",
      illustration: recalibrateIllustration,
      route: "/recalibrate"
    },
    {
      id: "social-intelligence",
      title: "Social Intelligence",
      subtitle: "Replay social convos and reflect on tone",
      illustration: mentorIllustration,
      route: "/mentor"
    },
    {
      id: "flow-state",
      title: "Flow State",
      subtitle: "Set focus zones with ambient visuals",
      illustration: scenarioIllustration,
      route: "/scenario-lab"
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

      {/* Hero Section - Minimal */}
      <div className="px-8 py-20 text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-heading font-medium text-foreground mb-8 leading-tight">
          Inner Architect
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Your cognitive companion for clarity and growth
        </p>
      </div>

      {/* Simplified Mode Selection */}
      <div className="flex-1 px-8">
        <div className="max-w-lg mx-auto space-y-12">
          {modes.map((mode, index) => (
            <div
              key={mode.id}
              onClick={() => handleModeSelect(mode.route)}
              className="group cursor-pointer animate-fade-in"
              style={{ animationDelay: `${index * 200}ms` }}
            >
              {/* Ink Illustration for contemplative modes */}
              <div className="mb-8 flex justify-center">
                <div className="w-24 h-24 rounded-full bg-card border border-border overflow-hidden group-hover:scale-105 transition-transform duration-300">
                  <img 
                    src={mode.illustration} 
                    alt={mode.title}
                    className="w-full h-full object-contain p-3 opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                </div>
              </div>
              
              {/* Minimal Text */}
              <div className="text-center space-y-3">
                <h3 className="text-2xl font-heading font-medium text-foreground group-hover:text-primary transition-colors">
                  {mode.title}
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed">
                  {mode.subtitle}
                </p>
              </div>
              
              {/* Subtle Divider */}
              {index < modes.length - 1 && (
                <div className="mt-16 flex justify-center">
                  <div className="w-8 h-px bg-border"></div>
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
