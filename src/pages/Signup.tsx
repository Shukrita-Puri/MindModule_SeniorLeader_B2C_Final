import { useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isInIframe, openAuthInNewTab, CANONICAL_APP_URL } from '@/utils/authRedirect';

const Signup = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectInitiated = useRef(false);
  const [showIframeMessage, setShowIframeMessage] = useState(false);

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

    // If in iframe, open signup in new tab instead
    if (isInIframe()) {
      console.log('[Signup] Running in iframe, opening signup in new tab');
      redirectInitiated.current = true;
      setShowIframeMessage(true);
      const signupPath = isOnboardingFlow ? '/onboarding/signup?from=onboarding' : '/signup';
      openAuthInNewTab(signupPath);
      return;
    }

    // Use redirect instead of popup - works reliably on all devices including mobile
    console.log('[Signup] Initiating Auth0 redirect flow', { isOnboardingFlow });
    redirectInitiated.current = true;
    
    const redirectUri = isOnboardingFlow 
      ? `${CANONICAL_APP_URL}/callback?from=onboarding`
      : `${CANONICAL_APP_URL}/callback`;

    loginWithRedirect({
      authorizationParams: {
        redirect_uri: redirectUri,
        screen_hint: 'signup',
        scope: 'openid profile email',
      },
    });
  }, [isLoading, isAuthenticated, navigate, location, loginWithRedirect, isOnboardingFlow]);

  // Show message when in iframe
  if (showIframeMessage) {
    const signupPath = isOnboardingFlow ? '/onboarding/signup?from=onboarding' : '/signup';
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-6">
          <ExternalLink className="w-12 h-12 mx-auto mb-4 text-primary" />
          <h2 className="text-xl font-semibold mb-2 text-foreground">Signup opened in new tab</h2>
          <p className="text-muted-foreground mb-6">
            Please complete your signup in the new tab that just opened.
          </p>
          <Button 
            onClick={() => openAuthInNewTab(signupPath)}
            variant="outline"
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open Signup Again
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Or visit: <a href={CANONICAL_APP_URL} target="_blank" rel="noopener noreferrer" className="underline">{CANONICAL_APP_URL}</a>
          </p>
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
