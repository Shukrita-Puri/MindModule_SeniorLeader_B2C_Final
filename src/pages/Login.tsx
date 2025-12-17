import { useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const Login = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const redirectInitiated = useRef(false);

  useEffect(() => {
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
