import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import ErrorMessage from '@/components/ui/error-message';

const Login = () => {
  const { loginWithRedirect, isAuthenticated, isLoading, error } = useAuth0();
  const navigate = useNavigate();
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    // Don't keep trying if there's already an error
    if (error || localError) return;

    // If already authenticated, redirect to daily check-in
    if (isAuthenticated) {
      navigate('/daily-check-in');
      return;
    }

    // Redirect to Auth0 Universal Login
    const doLogin = async () => {
      try {
        await loginWithRedirect({
          authorizationParams: {
            redirect_uri: `${window.location.origin}/callback`,
            screen_hint: 'login',
          },
        });
      } catch (e) {
        console.error('Login redirect failed:', e);
        setLocalError(e instanceof Error ? e.message : 'Failed to redirect to login');
      }
    };

    void doLogin();
  }, [isAuthenticated, isLoading, loginWithRedirect, navigate, error, localError]);

  // Show loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-4">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground mb-4">Redirecting to login...</p>
        
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
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-sm text-primary underline"
          >
            Back to start
          </button>
        )}
      </div>
    </div>
  );
};

export default Login;
