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
      <div className="flex-1 px-8 max-w-2xl mx-auto pb-32 pt-16">
        <div className="space-y-12">
          {tools.map((tool, index) => (
            <article 
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              className="group cursor-pointer border-b border-gold/20 pb-12 last:border-b-0 animate-fade-in hover:bg-primary/5 transition-all"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              <div className="flex items-start gap-8">
                <div className="w-20 h-20 rounded-sm bg-card border border-gold/20 overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform shadow-md">
                  <img 
                    src={tool.illustration} 
                    alt={tool.title}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                </div>
                
                <div className="flex-1 min-w-0 pt-2">
                  <h3 className="text-xl font-headline font-medium text-foreground group-hover:text-primary transition-colors mb-3">
                    {tool.title}
                  </h3>
                  
                  <p className="text-base text-muted-foreground leading-relaxed font-body">
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
    <div className="min-h-screen font-body flex flex-col">
      <TopNavigation backPath="/executive-home" />
      
      {/* Hero Banner with Watercolor */}
      <div className="relative w-full h-[400px] md:h-[60vh] overflow-hidden">
        {/* Background Image */}
        <img 
          src={sanctuaryBanner} 
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        
        {/* Stronger overlay for text visibility */}
        <div className="absolute inset-0 bg-[rgba(245,225,210,0.30)]" />
        
        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <h1 
            className="text-5xl md:text-7xl lg:text-8xl font-headline font-bold mb-4 bg-gradient-to-br from-[#6B5610] via-[#8B6914] to-[#B8860B] bg-clip-text text-transparent"
            style={{ 
              filter: 'drop-shadow(0 4px 20px rgba(0, 0, 0, 0.6)) drop-shadow(0 8px 40px rgba(0, 0, 0, 0.4)) drop-shadow(0 2px 12px rgba(139, 105, 20, 0.5))' 
            }}
          >
            Sanctuary Studio
          </h1>
          <p 
            className="text-lg md:text-xl text-gold/90 font-body"
            style={{ 
              textShadow: '0 4px 20px rgba(0, 0, 0, 0.6), 0 2px 12px rgba(200, 179, 119, 0.5)' 
            }}
          >
            Your space to reset and restore
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {renderToolSelection()}
      </div>

      <MainNavigation />
    </div>
  );
};

export default RecalibrateMode;