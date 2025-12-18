import { useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Signup = () => {
  const { isAuthenticated, isLoading, loginWithRedirect, loginWithPopup } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectInitiated = useRef(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);

  const isOnboardingFlow = location.pathname.includes('/onboarding') || 
                           location.search.includes('from=onboarding');

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      if (isOnboardingFlow) {
        navigate('/onboarding/results');
      } else {
        navigate('/executive-home');
      }
      return;
    }

    // Prevent multiple redirect attempts
    if (redirectInitiated.current) return;
    redirectInitiated.current = true;
    
    const redirectUri = isOnboardingFlow 
      ? `${window.location.origin}/callback?from=onboarding`
      : `${window.location.origin}/callback`;

    // Try popup first
    loginWithPopup({
      authorizationParams: {
        redirect_uri: redirectUri,
        screen_hint: 'signup',
        scope: 'openid profile email',
      },
    }).then(() => {
      if (isOnboardingFlow) {
        navigate('/onboarding/results');
      } else {
        navigate('/executive-home');
      }
    }).catch((error) => {
      console.error('Signup popup failed:', error);
      redirectInitiated.current = false;
      if (error?.message?.includes('blocked') || error?.message?.includes('closed')) {
        setPopupBlocked(true);
      }
    });
  }, [isLoading, isAuthenticated, navigate, location, loginWithPopup, isOnboardingFlow]);

  // Handle manual signup
  const handleManualSignup = async () => {
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

  // Show button only if popup was blocked
  if (popupBlocked && !isAuthenticated && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md space-y-4">
          <h2 className="text-xl font-heading font-semibold text-foreground">Popup Blocked</h2>
          <p className="text-muted-foreground text-sm">
            Your browser blocked the signup popup. Click below to try again.
          </p>
          <Button 
            onClick={handleManualSignup}
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
