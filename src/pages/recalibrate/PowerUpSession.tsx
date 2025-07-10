import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, Zap, Wind, Compass } from "lucide-react";
import MainNavigation from "@/components/MainNavigation";
import ClearBackButton from "@/components/ClearBackButton";
import vibrantVoiceOrb from "@/assets/vibrant-voice-orb.png";

const PowerUpSession = () => {
  const navigate = useNavigate();

  const content = [
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

  return (
    <div className="min-h-screen bg-background font-editorial pb-32">
      <ClearBackButton />
      
      <div className="px-8 py-12 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-card border border-border overflow-hidden">
            <img 
              src={vibrantVoiceOrb} 
              alt="Power Up"
              className="w-full h-full object-cover opacity-80"
            />
          </div>
          
          <h2 className="text-2xl font-heading font-medium text-foreground mb-4 leading-tight">
            Power Up
          </h2>
          
          <p className="text-muted-foreground font-body">
            Energy Boost Before Big moments or during Low energy moments
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
            onClick={() => navigate('/recalibrate')}
            className="text-muted-foreground hover:text-foreground font-body"
          >
            Choose different tool
          </Button>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default PowerUpSession;