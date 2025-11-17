import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CalendarConnectionSettingsProps {
  compact?: boolean;
}

const CalendarConnectionSettings = ({ compact = false }: CalendarConnectionSettingsProps) => {
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (data && !error) {
        setConnected(true);
        setProvider(data.provider);
        setLastSync(data.last_sync);
      }
    } catch (error) {
      console.error('Error checking calendar connection:', error);
    }
  };

  const handleConnect = async (selectedProvider: 'google' | 'outlook') => {
    setLoading(true);
    try {
      // Call edge function to get OAuth URL
      const { data, error } = await supabase.functions.invoke('calendar-auth', {
        body: { action: 'connect', provider: selectedProvider }
      });

      if (error) throw error;

      if (data.authUrl) {
        // Redirect to OAuth URL
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error connecting calendar:', error);
      toast.error('Failed to connect calendar');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!provider) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('calendar-auth', {
        body: { action: 'disconnect', provider }
      });

      if (error) throw error;

      setConnected(false);
      setProvider(null);
      setLastSync(null);
      toast.success('Calendar disconnected');
    } catch (error) {
      console.error('Error disconnecting calendar:', error);
      toast.error('Failed to disconnect calendar');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!provider) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('sync-calendar', {
        body: { provider }
      });

      if (error) throw error;

      toast.success('Calendar synced successfully');
      await checkConnection();
    } catch (error) {
      console.error('Error syncing calendar:', error);
      toast.error('Failed to sync calendar');
    } finally {
      setLoading(false);
    }
  };

  // Compact mode for inline use in onboarding
  if (compact) {
    return (
      <div className="space-y-3">
        {!connected ? (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              Choose your calendar provider:
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => handleConnect('google')}
                disabled={loading}
                variant="outline"
                className="flex-1"
                size="sm"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Google'}
              </Button>
              <Button
                onClick={() => handleConnect('outlook')}
                disabled={loading}
                variant="outline"
                className="flex-1"
                size="sm"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Outlook'}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium capitalize">{provider} Connected</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Full card mode for settings pages
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
          <Calendar className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold">Calendar Integration</h3>
            {connected && (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Connected
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {connected 
              ? `Connected to ${provider?.charAt(0).toUpperCase()}${provider?.slice(1)} Calendar`
              : 'Connect your calendar to get personalized practice suggestions based on your schedule'
            }
          </p>
        </div>
      </div>

      {connected ? (
        <div className="space-y-4">
          {lastSync && (
            <p className="text-xs text-muted-foreground">
              Last synced: {new Date(lastSync).toLocaleString()}
            </p>
          )}
          
          <div className="flex gap-2">
            <Button
              onClick={handleSync}
              disabled={loading}
              variant="outline"
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                'Sync Now'
              )}
            </Button>
            <Button
              onClick={handleDisconnect}
              disabled={loading}
              variant="destructive"
            >
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose your calendar provider to get started:
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => handleConnect('google')}
              disabled={loading}
              variant="outline"
              className="flex-1"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Calendar className="w-4 h-4 mr-2" />
              )}
              Google Calendar
            </Button>
            <Button
              onClick={() => handleConnect('outlook')}
              disabled={loading}
              variant="outline"
              className="flex-1"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Calendar className="w-4 h-4 mr-2" />
              )}
              Outlook Calendar
            </Button>
          </div>
        </div>
      )}

      <div className="pt-4 border-t mt-4">
        <p className="text-sm font-medium mb-2">What we sync:</p>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Event times and duration</li>
          <li>• Meeting frequency patterns</li>
          <li>• Calendar availability</li>
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          We respect your privacy. We only access metadata to suggest optimal practice times.
        </p>
      </div>
    </Card>
  );
};

export default CalendarConnectionSettings;
