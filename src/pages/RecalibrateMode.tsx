import { useNavigate, useLocation, Outlet } from "react-router-dom";
import FloatingNavigation from "@/components/navigation/FloatingNavigation";
import architecturalPowerUp from "@/assets/recalibrate/power-up/architectural-power-up.jpg";
import architecturalPause from "@/assets/recalibrate/pause/architectural-pause.jpg";
import architecturalPresence from "@/assets/recalibrate/presence/architectural-presence.jpg";

const RecalibrateMode = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Check if we're on a nested route (session page)
  const isSessionPage = location.pathname !== '/recalibrate';

  const tools = [
    {
      id: "pause",
      title: "Pause Mastery",
      description: "Reset and restore composure, regain clarity, and maintain executive poise, in moments of intensity.",
      illustration: architecturalPause,
      path: "/recalibrate/pause",
      imagePosition: "object-top"
    },
    {
      id: "presence",
      title: "Flow Mastery",
      description: "Enter deep focus, accelerate productivity, and sustain peak mental performance.",
      illustration: architecturalPresence,
      path: "/recalibrate/presence",
      imagePosition: "object-top"
    },
    {
      id: "power-up", 
      title: "Recharge Mastery",
      description: "Rebuild energy, resilience, and readiness for high-stakes moments.",
      illustration: architecturalPowerUp,
      path: "/recalibrate/power-up",
      imagePosition: "object-[center_20%]"
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
      <div className="flex-1 px-4 md:px-8 max-w-5xl mx-auto pb-4 overflow-hidden">
        <div className="h-full flex flex-col gap-3 md:grid md:grid-cols-3 md:gap-6">
          {tools.map((tool, index) => (
            <article 
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              className="group cursor-pointer animate-fade-in flex-1 min-h-0"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="h-full bg-card/85 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:-translate-y-0.5 transition-all duration-500 flex flex-col">
                {/* Image */}
                <div className="relative flex-[2] min-h-0 overflow-hidden bg-card">
                  <img 
                    src={tool.illustration} 
                    alt={tool.title}
                    className={`w-full h-full object-cover img-card img-taupe-overlay group-hover:scale-105 transition-all duration-700 ${tool.imagePosition}`}
                  />
                </div>
                {/* Text on opaque background */}
                <div className="p-3 bg-card">
                  <h3 className="text-sm font-headline font-medium text-foreground group-hover:text-primary transition-colors duration-300">
                    {tool.title}
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-snug font-body mt-0.5 line-clamp-2">
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
    <div className="h-screen h-[100dvh] bg-background flex flex-col pt-16">
      {/* Navigation */}
      <FloatingNavigation />

      {/* Hero Banner — compact */}
      <div className="px-4 pt-4 pb-2 text-center">
        <h1 className="text-[24px] sm:text-4xl font-headline font-semibold text-foreground tracking-tight">
          Reset Studio
        </h1>
        <p className="text-[12px] text-muted-foreground max-w-3xl mx-auto leading-relaxed mt-1 context-clamp">
          Practical mind reset tools used by high performers – from centuries of proven techniques to modern execution.
        </p>
      </div>

      {/* Tool Selection — fills remaining space */}
      {renderToolSelection()}
    </div>
  );
};

export default RecalibrateMode;