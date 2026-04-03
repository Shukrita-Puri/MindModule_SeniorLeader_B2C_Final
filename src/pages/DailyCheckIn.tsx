import { useNavigate } from "react-router-dom";
import { Zap, Waves, Target, Sparkles, Wind } from "lucide-react";
import TouchOptimized from "@/components/TouchOptimized";
import { trackEngagement } from "@/utils/engagementTracking";
import { useAuth } from "@/hooks/useAuth";
import { getAuthToken } from '@/services/authTokenService';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveCheckin, getCurrentTimeWindow, canCheckInNow } from "@/utils/dailyCheckins";
import FloatingNavigation from "@/components/navigation/FloatingNavigation";
import { useRef, useState, useEffect, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import FirstSessionGuide from "@/components/onboarding/FirstSessionGuide";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";

// New outcome types mapping to internal axes
type Outcome = "overwhelmed" | "drained" | "steady" | "scattered" | "focused";

interface CheckInData {
  outcome: Outcome;
  timestamp: string;
  date: string;
  skipped: boolean;
  completedFull: boolean;
}

const outcomes = [
  {
    value: "overwhelmed" as Outcome,
    icon: Waves,
    title: "Overwhelmed / Stressed",
    subtitle: "Too much, too fast",
    gradient: "from-red-800/90 to-amber-600/90",
  },
  {
    value: "drained" as Outcome,
    icon: Zap,
    title: "Low Energy / Drained",
    subtitle: "Running on empty",
    gradient: "from-slate-700/90 to-gray-400/90",
  },
  {
    value: "steady" as Outcome,
    icon: Target,
    title: "Okay / Steady",
    subtitle: "Grounded. Present.",
    gradient: "from-amber-700/90 to-yellow-200/90",
  },
  {
    value: "scattered" as Outcome,
    icon: Wind,
    title: "Scattered / Unfocused",
    subtitle: "Mind in motion",
    gradient: "from-teal-700/90 to-emerald-300/90",
  },
  {
    value: "focused" as Outcome,
    icon: Sparkles,
    title: "Focused / Energised",
    subtitle: "Sharp and ready",
    gradient: "from-green-800/90 to-yellow-500/90",
  },
];

const DailyCheckIn = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(2); // Start on "Okay / Steady"
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [checkedInMessage, setCheckedInMessage] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  // Check if user has active or trialing subscription
  const hasActiveSubscription = user?.subscription_status === 'active' || user?.subscription_status === 'trialing';

  // Check if user already checked in for this time window
  useEffect(() => {
    canCheckInNow().then(result => {
      if (!result.canCheckIn) {
        setAlreadyCheckedIn(true);
        setCheckedInMessage(result.reason || 'Already checked in.');
      }
    });
  }, []);

  // Show first session guide if user has zero check-ins (or forced via URL param)
  useEffect(() => {
    // Dev/testing: ?tour=1 in URL forces the guide (clears done flag first)
    const params = new URLSearchParams(window.location.search);
    if (params.get('tour') === '1') {
      sessionStorage.removeItem('first_session_done');
      sessionStorage.setItem('first_session_guide_step', '0');
      setShowGuide(true);
      return;
    }

    if (sessionStorage.getItem('first_session_done')) return;

    if (!user?.id) return;
    supabase
      .from('daily_checkins')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => {
        if (count === 0) {
          sessionStorage.setItem('first_session_guide_step', '0');
          setShowGuide(true);
        }
      });
  }, [user?.id]);

  // Fetch connection status
  const { data: connections } = useQuery({
    queryKey: ['connections', user?.id],
    queryFn: async () => {
      if (!user?.id) return { hasWearable: false, hasCalendar: false };
      const [wearable, calendar] = await Promise.all([
        supabase.from('wearable_data').select('id').eq('user_id', user.id).limit(1).maybeSingle(),
        supabase.from('calendar_connections').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle()
      ]);
      return {
        hasWearable: !!wearable.data,
        hasCalendar: !!calendar.data
      };
    },
    enabled: !!user?.id
  });

  // Scroll to initial card on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.children[activeIndex] as HTMLElement;
    if (card) {
      el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.clientWidth) / 2, behavior: 'instant' as ScrollBehavior });
    }
  }, []);

  // Track scroll position for dot indicators
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i] as HTMLElement;
      const childCenter = child.offsetLeft + child.clientWidth / 2;
      const dist = Math.abs(center - childCenter);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    setActiveIndex(closest);
  }, []);

  const handleOutcomeSelect = async (outcome: Outcome) => {
    // Track check-in engagement
    trackEngagement('check_in');

    const now = new Date();
    const timestamp = now.toISOString();
    const checkinDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const checkInData: CheckInData = {
      outcome,
      timestamp,
      date: now.toDateString(),
      skipped: false,
      completedFull: true
    };

    // Save to database (no localStorage for sensitive check-in data)
    const timeWindow = getCurrentTimeWindow();
    try {
      const result = await saveCheckin({
        checkin_date: checkinDate,
        time_window: timeWindow,
        outcome,
        skipped: false,
        timestamp,
        data_sources: { check_in: true }
      });

      if (!result) {
        toast({
          title: 'Check-in failed',
          description: 'Unable to save your check-in. Please sign in and try again.',
          variant: 'destructive',
        });
        return;
      }

      console.log('[Check-In] Saved to database');

      // Invalidate energy-state and outer-readiness queries to force refetch
      queryClient.invalidateQueries({ queryKey: ['energy-state'] });
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
      
      // Clear mastery plan session cache to force fresh plan generation
      const todayDate2 = new Date().toISOString().split('T')[0];
      const currentPeriod = getCurrentTimeWindow();
      sessionStorage.removeItem(`plan-loaded-${todayDate2}-${currentPeriod}`);
      sessionStorage.removeItem(`plan-data-${todayDate2}-${currentPeriod}`);
      sessionStorage.removeItem(`plan-energy-hash-${todayDate2}-${currentPeriod}`);

      // Navigate to optional detail screen for clarity/confidence
      setTimeout(() => {
        navigate('/check-in-detail', { state: { checkinDate, timeWindow } });
      }, 100);
    } catch (error) {
      console.error('[Check-In] Failed to save to database:', error);
      toast({
        title: 'Check-in failed',
        description: 'Unable to save your check-in. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSkipToHome = async () => {
    if (user?.id) {
      try {
        const now = new Date();
        const skipDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const accessToken = await getAuthToken();
        await supabase.functions.invoke('user-events', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: 'LOG_CHECKIN_SKIP',
            skipDate,
            hasWearable: connections?.hasWearable || false,
            hasCalendar: connections?.hasCalendar || false
          }
        });
      } catch (error) {
        console.error('Failed to log checkin skip:', error);
      }
    }

    localStorage.setItem('dailyCheckInSkipped', JSON.stringify({
      skipped: true,
      timestamp: new Date().toISOString(),
      date: new Date().toDateString()
    }));

    navigate('/executive-home');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <FloatingNavigation />

      {/* Already checked in banner */}
      {alreadyCheckedIn && (
        <div className="mx-4 mt-4 p-4 rounded-xl bg-muted border border-border text-center space-y-3">
          <p className="text-sm text-muted-foreground">{checkedInMessage}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setAlreadyCheckedIn(false)}
              className="text-sm font-medium text-primary underline"
            >
              Update anyway
            </button>
            <button
              onClick={() => navigate('/executive-home')}
              className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg"
            >
              Go to Home
            </button>
          </div>
        </div>
      )}
      {/* Hero Banner */}
      <div className="relative h-auto py-8 overflow-hidden">
        <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-2">
          <h1 className="text-4xl font-headline text-foreground tracking-tight">
            Performance Readiness Assessment
          </h1>
          <p className="text-base font-semibold uppercase tracking-widest text-foreground/70 font-body">Mental Sharpness State</p>
          <p className="text-base font-subheadline italic text-muted-foreground">
            Awareness First. Action Follows.
          </p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            A moment to check your inner state, guiding today's performance plan.
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-32">

        {/* Catalog Carousel */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          data-tour="check-in-carousel"
          className="flex gap-4 overflow-x-auto w-full max-w-[100vw] px-[calc(50vw-120px)] pb-4 snap-x snap-mandatory scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {outcomes.map((outcome, idx) => {
            const IconComponent = outcome.icon;
            const isActive = idx === activeIndex;
            return (
              <TouchOptimized
                key={outcome.value}
                onTap={() => handleOutcomeSelect(outcome.value)}
                className="snap-center shrink-0"
              >
                <div
                  className={`
                    w-[240px] h-[280px] rounded-2xl bg-gradient-to-br ${outcome.gradient}
                    flex flex-col items-center justify-center gap-4 p-6
                    border border-white/20 backdrop-blur-sm
                    shadow-[0_8px_32px_rgba(0,0,0,0.15)]
                    transition-all duration-300 cursor-pointer
                    ${isActive ? 'scale-100 opacity-100' : 'scale-[0.92] opacity-60'}
                    hover:scale-[1.02] active:scale-95
                  `}
                >
                  <div className="w-16 h-16 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
                    <IconComponent className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-headline text-white text-center tracking-tight">
                    {outcome.title}
                  </h3>
                  <p className="text-sm text-white/70 font-body italic">
                    {outcome.subtitle}
                  </p>
                </div>
              </TouchOptimized>
            );
          })}
        </div>

        {/* Dot Indicators */}
        <div className="flex gap-2 mt-4">
          {outcomes.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                const el = scrollRef.current;
                if (!el) return;
                const card = el.children[idx] as HTMLElement;
                if (card) {
                  el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.clientWidth) / 2, behavior: 'smooth' });
                }
              }}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                idx === activeIndex ? 'bg-foreground w-6' : 'bg-muted-foreground/30'
              }`}
              aria-label={`Go to card ${idx + 1}`}
            />
          ))}
        </div>
      </div>
      {/* First Session Guide overlay */}
      {showGuide && (
        <FirstSessionGuide onComplete={() => setShowGuide(false)} />
      )}
    </div>
  );
};

export default DailyCheckIn;
