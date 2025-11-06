import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import MainNavigation from "@/components/MainNavigation";
import TopNavigation from "@/components/simulation/TopNavigation";
import useScrollToTop from "@/hooks/useScrollToTop";
import vibrantVoiceOrb from "@/assets/vibrant-voice-orb.png";
import vibrantPracticeIllustration from "@/assets/vibrant-practice-illustration.png";
import vibrantMentorIllustration from "@/assets/vibrant-mentor-illustration.png";
import sanctuaryBanner from "@/assets/sanctuary-watercolor-banner.jpg";

const RecalibrateMode = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useScrollToTop();

  // Check if we're on a nested route (session page)
  const isSessionPage = location.pathname !== '/recalibrate';

  const tools = [
    {
      id: "power-up", 
      title: "Power Up",
      description: "Energy boost before big moments or during low energy moments",
      illustration: vibrantVoiceOrb,
      path: "/recalibrate/power-up"
    },
    {
      id: "pause",
      title: "Pause",
      description: "Breathing exercises and calming sounds for reset and restoration",
      illustration: vibrantPracticeIllustration,
      path: "/recalibrate/pause"
    },
    {
      id: "presence",
      title: "Presence",
      description: "Deep focus sessions and soundscapes for peak performance",
      illustration: vibrantMentorIllustration,
      path: "/recalibrate/presence"
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
      <div className="flex-1 px-6 md:px-8 max-w-5xl mx-auto pb-32 pt-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {tools.map((tool, index) => (
            <article 
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              className="group cursor-pointer animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="bg-card/85 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_20px_rgba(0,217,255,0.1)] hover:shadow-[0_12px_48px_rgba(0,0,0,0.5),0_0_40px_rgba(0,217,255,0.2)] hover:-translate-y-1 transition-all duration-500">
                {/* Image Container */}
                <div className="relative w-full aspect-square overflow-hidden bg-gradient-to-br from-card to-background">
                  <img 
                    src={tool.illustration} 
                    alt={tool.title}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                    style={{ filter: 'brightness(0.7) contrast(1.2)' }}
                  />
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-card/80 via-transparent to-transparent" />
                  {/* Glow on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>
                
                {/* Content */}
                <div className="p-8 space-y-3">
                  <h3 className="text-2xl font-headline font-semibold text-foreground group-hover:text-primary transition-colors duration-300">
                    {tool.title}
                  </h3>
                  
                  <p className="text-sm text-muted-foreground leading-relaxed font-body">
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
        <MainNavigation />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNavigation backPath="/executive-home" />
      
      {/* Hero Banner - Architectural Style */}
      <div className="relative h-[30vh] overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-card to-background" />
        
        <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10">
          <h1 className="text-5xl font-headline mb-2 text-foreground tracking-tight">
            Sanctuary
          </h1>
          <p className="text-lg font-subheadline italic text-muted-foreground">
            Reset. Restore. Refocus.
          </p>
        </div>
      </div>

      {/* Tool Selection */}
      {renderToolSelection()}
      
      <MainNavigation />
    </div>
  );
};

export default RecalibrateMode;