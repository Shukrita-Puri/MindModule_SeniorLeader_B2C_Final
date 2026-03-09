import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Loader2, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { supabase } from '@/integrations/supabase/client';
import { requestHealthKitPermissions, isNativeApp } from '@/utils/healthKitCapacitor';
import { format } from 'date-fns';
import { toast } from 'sonner';

import googleCalendarLogo from '@/assets/shared/google-calendar-logo.avif';
import appleWatchLogo from '@/assets/shared/apple-watch-logo.jpg';

/* ─── Types ─── */

interface ConnectionStatus {
  calendar: { connected: boolean; provider: string | null; lastSync: string | null };
  appleWatch: { connected: boolean; lastSync: string | null };
}

const ConnectedData = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const token = await getAuthToken();
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/check-connections-status`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (res.ok) {
          setStatus(await res.json());
        }
      } catch (err) {
        console.error('[ConnectedData] Failed to fetch status:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, []);

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return `Last synced ${format(new Date(dateStr), 'MMM d, h:mm a')}`;
    } catch {
      return null;
    }
  };

  /* ─── Google Calendar Handlers ─── */

  const handleConnectCalendar = async () => {
    setConnecting('google-calendar');
    try {
      const token = await getAuthToken();
      const { data, error } = await supabase.functions.invoke('calendar-auth', {
        body: {
          action: 'connect',
          provider: 'google',
          redirectPath: '/connected-data',
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error('Error connecting calendar:', err);
      toast.error('Failed to connect calendar');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnectCalendar = async () => {
    const provider = status?.calendar.provider || 'google';
    try {
      const token = await getAuthToken();
      const { error } = await supabase.functions.invoke('calendar-auth', {
        body: { action: 'disconnect', provider },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      setStatus(prev => prev ? { ...prev, calendar: { connected: false, provider: null, lastSync: null } } : prev);
      toast.success('Google Calendar disconnected');
    } catch {
      toast.error('Failed to disconnect calendar');
    }
  };

  /* ─── Apple Watch Handlers ─── */

  const handleConnectAppleWatch = async () => {
    if (!isNativeApp()) {
      toast.info('Apple Watch connects via the native iOS app. Download MindModule from the App Store to connect.');
      return;
    }
    setConnecting('apple-watch');
    try {
      const granted = await requestHealthKitPermissions();
      if (granted) {
        toast.success('Apple Health connected');
        setStatus(prev => prev ? { ...prev, appleWatch: { connected: true, lastSync: new Date().toISOString() } } : prev);
      } else {
        toast.error('Health permissions were denied');
      }
    } catch {
      toast.error('Failed to connect Apple Health');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnectAppleWatch = () => {
    try {
      localStorage.removeItem('contextConnections');
      setStatus(prev => prev ? { ...prev, appleWatch: { connected: false, lastSync: null } } : prev);
      toast.success('Apple Watch disconnected');
    } catch {
      toast.error('Failed to disconnect Apple Watch');
    }
  };

  /* ─── Connection Data ─── */

  const connections = [
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      description: 'Sync your calendar for contextual recommendations',
      logo: <img src={googleCalendarLogo} alt="Google Calendar" className="h-8 w-8 rounded" />,
      connected: status?.calendar.connected ?? false,
      lastSync: formatLastSync(status?.calendar.lastSync ?? null),
      onConnect: handleConnectCalendar,
      onDisconnect: handleDisconnectCalendar,
    },
    {
      id: 'apple-watch',
      name: 'Apple Watch',
      description: 'Connect via Apple Health for HRV and sleep data',
      logo: <img src={appleWatchLogo} alt="Apple Watch" className="h-8 w-8 rounded" />,
      connected: status?.appleWatch.connected ?? false,
      lastSync: formatLastSync(status?.appleWatch.lastSync ?? null),
      onConnect: handleConnectAppleWatch,
      onDisconnect: handleDisconnectAppleWatch,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 safe-area-top bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-headline font-semibold">Connected Data</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          connections.map((conn) => (
            <Card key={conn.id}>
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-4">
                  {/* Brand Logo */}
                  <div className="shrink-0">{conn.logo}</div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground">{conn.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{conn.description}</p>
                    {conn.connected && conn.lastSync && (
                      <p className="text-xs text-muted-foreground mt-0.5">{conn.lastSync}</p>
                    )}
                  </div>

                  {/* Action */}
                  {conn.connected ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={conn.onDisconnect}
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Button
                      size="sm"
                      onClick={conn.onConnect}
                      disabled={connecting === conn.id}
                    >
                      {connecting === conn.id ? 'Connecting…' : 'Connect'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {/* Privacy Policy Link */}
        <Button
          variant="link"
          className="text-sm text-muted-foreground px-0"
          onClick={() => navigate('/privacy')}
        >
          Privacy Policy →
        </Button>
      </div>
    </div>
  );
};

export default ConnectedData;
