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
        
        {/* Translucent overlay for text visibility */}
        <div className="absolute inset-0 bg-black/30" />
        
        {/* Hero Title - No box, pure text shadow luxury */}
        <div className="absolute inset-0 flex items-center justify-center">
          <h1 
            className="text-5xl md:text-7xl lg:text-8xl font-headline font-bold text-gold text-center px-6"
            style={{ 
              textShadow: '0 4px 20px rgba(0, 0, 0, 0.6), 0 8px 40px rgba(0, 0, 0, 0.4), 0 2px 12px rgba(200, 179, 119, 0.5)' 
            }}
          >
            Dialogue Room
          </h1>
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

              <p className="text-base md:text-lg lg:text-xl text-center leading-relaxed mb-3">
                <span className="text-foreground font-normal">This is where </span>
                <span className="text-gold font-bold text-lg md:text-xl lg:text-2xl">precision meets empathy</span>
                <span className="text-foreground font-normal">.</span>
              </p>

              <p className="text-base md:text-lg lg:text-xl text-center leading-relaxed">
                <span className="text-foreground font-normal">Where </span>
                <span className="text-gold font-bold text-lg md:text-xl lg:text-2xl">confidence is not performed, but practiced</span>
                <span className="text-foreground font-normal">.</span>
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
