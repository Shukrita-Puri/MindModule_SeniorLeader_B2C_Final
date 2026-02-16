import { useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const Stage8SignupStep = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const redirectInitiated = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      navigate('/onboarding/results');
      return;
    }

    if (redirectInitiated.current) return;
    redirectInitiated.current = true;

    loginWithRedirect({
      appState: { returnTo: '/onboarding/results' },
      authorizationParams: {
        redirect_uri: `${window.location.origin}/callback?from=onboarding`,
        screen_hint: 'signup',
        scope: 'openid profile email',
      },
    });
  }, [isLoading, isAuthenticated, navigate, loginWithRedirect]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Redirecting to create your account...</p>
      </div>
    </div>
  );
};

export default Stage8SignupStep;
