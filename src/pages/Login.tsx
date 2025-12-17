import { useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Canonical app URL for authentication - use this for sharing with users
const CANONICAL_APP_URL = 'https://ibrvatszexahdqwejahc.lovable.app';

const Login = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const redirectInitiated = useRef(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    // Detect if running inside an iframe (e.g., Lovable editor preview)
    const inIframe = window.self !== window.top;
    setIsInIframe(inIframe);
    
    if (inIframe) {
      console.log('[Login] Running inside iframe, will show redirect message');
      return;
    }

    console.log('[Login] Component mounted:', { 
      isLoading, 
      isAuthenticated,
      pathname: window.location.pathname,
      redirectInitiated: redirectInitiated.current
    });

    if (isLoading) return;

    if (isAuthenticated) {
      console.log('[Login] Already authenticated, redirecting to daily-check-in');
      navigate('/daily-check-in');
      return;
    }

    // Prevent multiple redirect attempts
    if (redirectInitiated.current) {
      console.log('[Login] Redirect already initiated, skipping');
      return;
    }

    // Use redirect instead of popup - works reliably on all devices including mobile
    console.log('[Login] Initiating Auth0 redirect flow');
    redirectInitiated.current = true;
    
    loginWithRedirect({
      authorizationParams: {
        redirect_uri: `${window.location.origin}/callback`,
        scope: 'openid profile email',
      },
    });
  }, [isLoading, isAuthenticated, navigate, loginWithRedirect]);

  // Show message when running in iframe (Lovable editor)
  if (isInIframe) {
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
            onClick={() => window.open(`${CANONICAL_APP_URL}/login`, '_blank')}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open App & Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </div>
  );
};

export default Login;
