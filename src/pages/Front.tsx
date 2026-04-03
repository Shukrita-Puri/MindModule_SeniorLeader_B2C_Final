import { useState, useEffect } from "react";
import { Shield } from "lucide-react";
import mmLogoCircle from "@/assets/brand/mm-logo-circle.png";
import heroIllustration from "@/assets/hero-illustration.jpg";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { clearSession } from "@/utils/onboardingStorage";
import { DEV_MODE } from "@/config/devMode";
import { getRedirectUri, nativeLogin, getSanitisedAuth0Audience } from "@/utils/nativeAuth";
import { useAuth } from "@/hooks/useAuth";
import { clearLogoutGuard } from "@/utils/logoutGuard";
import { hasValidAccess, isWithin60DaysOfCancellation } from "@/utils/subscriptionHelpers";
import { getResumeRoute } from "@/utils/onboardingStatus";

const CANONICAL_HOME = '/daily-check-in';

const Front = () => {
  if (DEV_MODE) {
    return <FrontContent onSignIn={() => {}} onLetsGo={async () => {}} isAuthenticated={false} user={null} />;
  }
  return <Auth0Front />;
};

const Auth0Front = () => {
  const { loginWithRedirect } = useAuth0();
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();

  // Auto-redirect: logged-in + completed + valid → straight to app
  useEffect(() => {
    if (loading || !isAuthenticated || !user) return;
    if (user.onboarding_completed_at && hasValidAccess(user)) {
      navigate(CANONICAL_HOME, { replace: true });
    }
  }, [loading, isAuthenticated, user, navigate]);

  const handleSignIn = async () => {
    clearLogoutGuard();

    const handled = await nativeLogin({ returnTo: CANONICAL_HOME });
    if (handled) return;

    loginWithRedirect({
      appState: { returnTo: CANONICAL_HOME },
      authorizationParams: {
        redirect_uri: getRedirectUri(),
        audience: getSanitisedAuth0Audience(),
        scope: 'openid profile email offline_access',
      }
    });
  };

  const handleLetsGo = async () => {
    // Case 1: Logged-in + onboarding complete + valid subscription → go to app
    if (isAuthenticated && user?.onboarding_completed_at && hasValidAccess(user)) {
      navigate(CANONICAL_HOME);
      return;
    }

    // Case 2: Logged-in + onboarding incomplete → resume at correct step
    if (isAuthenticated && user && !user.onboarding_completed_at) {
      try {
        const resumeRoute = await getResumeRoute();
        console.log('[Front] Resuming onboarding at:', resumeRoute);
        navigate(resumeRoute);
      } catch {
        navigate('/onboarding');
      }
      return;
    }

    // Case 3: Logged-in + onboarding complete + no valid subscription
    if (isAuthenticated && user?.onboarding_completed_at && !hasValidAccess(user)) {
      if (isWithin60DaysOfCancellation(user as any)) {
        navigate('/onboarding/payment');
      } else {
        navigate('/onboarding/payment');
      }
      return;
    }

    // Case 4: Not logged in → start fresh onboarding
    clearSession();
    navigate('/onboarding');
  };

  return <FrontContent onSignIn={handleSignIn} onLetsGo={handleLetsGo} isAuthenticated={isAuthenticated} user={user} />;
};

const FrontContent = ({ onSignIn, onLetsGo, isAuthenticated, user }: {
  onSignIn: () => void;
  onLetsGo: () => Promise<void>;
  isAuthenticated: boolean;
  user: any;
}) => {
  const navigate = useNavigate();
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleGetStarted = async () => {
    setIsTransitioning(true);
    try {
      await onLetsGo();
    } finally {
      // Reset in case navigation didn't happen (e.g. error)
      setTimeout(() => setIsTransitioning(false), 500);
    }
  };

  const handleSignIn = () => {
    if (DEV_MODE) {
      navigate(CANONICAL_HOME);
      return;
    }
    onSignIn();
  };

  return <div className={`relative h-screen h-[100dvh] bg-background flex flex-col items-center overflow-hidden transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
      
      {/* Full-bleed background illustration */}
      <img 
        src={heroIllustration} 
        alt="" 
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover opacity-[0.35] object-[70%_20%] sm:object-center"
        width={1920}
        height={1080}
      />

      {/* Gradient overlays for depth and readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/30 to-background/90 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-background pointer-events-none" />
      
      {/* Content layer */}
      <div className="relative z-10 flex flex-col items-center text-center h-full w-full px-5 py-4 sm:py-16 max-w-4xl mx-auto">
        
        {/* Top section - pushed down to overlap with sun area on mobile */}
        <div className="flex flex-col items-center space-y-3 sm:space-y-5 lg:space-y-6 mt-[38%] sm:mt-auto sm:flex-1 sm:justify-center">
          {/* Logo */}
          <img src={mmLogoCircle} alt="Mind Module logo" className="w-20 h-20 sm:w-24 sm:h-24 rounded-full shadow-lg" />
          
          {/* Brand name */}
          <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-headline font-bold text-foreground tracking-wider leading-none">
            MIND MODULE
          </h1>
          <p className="text-[9px] sm:text-xs tracking-[0.25em] uppercase text-muted-foreground/70 font-body -mt-2 sm:-mt-4">
            Executive Edition
          </p>
          
          {/* Tagline - positioned between clouds and landscape */}
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-editorial italic text-foreground font-bold tracking-wide leading-snug drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] mt-6 sm:mt-4">
            World's First Proactive Mental Performance OS.
          </h2>
        </div>

        {/* CTA Buttons - pushed down into landscape area */}
        <div className="flex flex-col items-center gap-3 mt-auto mb-[22%] sm:mb-auto sm:mt-6">
          {/* Gold Divider */}
          <div className="w-full max-w-xs h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent mb-2" />
          
          <Button onClick={handleGetStarted} variant="critical" size="lg" className="px-8 py-4 sm:px-12 sm:py-6 text-sm sm:text-lg font-medium tracking-wide shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            Let's Go
          </Button>
          
          <button onClick={handleSignIn} className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-body">
            Already have an account? <span className="underline underline-offset-2">Log in</span>
          </button>
        </div>
        
        {/* Privacy Trust Badge - pinned to bottom on mobile */}
        <div className="flex flex-col items-center gap-1 pt-2 sm:pt-6 border-t border-gold/10 w-full mt-auto pb-4 sm:pb-0">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gold" />
            <span className="font-body tracking-wide">Privacy by Design</span>
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground/60 font-body tracking-wide">
            Local &amp; End-to-End Encrypted
          </span>
          <button
            onClick={() => navigate('/powered-by-ai')}
            className="text-[10px] sm:text-xs text-muted-foreground/60 hover:text-muted-foreground font-body tracking-wide transition-colors mt-1"
          >
            Powered by AI →
          </button>
        </div>
      </div>
      
    </div>;
};

export default Front;
