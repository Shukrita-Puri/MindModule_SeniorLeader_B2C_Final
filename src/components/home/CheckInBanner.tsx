import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { useAuth } from '@/hooks/useAuth';

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
      className="mx-4 my-2 flex items-center justify-between rounded-lg px-3 py-2"
      style={{
        background: '#fff8ed',
        border: '0.5px solid #f5d5b8',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="shrink-0 rounded-full"
          style={{ width: 6, height: 6, background: '#E87A2F' }}
        />
        <span className="text-[11px] font-body" style={{ color: '#E87A2F' }}>
          Check in to sharpen your brief
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/daily-check-in')}
          className="rounded-md text-[10px] font-medium text-white"
          style={{
            background: '#E87A2F',
            padding: '4px 10px',
            borderRadius: 6,
          }}
        >
          Check in
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-sm leading-none"
          style={{ color: '#E87A2F', opacity: 0.6 }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default CheckInBanner;
