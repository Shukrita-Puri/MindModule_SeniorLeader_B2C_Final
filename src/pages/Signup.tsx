import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const Signup = () => {
  const { isAuthenticated, isLoading } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[Signup] Component mounted:', { 
      isLoading, 
      isAuthenticated,
      pathname: window.location.pathname,
      search: window.location.search
    });

    if (isLoading) return;

    if (isAuthenticated) {
      console.log('[Signup] Already authenticated, redirecting to executive-home');
      navigate('/executive-home');
      return;
    }

    // Direct manual redirect - completely bypass Auth0 SDK
    const timer = setTimeout(() => {
      const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN;
      const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
      
      const isOnboardingFlow = window.location.pathname.includes('/onboarding') || 
                               window.location.search.includes('from=onboarding');
      const redirect_uri = `${window.location.origin}/callback${isOnboardingFlow ? '?from=onboarding' : ''}`;
      
      // Manually construct Auth0 authorization URL
      const authUrl = `https://${auth0Domain}/authorize?` +
        `response_type=code&` +
        `client_id=${auth0ClientId}&` +
        `redirect_uri=${encodeURIComponent(redirect_uri)}&` +
        `scope=openid%20profile%20email&` +
        `screen_hint=signup`;
      
      console.log('[Signup] Direct full-page redirect to:', authUrl);
      
      // Break out of iframe and navigate top-level window
      window.top.location.href = authUrl;
    }, 100);

    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, navigate]);

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
