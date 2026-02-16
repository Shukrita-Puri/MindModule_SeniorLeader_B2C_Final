import { useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, ExternalLink } from 'lucide-react';

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

const Login = () => {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectInitiated = useRef(false);

  const intendedDestination = (location.state as { from?: string })?.from || '/executive-home';
  const urlParams = new URLSearchParams(window.location.search);
  const returnToParam = urlParams.get('returnTo');
  const finalDestination = returnToParam || intendedDestination;

  const inIframe = isInIframe();

  useEffect(() => {
    if (inIframe) return; // Don't attempt redirect inside iframe
    if (isLoading) return;

    if (isAuthenticated) {
      navigate(finalDestination);
      return;
    }

    if (redirectInitiated.current) return;
    redirectInitiated.current = true;

    loginWithRedirect({
      appState: { returnTo: finalDestination },
      authorizationParams: {
        redirect_uri: `${window.location.origin}/callback`,
        scope: 'openid profile email',
      },
    });
  }, [isLoading, isAuthenticated, navigate, loginWithRedirect, finalDestination, inIframe]);

  if (inIframe) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm mx-auto p-6 space-y-4">
          <p className="text-lg font-semibold text-foreground">Login requires a full browser window</p>
          <p className="text-sm text-muted-foreground">
            Auth0 cannot load inside an iframe. Please open the app in a new tab to sign in.
          </p>
          <a
            href="https://id-preview--eb63fb97-dcc8-4fc5-8148-517646438c6d.lovable.app/login"
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
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </div>
  );
};

export default Login;
