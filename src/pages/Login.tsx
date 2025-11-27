import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const Login = () => {
  const { isAuthenticated, isLoading, loginWithPopup } = useAuth0();
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

    (async () => {
      console.log('[Login] Opening Auth0 login popup');
      try {
        await loginWithPopup({
          authorizationParams: {
            scope: 'openid profile email',
          },
        });
        console.log('[Login] Popup login successful, redirecting to daily-check-in');
        navigate('/daily-check-in');
      } catch (error) {
        console.error('[Login] Popup login error:', error);
        navigate('/login?error=auth_failed');
      }
    })();
  }, [isLoading, isAuthenticated, navigate, loginWithPopup]);

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
