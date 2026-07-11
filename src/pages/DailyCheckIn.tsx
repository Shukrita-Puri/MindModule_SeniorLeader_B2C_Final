import { useLocation, useNavigate } from "react-router-dom";
import { DEV_MODE, DEV_USER } from "@/config/devMode";
import { trackEngagement } from "@/utils/engagementTracking";
import { useAuth } from "@/hooks/useAuth";
import { getAuthToken } from '@/services/authTokenService';
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearTodayCheckinCache, saveCheckin, getCurrentTimeWindow } from "@/utils/dailyCheckins";
import { mapCheckInToTags } from "@/utils/checkInToTags";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import LeftSidebar from "@/components/navigation/LeftSidebar";
import SidebarDiscoveryPulse from "@/components/navigation/SidebarDiscoveryPulse";

import TodayHero from "@/components/today/TodayHero";
import TodayGreeting from "@/components/today/TodayGreeting";
import { Slider } from "@/components/ui/slider";
import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import FirstSessionGuide from "@/components/onboarding/FirstSessionGuide";
import InsightInfoModal from "@/components/insights/InsightInfoModal";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { fetchOnboardingProgressSnapshot, hasCompletedFirstSessionWalkthrough, isOnboardingCompleteSnapshot } from "@/utils/onboardingCompletion";
import { ensureTourBoundToUser, hasIntroBeenSeen, FST_KEYS, FIRST_SESSION_TOUR_STARTED_EVENT } from "@/utils/firstSessionTour";
import { clear as clearPersistent, cacheKeys, localISODate } from "@/utils/persistentBriefCache";
import { clearEnergyStateCache } from "@/utils/energyStateEngine";
import { clearOuterReadinessCache } from "@/hooks/useOuterReadiness";
import { useCheckInMode } from "@/hooks/useCheckInMode";

const ACTIVE_TOUR_STEP_KEY = 'first_session_guide_step';
const ACTIVE_TOUR_KEY = 'first_session_guide_active';
const ACTIVE_TOUR_USER_KEY = 'first_session_guide_user';
const RETAKE_TOUR_KEY = 'first_session_guide_retake';

type Outcome = "overwhelmed" | "drained" | "steady" | "scattered" | "focused";

const clarityLabels = ['Clouded', 'Obscured', 'Neutral', 'Lucid', 'Crystal'];
const emotionLabels = ['Reactive', 'Unsettled', 'Balanced', 'Composed', 'Open'];
const pressureLabels = ['Overloaded', 'Elevated', 'Manageable', 'Light', 'Spacious'];
const regulationLabels = ['Reactive', 'Low', 'Holding', 'Strong', 'In Control'];

/**
 * Derive the legacy `outcome` enum from the 4 slider values so downstream
 * brief / scoring / pattern code keeps working unchanged. Order matters:
 * earlier rules win.
 */
function deriveOutcome(
  clarity: number,
  emotion: number,
  pressure: number,
  regulation: number
): Outcome {
  const avg = (clarity + emotion + pressure + regulation) / 4;
  if (pressure === 1 || regulation === 1) return 'overwhelmed';
  if (emotion <= 2 && pressure <= 2) return 'drained';
  if (clarity <= 2 && emotion <= 2) return 'scattered';
  if (avg >= 4 && clarity >= 4) return 'focused';
  return 'steady';
}

const DailyCheckIn = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { dailyCtaTarget, dailyCtaLabel } = useCheckInMode();

  const [clarity, setClarity] = useState(3);
  const [emotion, setEmotion] = useState(3);
  const [pressure, setPressure] = useState(3);
  const [regulation, setRegulation] = useState(3);
  const [clarityTouched, setClarityTouched] = useState(false);
  const [emotionTouched, setEmotionTouched] = useState(false);
  const [pressureTouched, setPressureTouched] = useState(false);
  const [regulationTouched, setRegulationTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const allFourTouched =
    clarityTouched && emotionTouched && pressureTouched && regulationTouched;
  const rClarity = Math.round(clarity);
  const rEmotion = Math.round(emotion);
  const rPressure = Math.round(pressure);
  const rRegulation = Math.round(regulation);

  useEffect(() => {
    // No longer auto-navigates to CheckInDetail; Page 2 is reserved for
    // body sliders in a follow-up. Intentionally no prefetch.
  }, []);

  const { recordStep } = useOnboardingProgress();

  useEffect(() => {
    const handleTourStarted = () => {
      const effectiveId = user?.id || (DEV_MODE ? DEV_USER.id : undefined);
      if (effectiveId) ensureTourBoundToUser(effectiveId);
      setShowGuide(true);
    };

    window.addEventListener(FIRST_SESSION_TOUR_STARTED_EVENT, handleTourStarted);
    return () => window.removeEventListener(FIRST_SESSION_TOUR_STARTED_EVENT, handleTourStarted);
  }, [user?.id]);

  // Show first session guide – DB is the single source of truth for eligibility
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(location.search);
    const hasTourParam = params.get('tour') === '1';
    const effectiveId = user?.id || (DEV_MODE ? DEV_USER.id : undefined);
    const activateGuide = () => {
      // Bind the tour to the active user but DO NOT reset the step or the
      // intro flag — when the user navigates Back from step 2 → step 1, the
      // FirstSessionGuide re-mounts here and we must preserve currentStep
      // (so we don't bounce them back to 0) and must NOT replay the intro
      // modal (which the user reads as "the tour restarted onboarding").
      // Step 0 + active flag are set by the shared startFirstSessionTour
      // helper at the entry points (Stage7 / Profile / sidebar retake).
      sessionStorage.setItem(ACTIVE_TOUR_KEY, '1');
      if (effectiveId) ensureTourBoundToUser(effectiveId);
      // Only initialise step if it isn't already set (fresh entry only).
      if (sessionStorage.getItem(ACTIVE_TOUR_STEP_KEY) == null) {
        sessionStorage.setItem(ACTIVE_TOUR_STEP_KEY, '0');
      }
      // Only clear introSeen on a fresh tour (no step yet). Preserves the
      // "intro already shown" flag during Back navigation between steps.
      if (!hasIntroBeenSeen() && sessionStorage.getItem(ACTIVE_TOUR_STEP_KEY) === '0') {
        // leave introSeen unset so intro can show on the very first mount
      }
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

    if (!DEV_MODE && (hasTourParam || isRetakeForUser)) {
      activateGuide();
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
  }, [location.search, user?.id, user?.onboarding_completed_at]);

  const handleSubmit = async () => {
    if (!allFourTouched || isSubmitting) return;
    setIsSubmitting(true);

    const outcome = deriveOutcome(rClarity, rEmotion, rPressure, rRegulation);
    // Track check-in engagement
    trackEngagement('check_in');

    const now = new Date();
    const timestamp = now.toISOString();
    const checkinDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

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
        clarity_level: rClarity,
        emotion_level: rEmotion,
        pressure_level: rPressure,
        regulation_level: rRegulation,
        data_sources: { check_in: true }
      });

      if (!result) {
        toast({
          title: 'Check-in failed',
          description: 'Unable to save your check-in. Please sign in and try again.',
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      console.log('[Check-In] Saved to database');

      // Persist all 4 slider levels via the daily-checkins edge function
      // (UPDATE_CLARITY_CONFIDENCE accepts the new optional fields). We
      // pass clarity as the `clarity` field and reuse `confidence` to
      // satisfy the edge function's required-field contract — the new
      // emotion/pressure/regulation columns are what we care about.
      try {
        if (DEV_MODE) {
          await supabase
            .from('daily_checkins')
            .update({
              clarity_level: rClarity,
              emotion_level: rEmotion,
              pressure_level: rPressure,
              regulation_level: rRegulation,
            })
            .eq('id', result.id!);
        } else {
          const accessToken = await getAuthToken();
          if (accessToken) {
            await supabase.functions.invoke('daily-checkins', {
              headers: { Authorization: `Bearer ${accessToken}` },
              body: {
                action: 'UPDATE_CLARITY_CONFIDENCE',
                checkinDate,
                checkinId: result.id,
                timeWindow,
                clarity: rClarity,
                // Confidence is no longer captured on Page 1; pass the
                // clarity value to satisfy the legacy required field
                // without overwriting any existing confidence with junk.
                confidence: rClarity,
                emotion: rEmotion,
                pressure: rPressure,
                regulation: rRegulation,
              },
            });
          }
        }
      } catch (e) {
        console.warn('[Check-In] Slider persistence (extra fields) failed:', e);
      }

      // Clear any persisted "awaiting signals" brief payload across all three
      // windows for today — otherwise the synchronous initialData hydrate
      // would replay the stale awaiting view on the next mount/navigation,
      // even though we're about to refetch.
      const todayDate2 = localISODate();
      const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;
      if (effectiveUserId) {
        for (const p of ['morning', 'afternoon', 'evening']) {
          clearPersistent(cacheKeys.brief(effectiveUserId, p, todayDate2));
          clearPersistent(cacheKeys.briefAwaiting(effectiveUserId, p, todayDate2));
        }
      }
      clearTodayCheckinCache();
      clearEnergyStateCache();
      clearOuterReadinessCache(effectiveUserId);

      // Clear mastery plan session caches to force fresh plan generation
      // even if the user crosses a time window while moving through check-in.
      for (const p of ['morning', 'afternoon', 'evening']) {
        sessionStorage.removeItem(`plan-loaded-${todayDate2}-${p}`);
        sessionStorage.removeItem(`plan-data-${todayDate2}-${p}`);
        sessionStorage.removeItem(`plan-energy-hash-${todayDate2}-${p}`);
        sessionStorage.setItem(cacheKeys.planForceRefresh(todayDate2, p), '1');
      }

      queryClient.invalidateQueries({ queryKey: ['energy-state'] });
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });

      // Snapshot-only home: after a check-in save, trigger the server-side
      // rebuild of the 3 Executive Home snapshots, then invalidate the
      // snapshot readers so /executive-home rehydrates from the new rows.
      try {
        const period = getCurrentTimeWindow();
        console.info('[exec-home][refresh:start]', {
          trigger: 'daily_checkin_save',
          localDate: todayDate2,
          window: period,
        });
        const headers: Record<string, string> = {};
        if (DEV_MODE) headers['x-dev-user-id'] = effectiveUserId ?? DEV_USER.id;
        const t = await getAuthToken().catch(() => null);
        if (t) headers.Authorization = `Bearer ${t}`;
        await supabase.functions.invoke('build-executive-home-cards', {
          headers,
          body: {
            mode: 'checkin_save',
            userId: DEV_MODE ? (effectiveUserId ?? DEV_USER.id) : undefined,
            localDate: todayDate2,
            window: period,
          },
        });
      } catch (e) {
        console.warn('[exec-home][refresh:error]', {
          trigger: 'daily_checkin_save',
          error: e instanceof Error ? e.message : String(e),
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mrs-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['current-brief-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['mastery-plan-snapshot'] }),
      ]);

      // Route to the next step based on the user's check-in mode:
      // - Wearable + Self → straight to Today's Brief (wearable supplies body data)
      // - Self-Declared Only → continue to Body State Check-in
      navigate(dailyCtaTarget);
    } catch (error) {
      console.error('[Check-In] Failed to save to database:', error);
      toast({
        title: 'Check-in failed',
        description: 'Unable to save your check-in. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipToHome = async () => {
    if (user?.id) {
      try {
        const now = new Date();
        const skipDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const accessToken = await getAuthToken();
        const [wearable, calendar] = await Promise.all([
          supabase.from('wearable_data').select('id').eq('user_id', user.id).limit(1).maybeSingle(),
          supabase.from('calendar_connections').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
        ]);
        await supabase.functions.invoke('user-events', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: 'LOG_CHECKIN_SKIP',
            skipDate,
            hasWearable: !!wearable.data,
            hasCalendar: !!calendar.data
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
    <div className="h-[100dvh] max-h-[100dvh] min-h-0 flex w-full bg-transparent overflow-hidden">
      <LeftSidebar />
      <SidebarInset className="w-full h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
      <div className="bg-transparent pt-[env(safe-area-inset-top,0px)] pb-[calc(env(safe-area-inset-bottom,0px)+8rem)]">
      <div className="relative">
        <TodayHero />
        <TodayGreeting />
        <header className="absolute top-0 left-0 right-0 z-40 flex items-center px-3 md:px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3">
          <SidebarDiscoveryPulse />
        </header>
      </div>

      <div className="relative z-20 -mt-[170px] md:-mt-[210px]">
      <h1 className="sr-only">Performance Readiness Assessment</h1>

      <div className="flex flex-col max-w-lg mx-auto w-full pt-2 pb-4">

        {/* Glass card wrapper (matches Brief card) — edge-to-edge on mobile */}
        <div className="relative overflow-hidden rounded-t-2xl md:rounded-2xl p-5 flex flex-col
          bg-white
          border border-[#cfc7b8]
          shadow-[0_1px_2px_rgba(0,0,0,0.04)]">

          {/* Eyebrow row inside card (matches Brief card) */}
          <div className="mb-3 flex items-center justify-between gap-2 whitespace-nowrap">
            <span className="text-eyebrow text-[hsl(var(--muted-foreground-v2))] truncate">
              Performance Readiness Assessment
            </span>
            <span className="text-caption text-[hsl(var(--muted-foreground-v2))] shrink-0">
              Mind State Check
            </span>
          </div>

          {/* Four mind sliders — same component / variants as Page 2 */}
          <div data-tour="check-in-carousel" className="flex flex-col gap-5 w-full pt-1">
            {/* 1. Clarity */}
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground font-body inline-flex items-center gap-1.5">
                  Clarity
                  <InsightInfoModal
                    title="Mental Clarity"
                    explanation="What it measures: How cleanly your thinking is landing right now — focus, signal-to-noise, cognitive precision. Why it matters: Clarity degradation is the earliest sign of cognitive overload. When it drops, decision quality follows — usually before you notice."
                  />
                </span>
                <span className="text-[14px] font-medium text-primary font-body">{clarityLabels[rClarity - 1]}</span>
              </div>
              <Slider
                value={[clarity]}
                onValueChange={(v) => { setClarity(v[0]); setClarityTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="clarity"
                className="w-full py-0.5"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Clouded</span>
                <span>Crystal</span>
              </div>
            </div>

            {/* 2. Emotion */}
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground font-body inline-flex items-center gap-1.5">
                  Emotion
                  <InsightInfoModal
                    title="Emotional State"
                    explanation="What it measures: Your current activation level — how reactive or open you are to what's coming at you. Why it matters: Low emotional state doesn't affect your IQ. It affects your interpersonal judgment — tone, read of the room, decisions involving people. That's where leadership errors live."
                  />
                </span>
                <span className="text-[14px] font-medium text-primary font-body">{emotionLabels[rEmotion - 1]}</span>
              </div>
              <Slider
                value={[emotion]}
                onValueChange={(v) => { setEmotion(v[0]); setEmotionTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="emotion"
                className="w-full py-0.5"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Reactive</span>
                <span>Open</span>
              </div>
            </div>

            {/* 3. Pressure */}
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground font-body inline-flex items-center gap-1.5">
                  Pressure
                  <InsightInfoModal
                    title="Internal Pressure"
                    explanation="What it measures: How much you are carrying right now — unresolved decisions, accumulated load, background weight. Why it matters: Pressure builds invisibly. By the time it shows up as behaviour — short temper, poor sleep, flat affect — it has been compounding for days. This catches it earlier."
                  />
                </span>
                <span className="text-[14px] font-medium text-primary font-body">{pressureLabels[rPressure - 1]}</span>
              </div>
              <Slider
                value={[pressure]}
                onValueChange={(v) => { setPressure(v[0]); setPressureTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="sharpness"
                className="w-full py-0.5"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Overloaded</span>
                <span>Spacious</span>
              </div>
            </div>

            {/* 4. Regulation */}
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground font-body inline-flex items-center gap-1.5">
                  Regulation
                  <InsightInfoModal
                    title="Regulation Capacity"
                    explanation="What it measures: Your ability to stay deliberate rather than reactive when pressure, emotion, or load increases. Why it matters: This is the meta-skill the app is building. Every other dimension tells you your state today. Regulation tells you whether you are developing the capacity to perform regardless of state — and whether it is actually improving over time."
                  />
                </span>
                <span className="text-[14px] font-medium text-primary font-body">{regulationLabels[rRegulation - 1]}</span>
              </div>
              <Slider
                value={[regulation]}
                onValueChange={(v) => { setRegulation(v[0]); setRegulationTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="confidence"
                className="w-full py-0.5"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Reactive</span>
                <span>In Control</span>
              </div>
            </div>

            {/* Inline CTA — matches Page 2's saffron pattern */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="mt-2 w-full h-12 rounded-xl font-body text-[15px] font-medium transition-all duration-200 bg-saffron text-saffron-foreground hover:brightness-110 active:scale-[0.98]"
            >
              {isSubmitting ? 'Saving...' : dailyCtaLabel}
            </button>
          </div>
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
    </div>
    </SidebarInset>
    </div>
    </SidebarProvider>
  );
};

export default DailyCheckIn;
