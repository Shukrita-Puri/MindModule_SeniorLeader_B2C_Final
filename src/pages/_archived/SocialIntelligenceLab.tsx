import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/_archived/MainNavigation";
import TopNavigation from "@/components/simulation/TopNavigation";
import dialogueHeroImage from "@/assets/dialogue-room-hero.jpg";

const SocialIntelligenceLab = () => {
  const navigate = useNavigate();

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <TopNavigation backPath="/executive-home" />
      
      {/* Hero Section */}
      <div className="relative w-full h-[35vh] md:h-[45vh] overflow-hidden">
        <img 
          src={dialogueHeroImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[rgba(255,240,230,0.25)]" />
        
        <div className="absolute inset-0 flex items-center justify-center">
          <h1 
            className="text-5xl md:text-7xl lg:text-8xl font-editorial font-normal tracking-tight text-center px-6 bg-gradient-to-br from-[#6B5610] via-[#8B6914] to-[#B8860B] bg-clip-text text-transparent"
            style={{ 
              filter: 'drop-shadow(0 4px 20px rgba(0, 0, 0, 0.6)) drop-shadow(0 8px 40px rgba(0, 0, 0, 0.4))' 
            }}
          >
            Dialogue Room
          </h1>
        </div>
      </div>

      {/* Compressed Editorial Content */}
      <div className="flex-1 flex flex-col justify-center py-8 md:py-12">
        <div className="max-w-2xl mx-auto px-6 md:px-10 text-center">
          
          {/* Deck */}
          <h2 className="font-editorial text-2xl md:text-3xl lg:text-4xl text-foreground leading-tight mb-6 tracking-tight">
            Rehearse the conversations that define you.
          </h2>

          {/* Divider */}
          <div className="flex items-center justify-center mb-6">
            <div className="w-10 h-px bg-gold/40"></div>
          </div>

          {/* Condensed Copy */}
          <p className="font-body text-sm md:text-base text-muted-foreground leading-relaxed mb-8 max-w-xl mx-auto">
            Every word matters. Hone your influence with an AI counterpart, exquisitely attuned. Where precision meets empathy.
          </p>

          {/* CTA */}
          <button
            onClick={() => navigate('/practice/configure')}
            className="group relative px-8 py-3 text-sm md:text-base font-body font-medium text-foreground border border-foreground/20 hover:border-foreground/40 transition-all duration-500 tracking-wide"
          >
            <span className="relative z-10">Enter the Dialogue Room</span>
            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-all duration-500"></div>
          </button>

        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default SocialIntelligenceLab;
