import { useState, useEffect } from "react";
import { Shield } from "lucide-react";
import mmLogoCircle from "@/assets/brand/mm-logo-circle.png";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { clearSession } from "@/utils/onboardingStorage";
import { DEV_MODE } from "@/config/devMode";
import { getRedirectUri, nativeLogin, getSanitisedAuth0Audience } from "@/utils/nativeAuth";
import { useAuth } from "@/hooks/useAuth";
import { clearLogoutGuard } from "@/utils/logoutGuard";
import { hasValidSubscription, isWithin60DaysOfCancellation, resetIncompleteOnboarding } from "@/utils/subscriptionHelpers";

const Front = () => {
  if (DEV_MODE) {
    return <FrontContent onSignIn={() => {}} onLetsGoReset={async () => {}} isAuthenticated={false} user={null} />;
  }
  return <Auth0Front />;
};

const Auth0Front = () => {
  const { loginWithRedirect, logout } = useAuth0();
  const { isAuthenticated, loading, user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated && user?.onboarding_completed_at && hasValidSubscription(user as any)) {
      navigate('/daily-check-in', { replace: true });
    }
  }, [loading, isAuthenticated, user, navigate]);

  const handleSignIn = async () => {
    clearLogoutGuard();

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

  const handleLetsGoReset = async () => {
    if (isAuthenticated && user) {
      // Check 60-day cancellation rule
      if (isWithin60DaysOfCancellation(user as any)) {
        // Recent cancellation — go straight to payment
        navigate('/onboarding/payment');
        return;
      }

      // Authenticated but no valid subscription — full reset
      if (!hasValidSubscription(user as any)) {
        try {
          await resetIncompleteOnboarding();
        } catch (err) {
          console.warn('[Front] Reset failed, continuing with logout:', err);
        }
        await signOut();
        // After signOut, user lands back on / and can press "Let's Go" as fresh user
        return;
      }
    }
  };

  return <FrontContent onSignIn={handleSignIn} onLetsGoReset={handleLetsGoReset} isAuthenticated={isAuthenticated} user={user} />;
};

const FrontContent = ({ onSignIn, onLetsGoReset, isAuthenticated, user }: {
  onSignIn: () => void;
  onLetsGoReset: () => Promise<void>;
  isAuthenticated: boolean;
  user: any;
}) => {
  const navigate = useNavigate();
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleGetStarted = async () => {
    setIsTransitioning(true);

    // If authenticated but no valid subscription, trigger re-entry flow
    if (isAuthenticated && user && !hasValidSubscription(user)) {
      await onLetsGoReset();
      setIsTransitioning(false);
      return;
    }

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
          World's First Proactive Mental Performance OS.
        </h2>
        
        {/* Gold Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent mt-2" />
        
        {/* Description */}
        <p className="text-[11px] sm:text-base lg:text-lg text-muted-foreground leading-relaxed font-body max-w-2xl mt-2">
          Always One Step Ahead. Always Based on Your Context. All in One App.
        </p>
        <p className="text-sm sm:text-xl lg:text-2xl font-bold text-muted-foreground font-body mt-1">
          Built for Leaders. By Leaders.
        </p>
        
        {/* CTA Buttons */}
        <div className="flex flex-col items-center gap-3 mt-2">
          <Button onClick={handleGetStarted} variant="critical" size="lg" className="px-8 py-4 sm:px-12 sm:py-6 text-sm sm:text-lg font-medium tracking-wide shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            Let's Go
          </Button>
          
          <button onClick={handleSignIn} className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 font-body">
            Already have an account? <span className="underline underline-offset-2">Log in</span>
          </button>
        </div>
        
        {/* Privacy Trust Badge */}
        <div className="flex flex-col items-center gap-1 pt-2 sm:pt-6 border-t border-gold/10 w-full">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gold" />
            <span className="font-body tracking-wide">Privacy by Design</span>
          </div>
          <span className="text-[10px] sm:text-xs text-muted-foreground/60 font-body tracking-wide">
            Local &amp; End-to-End Encrypted
          </span>
        </div>
      </div>
      
    </div>;
};

export default Front;
