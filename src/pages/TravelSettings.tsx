import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Plane, Clock, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useTravelState } from '@/hooks/useTravelState';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  requestTravelLocationPermission,
  manualTravelRefresh,
  getTravelPermissionStatus,
  ensureTravelMonitoringIfAuthorized,
  getTravelPlatform,
  persistPermissionStatus,
  type TravelPermissionStatus,
} from '@/services/travelStateService';
import { useToast } from '@/hooks/use-toast';

const STATE_COPY: Record<string, { label: string; tone: string }> = {
  not_travelling: { label: 'At home', tone: 'text-foreground/70' },
  travel_planned: { label: 'Travel planned', tone: 'text-foreground' },
  en_route: { label: 'En route', tone: 'text-foreground' },
  arrived: { label: 'Arrived', tone: 'text-foreground' },
  returning: { label: 'Returning', tone: 'text-foreground' },
  location_unknown: { label: 'Location unknown', tone: 'text-muted-foreground' },
};

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  return `${Math.round(diff / 86_400_000)} d ago`;
}

export default function TravelSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { snapshot, loading, refresh } = useTravelState();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(
    (user as any)?.travel_notifications_enabled ?? true,
  );
  const [permission, setPermission] = useState<TravelPermissionStatus>('unknown');
  const [showDebug, setShowDebug] = useState(false);
  const platform = getTravelPlatform();

  // Load the persisted travel-notifications preference from the DB so the
  // toggle reflects the real state on mount (not always-on).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('travel_notifications_enabled')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled && data && typeof (data as any).travel_notifications_enabled === 'boolean') {
        setEnabled((data as any).travel_notifications_enabled);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Auto-start native monitoring + read permission on mount and on app resume.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      await ensureTravelMonitoringIfAuthorized();
      const p = await getTravelPermissionStatus();
      if (!cancelled) setPermission(p);
      // Mirror current permission to the DB so server-side state is fresh
      // even when no location ping has fired (e.g. user just revoked).
      void persistPermissionStatus();
    };
    void sync();
    const onVis = () => { if (document.visibilityState === 'visible') void sync(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const handleEnable = async () => {
    setBusy(true);
    const result = await requestTravelLocationPermission();
    const p = await getTravelPermissionStatus();
    setPermission(p);
    void persistPermissionStatus();
    setBusy(false);
    if (result === 'granted') {
      toast({ title: 'Travel detection on', description: "We'll quietly retune nudges to your local time." });
      void refresh();
    } else if (result === 'cooldown') {
      toast({ title: 'Already asked recently', description: 'Open iPhone Settings → Mind Module → Location to change this.' });
    } else if (result === 'unsupported') {
      toast({ title: 'Not supported here', description: 'Automatic travel detection needs the iOS app.' });
    } else {
      toast({ title: 'Permission needed', description: 'Open iPhone Settings → Mind Module → Location and choose Always.' });
    }
  };

  const handleManual = async () => {
    setBusy(true);
    await manualTravelRefresh(user?.id ?? null);
    await refresh();
    setBusy(false);
  };

  const handleToggle = async (next: boolean) => {
    setEnabled(next);
    if (!user?.id) return;
    await supabase.from('profiles').update({ travel_notifications_enabled: next } as any).eq('id', user.id);
  };

  const state = snapshot?.state ?? 'location_unknown';
  const copy = STATE_COPY[state] ?? STATE_COPY.location_unknown;

  const isIosGranted = platform === 'ios' && (permission === 'authorized_always' || permission === 'authorized_when_in_use');
  const isIosDenied = platform === 'ios' && (permission === 'denied' || permission === 'restricted');
  const isIosUndetermined = platform === 'ios' && permission === 'not_determined';
  const isWeb = platform === 'web';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/40 bg-background/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-medium">Travel</h1>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <Card className="p-5">
          <div className="mb-4 flex items-start gap-3">
            <Plane className="mt-0.5 h-5 w-5 text-foreground/70" />
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Current status</div>
              <div className={`mt-1 text-lg font-medium ${copy.tone}`}>{copy.label}</div>
              {snapshot?.lastKnownTimezone && (
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {snapshot.lastKnownTimezone}
                </div>
              )}
              {snapshot?.distanceFromHomeKm != null && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  ~{Math.round(snapshot.distanceFromHomeKm)} km from home
                </div>
              )}
              <div className="mt-1 text-xs text-muted-foreground">
                Last checked {formatRelative(snapshot?.lastLocationAt ?? null)}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-foreground/70" />
            <div className="flex-1">
              {isIosGranted && (
                <>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-foreground" />
                    Automatic travel detection is on
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your iPhone quietly signals departures, arrivals, and timezone changes. No action needed.
                  </p>
                </>
              )}
              {isIosUndetermined && (
                <>
                  <div className="text-sm font-medium">Enable automatic travel detection</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    One permission, then we retune your nudges automatically when you travel. Never shared.
                  </p>
                  <Button size="sm" className="mt-3" onClick={handleEnable} disabled={busy}>
                    Allow location access
                  </Button>
                </>
              )}
              {isIosDenied && (
                <>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertCircle className="h-4 w-4 text-foreground" />
                    Location access is off
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Open iPhone Settings → Mind Module → Location and choose <span className="font-medium">Always</span> to enable automatic travel detection.
                  </p>
                </>
              )}
              {isWeb && (
                <>
                  <div className="text-sm font-medium">Travel status</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Automatic travel detection works best in the iOS app. On the web, we show your latest synced travel status.
                  </p>
                </>
              )}
            </div>
          </div>
        </Card>

        <Card className="flex items-center justify-between p-5">
          <div>
            <div className="text-sm font-medium">Travel notifications</div>
            <p className="mt-1 text-xs text-muted-foreground">Quiet nudges before, during, and after trips.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </Card>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setShowDebug((s) => !s)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {showDebug ? 'Hide' : 'Having issues?'}
          </button>
          {showDebug && (
            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={handleManual} disabled={busy || loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                Update now
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}