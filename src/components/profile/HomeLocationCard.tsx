/**
 * HomeLocationCard — Sprint 10 / Phase 9B
 *
 * Minimal home-anchor capture surface on the Profile page. Lets the user:
 *   • See whether a home location is set (no raw coordinates shown).
 *   • Set it using the current device location (browser or iOS).
 *   • Change it (explicit confirmation, calls set-home-location with force:true).
 *   • See when the last travel_state sync ran (meta.last_sync_at only —
 *     never rely on updated_at, which the sync producer also touches on skip).
 *
 * No manual lat/lng input; no map; no external geocoding. Keeps scope small.
 */

import { useEffect, useState } from 'react';
import { Home, MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE } from '@/config/devMode';

interface HomeStatus {
  isSet: boolean;
  setAt: string | null;
  timezone: string | null;
  lastSyncAt: string | null;
  travelState: string | null;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return `${days} d ago`;
}

export default function HomeLocationCard() {
  const { user } = useAuth();
  const [status, setStatus] = useState<HomeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmChange, setConfirmChange] = useState(false);

  const loadStatus = async () => {
    if (!user?.id) return;
    // Read through the authenticated `profile-account` edge function. The
    // browser client is publishable-key only, so a direct `profiles` /
    // `travel_state` read carries no Auth0 identity, matches no RLS policy,
    // and always came back empty — the card kept showing "Not set" even
    // after a successful save.
    try {
      const token = DEV_MODE ? null : await getAuthToken().catch(() => null);
      const { data, error } = await supabase.functions.invoke('profile-account', {
        body: { action: 'home_status' },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      const res = data as {
        isSet?: boolean;
        setAt?: string | null;
        timezone?: string | null;
        lastSyncAt?: string | null;
        travelState?: string | null;
      } | null;
      setStatus({
        // Explicit null-check upstream: 0.0 lat/lng is a valid coordinate.
        isSet: !!res?.isSet,
        setAt: res?.setAt ?? null,
        timezone: res?.timezone ?? null,
        lastSyncAt: res?.lastSyncAt ?? null,
        travelState: res?.travelState ?? null,
      });
    } catch (err) {
      console.error('[HomeLocationCard] status load failed:', err);
    }
  };

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const captureLocation = async (force: boolean): Promise<void> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Location not available on this device.');
      return;
    }
    setLoading(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10_000,
          maximumAge: 5 * 60_000,
        });
      });
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
      const token = await getAuthToken();
      if (!token) throw new Error('not_authenticated');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/set-home-location`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timezone: tz,
          force,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok === false) {
        if (res.status === 409) {
          setConfirmChange(true);
          return;
        }
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      toast.success(force ? 'Home location changed.' : 'Home location set.');
      await loadStatus();
    } catch (err) {
      const msg = (err as Error)?.message ?? 'Failed to set home location.';
      // Do not surface OS coord errors verbatim (some browsers include lat/lng).
      toast.error(msg.length > 80 ? 'Could not read your location.' : msg);
    } finally {
      setLoading(false);
      setConfirmChange(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px] font-sans font-medium flex items-center gap-2">
          <Home className="h-4 w-4 text-muted-foreground" /> Home location
        </CardTitle>
        <CardDescription className="font-sans">
          Used to tell local days from travel days. We never show or share your address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between py-1 border-b border-border">
          <span className="text-sm text-muted-foreground">Status</span>
          <span className="text-sm">
            {status == null ? '…' : status.isSet ? 'Set' : 'Not set'}
          </span>
        </div>
        {status?.timezone && (
          <div className="flex items-center justify-between py-1 border-b border-border">
            <span className="text-sm text-muted-foreground">Home timezone</span>
            <span className="text-sm">{status.timezone}</span>
          </div>
        )}
        {status?.isSet && (
          <div className="flex items-center justify-between py-1 border-b border-border">
            <span className="text-sm text-muted-foreground">Last travel sync</span>
            <span className="text-sm">{formatRelative(status.lastSyncAt)}</span>
          </div>
        )}
        {status?.travelState && (
          <div className="flex items-center justify-between py-1 border-b border-border">
            <span className="text-sm text-muted-foreground">Travel state</span>
            <span className="text-sm capitalize">{status.travelState.replace(/_/g, ' ')}</span>
          </div>
        )}

        {!status?.isSet ? (
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => captureLocation(false)}
            disabled={loading}
          >
            <MapPin className="h-4 w-4" />
            {loading ? 'Setting…' : 'Use current location as home'}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => setConfirmChange(true)}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Change home location
          </Button>
        )}
      </CardContent>

      <Dialog open={confirmChange} onOpenChange={setConfirmChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change home location?</DialogTitle>
            <DialogDescription>
              This will replace your current home anchor with your device's current
              location. Travel detection will re-calibrate from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={() => captureLocation(true)} disabled={loading}>
              {loading ? 'Updating…' : 'Use current location'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}