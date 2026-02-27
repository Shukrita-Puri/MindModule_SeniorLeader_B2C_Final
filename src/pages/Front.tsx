import { useState, useEffect } from "react";
import { Shield, Lock, ArrowRight } from "lucide-react";
import mmLogoCircle from "@/assets/mm-logo-circle.png";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { clearSession } from "@/utils/onboardingStorage";
import { DEV_MODE } from "@/config/devMode";
import { getRedirectUri, nativeLogin, getSanitisedAuth0Audience } from "@/utils/nativeAuth";
import { useAuth } from "@/hooks/useAuth";
import { clearLogoutGuard } from "@/utils/logoutGuard";

const Front = () => {
  if (DEV_MODE) {
    return <FrontContent onSignIn={() => {}} />;
  }
  return <Auth0Front />;
};

const Auth0Front = () => {
  const { loginWithRedirect } = useAuth0();
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/daily-check-in', { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  const handleSignIn = async () => {
    // User explicitly initiated login — clear any active logout guard
    clearLogoutGuard();

    // On iOS native, open in-app browser instead of full redirect
    const handled = await nativeLogin({ returnTo: '/daily-check-in' });
    if (handled) return;

    loginWithRedirect({
      appState: { returnTo: '/daily-check-in' },
      authorizationParams: {
        redirect_uri: getRedirectUri(),
        audience: getSanitisedAuth0Audience(),
        scope: 'openid profile email offline_access',
      }
    });
  };

  return <FrontContent onSignIn={handleSignIn} />
};

const FrontContent = ({ onSignIn }: {onSignIn: () => void;}) => {
  const navigate = useNavigate();
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleGetStarted = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      clearSession();
      navigate('/onboarding');
    }, 300);
  };

  const handleSignIn = () => {
    if (DEV_MODE) {
      navigate('/daily-check-in');
      return;
    }
    onSignIn();
  };

  return <div className={`relative h-screen h-[100dvh] bg-background flex flex-col items-center justify-center px-5 py-4 sm:py-16 overflow-hidden transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
      
      {/* Subtle background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-mocha/5 pointer-events-none" />
      
      {/* Main Hero Content */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-4xl space-y-4 sm:space-y-6 lg:space-y-8">
        
        {/* Logo */}
        <img src={mmLogoCircle} alt="Mind Module logo" className="w-24 h-24 sm:w-28 sm:h-28 rounded-full shadow-lg" />
        
        {/* LOGO - THE HERO */}
        <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-headline font-bold text-foreground tracking-wider leading-none">
          MIND MODULE
        </h1>
        <p className="text-sm sm:text-base tracking-[0.25em] uppercase text-muted-foreground/70 font-body -mt-2 sm:-mt-4">
          Executive Edition
        </p>
        
        {/* Tagline */}
        <h2 className="text-xl sm:text-3xl lg:text-4xl font-editorial italic text-primary font-medium tracking-wide leading-snug">
          The World's First Proactive Performance System For Your Inner Game.
          <br />
          Built by Leaders. For Leaders.
        </h2>
        
        {/* Gold Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent mt-2" />
        
        {/* Description */}
        <p className="text-[13px] sm:text-xl lg:text-2xl text-muted-foreground leading-relaxed font-body max-w-2xl mt-2">
          It understands your day, learns your patterns, to build your inner infrastructure. So you show up at your highest level before high stakes arrive– not after they've already cost you. Calibrate. Clarify. Renew.
        </p>
        
        {/* CTA Buttons */}
        <div className="flex flex-row gap-3 sm:gap-4 items-center justify-center mt-2">
          <Button onClick={handleGetStarted} variant="critical" size="lg" className="px-8 py-4 sm:px-12 sm:py-6 text-sm sm:text-lg font-medium tracking-wide shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            Begin Your Journey
            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2 sm:ml-3" />
          </Button>
          
          <Button onClick={handleSignIn} variant="outline" size="lg" className="px-8 py-4 sm:px-12 sm:py-6 text-sm sm:text-lg font-medium tracking-wide">
            Sign In
          </Button>
        </div>
        
        {/* Privacy Trust Badge */}
        <div className="flex flex-row items-center justify-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground pt-2 sm:pt-8 border-t border-gold/10 w-full">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gold" />
            <span className="font-body tracking-wide">Privacy by Design</span>
          </div>
          <span className="text-gold/40">•</span>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gold" />
            <span className="font-body tracking-wide">Local-First Architecture</span>
          </div>
        </div>
      </div>
      
      {/* Enhanced Privacy Footer */}
      <div className="absolute bottom-4 sm:bottom-8 left-0 right-0 text-center pb-[env(safe-area-inset-bottom)]">
        <a href="/privacy" className="text-xs font-body text-gold/70 hover:text-gold transition-all duration-300 hover:tracking-wide">
          Privacy Policy →
        </a>
      </div>
      
    </div>;};

export default Front;
