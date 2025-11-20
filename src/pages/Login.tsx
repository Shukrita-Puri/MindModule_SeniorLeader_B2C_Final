import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const Login = () => {
  const { isAuthenticated, isLoading } = useAuth0();
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

    // Direct manual redirect - completely bypass Auth0 SDK
    const timer = setTimeout(() => {
      const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN;
      const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
      
      const redirect_uri = `${window.location.origin}/callback`;
      
      // Manually construct Auth0 authorization URL (no screen_hint for login)
      const authUrl = `https://${auth0Domain}/authorize?` +
        `response_type=code&` +
        `client_id=${auth0ClientId}&` +
        `redirect_uri=${encodeURIComponent(redirect_uri)}&` +
        `scope=openid%20profile%20email`;
      
      console.log('[Login] Direct full-page redirect to:', authUrl);
      
      // Break out of iframe and navigate top-level window
      window.top.location.href = authUrl;
    }, 100);

    return () => clearTimeout(timer);
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
