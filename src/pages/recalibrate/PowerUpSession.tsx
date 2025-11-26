import { useNavigate } from "react-router-dom";
import useScrollToTop from "@/hooks/useScrollToTop";
import { Button } from "@/components/ui/button";
import { Clock, Sparkles } from "lucide-react";
import TopNavigation from "@/components/simulation/TopNavigation";
import phoenixRisingHero from "@/assets/phoenix-rising-hero.png";

const PowerUpSession = () => {
  const navigate = useNavigate();
  useScrollToTop();

  return (
    <div className="min-h-screen font-body pb-32">
      <TopNavigation backPath="/recalibrate" />
      
      <div className="px-8 py-20 max-w-lg mx-auto">
        {/* Header with Phoenix Visual */}
        <div className="text-center mb-10">
          {/* Hero Visual */}
          <div className="w-full max-w-sm mx-auto mb-8 aspect-[4/3] rounded-2xl overflow-hidden shadow-lg">
            <img 
              src={phoenixRisingHero} 
              alt="Phoenix Rising"
              className="w-full h-full object-cover"
              style={{ filter: 'brightness(1.0) contrast(1.05) saturate(1.15)' }}
            />
          </div>
          
          <h2 className="text-2xl font-headline font-medium text-foreground mb-3 leading-tight">
            Resilience Through The Phoenix
          </h2>
          
          <p className="text-muted-foreground font-body leading-relaxed italic">
            Reframe setbacks into strength and clarity
          </p>

          {/* Duration/Steps Badges */}
          <div className="flex items-center justify-center gap-4 mt-5">
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm text-muted-foreground">
              <Clock size={14} /> 2 min
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm text-muted-foreground">
              <Sparkles size={14} /> 4 Steps
            </span>
          </div>
        </div>

        {/* Trigger & When to Use Sections */}
        <div className="space-y-6 text-left bg-card border border-border rounded-xl p-6 mb-8">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Best For</h4>
            <p className="text-foreground leading-relaxed">
              Setbacks, failures, rejection, unexpected obstacles, moments when you feel defeated
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">When to Use</h4>
            <p className="text-foreground leading-relaxed">
              After any loss, rejection, failure, or mistake — big or small. When you need to move from 'what happened to me' to 'what I do next.'
            </p>
          </div>
        </div>

        {/* Source Attribution */}
        <p className="text-xs text-muted-foreground text-center italic mb-8">
          Growth through adversity — a pattern observed across millennia — Stoic Amor Fati (love of fate) + Growth Mindset Research (Dweck)
        </p>

        {/* Begin Practice Button */}
        <Button 
          className="w-full rounded-xl py-6 text-base font-body"
          onClick={() => navigate('/micro-practice/buddhist-phoenix/cards')}
        >
          Begin Practice
        </Button>
        
        {/* Back to tools */}
        <div className="text-center mt-8">
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
