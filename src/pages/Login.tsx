import { useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isInIframe, openAuthInNewTab, CANONICAL_APP_URL } from '@/utils/authRedirect';

const Login = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const redirectInitiated = useRef(false);
  const [showIframeMessage, setShowIframeMessage] = useState(false);

  useEffect(() => {
    console.log('[Login] Component mounted:', { 
      isLoading, 
      isAuthenticated,
      pathname: window.location.pathname,
      redirectInitiated: redirectInitiated.current,
      isInIframe: isInIframe()
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

    // If in iframe, open login in new tab instead
    if (isInIframe()) {
      console.log('[Login] Running in iframe, opening login in new tab');
      redirectInitiated.current = true;
      setShowIframeMessage(true);
      openAuthInNewTab('/login');
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

  // Show message when in iframe
  if (showIframeMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-6">
          <ExternalLink className="w-12 h-12 mx-auto mb-4 text-primary" />
          <h2 className="text-xl font-semibold mb-2 text-foreground">Login opened in new tab</h2>
          <p className="text-muted-foreground mb-6">
            Please complete your login in the new tab that just opened.
          </p>
          <Button 
            onClick={() => openAuthInNewTab('/login')}
            variant="outline"
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open Login Again
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
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </div>
  );
};

export default Login;
