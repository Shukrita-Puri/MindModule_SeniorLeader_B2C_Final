import { useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isInIframe } from '@/utils/authRedirect';

const Signup = () => {
  const { isAuthenticated, isLoading, loginWithRedirect, loginWithPopup } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectInitiated = useRef(false);
  const [isSigningUp, setIsSigningUp] = useState(false);

  const isOnboardingFlow = location.pathname.includes('/onboarding') || 
                           location.search.includes('from=onboarding');

  useEffect(() => {
    console.log('[Signup] Component mounted:', { 
      isLoading, 
      isAuthenticated,
      pathname: location.pathname,
      search: location.search,
      isOnboardingFlow,
      redirectInitiated: redirectInitiated.current,
      isInIframe: isInIframe()
    });

    // Don't auto-trigger in iframe - show button instead
    if (isInIframe()) return;

    if (isLoading) return;

    if (isAuthenticated) {
      if (isOnboardingFlow) {
        console.log('[Signup] Already authenticated in onboarding, redirecting to /onboarding/results');
        navigate('/onboarding/results');
      } else {
        console.log('[Signup] Already authenticated, redirecting to executive-home');
        navigate('/executive-home');
      }
      return;
    }

    // Prevent multiple redirect attempts
    if (redirectInitiated.current) {
      console.log('[Signup] Redirect already initiated, skipping');
      return;
    }

    // Use redirect for signup
    console.log('[Signup] Initiating Auth0 redirect flow', { isOnboardingFlow });
    redirectInitiated.current = true;
    
    const redirectUri = isOnboardingFlow 
      ? `${window.location.origin}/callback?from=onboarding`
      : `${window.location.origin}/callback`;

    loginWithRedirect({
      authorizationParams: {
        redirect_uri: redirectUri,
        screen_hint: 'signup',
        scope: 'openid profile email',
      },
    });
  }, [isLoading, isAuthenticated, navigate, location, loginWithRedirect, isOnboardingFlow]);

  // Handle signup button click in iframe
  const handleIframeSignup = async () => {
    setIsSigningUp(true);
    try {
      await loginWithPopup({
        authorizationParams: {
          redirect_uri: `${window.location.origin}/callback`,
          screen_hint: 'signup',
          scope: 'openid profile email',
        },
      });
      if (isOnboardingFlow) {
        navigate('/onboarding/results');
      } else {
        navigate('/executive-home');
      }
    } catch (error) {
      console.error('Signup failed:', error);
      setIsSigningUp(false);
    }
  };

  // In iframe: show signup button (popup from inside iframe)
  if (isInIframe() && !isAuthenticated && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-4">
          <h2 className="text-xl font-heading font-semibold text-foreground">Create Account</h2>
          <p className="text-muted-foreground text-sm">
            Click below to sign up via popup. You'll return here once registered.
          </p>
          <Button 
            onClick={handleIframeSignup}
            disabled={isSigningUp}
            className="gap-2"
          >
            {isSigningUp ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn size={16} />
            )}
            {isSigningUp ? 'Creating account...' : 'Sign up'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Redirecting to signup...</p>
      </div>
    </div>
  );
};

export default Signup;
