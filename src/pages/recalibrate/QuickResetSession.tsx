import { useNavigate } from "react-router-dom";
import useScrollToTop from "@/hooks/useScrollToTop";
import { Button } from "@/components/ui/button";
import { Mountain, Compass, Brain, Waves } from "lucide-react";
import ClearBackButton from "@/components/ClearBackButton";
import vibrantPracticeIllustration from "@/assets/vibrant-practice-illustration.png";

const QuickResetSession = () => {
  const navigate = useNavigate();
  useScrollToTop(); // Scroll to top when this page loads

  const content = [
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

  return (
    <div className="min-h-screen bg-background font-editorial pb-32">
      <ClearBackButton />
      
      <div className="px-8 py-12 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-card border border-border overflow-hidden">
            <img 
              src={vibrantPracticeIllustration} 
              alt="Quick Reset"
              className="w-full h-full object-cover opacity-80"
            />
          </div>
          
          <h2 className="text-2xl font-heading font-medium text-foreground mb-4 leading-tight">
            Quick Reset
          </h2>
          
          <p className="text-muted-foreground font-body">
            Calming sounds for study breaks
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

export default QuickResetSession;