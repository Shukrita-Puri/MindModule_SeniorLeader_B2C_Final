import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import MainNavigation from "@/components/MainNavigation";

const SocialIntelligenceLab = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 pb-24">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          {/* Image with enhanced styling */}
          <div className="relative mx-auto w-full max-w-lg mb-12">
            {/* Subtle background glow */}
            <div className="absolute inset-0 bg-forest/5 blur-3xl rounded-full" />
            
            {/* Image container */}
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border-2 border-forest/20 shadow-[0_16px_48px_rgba(61,111,95,0.15)]">
              <img 
                src="/lovable-uploads/ae4d66fb-b3ea-4ef5-bfff-f228c447224c.png"
                alt="Dialogue Room - Practice conversations with precision"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Title & Copy with Typography Hierarchy */}
          <h1 className="text-4xl md:text-5xl font-headline font-medium text-forest mb-6">
            Dialogue Room
          </h1>
          
          <p className="italic text-muted-foreground text-lg mb-8">
            Rehearse the conversations in a private space, refine your influence, before they matter
          </p>

          <div className="space-y-4 text-left max-w-2xl mx-auto mb-12">
            <p className="text-xl md:text-2xl font-medium text-foreground leading-relaxed">
              Every word carries weight. Every tone, a ripple.
            </p>

            <p className="text-base text-foreground/90 leading-relaxed">
              Here, you practice the conversations that shape outcomes — <strong>before they unfold</strong>.
            </p>

            <p className="text-base text-foreground/90 leading-relaxed">
              Step inside a reflective simulation where <span className="text-forest font-medium">precision meets empathy</span>.
            </p>

            <p className="text-base text-foreground/90 leading-relaxed">
              Your AI dialogue partner is adaptive, calm, and built to <span className="text-forest font-medium">sharpen your edge</span>.
            </p>
          </div>

          {/* CTA Button */}
          <div className="flex justify-center">
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

      <MainNavigation />
    </div>
  );
};

export default SocialIntelligenceLab;
