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
    if (isLoading) return;

    // If already authenticated, redirect to home
    if (isAuthenticated) {
      navigate('/executive-home');
      return;
    }

    // Check if user came from onboarding flow
    const isOnboardingFlow = window.location.pathname.includes('/onboarding') || 
                             window.location.search.includes('from=onboarding');
    
    // Redirect to Auth0 Universal Login
    const doSignup = async () => {
      try {
        await loginWithRedirect({
          authorizationParams: {
            redirect_uri: `${window.location.origin}/callback${isOnboardingFlow ? '?from=onboarding' : ''}`,
            screen_hint: 'signup',
          },
        });
      } catch (e) {
        console.error('Signup redirect failed:', e);
        setLocalError(e instanceof Error ? e.message : 'Failed to redirect to signup');
      }
    };

    void doSignup();
  }, [isAuthenticated, isLoading, loginWithRedirect, navigate]);

  // Show loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-4">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground mb-4">Redirecting to sign up...</p>
        
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
      </div>
    </div>
  );
};

export default Signup;
