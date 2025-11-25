import { useNavigate } from "react-router-dom";
import useScrollToTop from "@/hooks/useScrollToTop";
import { Button } from "@/components/ui/button";
import { Music } from "lucide-react";
import TopNavigation from "@/components/simulation/TopNavigation";
import architecturalPowerUp from "@/assets/architectural-power-up.jpg";
import { sanctuaryContent } from "@/data/practicesAndSoundscapes";

const PowerUpSession = () => {
  const navigate = useNavigate();
  useScrollToTop(); // Scroll to top when this page loads

  // Filter soundscapes for power-up category
  const powerUpSoundscapes = sanctuaryContent.filter(
    (content) => content.category === 'power-up' && content.contentType === 'soundbath'
  );

  const extractTechniqueTease = (technique: string) => {
    // Get first sentence as a tease
    const sentences = technique.split('. ');
    return sentences[0] + '.';
  };

  return (
    <div className="min-h-screen font-body pb-32">
      <TopNavigation backPath="/recalibrate" />
      
      <div className="px-8 py-20 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="w-28 h-28 mx-auto mb-8 rounded-sm bg-card border border-border overflow-hidden shadow-md">
            <img 
              src={architecturalPowerUp} 
              alt="Power Up"
              className="w-full h-full object-cover img-card"
            />
          </div>
          
          <h2 className="text-2xl font-headline font-medium text-foreground mb-4 leading-tight">
            Power Up
          </h2>
          
          <p className="text-muted-foreground font-body leading-relaxed">
            Energy Boost Before Big moments or during Low energy moments
          </p>
        </div>

        {/* Content Cards */}
        <div className="space-y-8">
          {powerUpSoundscapes.map((soundscape, index) => (
            <article 
              key={soundscape.id}
              className="group cursor-pointer bg-card border border-border rounded-sm p-8 hover:border-gold/30 transition-all duration-300 animate-fade-in hover:shadow-lg hover:-translate-y-1"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-full bg-muted/30 border border-border flex items-center justify-center flex-shrink-0 group-hover:border-gold/40 group-hover:bg-primary/5 transition-all duration-300">
                    <Music size={20} className="text-secondary group-hover:text-primary transition-colors duration-300" strokeWidth={1.5} />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-headline font-medium text-foreground group-hover:text-primary transition-colors">
                        {soundscape.title}
                      </h3>
                      <span className="px-3 py-1 bg-muted rounded-full text-xs font-body text-muted-foreground">
                        {soundscape.duration} min
                      </span>
                    </div>
                    
                    <p className="text-sm text-muted-foreground font-body mb-4 leading-relaxed">
                      {soundscape.storyHook}
                    </p>
                    
                    <p className="text-muted-foreground font-body leading-relaxed text-sm">
                      {extractTechniqueTease(soundscape.technique)}
                    </p>
                  </div>
                </div>
                
                <div className="ml-6 flex-shrink-0">
                  <div className="w-20 h-20 rounded-sm overflow-hidden border border-border group-hover:border-gold/40 transition-all">
                    <img 
                      src={soundscape.thumbnail} 
                      alt={soundscape.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
              
              <div className="pt-6 border-t border-border">
                <Button 
                  variant="default"
                  className="w-full rounded-sm py-3 font-body"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/soundscapes/${soundscape.id}`);
                  }}
                >
                  Begin session
                </Button>
              </div>
            </article>
          ))}
        </div>
        
        {/* Back to tools */}
        <div className="text-center mt-16 pt-12 border-t border-gold/20">
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

export default PowerUpSession;