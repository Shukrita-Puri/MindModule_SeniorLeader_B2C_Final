/**
 * TodayThreePriorities — 3-slot horizon-classified practice sequence.
 * Replaces DailyRitual + JitCarousel on the homepage.
 * Preserves all existing completion tracking, navigation, and player routing.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, Heart, ChevronRight, X, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/hooks/useFavorites';
import { useOuterReadiness } from '@/hooks/useOuterReadiness';
import { toast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';
import { getTodayRitual, upsertRitual } from '@/utils/dailyRituals';
import { getCheckinForWindow, getCurrentTimeWindow } from '@/utils/dailyCheckins';
import { getContentById } from '@/data/practicesAndSoundscapes';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import PostEventReflection from '@/components/home/PostEventReflection';
import MetricInfoModal from '@/components/home/MetricInfoModal';
import PlanFeedbackModal from '@/components/home/PlanFeedbackModal';
import { submitPlanFeedback } from '@/utils/relevanceFeedback';

import coachVisual from '@/assets/shared/coach-visual-calm.jpeg';

// ── Types ──
interface PlanModule {
  type: 'regulate' | 'align' | 'prepare' | 'integrate';
  contentId: string;
  title: string;
  contentType: string;
  duration: number;
  focus: string;
  intensity: string;
  isFavorite: boolean;
  isCoachCard?: boolean;
  reasoning: string;
  required?: boolean;
  thumbnailUrl?: string;
}

interface HorizonModule {
  horizon: 'immediate' | 'tactical' | 'strategic';
  timeLabel: string;
  typeLabel: string;
  whyLine: string;
  practice: PlanModule;
  practices?: PlanModule[];
  sequenceReasoning?: string;
  isJit: boolean;
  jitEventTitle: string | null;
  jitMinutesUntil: number | null;
  showNavyBorder: boolean;
  showPulse: boolean;
  showPriorityPill: boolean;
}

interface CoachCardData {
  id: string;
  type: string;
  label: string;
  protocolType: string;
  title: string;
  duration: number;
  sortOrder: number;
  isCoachCard: true;
  prompt: string;
  eventTitle?: string;
}

interface MasteryPlanResponse {
  timeOfDayPlan: {
    label: string;
    period: 'morning' | 'afternoon' | 'evening';
    modules: PlanModule[];
    coachCard: CoachCardData | null;
    totalDuration: number;
    progressTracked: boolean;
    calendarMessage?: string;
    planBrief?: string;
  };
  preEventPlan: any;
  jitPriority?: boolean;
  horizonModules?: HorizonModule[];
  meta: { generatedAt: string; [key: string]: any };
}

const TodayThreePriorities = ({ onEmpty, onLoaded }: { onEmpty?: () => void; onLoaded?: () => void }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFavorite } = useFavorites();
  const { data: outerReadinessData } = useOuterReadiness();

  const [plan, setPlan] = useState<MasteryPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [completedPracticeIds, setCompletedPracticeIds] = useState<string[]>([]);
  const [expandedSlot, setExpandedSlot] = useState<number>(0);
  const [feedbackSlot, setFeedbackSlot] = useState<{ index: number; horizon: string } | null>(null);
  // Persist celebration/feedback state in sessionStorage so remounts don't re-trigger
  const todayKey = new Date().toISOString().split('T')[0];
  const celebratedStorageKey = `celebrated-ids-${todayKey}`;
  const feedbackSlotsStorageKey = `feedback-slots-${todayKey}`;

  const loadPersistedSet = (key: string): Set<string> => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  };
  const persistSet = (key: string, s: Set<string>) => {
    sessionStorage.setItem(key, JSON.stringify(Array.from(s)));
  };

  const prevCompletedIdsRef = useRef<string[] | null>(null);
  const completedSlotsRef = useRef<Set<number>>(new Set(
    Array.from(loadPersistedSet(feedbackSlotsStorageKey)).map(Number).filter(n => !isNaN(n))
  ));
  const celebratedIdsRef = useRef<Set<string>>(loadPersistedSet(celebratedStorageKey));
  const autoRetryDoneRef = useRef(false);
  const authTimeoutRef = useRef(false);

  // ── Celebration ──
  const triggerCelebration = useCallback((practiceName: string, isAllComplete: boolean, practiceId?: string) => {
    if (practiceId && celebratedIdsRef.current.has(practiceId)) return;
    if (practiceId) {
      celebratedIdsRef.current.add(practiceId);
      persistSet(celebratedStorageKey, celebratedIdsRef.current);
    }
    if (isAllComplete) {
      confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 }, colors: ['#D4AF37', '#F5D76E', '#FFD700', '#FFA500', '#E6C200'] });
      setTimeout(() => {
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.7, x: 0.3 }, colors: ['#D4AF37', '#F5D76E', '#FFD700'] });
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.7, x: 0.7 }, colors: ['#D4AF37', '#F5D76E', '#FFD700'] });
      }, 200);
    } else {
      confetti({ particleCount: 60, spread: 50, origin: { y: 0.6 }, colors: ['#D4AF37', '#8B7355', '#A9957B'] });
    }
    toast({
      title: isAllComplete ? 'All Priorities Complete!' : 'Practice Complete!',
      description: isAllComplete ? "Amazing work! You've completed all three priorities." : `Great job completing "${practiceName}"!`,
    });
  }, []);

  // ── Detect newly completed + per-priority feedback ──
  useEffect(() => {
    const prev = prevCompletedIdsRef.current;
    // Don't seed until plan is loaded — avoids treating existing completions as "new"
    if (prev === null) {
      if (!plan) return;
      prevCompletedIdsRef.current = completedPracticeIds;
      // Pre-populate completedSlotsRef & celebratedIdsRef for already-done slots
      const modules = plan.horizonModules || [];
      modules.forEach((hm, idx) => {
        const sp = hm.practices || [hm.practice];
        if (sp.every(p => completedPracticeIds.includes(p.contentId))) {
          completedSlotsRef.current.add(idx);
        }
      });
      completedPracticeIds.forEach(id => celebratedIdsRef.current.add(id));
      // Persist the seeded state
      persistSet(celebratedStorageKey, celebratedIdsRef.current);
      persistSet(feedbackSlotsStorageKey, new Set([...completedSlotsRef.current].map(String)));
      return;
    }

    const newlyDone = completedPracticeIds.filter(id => !prev.includes(id));
    if (newlyDone.length > 0) {
      const modules = plan?.horizonModules || [];
      const allPracticesList = modules.flatMap(m => m.practices || [m.practice]);
      const found = allPracticesList.find(p => newlyDone.includes(p.contentId));
      const allIds = allPracticesList.map(p => p.contentId);
      const allDone = allIds.every(id => completedPracticeIds.includes(id));
      if (found) triggerCelebration(found.title, allDone, found.contentId);

      // Check if a new priority slot just completed
      modules.forEach((hm, idx) => {
        if (completedSlotsRef.current.has(idx)) return;
        const sp = hm.practices || [hm.practice];
        const slotNowComplete = sp.every(p => completedPracticeIds.includes(p.contentId));
        if (slotNowComplete) {
          completedSlotsRef.current.add(idx);
          persistSet(feedbackSlotsStorageKey, new Set([...completedSlotsRef.current].map(String)));
          setFeedbackSlot({ index: idx, horizon: hm.horizon });
        }
      });
    }
    prevCompletedIdsRef.current = completedPracticeIds;
  }, [completedPracticeIds, plan, triggerCelebration]);

  // ── Load plan ──
  const loadPlan = useCallback(async () => {
    setLoading(true);
    setFetchFailed(false);
    try {
      const currentPeriod = getCurrentTimeWindow();
      const todayDate = new Date().toISOString().split('T')[0];
      const sessionKey = `plan-loaded-${todayDate}-${currentPeriod}`;
      const sessionLoaded = sessionStorage.getItem(sessionKey);
      const todayRitual = await getTodayRitual(currentPeriod);
      const todayCheckin = await getCheckinForWindow(todayDate, currentPeriod);

      const storedPracticeIds = todayRitual?.recommended_practice_ids;
      const hasStoredPlan = storedPracticeIds && storedPracticeIds.length > 0;
      let shouldRegenerate = !hasStoredPlan;

      if (hasStoredPlan && todayRitual?.session_period && todayRitual.session_period !== currentPeriod) {
        shouldRegenerate = true;
        sessionStorage.removeItem(sessionKey);
      }

      if (hasStoredPlan && !shouldRegenerate && todayCheckin && todayRitual) {
        const checkinTime = new Date(todayCheckin.timestamp);
        const planTime = new Date(todayRitual.updated_at || todayRitual.created_at || todayRitual.ritual_date);
        if (checkinTime.getTime() > planTime.getTime() + 60000) {
          shouldRegenerate = true;
          sessionStorage.removeItem(sessionKey);
        }
      }

      // Session cache
      if (!shouldRegenerate && sessionLoaded === 'true') {
        const cachedPlan = sessionStorage.getItem(`plan-data-${todayDate}-${currentPeriod}`);
        if (cachedPlan) {
          const parsed = JSON.parse(cachedPlan) as MasteryPlanResponse;
          // Cache version invalidation: old plans without horizonModules must be regenerated
          if (!parsed.horizonModules || parsed.horizonModules.length === 0) {
            sessionStorage.removeItem(sessionKey);
            sessionStorage.removeItem(`plan-data-${todayDate}-${currentPeriod}`);
            shouldRegenerate = true;
          }
          // JIT cache invalidation
          const jitCacheKey = `plan-jit-checked-${todayDate}-${currentPeriod}`;
          const lastJitCheck = sessionStorage.getItem(jitCacheKey);
          const hasCommittedPlan = hasStoredPlan && todayRitual?.recommended_practice_ids?.length > 0;
          const jitCacheStale = !parsed.preEventPlan && !hasCommittedPlan && (!lastJitCheck || (Date.now() - parseInt(lastJitCheck, 10)) > 10 * 60 * 1000);
          if (jitCacheStale) {
            sessionStorage.removeItem(sessionKey);
            sessionStorage.removeItem(`plan-data-${todayDate}-${currentPeriod}`);
            sessionStorage.setItem(jitCacheKey, String(Date.now()));
            shouldRegenerate = true;
          }

          if (!shouldRegenerate) {
            const cachedEnergyHash = sessionStorage.getItem(`plan-energy-hash-${todayDate}-${currentPeriod}`);
            const currentEnergyHash = `${parsed.timeOfDayPlan?.period || currentPeriod}:${todayCheckin?.outcome || 'none'}:${todayCheckin?.energy_balance || 0}:${todayCheckin?.clarity_level ?? 'x'}:${todayCheckin?.confidence_level ?? 'x'}`;
            if (cachedEnergyHash && cachedEnergyHash !== currentEnergyHash) {
              sessionStorage.removeItem(sessionKey);
              sessionStorage.removeItem(`plan-data-${todayDate}-${currentPeriod}`);
              shouldRegenerate = true;
            } else {
              setPlan(parsed);
              const allCompleted = todayRitual?.completed_practice_ids || [];
              const horizonIds = (parsed.horizonModules || []).flatMap(m => (m.practices || [m.practice]).map((p: any) => p.contentId));
              setCompletedPracticeIds(horizonIds.length > 0 ? allCompleted.filter((id: string) => horizonIds.includes(id)) : allCompleted);
              setLoading(false);
              return;
            }
          }
        }
      }

      // Fetch fresh plan with retry logic for transient network errors
      let planData: any = null;
      let fetchError: any = null;
      const MAX_RETRIES = 2;
      const RETRY_DELAY_MS = 2000;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const headers: Record<string, string> = {};
        if (DEV_MODE) headers['x-dev-user-id'] = DEV_USER.id;
        const token = await getAuthToken();

        // Auth guard: if no token after retries, surface error instead of silent loop
        if (!token && !DEV_MODE) {
          if (attempt === MAX_RETRIES) {
            console.error('[TodayThreePriorities] Auth token unavailable after retries');
            fetchError = new Error('Auth token unavailable');
            break;
          }
          console.warn(`[TodayThreePriorities] Auth token not ready, attempt ${attempt + 1}`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }

        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Build request body with outer readiness cache to skip ~2.8s server-to-server call
        const requestBody: any = { timezoneOffset: new Date().getTimezoneOffset() };
        if (outerReadinessData?.phrase) {
          requestBody.outerReadinessCache = {
            phrase: outerReadinessData.phrase,
            context: outerReadinessData.context,
            leanOn: outerReadinessData.leanOn,
            watchFor: outerReadinessData.watchFor,
            driver: outerReadinessData.driver,
          };
        }

        const { data, error } = await supabase.functions.invoke('generate-mastery-plan', {
          headers,
          body: requestBody,
        });

        if (!error) {
          planData = data;
          fetchError = null;
          break;
        }

        fetchError = error;
        console.warn(`[TodayThreePriorities] Attempt ${attempt + 1} failed:`, error.message || error);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
      }

      if (fetchError || !planData) {
        console.error('Error calling generate-mastery-plan after retries:', fetchError);
        setFetchFailed(true);
        setLoading(false);
        // Auto-retry once after 3s if not already tried
        if (!autoRetryDoneRef.current) {
          autoRetryDoneRef.current = true;
          setTimeout(() => { loadPlan(); }, 3000);
        }
        return;
      }

      const planResponse = planData as MasteryPlanResponse;
      setPlan(planResponse);

      // Store plan for stability
      if (user || DEV_MODE) {
        const allModules = planResponse.horizonModules?.length
          ? planResponse.horizonModules.flatMap(m => (m.practices || [m.practice]).map(p => p.contentId))
          : planResponse.timeOfDayPlan.modules.map(m => m.contentId);

        const existingRitual = await getTodayRitual(currentPeriod);
        const existingCompleted = existingRitual?.completed_practice_ids || [];
        const prunedCompleted = existingCompleted.filter((id: string) => allModules.includes(id));

        await upsertRitual({
          ritual_date: todayDate,
          recommended_practice_ids: allModules,
          recommended_practices_count: allModules.length,
          completed_practice_ids: prunedCompleted,
          completion_status: prunedCompleted.length >= allModules.length && prunedCompleted.length > 0 ? 'full' : prunedCompleted.length > 0 ? 'partial' : 'skipped',
          session_period: planResponse.timeOfDayPlan.period,
        });
        sessionStorage.setItem(sessionKey, 'true');
        sessionStorage.setItem(`plan-data-${todayDate}-${currentPeriod}`, JSON.stringify(planResponse));
        sessionStorage.setItem(`plan-energy-hash-${todayDate}-${currentPeriod}`, `${planResponse.timeOfDayPlan?.period || currentPeriod}:${todayCheckin?.outcome || 'none'}:${todayCheckin?.energy_balance || 0}:${todayCheckin?.clarity_level ?? 'x'}:${todayCheckin?.confidence_level ?? 'x'}`);
        setCompletedPracticeIds(prunedCompleted);
      }
    } catch (error) {
      console.error('Error loading plan:', error);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadPlan();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkCompletion();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = setInterval(() => { if (plan) checkCompletion(); }, 60000);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [user?.id]);

  useEffect(() => { if (plan) checkCompletion(); }, [plan]);

  const checkCompletion = async () => {
    const effectiveUserId = user?.id || (DEV_MODE ? DEV_USER.id : null);
    if (!effectiveUserId || !plan) return;
    const currentPeriod = getCurrentTimeWindow();
    const ritual = await getTodayRitual(currentPeriod);
    const horizonIds = (plan.horizonModules || []).flatMap(m => (m.practices || [m.practice]).map((p: any) => p.contentId));
    if (!ritual) {
      setCompletedPracticeIds([]);
      return;
    }
    const allCompleted = ritual.completed_practice_ids || [];
    const active = horizonIds.length > 0 ? allCompleted.filter((id: string) => horizonIds.includes(id)) : allCompleted;
    // Only update state if content actually changed — prevents spurious effect re-runs
    setCompletedPracticeIds(prev => {
      const prevKey = [...prev].sort().join(',');
      const nextKey = [...active].sort().join(',');
      return prevKey === nextKey ? prev : active;
    });

    if (active.length >= horizonIds.length && active.length > 0) {
      if (ritual.completion_status !== 'full') {
        await upsertRitual({ ritual_date: new Date().toISOString().split('T')[0], completion_status: 'full', session_period: currentPeriod });
      }
    }
  };

  // ── Navigation ──
  const navigateToCoach = (prompt: string, flowType: string, eventTitle?: string) => {
    navigate('/coach', {
      state: { initialPrompt: prompt, flowType, eventTitle, fromRitual: true, entryContext: { entryPoint: 'tod_plan', lastAction: 'started daily plan', triggeredBy: null } },
    });
  };

  const navigateToPractice = async (module: PlanModule, allModules: PlanModule[]) => {
    localStorage.removeItem('jitInterventionData');
    localStorage.setItem('practiceQueue', JSON.stringify(allModules.map(m => ({
      id: m.contentId, title: m.title, contentType: m.contentType, category: m.contentType === 'coach' ? 'coach' : 'pause', duration: m.duration,
    }))));
    const idx = allModules.findIndex(m => m.contentId === module.contentId);
    localStorage.setItem('queueIndex', String(idx >= 0 ? idx : 0));
    localStorage.setItem('ritualMode', 'true');

    if (user) {
      const today = new Date().toISOString().split('T')[0];
      const currentPeriod = getCurrentTimeWindow();
      await upsertRitual({
        ritual_date: today,
        session_period: currentPeriod,
        completion_status: 'partial',
        recommended_practices_count: allModules.length,
        recommended_practice_ids: allModules.map(m => m.contentId),
      });
    }

    if (module.isCoachCard) {
      const coachCard = plan?.timeOfDayPlan?.coachCard;
      const prompt = coachCard?.prompt || "Let's take a moment to center before what's ahead.";
      navigateToCoach(prompt, module.type, undefined);
      return;
    }

    // For JIT modules, set up JIT intervention data
    if (plan?.preEventPlan) {
      const jitModule = plan.preEventPlan.modules?.find((m: any) => m.contentId === module.contentId);
      if (jitModule) {
        localStorage.setItem('jitInterventionData', JSON.stringify({
          coachPrompt: plan.preEventPlan.coachCard?.prompt,
          flowType: 'prepare',
          eventTitle: plan.preEventPlan.eventTitle,
        }));
      }
    }

    let route: string;
    if (module.contentType === 'soundbath') route = `/soundscapes/${module.contentId}`;
    else if (module.contentType === 'guided-practice') route = `/guided-practices/${module.contentId}`;
    else route = `/micro-practice/${module.contentId}/cards`;
    navigate(route, { state: { category: 'pause', fromRitual: true } });
  };

  // ── JIT Dismiss ──
  const handleJitDismiss = async (slotIndex: number, hm: HorizonModule) => {
    if (!hm.isJit || !plan?.preEventPlan) return;
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (DEV_MODE) headers['x-dev-user-id'] = DEV_USER.id;

      const snoozeCountKey = `jit_snooze_count_${plan.preEventPlan.eventType || 'unknown'}`;
      const priorCount = parseInt(localStorage.getItem(snoozeCountKey) || '0', 10);
      const newCount = priorCount + 1;
      localStorage.setItem(snoozeCountKey, String(newCount));

      await supabase.functions.invoke('track-jit-skip', {
        headers,
        body: {
          action: newCount >= 3 ? 'dismissed' : 'snoozed',
          eventType: plan.preEventPlan.eventType,
          eventTitle: plan.preEventPlan.eventTitle,
          eventId: plan.preEventPlan.eventId || null,
          horizon: plan.preEventPlan.horizon || null,
        },
      });
    } catch { /* silent */ }
  };

  // ── Auto-expand next slot on completion ──
  useEffect(() => {
    if (!plan?.horizonModules) return;
    const modules = plan.horizonModules;
    for (let i = 0; i < modules.length; i++) {
      const slotPractices = modules[i].practices || [modules[i].practice];
      const slotComplete = slotPractices.every(p => completedPracticeIds.includes(p.contentId));
      if (!slotComplete) {
        setExpandedSlot(i);
        return;
      }
    }
    // All done
    setExpandedSlot(-1);
  }, [completedPracticeIds, plan]);

  const horizonModules = plan?.horizonModules;

  // Signal empty/loaded state to parent for fallback rendering
  // Only fire onEmpty when genuinely no data AND not a transient fetch failure
  useEffect(() => {
    if (!loading && !fetchFailed && (!horizonModules || horizonModules.length === 0)) {
      onEmpty?.();
    } else if (!loading && horizonModules && horizonModules.length > 0) {
      onLoaded?.();
    }
  }, [loading, fetchFailed, horizonModules, onEmpty, onLoaded]);

  // ── Render ──
  // ── Loading skeleton with visible card structure ──
  if (loading) {
    return (
      <div className="space-y-4 pt-2">
        <div className="px-4 max-w-lg mx-auto">
          <span className="text-xs tracking-widest uppercase text-muted-foreground/60 font-body">
            Today's 3 Performance Priorities
          </span>
        </div>
        <div className="flex flex-col gap-3 px-4 max-w-lg mx-auto">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3 py-2">
              <div className="w-7 h-7 rounded-full bg-muted/30 animate-pulse flex items-center justify-center text-xs text-muted-foreground/40 font-bold">
                {n}
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted/20 rounded-md w-16 animate-pulse" />
                <div className="h-3.5 bg-muted/20 rounded-md w-3/4 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Empty / error state — always show card shell ──
  if (!horizonModules || horizonModules.length === 0) {
    return (
      <div className="space-y-4 pt-2">
        <div className="px-4 max-w-lg mx-auto">
          <span className="text-xs tracking-widest uppercase text-muted-foreground/60 font-body">
            Today's 3 Performance Priorities
          </span>
        </div>
        <div className="flex flex-col gap-3 px-4 max-w-lg mx-auto">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3 py-2">
              <div className="w-7 h-7 rounded-full bg-muted/20 flex items-center justify-center text-xs text-muted-foreground/30 font-bold">
                {n}
              </div>
              <div className="flex-1">
                <div className="h-3.5 bg-muted/10 rounded-md w-2/3" />
              </div>
            </div>
          ))}

          {/* Contextual prompt */}
          <div className="pt-2">
            {fetchFailed ? (
              <div className="flex flex-col items-center gap-2 py-3">
                <p className="text-xs text-muted-foreground/60 font-body">
                  Your plan is loading...
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { autoRetryDoneRef.current = false; loadPlan(); }}
                  className="h-8 text-xs gap-1.5 rounded-lg border-muted-foreground/20"
                >
                  <RefreshCw size={12} />
                  Retry
                </Button>
              </div>
            ) : (
              <button
                onClick={() => navigate('/daily-check-in')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-muted/10 hover:bg-muted/20 transition-colors"
              >
                <span className="text-xs text-muted-foreground/70 font-body">
                  Check in to build your plan
                </span>
                <ChevronRight size={12} className="text-muted-foreground/40" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const allPractices = horizonModules.flatMap(m => m.practices || [m.practice]);
  const allComplete = allPractices.every(p => completedPracticeIds.includes(p.contentId));
  const completedPriorityCount = horizonModules.filter(hm => {
    const sp = hm.practices || [hm.practice];
    return sp.every(p => completedPracticeIds.includes(p.contentId));
  }).length;

  return (
    <div className="space-y-4 pt-2">
      <div className="px-4 max-w-lg mx-auto">
        <PostEventReflection />
      </div>

      {/* Header with info modal */}
      <div className="px-4 max-w-lg mx-auto">
        <div className="flex items-center justify-between">
          <span className="text-xs tracking-widest uppercase text-muted-foreground/60 font-body">
            Today's 3 Performance Priorities
          </span>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs font-medium font-body whitespace-nowrap",
              allComplete ? "text-saffron" : completedPriorityCount > 0 ? "text-saffron/80" : "text-muted-foreground"
            )}>
              {completedPriorityCount > 0 && <Check size={12} className="inline mr-0.5 -mt-0.5" />}
              {completedPriorityCount} of {horizonModules.length}
            </span>
            <MetricInfoModal
              title="Today's 3 Performance Priorities"
              description="Three horizon-classified practices built from your Decision Readiness Score and Outer Readiness Brief — what your system needs right now, matched to the shape of your day. Each priority is timed and sequenced to close the gap between where you are and where the day needs you to be."
            />
          </div>
        </div>
      </div>

      {/* 3 Slots */}
      <div className="flex flex-col gap-3 px-4 max-w-lg mx-auto">
        {horizonModules.map((hm, index) => {
          const slotPractices = hm.practices || [hm.practice];
          const slotCompleted = slotPractices.every(p => completedPracticeIds.includes(p.contentId));
          const slotCompletedCount = slotPractices.filter(p => completedPracticeIds.includes(p.contentId)).length;
          const isExpanded = expandedSlot === index;
          const hasMultiple = slotPractices.length > 1;
          const module = hm.practice; // primary practice for collapsed view

          return (
            <div key={`${module.contentId}-${index}`} className="space-y-0">
              {/* Slot header row */}
              <button
                onClick={() => setExpandedSlot(isExpanded ? -1 : index)}
                className="w-full flex items-center gap-3 py-2 text-left"
              >
                {/* Number circle */}
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all",
                    slotCompleted
                      ? "bg-taupe text-white"
                      : isExpanded
                        ? "bg-saffron text-white"
                        : "bg-muted/40 text-muted-foreground",
                    hm.showPulse && !slotCompleted && "animate-pulse"
                  )}
                >
                  {slotCompleted ? <Check size={14} className="stroke-[3]" /> : index + 1}
                </div>

                {/* Time label + practice name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-[11px] font-body",
                      hm.isJit ? "text-saffron font-medium" : "text-muted-foreground/60"
                    )}>
                      {hm.timeLabel}
                    </span>
                    {hm.showPriorityPill && !slotCompleted && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-foreground/8 text-foreground font-medium">
                        Priority event
                      </span>
                    )}
                  </div>
                  {!isExpanded && (
                    <div>
                      <p className={cn(
                        "text-[13px] font-body truncate",
                        slotCompleted ? "text-muted-foreground/50 line-through" : "text-foreground/80"
                      )}>
                        {module.title}
                        {hasMultiple && !slotCompleted && (
                          <span className="text-muted-foreground/40 text-[11px] ml-1">
                            ({slotCompletedCount} of {slotPractices.length})
                          </span>
                        )}
                      </p>
                      {hm.whyLine && !slotCompleted && (
                        <p className="text-[11px] italic text-muted-foreground/50 font-body truncate">
                          {hm.whyLine}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Expand/collapse arrow or dismiss */}
                {!slotCompleted && !isExpanded && (
                  <ChevronRight size={14} className="text-muted-foreground/40 flex-shrink-0" />
                )}
                {hm.isJit && !slotCompleted && isExpanded && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleJitDismiss(index, hm); }}
                    className="p-1 rounded-full hover:bg-muted/30 flex-shrink-0"
                    aria-label="Dismiss"
                  >
                    <X size={14} className="text-muted-foreground/50" />
                  </button>
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && !slotCompleted && (
                <div className="pl-10 space-y-2 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {/* Type label */}
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-body",
                    hm.isJit ? "text-saffron" : "text-saffron/80"
                  )}>
                    {hm.typeLabel}
                  </span>

                  {/* Sequence reasoning (if multi-practice) */}
                  {hm.sequenceReasoning && hasMultiple && (
                    <p className="text-[11px] text-foreground/70 font-body font-medium leading-relaxed">
                      {hm.sequenceReasoning}
                    </p>
                  )}

                  {/* Why line */}
                  <p className="text-[11px] italic text-muted-foreground font-body leading-relaxed">
                    {hm.whyLine}
                  </p>

                  {/* Practice cards — horizontal scroll when multiple */}
                  <div className={cn(
                    hasMultiple ? "flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory" : ""
                  )}>
                    {slotPractices.map((practice, pIdx) => {
                      const isPracticeCompleted = completedPracticeIds.includes(practice.contentId);
                      const isCoach = practice.isCoachCard;

                      return (
                        <div
                          key={practice.contentId}
                          onClick={() => !isPracticeCompleted && navigateToPractice(practice, allPractices)}
                          className={cn(
                            "relative flex rounded-xl overflow-hidden h-40 cursor-pointer transition-all duration-300 snap-start",
                            "shadow-[0_4px_16px_rgba(0,0,0,0.08)]",
                            "bg-white/15 backdrop-blur-md border border-white/40",
                            "hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
                            hm.showNavyBorder && pIdx === 0 && "border-l-2 border-l-foreground",
                            isPracticeCompleted && "opacity-40 sepia-[0.3] saturate-50",
                            hasMultiple ? "w-[80%] flex-shrink-0" : "w-full"
                          )}
                        >
                          {/* Thumbnail */}
                          {isCoach ? (
                            <div className="w-28 h-full flex-shrink-0 relative overflow-hidden">
                              <img src={coachVisual} alt="" className="w-full h-full object-cover object-top brightness-75" />
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/30" />
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-headline text-white tracking-tight leading-none drop-shadow-lg">SM</span>
                                <span className="text-[8px] uppercase tracking-[0.15em] text-white/80 mt-0.5">Coach</span>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={practice.thumbnailUrl || getContentById(practice.contentId)?.thumbnail || ''}
                              alt={practice.title}
                              className="w-28 h-full object-cover flex-shrink-0"
                            />
                          )}

                          {/* Content */}
                          <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                            {/* Step indicator for multi-practice */}
                            {hasMultiple && (
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 font-body mb-0.5">
                                Step {pIdx + 1} of {slotPractices.length}
                              </span>
                            )}
                            <div className="flex items-start gap-1">
                              <h4 className="text-[14px] font-medium line-clamp-2 leading-snug font-body flex-1 text-foreground">
                                {practice.title}
                              </h4>
                              {isPracticeCompleted && <Check size={14} className="text-taupe flex-shrink-0 mt-0.5 stroke-[3]" />}
                              {!isCoach && !isPracticeCompleted && isFavorite(practice.contentId) && (
                                <Heart size={14} className="text-saffron fill-saffron flex-shrink-0 mt-0.5" />
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground font-body mt-1">
                              {practice.duration} min
                            </span>
            {/* Per-practice reasoning */}
                            {practice.reasoning && (
                              <p className="text-[10px] text-muted-foreground/60 font-body mt-1 line-clamp-2 leading-snug">
                                {practice.reasoning}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Start button — navigates to first uncompleted practice */}
                  <Button
                    onClick={() => {
                      const nextPractice = slotPractices.find(p => !completedPracticeIds.includes(p.contentId)) || slotPractices[0];
                      navigateToPractice(nextPractice, allPractices);
                    }}
                    className="w-full h-11 text-[14px] font-medium bg-taupe text-white hover:bg-taupe/90 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
                  >
                    {hasMultiple && slotCompletedCount > 0 ? `Continue (${slotCompletedCount}/${slotPractices.length})` : 'Start'}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Per-priority feedback modal */}
      {feedbackSlot && (
        <PlanFeedbackModal
          planType="tod"
          priorityNumber={feedbackSlot.index + 1}
          priorityLabel={`Priority ${feedbackSlot.index + 1}`}
          onSubmit={(rating, feedback) => {
            submitPlanFeedback('tod', rating, feedback);
            setFeedbackSlot(null);
          }}
          onSkip={() => setFeedbackSlot(null)}
        />
      )}
    </div>
  );
};

export default TodayThreePriorities;
