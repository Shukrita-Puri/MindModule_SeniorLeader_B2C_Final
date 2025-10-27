import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import MainNavigation from "@/components/MainNavigation";
import dialogueHeroImage from "@/assets/dialogue-room-hero.jpg";

const SocialIntelligenceLab = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with Full-Width Image */}
      <div className="relative w-full h-[400px] md:h-[60vh] overflow-hidden">
        {/* Background Hero Image */}
        <img 
          src={dialogueHeroImage}
          alt="Dialogue Room"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        
        {/* Layered Title with Gradient Backdrop */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative px-8 py-6 mx-4">
            {/* Gradient backdrop - tone-on-tone cream-to-taupe */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#F5F0E9]/60 via-[#E8DFD3]/50 to-[#DDD0C0]/40 rounded-2xl" />
            
            {/* Title with forest green color, bold, larger size, text shadow */}
            <h1 
              className="relative text-4xl md:text-6xl font-headline font-bold text-forest text-center z-10"
              style={{ textShadow: '0 2px 12px rgba(0, 0, 0, 0.3), 0 4px 24px rgba(0, 0, 0, 0.15)' }}
            >
              Dialogue Room
            </h1>
          </div>
        </div>
      </div>

      {/* Content Box - Overlaps Hero Image */}
      <div className="container mx-auto px-4 pb-24">
        <div className="max-w-3xl mx-auto -mt-20 relative z-10">
          <div className="bg-[rgba(245,240,233,0.75)] backdrop-blur-[12px] rounded-[20px] px-6 md:px-8 py-8 md:py-10">
            {/* First Line - Bold */}
            <p className="text-center font-semibold text-foreground text-lg md:text-xl mb-6">
              Rehearse the conversations that matter — before they do.
            </p>

            {/* Second Line - Italic, Smaller */}
            <p className="text-center italic text-muted-foreground text-base md:text-lg mb-6">
              Every word carries weight. Every tone, a ripple through perception.
            </p>

            {/* Copy with Typography Hierarchy - All Centered */}
            <div className="space-y-4 text-center mb-8">
              <p className="text-sm md:text-base text-foreground/90 leading-relaxed">
                Here, you enter a private chamber of preparation — a reflective space where mastery begins in silence.
              </p>

              <p className="text-sm md:text-base text-foreground/90 leading-relaxed">
                Refine your influence within a dialogue that listens as deeply as it speaks.
              </p>

              <p className="text-sm md:text-base text-foreground/90 leading-relaxed">
                Your AI counterpart is composed, perceptive, and meticulously attuned to your voice.
              </p>

              <p className="text-sm md:text-base text-gold font-bold leading-relaxed">
                This is where precision meets empathy. Where confidence is not performed, but practiced.
              </p>

              <p className="text-sm md:text-base text-foreground/90 leading-relaxed">
                Step inside. Shape the conversation before it shapes you.
              </p>
            </div>

            {/* CTA Button */}
            <div className="flex justify-center mt-8">
              <Button
                onClick={() => navigate('/practice/configure')}
                variant="forest"
                size="lg"
                className="w-full max-w-md text-lg shadow-[0_8px_24px_rgba(61,111,95,0.2)]"
              >
                Enter the Dialogue Room
              </Button>
            </div>
          </div>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default SocialIntelligenceLab;
