import { useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ExternalLink } from 'lucide-react';
import { DEV_MODE } from '@/config/devMode';
import { CANONICAL_APP_URL } from '@/utils/authRedirect';

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

const Stage8SignupStep = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const redirectInitiated = useRef(false);
  const inIframe = isInIframe();

  useEffect(() => {
    if (DEV_MODE) {
      navigate('/onboarding/results');
      return;
    }
    if (inIframe) return;
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
  }, [isLoading, isAuthenticated, navigate, loginWithRedirect, inIframe]);

  if (DEV_MODE) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Redirecting (dev mode)...</p>
        </div>
      </div>
    );
  }

  if (inIframe) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm mx-auto p-6 space-y-4">
          <p className="text-lg font-semibold text-foreground">Sign up requires a full browser window</p>
          <p className="text-sm text-muted-foreground">
            Auth0 cannot load inside an iframe. Please open the app in a new tab to create your account.
          </p>
          <a
            href={`${CANONICAL_APP_URL}/onboarding/signup-step`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition"
          >
            Open in new tab <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

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
