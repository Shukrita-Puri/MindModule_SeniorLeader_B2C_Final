import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { getTodayCheckin } from '@/utils/dailyCheckins';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const AssessmentPill = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: checkin } = useQuery({
    queryKey: ['today-checkin-pill', user?.id],
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    queryFn: () => getTodayCheckin(),
  });

  if (checkin) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/daily-check-in')}
      aria-label="Take assessment"
      className={cn(
        'fixed left-2 top-1/2 -translate-y-1/2 z-30',
        'group flex items-center gap-1.5 rounded-full',
        'bg-background/70 backdrop-blur-md border border-border/60',
        'px-2.5 py-2 text-[10px] uppercase tracking-[0.18em] text-foreground/80',
        'shadow-sm hover:bg-background/90 transition-colors'
      )}
    >
      <ClipboardCheck className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Take assessment</span>
    </button>
  );
};

export default AssessmentPill;