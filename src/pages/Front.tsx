import { useState } from "react";
import { Shield, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { clearSession } from "@/utils/onboardingStorage";
const Front = () => {
  const navigate = useNavigate();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const handleGetStarted = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      clearSession();
      navigate('/onboarding');
    }, 300);
  };
  return <div className={`relative min-h-screen bg-background flex flex-col items-center justify-center px-6 py-16 overflow-hidden transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
      
      {/* Subtle background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-mocha/5 pointer-events-none" />
      
      {/* Top decorative gold line */}
      <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-24 h-px bg-gold/40" />
      
      {/* Main Hero Content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-4xl space-y-8">
        
        {/* LOGO - THE HERO */}
        <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-headline font-bold text-foreground tracking-wider leading-none">
          MIND<br />MODULE
        </h1>
        
        {/* Tagline */}
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-editorial italic text-primary font-medium tracking-wide">
          Mind Mastery for High Performers
        </h2>
        
        {/* Gold Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent my-6" />
        
        {/* Description */}
        <p className="text-lg sm:text-xl lg:text-2xl text-muted-foreground leading-relaxed font-body max-w-2xl">
          World's First Context- Based Self Mastery Partner. 
Because being able to recalibrate your mind is a superpower. 
         
 
        </p>
        
        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center mt-8">
          <Button onClick={handleGetStarted} variant="critical" size="lg" className="px-12 py-6 text-lg font-medium tracking-wide shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            Begin Your Journey
            <ArrowRight className="w-5 h-5 ml-3" />
          </Button>
          
          <Button onClick={() => navigate('/login')} variant="outline" size="lg" className="px-12 py-6 text-lg font-medium tracking-wide">
            Sign In
          </Button>
        </div>
        
        {/* Privacy Trust Badge */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground mt-8 pt-8 border-t border-gold/10 w-full">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-gold" />
            <span className="font-body tracking-wide">Privacy by Design</span>
          </div>
          <span className="hidden sm:inline text-gold/40">•</span>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gold" />
            <span className="font-body tracking-wide">Local-First Architecture</span>
          </div>
        </div>
      </div>
      
      {/* Bottom decorative gold line */}
      <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-24 h-px bg-gold/40" />
      
      {/* Enhanced Privacy Footer */}
      <div className="absolute bottom-8 left-0 right-0 text-center">
        <button onClick={() => navigate('/privacy')} className="text-xs font-body text-gold/70 hover:text-gold transition-all duration-300 hover:tracking-wide">
          Learn about our Privacy by Design commitment →
        </button>
      </div>
      
    </div>;
};
export default Front;