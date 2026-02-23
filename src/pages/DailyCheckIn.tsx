import { useNavigate } from "react-router-dom";
import { Zap, Waves, Target, Sparkles, Wind } from "lucide-react";
import TouchOptimized from "@/components/TouchOptimized";
import { trackEngagement } from "@/utils/engagementTracking";
import { useAuth } from "@/hooks/useAuth";
import { getAuthToken } from '@/services/authTokenService';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveCheckin } from "@/utils/dailyCheckins";
import FloatingNavigation from "@/components/navigation/FloatingNavigation";
import { useRef, useState, useEffect, useCallback } from "react";

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

  // Check if user has active subscription
  const hasActiveSubscription = user?.subscription_status === 'active';

  // Fetch connection status
  const { data: connections } = useQuery({
    queryKey: ['connections', user?.id],
    queryFn: async () => {
      if (!user?.id) return { hasWearable: false, hasCalendar: false };
      const [wearable, calendar] = await Promise.all([
        supabase.from('wearable_data').select('id').eq('user_id', user.id).limit(1).maybeSingle(),
        supabase.from('calendar_connections').select('id').eq('user_id', user.id).single()
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

    const timestamp = new Date().toISOString();
    const checkinDate = timestamp.split('T')[0];

    const checkInData: CheckInData = {
      outcome,
      timestamp,
      date: new Date().toDateString(),
      skipped: false,
      completedFull: true
    };

    // Save to localStorage for immediate use
    localStorage.setItem('dailyCheckIn', JSON.stringify(checkInData));
    console.log('[Check-In] Saved to localStorage:', checkInData);

    // Also save to database for persistence and insights
    try {
      await saveCheckin({
        checkin_date: checkinDate,
        outcome,
        skipped: false,
        timestamp,
        data_sources: { check_in: true }
      });
      console.log('[Check-In] Saved to database');
    } catch (error) {
      console.error('[Check-In] Failed to save to database:', error);
    }

    // Invalidate energy-state query to force refetch
    queryClient.invalidateQueries({ queryKey: ['energy-state'] });

    // Navigate to optional detail screen for clarity/confidence
    setTimeout(() => {
      navigate('/check-in-detail', { state: { checkinDate } });
    }, 100);
  };

  const handleSkipToHome = async () => {
    if (user?.id) {
      try {
        const accessToken = await getAuthToken();
        await supabase.functions.invoke('user-events', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: 'LOG_CHECKIN_SKIP',
            skipDate: new Date().toISOString().split('T')[0],
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

      {/* Hero Banner */}
      <div className="relative h-auto py-8 overflow-hidden">
        <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-2">
          <h1 className="text-4xl font-headline text-foreground tracking-tight">
            Emotional & Cognitive Check-In
          </h1>
          <p className="text-base font-subheadline italic text-muted-foreground">
            Awareness First. Action Follows.
          </p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            A moment to check your inner state, guiding today's performance plan.
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-32">
        {/* Question Header */}
        <div className="text-center mb-6">
          <h2 className="text-xl md:text-2xl font-headline text-foreground tracking-tight mb-2">
            How are you feeling right now?
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed font-body">
            Just your first instinct. Don't overthink it.
          </p>
        </div>

        {/* Catalog Carousel */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
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
    </div>
  );
};

export default DailyCheckIn;
