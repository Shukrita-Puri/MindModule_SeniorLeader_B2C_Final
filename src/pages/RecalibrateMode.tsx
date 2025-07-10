import { ArrowLeft, Zap, Waves, Brain, Heart, Wind, Mountain, Compass, Timer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import MainNavigation from "@/components/MainNavigation";
import ClearBackButton from "@/components/ClearBackButton";
import vibrantExecutiveOrb from "@/assets/vibrant-executive-orb.png";
import vibrantVoiceOrb from "@/assets/vibrant-voice-orb.png";
import vibrantBreathworkHero from "@/assets/vibrant-breathwork-hero.png";
import vibrantPracticeIllustration from "@/assets/vibrant-practice-illustration.png";
import vibrantMentorIllustration from "@/assets/vibrant-mentor-illustration.png";

const RecalibrateMode = () => {
  const navigate = useNavigate();
  const [selectedTool, setSelectedTool] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const tools = [
    {
      id: "emergency-reset",
      title: "Emergency Reset",
      description: "3-minute grounding when everything feels overwhelming",
      illustration: vibrantExecutiveOrb
    },
    {
      id: "power-up", 
      title: "Power Up",
      description: "Energy Boost Before Big moments or during Low energy moments",
      illustration: vibrantVoiceOrb
    },
    {
      id: "breathing",
      title: "Breathe & Center",
      description: "Guided breathing for test anxiety and pressure",
      illustration: vibrantBreathworkHero
    },
    {
      id: "pause",
      title: "Quick Reset",
      description: "Calming sounds for study breaks",
      illustration: vibrantPracticeIllustration
    }
  ];

  const handleToolSelect = (toolId: string) => {
    setSelectedTool(toolId);
    
    if (toolId === "emergency-reset") {
      setIsResetting(true);
      // Auto-return after 3 minutes
      setTimeout(() => {
        setIsResetting(false);
        setSelectedTool("");
      }, 180000);
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
            icon: Brain,
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
            visual: "🧠"
          },
          {
            title: "Kapalabhati Breath",
            subtitle: "Skull-shining breath technique",
            duration: "3 min",
            description: "Ancient yogic practice increases oxygen to prefrontal cortex for mental clarity",
            type: "Rapid cleansing breaths",
            icon: Wind,
            visual: "💨"
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
      case "breathing":
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
            icon: Brain,
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
          }
        ];
      case "pause":
        return [
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
            icon: Brain,
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
            icon: Brain,
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
      default:
        return [];
    }
  };

  const renderEmergencyReset = () => (
    <div className="px-8 py-20 text-center max-w-2xl mx-auto">
      <div className="w-40 h-40 mx-auto mb-12 rounded-full overflow-hidden shadow-xl border-4 border-accent/20">
        <img 
          src={vibrantExecutiveOrb} 
          alt="Emergency reset and grounding"
          className="w-full h-full object-cover"
        />
      </div>
      
      <h2 className="text-2xl font-heading font-medium text-foreground mb-12">
        Emergency Reset Active
      </h2>
      
      <div className="bg-card border border-border rounded-lg p-12 mb-16 text-left">
        <div className="space-y-8">
          <div>
            <h3 className="font-heading font-medium text-foreground mb-4 text-lg">Present Moment</h3>
            <p className="text-muted-foreground font-body leading-relaxed">
              Notice: You are here, now, in this moment. You are safe.
            </p>
          </div>
          
          <div>
            <h3 className="font-heading font-medium text-foreground mb-4 text-lg">Body Reset</h3>
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
        onClick={() => {
          setIsResetting(false);
          setSelectedTool("");
        }}
        className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 text-lg font-body rounded-full"
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
          
          <h2 className="text-2xl font-heading font-medium text-foreground mb-4 leading-tight">
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
              className="group cursor-pointer bg-card border border-border rounded-lg p-8 hover:border-primary/20 transition-all animate-fade-in hover:shadow-lg"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                    <item.icon size={20} className="text-primary" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-heading font-medium text-foreground group-hover:text-primary transition-colors">
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
                  className="w-full bg-background border border-border text-foreground hover:bg-muted rounded-full py-3 font-body"
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
        <div className="text-center mt-16 pt-12 border-t border-border">
          <Button 
            variant="ghost"
            onClick={() => setSelectedTool("")}
            className="text-muted-foreground hover:text-foreground font-body"
          >
            Choose different tool
          </Button>
        </div>
      </div>
    );
  };

  const renderToolSelection = () => (
    <>
      {/* Hero Section */}
      <div className="px-8 py-20 text-center max-w-2xl mx-auto">
        <div className="w-40 h-40 mx-auto mb-12 rounded-full overflow-hidden shadow-xl border-4 border-accent/20">
          <img 
            src="/lovable-uploads/c72cc661-d2db-48b0-b39a-d5c4bb2253d3.png" 
            alt="Inner calibration and balance"
            className="w-full h-full object-cover"
          />
        </div>
        
        <h2 className="text-3xl font-heading font-medium text-foreground mb-8 leading-tight">
          Inner Calibrate
        </h2>
        
        <p className="text-lg text-muted-foreground leading-relaxed mb-16">
          Reset when you're feeling:<br/>
          <span className="text-sm italic">Stressed • Overthinking • Looking to Level Up</span>
        </p>
      </div>

      {/* Tools Selection */}
      <div className="flex-1 px-8 max-w-2xl mx-auto pb-16">
        <div className="space-y-12">
          {tools.map((tool, index) => (
            <article 
              key={tool.id}
              onClick={() => handleToolSelect(tool.id)}
              className="group cursor-pointer border-b border-border pb-12 last:border-b-0 animate-fade-in"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              <div className="flex items-start gap-8">
                <div className="w-20 h-20 rounded-full bg-card border border-border overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                  <img 
                    src={tool.illustration} 
                    alt={tool.title}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                </div>
                
                <div className="flex-1 min-w-0 pt-2">
                  <h3 className="text-xl font-heading font-medium text-foreground group-hover:text-primary transition-colors mb-3">
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

        {/* Quick Grounding */}
        <div className="mt-20 pt-16 border-t border-border">
          <div className="text-center mb-12">
            <h3 className="text-xl font-heading font-medium text-foreground mb-4">
              Quick Grounding
            </h3>
            <p className="text-muted-foreground font-body">
              Right now, notice
            </p>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-8 space-y-4">
            <div className="grid grid-cols-1 gap-4 text-center">
              <div className="flex items-center justify-between">
                <span className="text-lg font-heading font-medium text-foreground">5</span>
                <span className="text-muted-foreground font-body">Things you can see</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-heading font-medium text-foreground">4</span>
                <span className="text-muted-foreground font-body">Things you can touch</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-heading font-medium text-foreground">3</span>
                <span className="text-muted-foreground font-body">Things you can hear</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-heading font-medium text-foreground">2</span>
                <span className="text-muted-foreground font-body">Things you can smell</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-heading font-medium text-foreground">1</span>
                <span className="text-muted-foreground font-body">Thing you can taste</span>
              </div>
            </div>
          </div>
        </div>

        {/* Crisis Resources */}
        <div className="mt-16 pt-12 border-t border-border">
          <div className="text-center mb-8">
            <h3 className="text-lg font-heading font-medium text-foreground mb-4">
              Need immediate support?
            </h3>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-8 space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-body">Crisis Line</span>
              <a href="tel:988" className="text-xl font-heading font-medium text-primary hover:underline">
                988
              </a>
            </div>
            <div className="w-full h-px bg-border"></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-body">Crisis Text</span>
              <span className="text-foreground font-body">
                Text HOME to <span className="font-mono text-primary">741741</span>
              </span>
            </div>
            <div className="w-full h-px bg-border"></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-body">Emergency</span>
              <a href="tel:911" className="text-xl font-heading font-medium text-primary hover:underline">
                911
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
      <ClearBackButton />
      {/* Minimal Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/inner-architect")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h1 className="text-xl font-heading font-medium text-foreground">
          Reset
        </h1>
        <div className="w-10"></div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {isResetting ? renderEmergencyReset() : 
         selectedTool && selectedTool !== "emergency-reset" ? renderContentGrid(selectedTool) : 
         renderToolSelection()}
      </div>

      <MainNavigation />
    </div>
  );
};

export default RecalibrateMode;