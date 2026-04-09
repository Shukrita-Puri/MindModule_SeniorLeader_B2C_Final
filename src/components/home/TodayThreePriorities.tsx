/**
 * TodayThreePriorities — 3-slot horizon-classified practice sequence.
 * Replaces DailyRitual + JitCarousel on the homepage.
 * Preserves all existing completion tracking, navigation, and player routing.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Check, Heart, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/hooks/useFavorites';
import { toast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';
import { getTodayRitual, upsertRitual } from '@/utils/dailyRituals';
import { getCheckinForWindow, getCurrentTimeWindow } from '@/utils/dailyCheckins';
import { getContentById } from '@/data/practicesAndSoundscapes';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import PostEventReflection from '@/components/home/PostEventReflection';

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

const TodayThreePriorities = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFavorite } = useFavorites();

  const [plan, setPlan] = useState<MasteryPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [completedPracticeIds, setCompletedPracticeIds] = useState<string[]>([]);
  const [expandedSlot, setExpandedSlot] = useState<number>(0);
  const prevCompletedIdsRef = useRef<string[]>([]);

  // ── Celebration ──
  const triggerCelebration = useCallback((practiceName: string, isAllComplete: boolean) => {
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

  // ── Detect newly completed ──
  useEffect(() => {
    const prev = prevCompletedIdsRef.current;
    const newlyDone = completedPracticeIds.filter(id => !prev.includes(id));
    if (newlyDone.length > 0 && prev.length > 0) {
      const modules = plan?.horizonModules || [];
      const found = modules.find(m => newlyDone.includes(m.practice.contentId));
      const allDone = modules.every(m => completedPracticeIds.includes(m.practice.contentId));
      if (found) triggerCelebration(found.practice.title, allDone);
    }
    prevCompletedIdsRef.current = completedPracticeIds;
  }, [completedPracticeIds, plan, triggerCelebration]);

  // ── Load plan ──
  const loadPlan = useCallback(async () => {
    setLoading(true);
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
              const horizonIds = (parsed.horizonModules || []).map(m => m.practice.contentId);
              setCompletedPracticeIds(horizonIds.length > 0 ? allCompleted.filter((id: string) => horizonIds.includes(id)) : allCompleted);
              setLoading(false);
              return;
            }
          }
        }
      }

      // Fetch fresh plan
      const headers: Record<string, string> = {};
      if (DEV_MODE) headers['x-dev-user-id'] = DEV_USER.id;
      const token = await getAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const { data: planData, error } = await supabase.functions.invoke('generate-mastery-plan', {
        headers,
        body: { timezoneOffset: new Date().getTimezoneOffset() },
      });

      if (error) {
        console.error('Error calling generate-mastery-plan:', error);
        setLoading(false);
        return;
      }

      const planResponse = planData as MasteryPlanResponse;
      setPlan(planResponse);

      // Store plan for stability
      if (user || DEV_MODE) {
        const allModules = planResponse.horizonModules?.length
          ? planResponse.horizonModules.map(m => m.practice.contentId)
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
    const horizonIds = (plan.horizonModules || []).map(m => m.practice.contentId);
    if (!ritual) {
      setCompletedPracticeIds([]);
      return;
    }
    const allCompleted = ritual.completed_practice_ids || [];
    const active = horizonIds.length > 0 ? allCompleted.filter((id: string) => horizonIds.includes(id)) : allCompleted;
    setCompletedPracticeIds(active);

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
      if (!completedPracticeIds.includes(modules[i].practice.contentId)) {
        setExpandedSlot(i);
        return;
      }
    }
    // All done
    setExpandedSlot(-1);
  }, [completedPracticeIds, plan]);

  // ── Render ──
  if (loading) {
    return (
      <div className="px-4 py-5">
        <div className="space-y-3">
          <div className="h-4 bg-muted/30 rounded-lg" />
          <div className="h-4 bg-muted/30 rounded-lg w-3/4" />
        </div>
      </div>
    );
  }

  const horizonModules = plan?.horizonModules;
  if (!horizonModules || horizonModules.length === 0) {
    // Fallback: render nothing here; ExecutiveHome handles DailyRitual fallback
    return null;
  }

  const allPractices = horizonModules.map(m => m.practice);
  const allComplete = horizonModules.every(m => completedPracticeIds.includes(m.practice.contentId));
  const completedCount = horizonModules.filter(m => completedPracticeIds.includes(m.practice.contentId)).length;

  return (
    <div className="space-y-4 pt-2">
      <div className="px-4 max-w-lg mx-auto">
        <PostEventReflection />
      </div>

      {/* Progress */}
      <div className="px-4 max-w-lg mx-auto">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-medium text-foreground font-body">
            Today's 3 Performance Priorities
          </span>
          <span className={cn(
            "text-xs font-medium font-body whitespace-nowrap",
            allComplete ? "text-saffron" : completedCount > 0 ? "text-saffron/80" : "text-muted-foreground"
          )}>
            {completedCount > 0 && <Check size={12} className="inline mr-0.5 -mt-0.5" />}
            {completedCount} of {horizonModules.length} completed
          </span>
        </div>
      </div>

      {/* 3 Slots */}
      <div className="flex flex-col gap-3 px-4 max-w-lg mx-auto">
        {horizonModules.map((hm, index) => {
          const isCompleted = completedPracticeIds.includes(hm.practice.contentId);
          const isExpanded = expandedSlot === index;
          const isCoach = hm.practice.isCoachCard;
          const module = hm.practice;

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
                    isCompleted
                      ? "bg-green-600 text-white"
                      : isExpanded
                        ? "bg-saffron text-white"
                        : "bg-muted/40 text-muted-foreground",
                    hm.showPulse && !isCompleted && "animate-pulse"
                  )}
                >
                  {isCompleted ? <Check size={14} className="stroke-[3]" /> : index + 1}
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
                    {hm.showPriorityPill && !isCompleted && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-foreground/8 text-foreground font-medium">
                        Priority event
                      </span>
                    )}
                  </div>
                  {!isExpanded && (
                    <p className={cn(
                      "text-[13px] font-body truncate",
                      isCompleted ? "text-muted-foreground/50 line-through" : "text-foreground/80"
                    )}>
                      {module.title}
                    </p>
                  )}
                </div>

                {/* Expand/collapse arrow or dismiss */}
                {!isCompleted && !isExpanded && (
                  <ChevronRight size={14} className="text-muted-foreground/40 flex-shrink-0" />
                )}
                {hm.isJit && !isCompleted && isExpanded && (
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
              {isExpanded && !isCompleted && (
                <div className="pl-10 space-y-2 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {/* Type label */}
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-body",
                    hm.isJit ? "text-saffron" : "text-saffron/80"
                  )}>
                    {hm.typeLabel}
                  </span>

                  {/* Why line */}
                  <p className="text-[11px] italic text-muted-foreground font-body leading-relaxed">
                    {hm.whyLine}
                  </p>

                  {/* Practice card */}
                  <div
                    onClick={() => navigateToPractice(module, allPractices)}
                    className={cn(
                      "relative flex rounded-xl overflow-hidden h-40 cursor-pointer transition-all duration-300",
                      "shadow-[0_4px_16px_rgba(0,0,0,0.08)]",
                      "bg-white/15 backdrop-blur-md border border-white/40",
                      "hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
                      hm.showNavyBorder && "border-l-2 border-l-foreground"
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
                        src={module.thumbnailUrl || getContentById(module.contentId)?.thumbnail || ''}
                        alt={module.title}
                        className="w-28 h-full object-cover flex-shrink-0"
                      />
                    )}

                    {/* Content */}
                    <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                      <div className="flex items-start gap-1">
                        <h4 className="text-[14px] font-medium line-clamp-2 leading-snug font-body flex-1 text-foreground">
                          {module.title}
                        </h4>
                        {!isCoach && isFavorite(module.contentId) && (
                          <Heart size={14} className="text-saffron fill-saffron flex-shrink-0 mt-0.5" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-body mt-1">
                        {module.duration} min
                      </span>
                    </div>
                  </div>

                  {/* Start button */}
                  <Button
                    onClick={() => navigateToPractice(module, allPractices)}
                    className="w-full h-11 text-[14px] font-medium bg-taupe text-white hover:bg-taupe/90 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
                  >
                    Start
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TodayThreePriorities;
