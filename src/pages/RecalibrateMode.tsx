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
              <div className="bg-card border border-gold/10 rounded-lg overflow-hidden shadow-sm hover:shadow-xl hover:border-gold/30 transition-all duration-500">
                {/* Image Container */}
                <div className="relative w-full aspect-square overflow-hidden bg-gradient-to-br from-background to-muted">
                  <img 
                    src={tool.illustration} 
                    alt={tool.title}
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                  />
                  {/* Subtle overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-card/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>
                
                {/* Content */}
                <div className="p-8 space-y-3">
                  <h3 className="text-2xl font-headline font-medium text-foreground group-hover:text-primary transition-colors duration-300">
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