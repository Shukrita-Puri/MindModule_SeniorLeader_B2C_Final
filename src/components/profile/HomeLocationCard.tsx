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
    const [{ data: profile }, { data: travel }] = await Promise.all([
      supabase
        .from('profiles')
        .select('home_lat, home_lng, home_timezone, home_location_set_at')
        .eq('id', user.id)
        .maybeSingle(),
      (supabase as any)
        .from('travel_state')
        .select('state, meta')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    setStatus({
      isSet: !!(profile?.home_lat && profile?.home_lng),
      setAt: (profile as any)?.home_location_set_at ?? null,
      timezone: (profile as any)?.home_timezone ?? null,
      lastSyncAt: (travel as any)?.meta?.last_sync_at ?? null,
      travelState: (travel as any)?.state ?? null,
    });
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
        <CardTitle className="text-[15px] font-medium flex items-center gap-2">
          <Home className="h-4 w-4 text-primary" /> Home location
        </CardTitle>
        <CardDescription>
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