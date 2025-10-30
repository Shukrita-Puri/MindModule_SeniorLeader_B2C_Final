import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import MainNavigation from "@/components/MainNavigation";
import TopNavigation from "@/components/simulation/TopNavigation";
import dialogueHeroImage from "@/assets/dialogue-room-hero.jpg";

const SocialIntelligenceLab = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background font-body flex flex-col">
      <TopNavigation backPath="/executive-home" />
      
      {/* Hero Section with Full-Width Image */}
      <div className="relative w-full h-[400px] md:h-[60vh] overflow-hidden">
        {/* Background Hero Image */}
        <img 
          src={dialogueHeroImage}
          alt="Dialogue Room"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        
        {/* Translucent overlay for text visibility */}
        <div className="absolute inset-0 bg-[rgba(255,240,230,0.35)]" />
        
        {/* Hero Title */}
        <div className="absolute inset-0 flex items-center justify-center">
          <h1 
            className="text-5xl md:text-7xl lg:text-8xl font-headline font-bold text-center px-6 bg-gradient-to-br from-[#6B5610] via-[#8B6914] to-[#B8860B] bg-clip-text text-transparent"
            style={{ 
              filter: 'drop-shadow(0 4px 20px rgba(0, 0, 0, 0.6)) drop-shadow(0 8px 40px rgba(0, 0, 0, 0.4)) drop-shadow(0 2px 12px rgba(139, 105, 20, 0.5))' 
            }}
          >
            Dialogue Room
          </h1>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 px-6 md:px-8 max-w-4xl mx-auto pb-32 pt-20">
        <div className="bg-card border border-gold/10 rounded-lg shadow-sm hover:shadow-xl transition-all duration-500 p-10 md:p-14">
          {/* Headline */}
          <h2 className="text-center font-headline font-medium text-foreground text-2xl md:text-3xl mb-10 leading-tight">
            Rehearse the conversations that define you.
          </h2>

          {/* Body Copy */}
          <div className="space-y-6 text-center mb-12 max-w-2xl mx-auto">
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed font-body">
              Every word matters. Every tone resonates.
            </p>

            <p className="text-base md:text-lg text-muted-foreground leading-relaxed font-body">
              Hone your influence with an AI counterpart, exquisitely attuned.
            </p>

            <p className="text-base md:text-lg text-muted-foreground leading-relaxed font-body">
              Where <span className="font-medium text-primary">Precision meets empathy. Confidence is cultivated.</span>
            </p>

            <p className="text-base md:text-lg text-muted-foreground leading-relaxed font-body">
              Enter a private chamber of preparation. Shape the conversation before it shapes you.
            </p>
          </div>

          {/* Subtle Divider */}
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent mx-auto mb-10"></div>

          {/* CTA Button */}
          <div className="flex justify-center">
            <Button
              onClick={() => navigate('/practice/configure')}
              size="lg"
              className="px-12 py-6 text-lg font-medium shadow-lg hover:shadow-xl transition-all duration-300"
            >
              Enter the Dialogue Room
            </Button>
          </div>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default SocialIntelligenceLab;
