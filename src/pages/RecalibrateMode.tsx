import { Zap, Waves, Target, Heart, Wind, Mountain, Compass, Timer } from "lucide-react";
import { useNavigate, useSearchParams, useLocation, Outlet } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import MainNavigation from "@/components/MainNavigation";
import TopNavigation from "@/components/simulation/TopNavigation";
import useScrollToTop from "@/hooks/useScrollToTop";
import vibrantExecutiveOrb from "@/assets/vibrant-executive-orb.png";
import vibrantVoiceOrb from "@/assets/vibrant-voice-orb.png";
import vibrantBreathworkHero from "@/assets/vibrant-breathwork-hero.png";
import vibrantPracticeIllustration from "@/assets/vibrant-practice-illustration.png";
import vibrantMentorIllustration from "@/assets/vibrant-mentor-illustration.png";
import sanctuaryBanner from "@/assets/sanctuary-watercolor-banner.jpg";

const RecalibrateMode = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [selectedTool, setSelectedTool] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  useScrollToTop(); // Scroll to top when this page loads

  // Check if we're on a nested route (session page)
  const isSessionPage = location.pathname !== '/recalibrate';

  // Check for URL parameters and auto-select mode (only for base page)
  useEffect(() => {
    if (!isSessionPage) {
      const mode = searchParams.get('mode');
      if (mode && ['power-up', 'pause', 'presence'].includes(mode)) {
        navigate(`/recalibrate/${mode}`);
      }
    }
  }, [searchParams, navigate, isSessionPage]);

  const tools = [
    {
      id: "power-up", 
      title: "Power Up",
      description: "Energy boost before big moments or during low energy moments",
      illustration: vibrantVoiceOrb
    },
    {
      id: "pause",
      title: "Pause",
      description: "Breathing exercises and calming sounds for reset and restoration",
      illustration: vibrantPracticeIllustration
    },
    {
      id: "presence",
      title: "Presence",
      description: "Deep focus sessions and soundscapes for peak performance",
      illustration: vibrantMentorIllustration
    }
  ];

  const handleToolSelect = (toolId: string) => {
    // Navigate to the appropriate route for each tool
    if (toolId === "power-up") {
      navigate('/recalibrate/power-up');
    } else if (toolId === "pause") {
      navigate('/recalibrate/pause');
    } else if (toolId === "presence") {
      navigate('/recalibrate/presence');
    }
  };

  const getContentForTool = (toolId: string) => {
    switch(toolId) {
      case "power-up":
        return [
          {
            title: "40Hz Gamma Focus",
            subtitle: "Neural enhancement frequency",
            duration: "1 min",
            description: "MIT research shows 40Hz stimulation enhances cognitive performance and memory consolidation",
            type: "Binaural beats with guided breathing",
            icon: Target,
            visual: "⚡"
          },
          {
            title: "Wim Hof Method",
            subtitle: "Cold exposure breathing",
            duration: "2 min",
            description: "Dutch extreme athlete's technique proven to boost adrenaline and focus in seconds",
            type: "Power breathing sequence",
            icon: Zap,
            visual: "❄️"
          },
          {
            title: "Pranayama Power",
            subtitle: "Ancient Vedic energizing",
            duration: "90 sec",
            description: "Bhastrika breath technique used by Indian warriors before battle",
            type: "Rapid breathing with retention",
            icon: Wind,
            visual: "🔥"
          },
          {
            title: "Beta Wave Boost",
            subtitle: "13-30Hz alertness frequency",
            duration: "2 min",
            description: "Harvard studies confirm enhanced executive function and decision-making speed",
            type: "Cognitive enhancement audio",
            icon: Zap,
            visual: "⚡"
          },
          {
            title: "Kapalabhati Breath",
            subtitle: "Skull-shining breath technique",
            duration: "3 min",
            description: "Ancient yogic practice increases oxygen to prefrontal cortex for mental clarity",
            type: "Rapid cleansing breaths",
            icon: Wind,
            visual: "🌬️"
          },
          {
            title: "Caffeine Alternative",
            subtitle: "Natural energy activation",
            duration: "90 sec",
            description: "Combines tapping, movement, and breath to trigger natural dopamine release",
            type: "Movement-based energizer",
            icon: Compass,
            visual: "⚡"
          }
        ];
      case "pause":
        return [
          {
            title: "Coherent Breathing",
            subtitle: "HeartMath Institute protocol",
            duration: "3 min",
            description: "5-second inhale, 5-second exhale proven to optimize heart rate variability",
            type: "Heart-brain synchronization",
            icon: Heart,
            visual: "💓"
          },
          {
            title: "Box Breathing",
            subtitle: "Navy SEAL technique",
            duration: "2 min",
            description: "4-4-4-4 pattern used by elite military for stress regulation under pressure",
            type: "Tactical breathing",
            icon: Timer,
            visual: "⬜"
          },
          {
            title: "Sudarshan Kriya",
            subtitle: "Ancient Indian rhythmic breathing",
            duration: "4 min",
            description: "Stanford research confirms reduction in cortisol and increased emotional regulation",
            type: "Cyclical breathing patterns",
            icon: Waves,
            visual: "🌊"
          },
          {
            title: "4-7-8 Technique",
            subtitle: "Dr. Andrew Weil's method",
            duration: "2 min",
            description: "Activates parasympathetic nervous system for instant calm and clarity",
            type: "Calming breath pattern",
            icon: Heart,
            visual: "💫"
          },
          {
            title: "Alternate Nostril",
            subtitle: "Nadi Shodhana pranayama",
            duration: "5 min",
            description: "Ancient technique balances left-right brain hemisphere activity",
            type: "Brain balancing breath",
            icon: Compass,
            visual: "⚖️"
          },
          {
            title: "Resonance Breathing",
            subtitle: "6 breaths per minute",
            duration: "3 min",
            description: "Optimizes autonomic balance for peak cognitive and emotional performance",
            type: "Autonomic optimization",
            icon: Waves,
            visual: "〰️"
          },
          {
            title: "Forest Bathing",
            subtitle: "Japanese Shinrin-yoku",
            duration: "2 min",
            description: "Recorded nature sounds proven to reduce cortisol by 50% in executive studies",
            type: "Immersive nature soundscape",
            icon: Mountain,
            visual: "🌲"
          },
          {
            title: "Tibetan Singing Bowls",
            subtitle: "Ancient Himalayan healing",
            duration: "3 min",
            description: "432Hz frequencies align with Earth's natural vibration for deep restoration",
            type: "Sacred sound healing",
            icon: Compass,
            visual: "🎵"
          },
          {
            title: "Alpha Wave Music",
            subtitle: "8-12Hz brain entrainment",
            duration: "90 sec",
            description: "Neuroscience-backed frequencies for accessing calm, creative flow states",
            type: "Brainwave synchronization",
            icon: Compass,
            visual: "∼"
          },
          {
            title: "Ocean Waves",
            subtitle: "Binaural beach soundscape",
            duration: "4 min",
            description: "Pink noise patterns mimic womb sounds, triggering deep relaxation response",
            type: "Natural rhythm restoration",
            icon: Waves,
            visual: "🌊"
          },
          {
            title: "Monastery Bells",
            subtitle: "Tibetan temple recordings",
            duration: "3 min",
            description: "Low-frequency overtones activate vagus nerve for profound calm",
            type: "Sacred sound meditation",
            icon: Compass,
            visual: "🔔"
          },
          {
            title: "Theta Wave Journey",
            subtitle: "4-8Hz deep meditation",
            duration: "5 min",
            description: "Stanford research shows theta states enhance creativity and problem-solving",
            type: "Deep consciousness access",
            icon: Compass,
            visual: "✧"
          },
          {
            title: "Rain on Leaves",
            subtitle: "Amazon rainforest recording",
            duration: "2 min",
            description: "Natural white noise proven to lower stress hormones in C-suite executives",
            type: "Tropical restoration sounds",
            icon: Mountain,
            visual: "🍃"
          }
        ];
      case "presence":
        return [
          {
            title: "Deep Focus Session",
            subtitle: "40Hz Gamma entrainment",
            duration: "25 min",
            description: "MIT research shows 40Hz stimulation enhances focus and cognitive performance for extended periods",
            type: "Deep work optimization",
            icon: Target,
            visual: "🎯"
          },
          {
            title: "Binaural Study Flow",
            subtitle: "Beta-Alpha bridge frequency",
            duration: "45 min",
            description: "Combines alertness with relaxation for optimal learning and retention",
            type: "Study enhancement audio",
            icon: Waves,
            visual: "📚"
          },
          {
            title: "Pomodoro Flow",
            subtitle: "25-5 productivity cycle",
            duration: "30 min",
            description: "Time-tested technique with ambient focus music for sustained concentration",
            type: "Timed focus session",
            icon: Timer,
            visual: "⏱️"
          },
          {
            title: "Creative Flow State",
            subtitle: "Theta-Alpha bridge",
            duration: "20 min",
            description: "Access creative problem-solving while maintaining mental clarity",
            type: "Creative optimization",
            icon: Compass,
            visual: "✨"
          },
          {
            title: "Exam Mode",
            subtitle: "Peak performance state",
            duration: "60 min",
            description: "Extended focus protocol designed for high-stakes testing and performance",
            type: "Performance optimization",
            icon: Zap,
            visual: "🔥"
          },
          {
            title: "Library Ambience",
            subtitle: "Productive environment sounds",
            duration: "90 min",
            description: "Soft background sounds proven to enhance focus in academic settings",
            type: "Ambient focus soundscape",
            icon: Mountain,
            visual: "📖"
          }
        ];
      default:
        return [];
    }
  };

  const renderEmergencyReset = () => (
    <div className="px-8 py-20 text-center max-w-2xl mx-auto">
      <div className="w-full max-w-md aspect-[4/5] mx-auto mb-12 rounded-sm border border-gold/20 overflow-hidden shadow-lg">
        <img 
          src={vibrantExecutiveOrb} 
          alt="Emergency reset and grounding"
          className="w-full h-full object-cover"
        />
      </div>
      
      <h2 className="text-2xl font-headline font-medium text-foreground mb-12">
        Emergency Reset Active
      </h2>
      
      <div className="bg-card border border-gold/20 rounded-sm p-12 mb-16 text-left shadow-lg">
        <div className="space-y-8">
          <div>
            <h3 className="font-headline font-medium text-foreground mb-4 text-lg">Present Moment</h3>
            <p className="text-muted-foreground font-body leading-relaxed">
              Notice: You are here, now, in this moment. You are safe.
            </p>
          </div>
          
          <div>
            <h3 className="font-headline font-medium text-foreground mb-4 text-lg">Body Reset</h3>
            <div className="space-y-3 text-muted-foreground font-body leading-relaxed">
              <p>Drop your shoulders</p>
              <p>Relax your jaw</p>
              <p>Soften your belly</p>
              <p>Feel your feet on the ground</p>
            </div>
          </div>
        </div>
      </div>

      <Button
        variant="default"
        onClick={() => {
          setIsResetting(false);
          setSelectedTool("");
        }}
        className="px-12 py-4 text-lg font-body rounded-sm"
      >
        I'm ready to continue
      </Button>
    </div>
  );

  const renderContentGrid = (toolId: string) => {
    const content = getContentForTool(toolId);
    const tool = tools.find(t => t.id === toolId);
    
    return (
      <div className="px-8 py-12 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-card border border-border overflow-hidden">
            <img 
              src={tool?.illustration} 
              alt={tool?.title}
              className="w-full h-full object-cover opacity-80"
            />
          </div>
          
          <h2 className="text-2xl font-headline font-medium text-foreground mb-4 leading-tight">
            {tool?.title}
          </h2>
          
          <p className="text-muted-foreground font-body">
            {tool?.description}
          </p>
        </div>

        {/* Content Cards */}
        <div className="space-y-8">
          {content.map((item, index) => (
            <article 
              key={index}
              className="group cursor-pointer bg-card border border-border rounded-sm p-8 hover:border-gold/30 transition-all duration-300 animate-fade-in hover:shadow-lg hover:-translate-y-1"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-full bg-muted/30 border border-border flex items-center justify-center flex-shrink-0 group-hover:border-gold/40 group-hover:bg-primary/5 transition-all duration-300">
                    <item.icon size={20} className="text-secondary group-hover:text-primary transition-colors duration-300" strokeWidth={1.5} />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-headline font-medium text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <span className="px-3 py-1 bg-muted rounded-full text-xs font-body text-muted-foreground">
                        {item.duration}
                      </span>
                    </div>
                    
                    <p className="text-sm text-muted-foreground font-body mb-4 italic">
                      {item.subtitle}
                    </p>
                    
                    <p className="text-muted-foreground font-body leading-relaxed mb-4">
                      {item.description}
                    </p>
                    
                    <p className="text-sm text-muted-foreground font-body italic">
                      {item.type}
                    </p>
                  </div>
                </div>
                
                <div className="ml-6 flex-shrink-0">
                  <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center group-hover:bg-primary/5 transition-colors">
                    <span className="text-2xl opacity-80 group-hover:opacity-100 transition-opacity">{item.visual}</span>
                  </div>
                </div>
              </div>
              
              <div className="pt-6 border-t border-border">
                <Button 
                  variant="default"
                  className="w-full rounded-sm py-3 font-body"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Here you would integrate with audio player
                    console.log(`Playing: ${item.title}`);
                  }}
                >
                  Begin session
                </Button>
              </div>
            </article>
          ))}
        </div>
        
        {/* Back to tools */}
        <div className="text-center mt-16">
          {/* Gold Divider */}
          <div className="w-full h-px bg-gold/20 mb-12"></div>
          
          <Button 
            variant="ghost"
            onClick={() => setSelectedTool("")}
            className="text-muted-foreground hover:text-primary font-body"
          >
            Choose different tool
          </Button>
        </div>
      </div>
    );
  };

  const renderToolSelection = () => (
    <>
      {/* Tools Selection */}
      <div className="flex-1 px-8 max-w-2xl mx-auto pb-32 pt-16">
        <div className="space-y-12">
          {tools.map((tool, index) => (
            <article 
              key={tool.id}
              onClick={() => navigate(`/recalibrate/${tool.id}`)}
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
        {isResetting ? renderEmergencyReset() : selectedTool ? renderContentGrid(selectedTool) : renderToolSelection()}
      </div>

      <MainNavigation />
    </div>
  );
};

export default RecalibrateMode;