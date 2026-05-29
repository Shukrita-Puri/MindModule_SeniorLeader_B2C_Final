import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Plane, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useTravelState } from '@/hooks/useTravelState';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  requestTravelLocationPermission,
  manualTravelRefresh,
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

export default function TravelSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { snapshot, loading, refresh } = useTravelState();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const handleEnable = async () => {
    setBusy(true);
    const result = await requestTravelLocationPermission();
    setBusy(false);
    if (result === 'granted') {
      toast({ title: 'Travel detection on', description: "We'll quietly retune nudges to your local time." });
      void refresh();
    } else if (result === 'cooldown') {
      toast({ title: 'Already asked recently', description: 'Open iOS Settings → Mind Module → Location to change this.' });
    } else if (result === 'unsupported') {
      toast({ title: 'Not supported here', description: 'Travel detection needs the iOS app.' });
    } else {
      toast({ title: 'Permission needed', description: 'Travel-aware notifications need background location.' });
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
            </div>
          </div>

          <Button variant="outline" size="sm" className="w-full" onClick={handleManual} disabled={busy || loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            Update now
          </Button>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-foreground/70" />
            <div className="flex-1">
              <div className="text-sm font-medium">Background location</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Used only to detect when you depart, arrive, or change time zones so pre/during/post-travel
                nudges fire at the right local time. Never shared.
              </p>
              <Button size="sm" className="mt-3" onClick={handleEnable} disabled={busy}>
                Enable travel detection
              </Button>
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
      </main>
    </div>
  );
}