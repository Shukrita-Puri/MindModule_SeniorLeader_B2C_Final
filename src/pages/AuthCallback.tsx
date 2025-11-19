import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const AuthCallback = () => {
  const { isLoading, error, isAuthenticated } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    if (error) {
      console.error('Auth0 callback error:', error);
      navigate('/signup?error=auth_failed');
      return;
    }

    if (isAuthenticated) {
      // Check if user came from onboarding flow
      const urlParams = new URLSearchParams(window.location.search);
      const fromOnboarding = urlParams.get('from') === 'onboarding';
      
      if (fromOnboarding) {
        // New user completing onboarding → show their results
        navigate('/onboarding/results');
      } else {
        // Returning user logging in → go to daily check-in
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
