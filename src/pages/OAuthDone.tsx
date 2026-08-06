import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { isNativeApp } from '@/utils/healthKitCapacitor';

export default function OAuthDone() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const calendarConnected = searchParams.get('calendar_connected') === 'true';
  const ouraConnected = searchParams.get('oura_connected') === 'true';
  const connected = calendarConnected || ouraConnected || searchParams.get('connected') === 'true';
  const provider = searchParams.get('provider') || 'provider';
  const reason = searchParams.get('reason');
  const rawRedirectPath = searchParams.get('redirectPath');
  const redirectPath = rawRedirectPath && rawRedirectPath.startsWith('/') ? rawRedirectPath : '/profile';

  useEffect(() => {
    // 1. Notify any active listeners in the background (web or main WebView)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mm:connections-changed'));
    }

    // 2. On native iOS, redirecting to the custom app scheme instructs iOS to
    //    close SFSafariViewController and fire appUrlOpen in the native shell.
    if (isNativeApp()) {
      const schemeUrl = `app.mindmodule.me://oauth-complete?${searchParams.toString()}`;
      console.log('[OAuthDone] Triggering native app scheme return:', schemeUrl);
      try {
        window.location.href = schemeUrl;
      } catch (e) {
        console.warn('[OAuthDone] Custom scheme return failed:', e);
      }
    }
  }, [searchParams]);

  const handleReturnToApp = () => {
    if (isNativeApp()) {
      const schemeUrl = `app.mindmodule.me://oauth-complete?${searchParams.toString()}`;
      try {
        window.location.href = schemeUrl;
      } catch {
        navigate(redirectPath, { replace: true });
      }
    } else {
      navigate(redirectPath, { replace: true });
    }
  };

  const providerName =
    provider === 'google'
      ? 'Google Calendar'
      : provider === 'microsoft'
      ? 'Microsoft Calendar'
      : provider === 'oura'
      ? 'Oura Ring'
      : provider === 'apple'
      ? 'Apple Calendar'
      : provider;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full p-6 rounded-2xl bg-card border border-border/50 shadow-xl text-center space-y-6">
        {connected ? (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {providerName} Connected!
            </h2>
            <p className="text-sm text-muted-foreground">
              Your connection has been saved successfully. Returning to Mind Module...
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive mx-auto flex items-center justify-center">
              <XCircle className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Connection Could Not Complete
            </h2>
            <p className="text-sm text-muted-foreground">
              {reason ? `Reason: ${reason}` : 'The connection process was cancelled or encountered an error.'}
            </p>
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={handleReturnToApp}
            className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Mind Module</span>
          </button>
        </div>
      </div>
    </div>
  );
}
