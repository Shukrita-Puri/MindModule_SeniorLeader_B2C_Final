import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { broadcastAuthSuccess, closeAuthWindow, isInIframe } from '@/utils/authRedirect';

const AuthCallback = () => {
  const { isLoading, error, isAuthenticated } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[AuthCallback] State:', { 
      isLoading, 
      error: error?.message, 
      isAuthenticated,
      search: window.location.search,
      isInIframe: isInIframe()
    });

    if (isLoading) return;

    if (error) {
      console.error('[AuthCallback] Auth0 callback error:', error);
      navigate('/signup?error=auth_failed');
      return;
    }

    if (isAuthenticated) {
      const urlParams = new URLSearchParams(window.location.search);
      const fromOnboarding = urlParams.get('from') === 'onboarding';
      const destination = fromOnboarding ? '/onboarding/results' : '/executive-home';
      
      console.log('[AuthCallback] Authenticated, destination:', destination);
      
      // If this window was opened from an iframe (new tab scenario),
      // broadcast success to the original tab and close this one
      if (!isInIframe() && window.opener) {
        console.log('[AuthCallback] Opened as new tab - broadcasting success and closing');
        broadcastAuthSuccess(destination);
        closeAuthWindow();
        // Fallback: if close doesn't work, still navigate
        setTimeout(() => {
          navigate(destination);
        }, 1000);
      } else {
        // Normal navigation (either in iframe or direct access)
        navigate(destination);
      }
    }
  }, [isLoading, error, isAuthenticated, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
