import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const Login = () => {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
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

    // Auto-redirect after small delay to ensure Auth0 SDK is initialized
    const timer = setTimeout(() => {
      const redirect_uri = `${window.location.origin}/callback`;
      
      console.log('[Login] Auto-redirecting to Auth0:', { redirect_uri });
      
      // Force full page redirect using openUrl to prevent iframe blocking
      loginWithRedirect({
        authorizationParams: {
          redirect_uri,
        },
        async openUrl(url) {
          console.log('[Login] Full page redirect to:', url);
          window.location.replace(url);
        }
      }).catch((err) => {
        console.error('[Login] loginWithRedirect failed:', err);
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, loginWithRedirect, navigate]);

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
