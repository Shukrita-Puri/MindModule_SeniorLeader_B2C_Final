import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CalendarConnectionSettings = () => {
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

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-saffron/20 to-gold/20 flex items-center justify-center flex-shrink-0">
          <Calendar className="w-6 h-6 text-saffron" />
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
              ? `Connected to ${provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'}`
              : 'Get context-aware practice recommendations based on your schedule'}
          </p>
          {lastSync && (
            <p className="text-xs text-muted-foreground mt-1">
              Last synced: {new Date(lastSync).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {!connected ? (
        <div className="space-y-2">
          <Button
            onClick={() => handleConnect('google')}
            disabled={loading}
            className="w-full justify-start"
            variant="outline"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4 mr-2" />
            )}
            Connect Google Calendar
          </Button>
          <Button
            onClick={() => handleConnect('outlook')}
            disabled={loading}
            className="w-full justify-start"
            variant="outline"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4 mr-2" />
            )}
            Connect Outlook Calendar
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={handleSync}
            disabled={loading}
            variant="outline"
            className="flex-1"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              'Sync Now'
            )}
          </Button>
          <Button
            onClick={handleDisconnect}
            disabled={loading}
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
          >
            Disconnect
          </Button>
        </div>
      )}

      <div className="mt-4 p-3 bg-muted/30 rounded-lg">
        <p className="text-xs text-muted-foreground">
          <strong>What we sync:</strong> We analyze your upcoming meetings to suggest relevant practices
          (e.g., grounding exercises before board meetings, quick resets between back-to-back calls).
          Event titles and times are synced; content is never accessed.
        </p>
      </div>
    </Card>
  );
};

export default CalendarConnectionSettings;
