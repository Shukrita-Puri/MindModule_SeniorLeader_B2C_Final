import { useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Canonical app URL for authentication - use this for sharing with users
const CANONICAL_APP_URL = 'https://ibrvatszexahdqwejahc.lovable.app';

const Signup = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectInitiated = useRef(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    // Detect if running inside an iframe (e.g., Lovable editor preview)
    const inIframe = window.self !== window.top;
    setIsInIframe(inIframe);
    
    if (inIframe) {
      console.log('[Signup] Running inside iframe, will show redirect message');
      return;
    }

    const isOnboardingFlow = location.pathname.includes('/onboarding') || 
                             location.search.includes('from=onboarding');

    console.log('[Signup] Component mounted:', { 
      isLoading, 
      isAuthenticated,
      pathname: location.pathname,
      search: location.search,
      isOnboardingFlow,
      redirectInitiated: redirectInitiated.current
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

    // Use redirect instead of popup - works reliably on all devices including mobile
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
  }, [isLoading, isAuthenticated, navigate, location, loginWithRedirect]);

  // Show message when running in iframe (Lovable editor)
  if (isInIframe) {
    const isOnboardingFlow = location.pathname.includes('/onboarding') || 
                             location.search.includes('from=onboarding');
    const targetUrl = isOnboardingFlow 
      ? `${CANONICAL_APP_URL}/onboarding/signup-step?from=onboarding`
      : `${CANONICAL_APP_URL}/signup`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">Open in New Tab</h1>
            <p className="text-muted-foreground">
              Authentication requires opening the app in a new browser tab. Click below to continue.
            </p>
          </div>
          <Button
            onClick={() => window.open(targetUrl, '_blank')}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open App & Sign Up
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
