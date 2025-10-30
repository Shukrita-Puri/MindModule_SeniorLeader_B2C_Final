import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import TopNavigation from "@/components/simulation/TopNavigation";
import dialogueHeroImage from "@/assets/dialogue-room-hero.jpg";

const SocialIntelligenceLab = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNavigation backPath="/executive-home" />
      
      {/* Hero Section */}
      <div className="relative w-full h-[50vh] md:h-[65vh] overflow-hidden">
        <img 
          src={dialogueHeroImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[rgba(255,240,230,0.25)]" />
        
        <div className="absolute inset-0 flex items-center justify-center">
          <h1 
            className="text-6xl md:text-8xl lg:text-9xl font-editorial font-normal tracking-tight text-center px-8 bg-gradient-to-br from-[#6B5610] via-[#8B6914] to-[#B8860B] bg-clip-text text-transparent"
            style={{ 
              filter: 'drop-shadow(0 4px 20px rgba(0, 0, 0, 0.6)) drop-shadow(0 8px 40px rgba(0, 0, 0, 0.4))' 
            }}
          >
            Dialogue Room
          </h1>
        </div>
      </div>

      {/* Editorial Content */}
      <div className="flex-1 py-24 md:py-32">
        <div className="max-w-3xl mx-auto px-8 md:px-12">
          
          {/* Deck / Subheading */}
          <h2 className="font-editorial text-3xl md:text-4xl lg:text-5xl text-foreground leading-tight text-center mb-16 tracking-tight">
            Rehearse the conversations<br className="hidden md:block" /> that define you.
          </h2>

          {/* Editorial Divider */}
          <div className="flex items-center justify-center mb-16">
            <div className="w-12 h-px bg-gold/40"></div>
          </div>

          {/* Body Copy - Magazine Editorial Style */}
          <div className="space-y-8 mb-20">
            <p className="font-body text-base md:text-lg text-muted-foreground leading-relaxed text-center">
              Every word matters. Every tone resonates.
            </p>

            <p className="font-body text-base md:text-lg text-muted-foreground leading-relaxed text-center">
              Hone your influence with an AI counterpart, exquisitely attuned.
            </p>

            <p className="font-body text-base md:text-lg text-foreground leading-relaxed text-center">
              Where precision meets empathy. <span className="italic">Confidence is cultivated.</span>
            </p>

            <p className="font-body text-base md:text-lg text-muted-foreground leading-relaxed text-center">
              Enter a private chamber of preparation.<br className="hidden md:block" /> Shape the conversation before it shapes you.
            </p>
          </div>

          {/* Refined CTA */}
          <div className="flex justify-center">
            <button
              onClick={() => navigate('/practice/configure')}
              className="group relative px-10 py-4 text-base md:text-lg font-body font-medium text-foreground border border-foreground/20 hover:border-foreground/40 transition-all duration-500 tracking-wide"
            >
              <span className="relative z-10">Enter the Dialogue Room</span>
              <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-all duration-500"></div>
            </button>
          </div>

        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default SocialIntelligenceLab;
