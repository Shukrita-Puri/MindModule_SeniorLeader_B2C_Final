import { useNavigate } from "react-router-dom";
import useScrollToTop from "@/hooks/useScrollToTop";
import { Button } from "@/components/ui/button";
import { Heart, Timer, Waves, Brain } from "lucide-react";
import ClearBackButton from "@/components/ClearBackButton";
import vibrantBreathworkHero from "@/assets/vibrant-breathwork-hero.png";

const BreathworkSession = () => {
  const navigate = useNavigate();
  useScrollToTop(); // Scroll to top when this page loads

  const content = [
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

  return (
    <div className="min-h-screen bg-background font-editorial pb-32">
      <ClearBackButton />
      
      <div className="px-8 py-12 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-card border border-border overflow-hidden">
            <img 
              src={vibrantBreathworkHero} 
              alt="Breathe & Center"
              className="w-full h-full object-cover opacity-80"
            />
          </div>
          
          <h2 className="text-2xl font-heading font-medium text-foreground mb-4 leading-tight">
            Breathe & Center
          </h2>
          
          <p className="text-muted-foreground font-body">
            Guided breathing for test anxiety and pressure
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

    </div>
  );
};

export default BreathworkSession;