/**
 * CoachSurfaceMessage — displays a proactive coach insight
 * inside the Compass card. Fetches from coach_surface_messages.
 * Renders nothing when no active message exists.
 */

import { useState, useEffect } from 'react';
import { ChatCircle, X } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { useAuth } from '@/hooks/useAuth';

const CoachSurfaceMessage = () => {
  const { user } = useAuth();
  const [message, setMessage] = useState<{ id: string; message: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const fetchMessage = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;

        const { data, error } = await supabase
          .from('coach_surface_messages')
          .select('id, message')
          .eq('user_id', user.id)
          .eq('dismissed', false)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          setMessage({ id: data[0].id, message: data[0].message });
        }
      } catch {
        // Non-fatal — render nothing
      }
    };

    fetchMessage();
  }, [user?.id]);

  const handleDismiss = async () => {
    if (!message) return;
    setDismissed(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      await supabase
        .from('coach_surface_messages')
        .update({ dismissed: true })
        .eq('id', message.id);
    } catch {
      // Non-fatal
    }
  };

  if (!message || dismissed) return null;

  return (
    <div className="flex items-start gap-2 px-3 py-2 bg-muted/20 border-l-[3px] border-l-saffron/40 rounded-sm animate-fade-in">
      <ChatCircle size={14} weight="duotone" className="text-saffron/70 shrink-0 mt-0.5" />
      <p className="text-sm italic text-muted-foreground/80 font-body leading-relaxed flex-1">
        {message.message}
      </p>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-0.5 text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
        aria-label="Dismiss coach message"
      >
        <X size={12} />
      </button>
    </div>
  );
};

export default CoachSurfaceMessage;
