import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { useAuth } from '@/hooks/useAuth';

const ACCENT = '#F26A50';

const CheckInBanner = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [hasCheckinToday, setHasCheckinToday] = useState<boolean | null>(null);

  useEffect(() => {
    const checkToday = async () => {
      const today = new Date().toISOString().split('T')[0];
      const userId = DEV_MODE ? DEV_USER.id : user?.id;
      if (!userId) return;

      try {
        const { data } = await supabase
          .from('daily_checkins')
          .select('id')
          .eq('user_id', userId)
          .eq('checkin_date', today)
          .limit(1);

        setHasCheckinToday(!!(data && data.length > 0));
      } catch {
        setHasCheckinToday(false);
      }
    };

    checkToday();
  }, [user?.id]);

  if (dismissed || hasCheckinToday === null || hasCheckinToday) return null;

  return (
    <div
      className="mx-4 my-2 flex items-center justify-between rounded-xl px-4 py-3 bg-white/65 backdrop-blur-[20px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-center gap-1.5">
        <span
          className="shrink-0 rounded-full bg-muted-foreground/50"
          style={{ width: 6, height: 6 }}
        />
        <span className="text-[11px] font-body text-foreground/70">
          Check in to sharpen your brief
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/daily-check-in')}
          className="rounded-md text-[10px] font-medium text-white"
          style={{
            background: ACCENT,
            padding: '4px 10px',
            borderRadius: 6,
          }}
        >
          Check in
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-sm leading-none text-muted-foreground/60"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default CheckInBanner;
