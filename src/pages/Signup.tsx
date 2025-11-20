import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import ErrorMessage from '@/components/ui/error-message';

const Signup = () => {
  const { loginWithRedirect, isAuthenticated, isLoading, error } = useAuth0();
  const navigate = useNavigate();
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[Signup] State:', { 
      isLoading, 
      isAuthenticated, 
      error: error?.message, 
      localError,
      pathname: window.location.pathname,
      search: window.location.search
    });

    if (isLoading) return;

    // If already authenticated, redirect to executive-home
    if (isAuthenticated) {
      console.log('[Signup] Already authenticated, redirecting to executive-home');
      navigate('/executive-home');
      return;
    }
  }, [isAuthenticated, isLoading, navigate, error, localError]);

  const handleSignup = async () => {
    console.log('[Signup] Signup button clicked');
    const isOnboardingFlow = window.location.pathname.includes('/onboarding') || 
                             window.location.search.includes('from=onboarding');
    try {
      setLocalError(null);
      const redirect_uri = `${window.location.origin}/callback${isOnboardingFlow ? '?from=onboarding' : ''}`;
      console.log('[Signup] Redirect with:', { redirect_uri });
      
      await loginWithRedirect({
        authorizationParams: {
          redirect_uri,
          screen_hint: 'signup',
        },
      });
    } catch (e) {
      console.error('[Signup] Redirect failed:', e);
      setLocalError(e instanceof Error ? e.message : 'Failed to redirect to signup');
    }
  };

  const isOnboardingFlow = window.location.pathname.includes('/onboarding');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md w-full space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Create Your Account</h1>
          <p className="text-muted-foreground">
            {isOnboardingFlow 
              ? "You're almost done! Create your account to save your results and start your journey."
              : "Sign up to get started with your personalized mental fitness journey."}
          </p>
        </div>

        {(error || localError) && (
          <ErrorMessage 
            message={error?.message || localError || ''}
            className="mt-4"
          />
        )}

        <button
          onClick={handleSignup}
          disabled={isLoading}
          className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Continue with Email'}
        </button>

        <button
          onClick={() => navigate(isOnboardingFlow ? '/onboarding/growth-assessment' : '/')}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          {isOnboardingFlow ? 'Back to questionnaire' : 'Back to start'}
        </button>
      </div>
    </div>
  );
};

export default Signup;
