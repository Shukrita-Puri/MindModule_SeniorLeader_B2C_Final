import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  NATIVE_AUTH_CANCELLED_EVENT,
  getRedirectUri,
  getSanitisedAuth0Audience,
  nativeLogin,
  nativeLoginHandled,
  resetStaleNativeAuth,
} from '@/utils/nativeAuth';
import { clearLogoutGuard } from '@/utils/logoutGuard';
import { useAuth } from '@/hooks/useAuth';
import mmLogo from '@/assets/brand/mm-logo-circle.png';

const LEGAL_KEY = 'mm_legal_accepted_v1';
type LoginState = 'auth0';

const Login = () => {
  const { isAuthenticated: sdkIsAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const { isAuthenticated: appIsAuthenticated, loading: appAuthLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const intendedDestination = (location.state as { from?: string })?.from || '/executive-home';
  const returnToParam = new URLSearchParams(window.location.search).get('returnTo');
  const finalDestination = returnToParam || intendedDestination;

  const [accepted, setAccepted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LEGAL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState<LoginState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  // Auto-redirect already-authenticated users.
  useEffect(() => {
    if (isLoading || appAuthLoading) return;
    if (sdkIsAuthenticated || appIsAuthenticated) {
      navigate(finalDestination, { replace: true });
    }
  }, [isLoading, appAuthLoading, sdkIsAuthenticated, appIsAuthenticated, navigate, finalDestination]);

  // Listen for native browser cancellation so the button un-spins.
  useEffect(() => {
    const onCancel = () => {
      cancelledRef.current = true;
      setBusy(null);
    };
    window.addEventListener(NATIVE_AUTH_CANCELLED_EVENT, onCancel);
    return () => window.removeEventListener(NATIVE_AUTH_CANCELLED_EVENT, onCancel);
  }, []);

  const persistAccepted = useCallback((value: boolean) => {
    setAccepted(value);
    try {
      if (value) localStorage.setItem(LEGAL_KEY, '1');
      else localStorage.removeItem(LEGAL_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const handleProvider = useCallback(
    async () => {
      if (!accepted || busy) return;
      setError(null);
      setBusy('auth0');
      cancelledRef.current = false;
      clearLogoutGuard();
      resetStaleNativeAuth();

      try {
        const result = await nativeLogin({ returnTo: finalDestination });
        if (result.status === 'opened') return;
        if (nativeLoginHandled(result)) return;

        await loginWithRedirect({
          appState: { returnTo: finalDestination },
          authorizationParams: {
            redirect_uri: getRedirectUri(),
            audience: getSanitisedAuth0Audience(),
            scope: 'openid profile email offline_access',
          },
        });
      } catch (e) {
        console.error('[Login] Auth0 redirect failed:', e);
        if (!cancelledRef.current) {
          setBusy(null);
          setError("We couldn't open sign in. Please try again.");
        }
      }
    },
    [accepted, busy, finalDestination, loginWithRedirect],
  );

  // While we're still figuring out auth state, render a calm splash so we
  // don't flash the buttons to an already-signed-in user.
  if (isLoading || appAuthLoading || sdkIsAuthenticated || appIsAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/60" />
      </div>
    );
  }

  const disabled = !accepted || busy !== null;

  return (
    <div
      className="relative min-h-[100svh] w-full overflow-hidden text-foreground"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Premium ambient background — soft layered gradients + subtle grain */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, hsl(40 38% 94%) 0%, hsl(38 30% 90%) 35%, hsl(150 18% 80%) 75%, hsl(165 22% 70%) 100%)',
        }}
      />
      <div
        aria-hidden
        className="absolute -top-32 -left-24 w-[60vw] h-[60vw] rounded-full blur-3xl opacity-50 -z-10"
        style={{ background: 'radial-gradient(circle, hsl(160 30% 78%) 0%, transparent 65%)' }}
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -right-20 w-[70vw] h-[70vw] rounded-full blur-3xl opacity-40 -z-10"
        style={{ background: 'radial-gradient(circle, hsl(35 45% 82%) 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.05] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      <div className="relative flex flex-col min-h-[100svh] px-6 max-w-md mx-auto">
        {/* Top: brand */}
        <header className="pt-10 flex items-center justify-center">
          <div className="flex items-center gap-2.5">
            <img src={mmLogo} alt="" className="w-7 h-7 rounded-full" />
            <span className="text-[19px] font-semibold tracking-tight text-foreground/90">
              Mind Module
            </span>
          </div>
        </header>

        {/* Middle: headline */}
        <section className="flex-1 flex items-center">
          <h1 className="font-serif text-[34px] leading-[1.12] tracking-tight text-foreground/90 text-center w-full">
            Your daily reset
            <br />
            for better
            <br />
            decisions.
          </h1>
        </section>

        {/* Bottom: providers + legal */}
        <section className="pb-6 space-y-3">
          {error && (
            <div className="flex items-center gap-2 text-sm text-foreground/80 bg-white/70 backdrop-blur rounded-xl px-4 py-2.5 border border-black/[0.06]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <ProviderButton
            onClick={handleProvider}
            disabled={disabled}
            busy={busy === 'auth0'}
            label="Continue with Auth0"
          />

          <div className="pt-4 flex items-center justify-between gap-4">
            <label htmlFor="legal-accept" className="text-[13px] text-foreground/75 leading-snug select-none">
              I accept the{' '}
              <Link to="/privacy" className="underline underline-offset-2">
                Privacy Policy
              </Link>{' '}
              &amp;{' '}
              <Link to="/terms" className="underline underline-offset-2">
                Terms of Service
              </Link>
            </label>
            <button
              id="legal-accept"
              type="button"
              role="switch"
              aria-checked={accepted}
              aria-label="Accept Privacy Policy and Terms of Service"
              onClick={() => persistAccepted(!accepted)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                accepted ? 'bg-foreground/85' : 'bg-foreground/15'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                  accepted ? 'translate-x-[22px]' : 'translate-x-[2px]'
                }`}
              />
            </button>
          </div>

          <p className="pt-3 text-[11.5px] leading-relaxed text-foreground/55 text-center">
            Powered by AI →
          </p>
        </section>
      </div>
    </div>
  );
};

function ProviderButton({
  onClick,
  disabled,
  busy,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="relative w-full h-[54px] rounded-full bg-white/95 backdrop-blur-sm border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] flex items-center justify-center px-5 text-[15.5px] font-medium text-foreground/90 transition active:scale-[0.985] disabled:opacity-60 disabled:active:scale-100"
    >
      <span className="absolute left-5 flex items-center justify-center">
        {busy ? <Loader2 className="w-5 h-5 animate-spin text-foreground/60" /> : null}
      </span>
      <span>{label}</span>
    </button>
  );
}

export default Login;
