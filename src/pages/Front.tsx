import { useState, useEffect } from "react";
import { Loader2, Shield } from "lucide-react";
import mmLogoCircle from "@/assets/brand/mm-logo-circle.png";
import heroIllustration from "@/assets/onboarding/usp-sky-light.jpeg";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { clearSession } from "@/utils/onboardingStorage";
import { DEV_MODE } from "@/config/devMode";
import { getRedirectUri, nativeLogin, getSanitisedAuth0Audience } from "@/utils/nativeAuth";
import { useAuth } from "@/hooks/useAuth";
import { clearLogoutGuard, isLogoutGuardActive } from "@/utils/logoutGuard";
import { hasValidAccess, isWithin60DaysOfCancellation } from "@/utils/subscriptionHelpers";
import { getResumeRoute } from "@/utils/onboardingStatus";
import { PAYMENT_PAGE_SUPPRESSED } from "@/config/payments";

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
  const logoutGuardActive = isLogoutGuardActive();

  // Auto-redirect authenticated users away from the public landing/login page.
  useEffect(() => {
    if (logoutGuardActive) return;
    if (loading || !isAuthenticated || !user) return;

    if (user.onboarding_completed_at && (hasValidAccess(user) || PAYMENT_PAGE_SUPPRESSED)) {
      navigate(CANONICAL_HOME, { replace: true });
      return;
    }

    if (!user.onboarding_completed_at) {
      let cancelled = false;
      void getResumeRoute()
        .then((resumeRoute) => {
          if (!cancelled) navigate(resumeRoute, { replace: true });
        })
        .catch(() => {
          if (!cancelled) navigate('/onboarding', { replace: true });
        });

      return () => {
        cancelled = true;
      };
    }

    if (!hasValidAccess(user)) {
      navigate('/onboarding/payment', { replace: true });
    }
  }, [loading, isAuthenticated, user, navigate, logoutGuardActive]);

  const handleSignIn = async () => {
    clearLogoutGuard();

    if (isAuthenticated && user?.onboarding_completed_at && hasValidAccess(user)) {
      navigate(CANONICAL_HOME);
      return;
    }

    if (isAuthenticated && user && !user.onboarding_completed_at) {
      try {
        const resumeRoute = await getResumeRoute();
        console.log('[Front] Resuming onboarding from sign in at:', resumeRoute);
        navigate(resumeRoute);
      } catch {
        navigate('/onboarding');
      }
      return;
    }

    if (isAuthenticated && user?.onboarding_completed_at && !hasValidAccess(user)) {
      navigate(PAYMENT_PAGE_SUPPRESSED ? CANONICAL_HOME : '/onboarding/payment');
      return;
    }

    const result = await nativeLogin({ returnTo: CANONICAL_HOME });
    if (result.status === 'opened') return;

    if (result.status !== 'not_native' && result.status !== 'failed') {
      navigate(`/login?returnTo=${encodeURIComponent(CANONICAL_HOME)}`);
      return;
    }

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
      if (PAYMENT_PAGE_SUPPRESSED) {
        navigate(CANONICAL_HOME);
        return;
      }

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

  if (!logoutGuardActive && (loading || isAuthenticated)) {
    return <FrontLoading />;
  }

  return (
    <FrontContent
      onSignIn={handleSignIn}
      onLetsGo={handleLetsGo}
      isAuthenticated={logoutGuardActive ? false : isAuthenticated}
      user={logoutGuardActive ? null : user}
    />
  );
};

const FrontLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
);

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

  const handleSignIn = async () => {
    if (DEV_MODE) {
      navigate(CANONICAL_HOME);
      return;
    }
    await onSignIn();
  };

  return <div className={`relative h-screen h-[100dvh] flex flex-col items-center overflow-hidden transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
      
      {/* Full-bleed background illustration */}
      <img 
        src={heroIllustration} 
        alt="" 
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
        width={1920}
        height={1080}
      />

      {/* Gradient overlays for depth and readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
      
      {/* Content layer */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center h-full w-full px-5 py-4 sm:py-16 max-w-4xl mx-auto">
        
        {/* Top section */}
          <div className="flex flex-col items-center space-y-4 sm:space-y-6 lg:space-y-8">
            {/* Logo */}
            <img src={mmLogoCircle} alt="Mind Module logo" className="w-20 h-20 sm:w-24 sm:h-24 rounded-full shadow-lg" />
            
            {/* Brand name */}
            <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-headline font-bold text-white tracking-wider leading-none">
              MIND MODULE
            </h1>
            <p className="text-xs sm:text-xs tracking-[0.35em] uppercase text-white/50 font-body -mt-1 sm:-mt-3">
              Executive Edition
            </p>
            
            {/* Tagline */}
            <h2 className="text-xl sm:text-3xl lg:text-4xl font-editorial italic text-white font-bold tracking-wide leading-snug drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] mt-10 sm:mt-8">
              Designed for Leaders to Stay Mentally Ahead
            </h2>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-row items-center justify-center gap-3 w-full mt-8 px-4">
            <Button
              onClick={handleSignIn}
              variant="outline"
              size="lg"
              className="flex-1 max-w-[46%] h-12 px-3 text-sm font-medium tracking-wide border-white/30 bg-transparent text-white hover:bg-white/10 hover:border-white/50 hover:text-white rounded-2xl transition-all duration-300"
            >
              Log In
            </Button>

            <Button
              onClick={handleGetStarted}
              variant="critical"
              size="lg"
              className="flex-1 max-w-[46%] h-12 px-3 text-sm font-medium tracking-wide shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 rounded-2xl"
            >
              Sign up
            </Button>
          </div>
        
        {/* Privacy Trust Badge */}
        <div className="flex flex-col items-center gap-1 pt-6 sm:pt-8 border-t border-white/10 w-full mt-8 pb-4 sm:pb-0">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-white/60">
            <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gold" />
            <span className="font-body tracking-wide">Privacy by Design</span>
          </div>
          <span className="text-xs sm:text-xs text-white/40 font-body tracking-wide">
            Local &amp; End-to-End Encrypted
          </span>
          <button
            onClick={() => navigate('/powered-by-ai')}
            className="text-xs sm:text-xs text-white/40 hover:text-white/60 font-body tracking-wide transition-colors mt-1"
          >
            Powered by AI →
          </button>
        </div>
      </div>
      
    </div>;
};

export default Front;
