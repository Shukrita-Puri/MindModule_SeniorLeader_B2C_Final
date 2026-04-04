import { useNavigate, useLocation, Outlet } from "react-router-dom";
import useScrollToTop from "@/hooks/useScrollToTop";
import FloatingNavigation from "@/components/navigation/FloatingNavigation";
import architecturalPowerUp from "@/assets/recalibrate/power-up/architectural-power-up.jpg";
import architecturalPause from "@/assets/recalibrate/pause/architectural-pause.jpg";
import architecturalPresence from "@/assets/recalibrate/presence/architectural-presence.jpg";

const RecalibrateMode = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useScrollToTop();

  // Check if we're on a nested route (session page)
  const isSessionPage = location.pathname !== '/recalibrate';

  const tools = [
    {
      id: "pause",
      title: "Pause Mastery",
      description: "Reset and restore composure, regain clarity, and maintain executive poise, in moments of intensity.",
      illustration: architecturalPause,
      path: "/recalibrate/pause"
    },
    {
      id: "presence",
      title: "Flow Mastery",
      description: "Enter deep focus, accelerate productivity, and sustain peak mental performance.",
      illustration: architecturalPresence,
      path: "/recalibrate/presence"
    },
    {
      id: "power-up", 
      title: "Recharge Mastery",
      description: "Rebuild energy, resilience, and readiness for high-stakes moments.",
      illustration: architecturalPowerUp,
      path: "/recalibrate/power-up"
    }
  ];

  const handleToolSelect = (toolId: string) => {
    const tool = tools.find(t => t.id === toolId);
    if (tool?.path) {
      navigate(tool.path);
    }
  };

  const renderToolSelection = () => (
    <>
      {/* Tools Selection */}
      <div className="flex-1 px-4 md:px-8 max-w-5xl mx-auto pb-32 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-10 auto-rows-fr">
          {tools.map((tool, index) => (
            <article 
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              className="group cursor-pointer animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="h-full bg-card/85 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_20px_rgba(0,217,255,0.1)] hover:shadow-[0_12px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(0,217,255,0.2)] hover:-translate-y-1 transition-all duration-500 flex flex-col">
                {/* Image Container */}
                <div className="relative w-full aspect-[4/3] overflow-hidden bg-card">
                  <img 
                    src={tool.illustration} 
                    alt={tool.title}
                    className="w-full h-full object-cover img-card img-taupe-overlay group-hover:scale-105 transition-all duration-700"
                  />
                  {/* Subtle gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-card/60 via-transparent to-transparent" />
                </div>
                
                {/* Content */}
                <div className="p-5 space-y-2">
                  <h3 className="text-[20px] sm:text-xl font-headline font-medium text-foreground group-hover:text-primary transition-colors duration-300">
                    {tool.title}
                  </h3>
                  
                  <p className="text-[13px] text-muted-foreground leading-relaxed font-body">
                    {tool.description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );

  // If we're on a session page, render the nested route
  if (isSessionPage) {
    return (
      <div className="min-h-screen font-body flex flex-col">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navigation - outside hero for consistent positioning */}
      <FloatingNavigation />

      {/* Hero Banner */}
      <div className="relative h-auto py-8 overflow-hidden">
        <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-3">
          <h1 className="text-[22px] sm:text-4xl font-headline mb-2 text-foreground tracking-tight">
            Reset Studio
          </h1>
          <p className="text-[13px] text-muted-foreground max-w-3xl mx-auto leading-relaxed context-clamp">
            Practical mind reset tools used by high performers – from centuries of proven techniques to modern execution. Mindset reframes, and Somatic protocols.
          </p>
        </div>
      </div>

      {/* Tool Selection */}
      {renderToolSelection()}
    </div>
  );
};

export default RecalibrateMode;