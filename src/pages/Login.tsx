import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const Login = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[Login] Component mounted:', { 
      isLoading, 
      isAuthenticated,
      pathname: window.location.pathname
    });

    if (isLoading) return;

    if (isAuthenticated) {
      console.log('[Login] Already authenticated, redirecting to daily-check-in');
      navigate('/daily-check-in');
      return;
    }

    // Use Auth0 SDK loginWithRedirect for proper PKCE flow
    const redirectUri = `${window.location.origin}/callback`;
    
    console.log('[Login] Redirecting to Auth0 with loginWithRedirect:', { redirectUri });
    
    loginWithRedirect({
      authorizationParams: {
        redirect_uri: redirectUri,
        scope: 'openid profile email',
      },
    });
  }, [isLoading, isAuthenticated, navigate]);

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
