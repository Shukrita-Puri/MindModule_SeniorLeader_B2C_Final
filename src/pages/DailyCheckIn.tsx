import { useNavigate } from "react-router-dom";
import { DEV_MODE, DEV_USER } from "@/config/devMode";
import { AlertTriangle, BatteryLow, Cloud, Minus, ArrowUp } from "lucide-react";
import TouchOptimized from "@/components/TouchOptimized";
import { trackEngagement } from "@/utils/engagementTracking";
import { useAuth } from "@/hooks/useAuth";
import { getAuthToken } from '@/services/authTokenService';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveCheckin, getCurrentTimeWindow, canCheckInNow } from "@/utils/dailyCheckins";
import { mapCheckInToTags } from "@/utils/checkInToTags";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import SidebarDiscoveryPulse from "@/components/navigation/SidebarDiscoveryPulse";
import FloatingPillNav from "@/components/navigation/FloatingPillNav";
import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import FirstSessionGuide from "@/components/onboarding/FirstSessionGuide";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { fetchOnboardingProgressSnapshot, hasCompletedFirstSessionWalkthrough, isOnboardingCompleteSnapshot } from "@/utils/onboardingCompletion";

const ACTIVE_TOUR_STEP_KEY = 'first_session_guide_step';
const ACTIVE_TOUR_KEY = 'first_session_guide_active';
const ACTIVE_TOUR_USER_KEY = 'first_session_guide_user';
const RETAKE_TOUR_KEY = 'first_session_guide_retake';

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
    icon: AlertTriangle,
    title: "Overloaded",
    accent: "#b91c1c", // dark red
  },
  {
    value: "drained" as Outcome,
    icon: BatteryLow,
    title: "Drained",
    accent: "#f87171", // light red
  },
  {
    value: "scattered" as Outcome,
    icon: Cloud,
    title: "Scattered",
    accent: "#a8a29e", // warm grey
  },
  {
    value: "steady" as Outcome,
    icon: Minus,
    title: "Steady",
    accent: "#86efac", // light green
  },
  {
    value: "focused" as Outcome,
    icon: ArrowUp,
    title: "Focused",
    accent: "#15803d", // dark green
  },
];

const DailyCheckIn = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const { recordStep } = useOnboardingProgress();

  // Show first session guide – DB is the single source of truth for eligibility
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const hasTourParam = params.get('tour') === '1';
    const effectiveId = user?.id || (DEV_MODE ? DEV_USER.id : undefined);
    const activateGuide = () => {
      sessionStorage.setItem('first_session_guide_step', '0');
      sessionStorage.setItem('first_session_guide_active', '1');
      if (effectiveId) sessionStorage.setItem('first_session_guide_user', effectiveId);
      sessionStorage.removeItem('first_session_intro_seen');
      setShowGuide(true);
    };

    if (DEV_MODE && hasTourParam) {
      activateGuide();
      return;
    }

    // Allow tour if explicit signals are present, even if onboarding_completed_at is stale
    const isRetakeForUser = sessionStorage.getItem(RETAKE_TOUR_KEY) === effectiveId;
    const isActiveForUser =
      sessionStorage.getItem(ACTIVE_TOUR_KEY) === '1' &&
      sessionStorage.getItem(ACTIVE_TOUR_USER_KEY) === effectiveId;
    const hasTourSignal = hasTourParam || isRetakeForUser || isActiveForUser;

    if (!DEV_MODE && !user?.id) {
      setShowGuide(false);
      return;
    }

    if (!DEV_MODE && !user?.onboarding_completed_at && !hasTourSignal) {
      setShowGuide(false);
      return;
    }

    // In dev mode, don't call backend eligibility checks with a non-JWT token.
    // Start the guide locally for the dev user unless it was explicitly completed in-session.
    if (DEV_MODE) {
      if (!hasTourParam) {
        const isRetakeForUser = sessionStorage.getItem(RETAKE_TOUR_KEY) === effectiveId;
        if (!isRetakeForUser) {
          if (!cancelled) setShowGuide(false);
          return;
        }
      }
      activateGuide();
      if (!cancelled) setShowGuide(true);
      return;
    }

    (async () => {
      try {
        const snapshot = await fetchOnboardingProgressSnapshot();
        if (cancelled) return;

        const walkthroughDone = hasCompletedFirstSessionWalkthrough(snapshot);
        const onboardingComplete = isOnboardingCompleteSnapshot(snapshot) || !!user?.onboarding_completed_at;
        const isActiveForUserAsync =
          sessionStorage.getItem(ACTIVE_TOUR_KEY) === '1' &&
          sessionStorage.getItem(ACTIVE_TOUR_USER_KEY) === effectiveId;
        const isRetakeForUserAsync = sessionStorage.getItem(RETAKE_TOUR_KEY) === effectiveId;
        const shouldForceTour = hasTourParam && (!walkthroughDone || isRetakeForUserAsync);

        // Allow tour if explicit tour signals are present even if onboarding not yet marked complete
        if ((!onboardingComplete && !isRetakeForUserAsync && !hasTourParam && !isActiveForUserAsync) || (walkthroughDone && !isRetakeForUserAsync && !shouldForceTour)) {
          sessionStorage.removeItem(ACTIVE_TOUR_STEP_KEY);
          sessionStorage.removeItem(ACTIVE_TOUR_KEY);
          sessionStorage.removeItem(ACTIVE_TOUR_USER_KEY);
          if (!cancelled) setShowGuide(false);
          return;
        }

        if (!isActiveForUserAsync || isRetakeForUserAsync || shouldForceTour) {
          activateGuide();
        }

        if (!cancelled) setShowGuide(true);
      } catch {
        if (!cancelled) setShowGuide(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.onboarding_completed_at]);

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

  const handleConfirm = async () => {
    if (!selectedOutcome || isSubmitting) return;
    setIsSubmitting(true);
    await handleOutcomeSelect(selectedOutcome);
    setIsSubmitting(false);
  };

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

    // Derive state_tags from outcome (energy/state/recommendation tags), deduped
    const tagMapping = mapCheckInToTags(outcome);
    const stateTags = Array.from(new Set([
      tagMapping.stateTag,
      tagMapping.energyTag,
      ...tagMapping.recommendationTags,
    ].filter(Boolean)));

    try {
      const result = await saveCheckin({
        checkin_date: checkinDate,
        time_window: timeWindow,
        outcome,
        skipped: false,
        timestamp,
        state_tags: stateTags,
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
    <SidebarProvider defaultOpen={false}>
    <div className="h-screen flex w-full bg-background overflow-hidden">
      <LeftSidebar />
      <SidebarInset className="w-full overflow-x-hidden overflow-y-auto">
      <div className="h-[100dvh] flex flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top,0px)] pb-[calc(env(safe-area-inset-bottom)+8.75rem)]">
      <header className="flex items-center px-3 md:px-4 py-3">
        <SidebarDiscoveryPulse />
      </header>

      {/* Hero Banner – compact for single-fold */}
      <div className="relative h-auto overflow-hidden px-4 pt-1 pb-2">
        <div className="relative h-full flex flex-col items-center justify-center text-center z-10 space-y-1.5">
          <h1 className="text-[28px] sm:text-3xl font-headline font-bold text-foreground tracking-tight leading-tight">
            Performance Readiness Assessment
          </h1>
          <p className="text-sm tracking-[0.08em] uppercase text-muted-foreground/60 font-body leading-none">Mental Energy State</p>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 flex-col px-4 max-w-lg mx-auto w-full">

        {/* Instruction */}
        <p className="text-sm text-muted-foreground font-body mb-4 tracking-wide text-center leading-none">
          Select your current state
        </p>

        {/* Vertical state list – compact gaps */}
        <div data-tour="check-in-carousel" className="flex flex-1 flex-col gap-2.5 w-full pt-0.5">
          {outcomes.map((outcome) => {
            const IconComponent = outcome.icon;
            const isSelected = selectedOutcome === outcome.value;
            return (
              <TouchOptimized
                key={outcome.value}
                onTap={() => setSelectedOutcome(outcome.value)}
                className="w-[84%] mx-auto"
              >
                <div
                  className={`
                    w-full rounded-2xl bg-gradient-to-br ${outcome.gradient}
                    min-h-[58px] flex items-center gap-3.5 px-4 py-2.5
                    border backdrop-blur-sm cursor-pointer
                    transition-all duration-200
                    ${isSelected
                      ? 'scale-[1.02] shadow-[0_8px_28px_rgba(0,0,0,0.30)] border-white/40 opacity-100'
                      : 'border-white/20 opacity-85 hover:opacity-100'}
                  `}
                >
                  <div className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shrink-0">
                    <IconComponent className="w-5 h-5 text-white" strokeWidth={outcome.value === 'scattered' ? 1.5 : 2} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-[15px] font-medium font-body text-white tracking-[0.01em] leading-tight">
                      {outcome.title}
                    </h3>
                  </div>
                </div>
              </TouchOptimized>
            );
          })}
        </div>
      </div>

      {/* Sticky bottom CTA – sits above pill nav, behind sidebar overlay */}
      <div className="fixed left-0 right-0 z-30 px-4 pt-2 pb-2.5 bg-gradient-to-t from-background via-background to-background/0"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}
      >
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleConfirm}
            disabled={!selectedOutcome || isSubmitting}
            className={`
              w-[84%] mx-auto block h-12 rounded-xl font-body text-[15px] font-medium tracking-wide
              transition-all duration-200
              ${selectedOutcome
                ? 'bg-taupe text-white shadow-lg hover:bg-taupe/90 active:scale-[0.98]'
                : 'bg-muted text-muted-foreground cursor-not-allowed'}
            `}
          >
            {isSubmitting ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
      {/* First Session Guide overlay */}
      {showGuide && (
        <FirstSessionGuide onComplete={() => {
          setShowGuide(false);
          recordStep('first_session_walkthrough', { completed: true });
        }} />
      )}
    </div>
    <FloatingPillNav />
    </SidebarInset>
    </div>
    </SidebarProvider>
  );
};

export default DailyCheckIn;
