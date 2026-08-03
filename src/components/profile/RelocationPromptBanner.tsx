/**
 * RelocationPromptBanner
 *
 * Surfaces a one-line prompt when the backend has flagged a sustained
 * timezone divergence (profiles.possible_relocation_detected). Tapping it
 * takes the user to the Profile page where HomeLocationCard lets them update
 * their home anchor. Dismissing clears the flag so it does not nag.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function RelocationPromptBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setVisible(false);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('possible_relocation_detected')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setVisible((data as any)?.possible_relocation_detected === true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!visible) return null;

  const clearFlag = async () => {
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ possible_relocation_detected: false } as never)
      .eq('id', user.id);
  };

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setVisible(false);
    await clearFlag().catch(() => {});
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/profile')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') navigate('/profile');
      }}
      className="flex cursor-pointer items-center gap-3 border-b border-border bg-muted/60 px-4 py-2.5 text-sm text-foreground"
    >
      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex-1 leading-snug">
        Your timezone suggests you may have moved. Update your home location?
      </span>
      <button
        type="button"
        aria-label="Dismiss relocation prompt"
        onClick={handleDismiss}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}