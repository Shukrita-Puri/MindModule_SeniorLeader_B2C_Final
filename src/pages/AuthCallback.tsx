import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const AuthCallback = () => {
  const { isLoading, error, isAuthenticated } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[AuthCallback] State:', { 
      isLoading, 
      error: error?.message, 
      isAuthenticated,
      search: window.location.search
    });

    if (isLoading) return;

    if (error) {
      console.error('[AuthCallback] Auth0 callback error:', error);
      navigate('/signup?error=auth_failed');
      return;
    }

    if (isAuthenticated) {
      // Check if user came from onboarding flow
      const urlParams = new URLSearchParams(window.location.search);
      const fromOnboarding = urlParams.get('from') === 'onboarding';
      
      console.log('[AuthCallback] URL params:', { from: urlParams.get('from'), fromOnboarding });
      
      if (fromOnboarding) {
        // New user completing onboarding → go to calendar connection
        console.log('[AuthCallback] Navigating to: /onboarding/context-connection');
        navigate('/onboarding/context-connection');
      } else {
        // Returning user logging in → go to daily check-in
        console.log('[AuthCallback] Navigating to: /daily-check-in');
        navigate('/daily-check-in');
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
