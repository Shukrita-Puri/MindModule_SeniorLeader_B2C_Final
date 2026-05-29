import { useState, useEffect, useCallback } from "react";
import { Loader2, Mail, AlertCircle } from "lucide-react";
import mmLogoCircle from "@/assets/brand/mm-logo-circle.png";
import heroIllustration from "@/assets/onboarding/usp-sky-light.jpeg";
import { Link, useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { clearSession } from "@/utils/onboardingStorage";
import { DEV_MODE } from "@/config/devMode";
import {
  getRedirectUri,
  nativeLogin,
  nativeLoginHandled,
  getSanitisedAuth0Audience,
  resetStaleNativeAuth,
  NATIVE_AUTH_CANCELLED_EVENT,
} from "@/utils/nativeAuth";
import { useAuth } from "@/hooks/useAuth";
import { clearLogoutGuard, isLogoutGuardActive } from "@/utils/logoutGuard";
import { hasValidAccess, isWithin60DaysOfCancellation } from "@/utils/subscriptionHelpers";
import { getResumeRoute } from "@/utils/onboardingStatus";
import { PAYMENT_PAGE_SUPPRESSED } from "@/config/payments";

const CANONICAL_HOME = '/daily-check-in';
const LEGAL_KEY = 'mm_legal_accepted_v1';

const GOOGLE_CONNECTION = 'google-oauth2';
const MICROSOFT_CONNECTION =
  (import.meta.env.VITE_AUTH0_MICROSOFT_CONNECTION as string | undefined) || 'windowslive';
const EMAIL_CONNECTION = import.meta.env.VITE_AUTH0_EMAIL_CONNECTION as string | undefined;

type Provider = 'google' | 'microsoft' | 'email';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 110-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1024 44c11 0 20-8 20-20 0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 006.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2C29.3 35 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5A20 20 0 0024 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 01-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

const Front = () => {
  if (DEV_MODE) {
    return <FrontContent onProvider={async () => {}} isAuthenticated={false} user={null} />;
  }
  return <Auth0Front />;
};

const Auth0Front = () => {
  const { loginWithRedirect } = useAuth0();
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();
  const logoutGuardActive = isLogoutGuardActive();

  // Auto-redirect authenticated users away from the public landing/login page.
  useEffect(() => {
    if (logoutGuardActive) return;
    if (loading || !isAuthenticated || !user) return;

    if (user.onboarding_completed_at && (hasValidAccess(user) || PAYMENT_PAGE_SUPPRESSED)) {
      navigate(CANONICAL_HOME, { replace: true });
      return;
    }

    if (!user.onboarding_completed_at) {
      let cancelled = false;
      void getResumeRoute()
        .then((resumeRoute) => {
          if (!cancelled) navigate(resumeRoute, { replace: true });
        })
        .catch(() => {
          if (!cancelled) navigate('/onboarding', { replace: true });
        });

      return () => {
        cancelled = true;
      };
    }

    if (!hasValidAccess(user)) {
      navigate('/onboarding/payment', { replace: true });
    }
  }, [loading, isAuthenticated, user, navigate, logoutGuardActive]);

  const handleProvider = async (connection: string | undefined) => {
    clearLogoutGuard();

    // Already-authenticated paths — route them correctly without starting auth.
    if (isAuthenticated && user?.onboarding_completed_at && hasValidAccess(user)) {
      navigate(CANONICAL_HOME);
      return;
    }
    if (isAuthenticated && user && !user.onboarding_completed_at) {
      try {
        const resumeRoute = await getResumeRoute();
        navigate(resumeRoute);
      } catch {
        navigate('/onboarding');
      }
      return;
    }
    if (isAuthenticated && user?.onboarding_completed_at && !hasValidAccess(user)) {
      navigate(PAYMENT_PAGE_SUPPRESSED ? CANONICAL_HOME : '/onboarding/payment');
      return;
    }

    // Fresh signup/login — clear any onboarding stub so new users start clean.
    clearSession();
    resetStaleNativeAuth();

    const result = await nativeLogin({ returnTo: CANONICAL_HOME, connection });
    if (result.status === 'opened') return;
    if (nativeLoginHandled(result)) return;

    await loginWithRedirect({
      appState: { returnTo: CANONICAL_HOME },
      authorizationParams: {
        redirect_uri: getRedirectUri(),
        audience: getSanitisedAuth0Audience(),
        scope: 'openid profile email offline_access',
        ...(connection ? { connection } : {}),
      },
    });
    // Silence unused-var lint for isWithin60DaysOfCancellation in this slim path.
    void isWithin60DaysOfCancellation;
  };

  if (!logoutGuardActive && (loading || isAuthenticated)) {
    return <FrontLoading />;
  }

  return (
    <FrontContent
      onProvider={handleProvider}
      isAuthenticated={logoutGuardActive ? false : isAuthenticated}
      user={logoutGuardActive ? null : user}
    />
  );
};

const FrontLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
  </div>
);

const FrontContent = ({ onProvider, isAuthenticated, user }: {
  onProvider: (connection: string | undefined) => Promise<void>;
  isAuthenticated: boolean;
  user: any;
}) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<boolean>(() => {
    try { return localStorage.getItem(LEGAL_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    const onCancel = () => setBusy(null);
    window.addEventListener(NATIVE_AUTH_CANCELLED_EVENT, onCancel);
    return () => window.removeEventListener(NATIVE_AUTH_CANCELLED_EVENT, onCancel);
  }, []);

  const persistAccepted = useCallback((value: boolean) => {
    setAccepted(value);
    try {
      if (value) localStorage.setItem(LEGAL_KEY, '1');
      else localStorage.removeItem(LEGAL_KEY);
    } catch { /* ignore */ }
  }, []);

  const handleProvider = async (provider: Provider) => {
    if (!accepted || busy) return;
    if (DEV_MODE) { navigate(CANONICAL_HOME); return; }
    setError(null);
    setBusy(provider);
    const connection =
      provider === 'google' ? GOOGLE_CONNECTION :
      provider === 'microsoft' ? MICROSOFT_CONNECTION :
      EMAIL_CONNECTION;
    try {
      await onProvider(connection);
    } catch (e) {
      console.error('[Front] Auth failed:', e);
      setBusy(null);
      setError("We couldn't open sign in. Please try again.");
    }
  };

  void isAuthenticated; void user;
  const disabled = !accepted || busy !== null;

  return <div className="relative h-screen h-[100dvh] flex flex-col items-center overflow-hidden">
      
      {/* Full-bleed background illustration */}
      <img 
        src={heroIllustration} 
        alt="" 
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
        width={1920}
        height={1080}
      />

      {/* Gradient overlays for depth and readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
      
      {/* Content layer */}
      <div className="relative z-10 flex flex-col items-center justify-between text-center h-full w-full px-5 max-w-4xl mx-auto pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        
        {/* Brand cluster — anchored to upper sky region */}
        <div className="relative flex flex-col items-center space-y-3 sm:space-y-4 mt-2 sm:mt-6">
          {/* Invisible-edged atmospheric scrim — reads as cloud shading, not a container */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[340px] blur-2xl"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0) 75%)",
            }}
          />
          <img src={mmLogoCircle} alt="Mind Module logo" className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full shadow-lg" />
          <h1
            className="relative text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-headline font-bold text-saffron tracking-wider leading-none"
            style={{ textShadow: "0 2px 4px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.45)" }}
          >
            MIND MODULE
          </h1>
          <p
            className="relative text-xs sm:text-xs tracking-[0.35em] uppercase text-white/90 font-body"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)" }}
          >
            Executive Edition
          </p>
        </div>

        {/* Tagline — owns the middle zone */}
        <div className="flex flex-col items-center justify-center flex-1 px-2">
          <h2 className="text-[1.75rem] sm:text-3xl lg:text-4xl font-editorial italic text-white font-bold tracking-wide leading-snug drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)]">
            Designed for Leaders to Stay Mentally Ahead
          </h2>
        </div>

        {/* Bottom zone: provider buttons + legal + reassurance */}
        <div className="flex flex-col items-stretch w-full space-y-3">
          {error && (
            <div className="flex items-center gap-2 text-sm text-foreground/90 bg-white/90 backdrop-blur rounded-xl px-4 py-2.5 border border-black/[0.06]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-left">{error}</span>
            </div>
          )}

          <ProviderPill
            label="Continue with Google"
            icon={<GoogleIcon />}
            busy={busy === 'google'}
            disabled={disabled}
            onClick={() => handleProvider('google')}
          />
          <ProviderPill
            label="Continue with Microsoft"
            icon={<MicrosoftIcon />}
            busy={busy === 'microsoft'}
            disabled={disabled}
            onClick={() => handleProvider('microsoft')}
          />
          <ProviderPill
            label="Continue with Email"
            icon={<Mail className="w-5 h-5 text-foreground/70" />}
            busy={busy === 'email'}
            disabled={disabled}
            onClick={() => handleProvider('email')}
          />

          <div className="pt-3 flex items-center justify-between gap-4">
            <label htmlFor="legal-accept" className="text-[13px] text-white/85 leading-snug select-none text-left drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              I accept the{' '}
              <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>{' '}&amp;{' '}
              <Link to="/terms" className="underline underline-offset-2">Terms of Service</Link>
            </label>
            <button
              id="legal-accept"
              type="button"
              role="switch"
              aria-checked={accepted}
              aria-label="Accept Privacy Policy and Terms of Service"
              onClick={() => persistAccepted(!accepted)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                accepted ? 'bg-saffron' : 'bg-white/25'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                  accepted ? 'translate-x-[22px]' : 'translate-x-[2px]'
                }`}
              />
            </button>
          </div>

          <p className="pt-1 text-[11.5px] leading-relaxed text-white/65 text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
            Privacy by design. Local-first where possible. End-to-end encrypted.{' '}
            <button
              type="button"
              onClick={() => navigate('/powered-by-ai')}
              className="underline underline-offset-2 hover:text-white/85 transition-colors"
            >
              Powered by AI →
            </button>
          </p>
        </div>
      </div>
      
    </div>;
};

function ProviderPill({
  label, icon, busy, disabled, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="relative w-full h-[54px] rounded-full bg-white/95 backdrop-blur-sm border border-white/70 shadow-[0_2px_8px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.18)] flex items-center justify-center px-5 text-[15.5px] font-medium text-foreground/90 transition active:scale-[0.985] disabled:opacity-60 disabled:active:scale-100"
    >
      <span className="absolute left-5 flex items-center justify-center">
        {busy ? <Loader2 className="w-5 h-5 animate-spin text-foreground/60" /> : icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export default Front;
