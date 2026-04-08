import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
    <div className="mx-4 my-2">
      <button
        onClick={() => navigate('/daily-check-in')}
        className="w-full rounded-xl py-3 px-5 text-[13px] font-medium font-body text-white tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
        style={{ background: ACCENT }}
      >
        Check in to sharpen your brief
      </button>
    </div>
  );
};

export default CheckInBanner;
