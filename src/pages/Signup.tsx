import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import ErrorMessage from '@/components/ui/error-message';

const Signup = () => {
  const { loginWithRedirect, isAuthenticated, isLoading, error } = useAuth0();
  const navigate = useNavigate();
  const [localError, setLocalError] = useState<string | null>(null);
  const [retryAttempts, setRetryAttempts] = useState(0);

  useEffect(() => {
    console.log('[Signup] State:', { 
      isLoading, 
      isAuthenticated, 
      error: error?.message, 
      localError,
      retryAttempts,
      pathname: window.location.pathname,
      search: window.location.search
    });

    if (isLoading) return;

    // If already authenticated, redirect to home
    if (isAuthenticated) {
      console.log('[Signup] Already authenticated, redirecting to executive-home');
      navigate('/executive-home');
      return;
    }

    // Check if user came from onboarding flow
    const isOnboardingFlow = window.location.pathname.includes('/onboarding') || 
                             window.location.search.includes('from=onboarding');
    
    console.log('[Signup] Checking onboarding flow:', { isOnboardingFlow });

    // Only auto-redirect if there's no error
    if (!error && !localError) {
      // Redirect to Auth0 Universal Login
      const doSignup = async () => {
        try {
          const redirect_uri = `${window.location.origin}/callback${isOnboardingFlow ? '?from=onboarding' : ''}`;
          console.log('[Signup] Calling loginWithRedirect with:', { redirect_uri, screen_hint: 'signup' });
          
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

      void doSignup();
    }
  }, [isAuthenticated, isLoading, loginWithRedirect, navigate, error, localError, retryAttempts]);

  const handleRetry = () => {
    console.log('[Signup] Retry button clicked, clearing errors');
    setLocalError(null);
    setRetryAttempts(prev => prev + 1);
  };

  const handleManualSignup = async () => {
    console.log('[Signup] Manual signup button clicked');
    const isOnboardingFlow = window.location.pathname.includes('/onboarding') || 
                             window.location.search.includes('from=onboarding');
    try {
      const redirect_uri = `${window.location.origin}/callback${isOnboardingFlow ? '?from=onboarding' : ''}`;
      console.log('[Signup] Manual redirect with:', { redirect_uri });
      
      await loginWithRedirect({
        authorizationParams: {
          redirect_uri,
          screen_hint: 'signup',
        },
      });
    } catch (e) {
      console.error('[Signup] Manual redirect failed:', e);
      setLocalError(e instanceof Error ? e.message : 'Failed to redirect to signup');
    }
  };

  // Show loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-4">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground mb-4">
          {error || localError ? 'Sign up failed' : 'Redirecting to sign up...'}
        </p>
        
        {error && (
          <ErrorMessage 
            message={`Auth0 error: ${error.message}`}
            className="mt-4"
          />
        )}
        
        {localError && (
          <ErrorMessage 
            message={localError}
            className="mt-4"
          />
        )}

        {(error || localError) && (
          <div className="mt-6 space-y-3">
            <button
              onClick={handleRetry}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Retry Signup
            </button>
            <button
              onClick={handleManualSignup}
              className="w-full px-4 py-2 border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Continue to Signup
            </button>
            <button
              onClick={() => navigate('/')}
              className="mt-4 text-sm text-muted-foreground underline"
            >
              Back to start
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Signup;
