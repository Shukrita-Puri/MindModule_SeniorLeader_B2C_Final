import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import CalendarProviderPicker, { fetchCalendarProvidersState } from '@/components/calendar/CalendarProviderPicker';

interface CalendarConnectionSettingsProps {
  compact?: boolean;
}

const CalendarConnectionSettings = ({
  compact = false
}: CalendarConnectionSettingsProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Handle post-OAuth callback: ?calendar_connected=true → trigger initial sync of the
  // newly-connected provider, then refresh the picker.
  useEffect(() => {
    const calendarCallback = searchParams.get('calendar_connected');
    if (calendarCallback !== 'true') return;

    searchParams.delete('calendar_connected');
    setSearchParams(searchParams, { replace: true });

    const runPostConnectSync = async () => {
      await new Promise(r => setTimeout(r, 500));
      try {
        const state = await fetchCalendarProvidersState();
        const provider =
          state.google?.connected ? 'google' :
          state.microsoft?.connected ? 'microsoft' :
          null;
        if (!provider) {
          toast.error('Calendar connection could not be verified');
          return;
        }
        toast.success('Calendar connected');
        const token = await getAuthToken();
        if (token) {
          const { error: syncError } = await supabase.functions.invoke('sync-calendar', {
            body: { provider },
            headers: { Authorization: `Bearer ${token}` },
          });
          if (syncError) {
            console.warn('[CalendarConnectionSettings] Initial sync error:', syncError);
          } else {
            toast.success('Calendar events synced');
          }
        }
      } catch (err) {
        console.error('[CalendarConnectionSettings] Post-OAuth sync error:', err);
      } finally {
        bumpRefresh();
      }
    };

    runPostConnectSync();
  }, [searchParams, setSearchParams, bumpRefresh]);

  if (compact) {
    return (
      <div className="space-y-3">
        <CalendarProviderPicker
          key={refreshKey}
          redirectPath={typeof window !== 'undefined' ? window.location.pathname : '/'}
          onChanged={bumpRefresh}
        />
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
          <Calendar className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-1">Calendar Integration</h3>
          <p className="text-sm text-muted-foreground">
            Connect Apple, Google, or Microsoft — we sync from whichever you choose.
          </p>
        </div>
      </div>

      <CalendarProviderPicker
        key={refreshKey}
        redirectPath={typeof window !== 'undefined' ? window.location.pathname : '/'}
        onChanged={bumpRefresh}
      />

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