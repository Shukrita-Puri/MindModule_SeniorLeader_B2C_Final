import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import ErrorMessage from '@/components/ui/error-message';

const Login = () => {
  const { loginWithRedirect, isAuthenticated, isLoading, error } = useAuth0();
  const navigate = useNavigate();
  const [localError, setLocalError] = useState<string | null>(null);
  const [retryAttempts, setRetryAttempts] = useState(0);

  useEffect(() => {
    console.log('[Login] State:', { 
      isLoading, 
      isAuthenticated, 
      error: error?.message, 
      localError,
      retryAttempts,
      pathname: window.location.pathname
    });

    if (isLoading) return;

    // If already authenticated, redirect to daily check-in
    if (isAuthenticated) {
      console.log('[Login] Already authenticated, redirecting to daily-check-in');
      navigate('/daily-check-in');
      return;
    }

    // Only auto-redirect if there's no error
    if (!error && !localError) {
      // Redirect to Auth0 Universal Login
      const doLogin = async () => {
        try {
          const redirect_uri = `${window.location.origin}/callback`;
          console.log('[Login] Calling loginWithRedirect with:', { redirect_uri, screen_hint: 'login' });
          
          await loginWithRedirect({
            authorizationParams: {
              redirect_uri,
              screen_hint: 'login',
            },
          });
        } catch (e) {
          console.error('[Login] Redirect failed:', e);
          setLocalError(e instanceof Error ? e.message : 'Failed to redirect to login');
        }
      };

      void doLogin();
    }
  }, [isAuthenticated, isLoading, loginWithRedirect, navigate, error, localError, retryAttempts]);

  const handleRetry = () => {
    console.log('[Login] Retry button clicked, clearing errors');
    setLocalError(null);
    setRetryAttempts(prev => prev + 1);
  };

  const handleManualLogin = async () => {
    console.log('[Login] Manual login button clicked');
    try {
      const redirect_uri = `${window.location.origin}/callback`;
      console.log('[Login] Manual redirect with:', { redirect_uri });
      
      await loginWithRedirect({
        authorizationParams: {
          redirect_uri,
          screen_hint: 'login',
        },
      });
    } catch (e) {
      console.error('[Login] Manual redirect failed:', e);
      setLocalError(e instanceof Error ? e.message : 'Failed to redirect to login');
    }
  };

  // Show loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-4">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground mb-4">
          {error || localError ? 'Login failed' : 'Redirecting to login...'}
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
              Retry Login
            </button>
            <button
              onClick={handleManualLogin}
              className="w-full px-4 py-2 border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Continue to Login
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

export default Login;
