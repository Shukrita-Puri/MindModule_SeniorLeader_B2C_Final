import { useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, ChevronLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isNativeApp } from '@/utils/healthKitCapacitor';
import { supabase } from '@/integrations/supabase/client';

export default function OAuthDone() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hasTriggeredRef = useRef(false);

  const calendarConnected = searchParams.get('calendar_connected') === 'true';
  const ouraConnected = searchParams.get('oura_connected') === 'true';
  const connected = calendarConnected || ouraConnected || searchParams.get('connected') === 'true';
  const provider = searchParams.get('provider') || 'provider';
  const reason = searchParams.get('reason');
  const rawRedirectPath = searchParams.get('redirectPath');
  const redirectPath = rawRedirectPath && rawRedirectPath.startsWith('/') ? rawRedirectPath : '/connected-data';

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

  const targetUrl = `${redirectPath}${redirectPath.includes('?') ? '&' : '?'}${searchParams.toString()}`;

  useEffect(() => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    // 1. Dispatch global event for active UI components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mm:connections-changed'));
    }

    // 2. Display success/failure toast and trigger immediate initial sync
    if (connected) {
      toast.success(`${providerName} connected successfully!`);

      // Trigger immediate initial data sync in background (bypassing 15-30min cron wait)
      if (provider === 'oura') {
        void supabase.functions.invoke('oura-sync').catch((err) => {
          console.warn('[OAuthDone] Initial Oura sync warning:', err);
        });
      } else if (['google', 'microsoft', 'apple'].includes(provider)) {
        void supabase.functions.invoke('sync-calendar').catch((err) => {
          console.warn('[OAuthDone] Initial Calendar sync warning:', err);
        });
      }
    } else {
      toast.error(reason ? `Connection error: ${reason}` : `Could not connect ${providerName}.`);
    }

    // 3. On native iOS, redirecting to the custom app scheme instructs iOS to
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

    // 4. Automatic return timer (1.2s delay to display confirmation tick & toast)
    const timer = setTimeout(() => {
      navigate(targetUrl, { replace: true });
    }, 1200);

    return () => clearTimeout(timer);
  }, [connected, provider, providerName, reason, searchParams, redirectPath, targetUrl, navigate]);

  const handleReturnToApp = () => {
    if (isNativeApp()) {
      const schemeUrl = `app.mindmodule.me://oauth-complete?${searchParams.toString()}`;
      try {
        window.location.href = schemeUrl;
      } catch {
        navigate(targetUrl, { replace: true });
      }
    } else {
      navigate(targetUrl, { replace: true });
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4" data-testid="oauth-done-page">
      <div className="max-w-md w-full p-6 rounded-2xl bg-card border border-border/50 shadow-xl text-center space-y-6 animate-fade-in">
        {connected ? (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {providerName} Connected!
            </h2>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              Syncing initial data &amp; returning to Mind Module…
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
            className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2 text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Return to Mind Module</span>
          </button>
        </div>
      </div>
    </div>
  );
}
