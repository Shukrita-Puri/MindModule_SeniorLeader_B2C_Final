import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PostEventReflection from '@/components/home/PostEventReflection';
import { Button } from '@/components/ui/button';
import { Check, RotateCcw, Heart, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
// Carousel imports removed – vertical list layout
import { toast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';
import { useFavorites } from '@/hooks/useFavorites';
import { getTodayRitual, getRitualForPeriod, upsertRitual } from '@/utils/dailyRituals';
import { getTodayCheckin, getCheckinForWindow, getCurrentTimeWindow } from '@/utils/dailyCheckins';
import { getContentById } from '@/data/practicesAndSoundscapes';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { TextWithEventEmphasis } from '@/components/ui/TextWithEventEmphasis';

// Background images for Coach cards
import coachVisual from '@/assets/shared/coach-visual-calm.jpeg';

// Types from backend response
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

interface CalendarPill {
  label: string;
  eventId: string;
  priorityScore: number;
  timePill: string;
}

interface PreEventPlan {
  eventTitle: string;
  eventType: string;
  minutesUntil: number;
  timePill: string;
  contextDescription: string;
  modules: PlanModule[];
  coachCard: CoachCardData | null;
  progressTracked: boolean;
  hrvCorrelation?: {
    eventType: string;
    avgDeviation: number;
    historicalCount: number;
  } | null;
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
  calendarPills: CalendarPill[];
  preEventPlan: PreEventPlan | null;
  jitPriority?: boolean;
  meta: {
    generatedAt: string;
    scenarioId: string | null;
    durationCeiling: number;
    maxModules: number;
    calendarContext?: {
      todayLoad: string;
      upcomingLoad: string;
      todayMeetingCount: number;
      todayMeetingHours: number;
    };
  };
}

// Check if current time is evening (after 6pm)
const isEvening = (): boolean => {
  const hour = new Date().getHours();
  return hour >= 18;
};

interface DailyRitualProps {
  onPreEventPlanReady?: (plan: PreEventPlan | null) => void;
  onJitPriorityChange?: (jitPriority: boolean) => void;
  jitPriority?: boolean;
}

const DailyRitual = ({ onPreEventPlanReady, onJitPriorityChange, jitPriority = false }: DailyRitualProps = {}) => {
  const [jitExpanded, setJitExpanded] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { favorites, isFavorite } = useFavorites();
  const [plan, setPlan] = useState<MasteryPlanResponse | null>(null);
  // activeView removed – JIT handled by JitCarousel component
  const [loading, setLoading] = useState(true);
  const [completedPracticeIds, setCompletedPracticeIds] = useState<string[]>([]);
  const [noCheckinForWindow, setNoCheckinForWindow] = useState(false);
  const [ritualStatus, setRitualStatus] = useState<{
    status: 'not_started' | 'partial' | 'completed';
    completedCount: number;
    totalCount: number;
  }>({ status: 'not_started', completedCount: 0, totalCount: 0 });
  // Carousel state removed – vertical list layout
  const prevCompletedIdsRef = useRef<string[]>([]);

  // Navigate to Coach with context
  const navigateToCoach = (prompt: string, flowType: string, eventTitle?: string) => {
    navigate('/coach', {
      state: { 
        initialPrompt: prompt, 
        flowType, 
        eventTitle, 
        fromRitual: true,
        entryContext: { entryPoint: 'tod_plan', lastAction: 'started daily plan', triggeredBy: null }
      }
    });
  };

  // Celebration effect
  const triggerCelebration = (practiceName: string, isRitualComplete: boolean) => {
    if (isRitualComplete) {
      confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 }, colors: ['#D4AF37', '#F5D76E', '#FFD700', '#FFA500', '#E6C200'] });
      setTimeout(() => {
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.7, x: 0.3 }, colors: ['#D4AF37', '#F5D76E', '#FFD700'] });
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.7, x: 0.7 }, colors: ['#D4AF37', '#F5D76E', '#FFD700'] });
      }, 200);
    } else {
      confetti({ particleCount: 60, spread: 50, origin: { y: 0.6 }, colors: ['#D4AF37', '#8B7355', '#A9957B'] });
    }
    toast({
      title: isRitualComplete ? "Ritual Complete!" : "Practice Complete!",
      description: isRitualComplete ? "Amazing work! You've completed your daily ritual." : `Great job completing "${practiceName}"!`,
    });
  };

  // Carousel useEffects removed – vertical list layout

  useEffect(() => {
    loadPlan();
    
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && plan) {
        checkRitualCompletion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    // Relaxed polling as fallback (60s instead of 15s) – only when plan is loaded
    const interval = setInterval(() => { if (plan) checkRitualCompletion(); }, 60000);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.id]);

  // Re-check completion whenever plan loads/changes – this is the canonical trigger
  useEffect(() => {
    if (plan) {
      checkRitualCompletion();
    }
  }, [plan]);

  // Detect newly completed practices
  useEffect(() => {
    const prevIds = prevCompletedIdsRef.current;
    const newlyCompletedIds = completedPracticeIds.filter(id => !prevIds.includes(id));
    if (newlyCompletedIds.length > 0 && prevIds.length > 0) {
      const modules = plan?.timeOfDayPlan?.modules || [];
      const newModule = modules.find(m => newlyCompletedIds.includes(m.contentId));
      const isRitualComplete = ritualStatus.status === 'completed';
      if (newModule) triggerCelebration(newModule.title, isRitualComplete);
    }
    prevCompletedIdsRef.current = completedPracticeIds;
  }, [completedPracticeIds, ritualStatus.status, plan]);

  const checkRitualCompletion = async () => {
    if (!user?.id) return;
    // Guard: only compute when plan is loaded so we have authoritative module IDs
    if (!plan) return;
    
    const currentPeriod = getCurrentTimeWindow();
    const data = await getTodayRitual(currentPeriod);
    const modules = plan.timeOfDayPlan?.modules || [];
    const planModuleIds = modules.map(m => m.contentId);
    const totalCount = modules.length;
    
    if (!data) {
      setRitualStatus({ status: 'not_started', completedCount: 0, totalCount });
      setCompletedPracticeIds([]);
      return;
    }

    const allCompletedIds = data.completed_practice_ids || [];
    // Strict intersection: only count completions that belong to THIS plan's modules
    const activeCompletedIds = planModuleIds.length > 0
      ? allCompletedIds.filter(id => planModuleIds.includes(id))
      : [];
    setCompletedPracticeIds(activeCompletedIds);
    const effectiveCompletedCount = Math.min(activeCompletedIds.length, totalCount);

    let status: 'not_started' | 'partial' | 'completed' = 'not_started';
    if (effectiveCompletedCount >= totalCount && effectiveCompletedCount > 0) {
      status = 'completed';
      if (data.completion_status !== 'full') {
        await upsertRitual({ ritual_date: new Date().toISOString().split('T')[0], completion_status: 'full', session_period: currentPeriod });
      }
    } else if (effectiveCompletedCount > 0) status = 'partial';

    setRitualStatus({ status, completedCount: effectiveCompletedCount, totalCount });
  };

  const loadPlan = async () => {
    setLoading(true);
    try {
      const currentPeriod = getCurrentTimeWindow();
      
      // Check for stored plan for the CURRENT period
      const todayRitual = await getTodayRitual(currentPeriod);
      const todayCheckin = await getCheckinForWindow(new Date().toISOString().split('T')[0], currentPeriod);
      const todayDate = new Date().toISOString().split('T')[0];
      const sessionKey = `plan-loaded-${todayDate}-${currentPeriod}`;
      const sessionLoaded = sessionStorage.getItem(sessionKey);
      
      // Check if we have a check-in for this window
      setNoCheckinForWindow(!todayCheckin);

      const storedPracticeIds = todayRitual?.recommended_practice_ids;
      const hasStoredPlan = storedPracticeIds && storedPracticeIds.length > 0;
      let shouldRegenerate = !hasStoredPlan;

      // Period mismatch: if the stored ritual is for a different period, force regen
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
          // Regenerate plan but PRESERVE existing completed_practice_ids
          // (user may have completed practices before re-checking in)
        }
      }

      // Use session cache if available – but validate energy state hash for cross-device consistency
      if (!shouldRegenerate && sessionLoaded === 'true') {
        const cachedPlan = sessionStorage.getItem(`plan-data-${todayDate}-${currentPeriod}`);
        if (cachedPlan) {
          const parsed = JSON.parse(cachedPlan) as MasteryPlanResponse;
          
          // ═══ JIT CACHE INVALIDATION ═══
          // If cached plan has no preEventPlan but enough time has passed, refetch
          // so newly-qualifying JIT events can surface.
          // Only invalidate if there's no stored ritual data (meaning we haven't committed to a plan yet)
          const jitCacheKey = `plan-jit-checked-${todayDate}-${currentPeriod}`;
          const lastJitCheck = sessionStorage.getItem(jitCacheKey);
          const hasCommittedPlan = hasStoredPlan && todayRitual?.recommended_practice_ids && todayRitual.recommended_practice_ids.length > 0;
          const jitCacheStale = !parsed.preEventPlan && !hasCommittedPlan && (!lastJitCheck || (Date.now() - parseInt(lastJitCheck, 10)) > 10 * 60 * 1000);
          if (jitCacheStale) {
            console.log('[DailyRitual] Cached plan has no preEventPlan – invalidating to allow JIT resurfacing');
            sessionStorage.removeItem(sessionKey);
            sessionStorage.removeItem(`plan-data-${todayDate}-${currentPeriod}`);
            sessionStorage.removeItem(`plan-energy-hash-${todayDate}-${currentPeriod}`);
            sessionStorage.setItem(jitCacheKey, String(Date.now()));
            shouldRegenerate = true;
          }

          // Validate cached plan against current energy state to prevent cross-device divergence
          if (!shouldRegenerate) {
            const cachedEnergyHash = sessionStorage.getItem(`plan-energy-hash-${todayDate}-${currentPeriod}`);
            const currentEnergyHash = `${parsed.timeOfDayPlan?.period || currentPeriod}:${todayCheckin?.outcome || 'none'}:${todayCheckin?.energy_balance || 0}:${todayCheckin?.clarity_level ?? 'x'}:${todayCheckin?.confidence_level ?? 'x'}`;
            if (cachedEnergyHash && cachedEnergyHash !== currentEnergyHash) {
              console.log('[DailyRitual] Energy hash mismatch – invalidating session cache', { cached: cachedEnergyHash, current: currentEnergyHash });
              sessionStorage.removeItem(sessionKey);
              sessionStorage.removeItem(`plan-data-${todayDate}-${currentPeriod}`);
              sessionStorage.removeItem(`plan-energy-hash-${todayDate}-${currentPeriod}`);
              shouldRegenerate = true;
            } else {
              console.log('[DailyRitual] Using sessionStorage cache for plan', { period: currentPeriod, date: todayDate });
              setPlan(parsed);
              onPreEventPlanReady?.(parsed.preEventPlan || null);
              onJitPriorityChange?.(!!parsed.jitPriority);
              const allCompletedIds = todayRitual?.completed_practice_ids || [];
              const modules = parsed.timeOfDayPlan?.modules || [];
              const planModuleIds = modules.map(m => m.contentId);
              const activeCompletedIds = planModuleIds.length > 0
                ? allCompletedIds.filter(id => planModuleIds.includes(id))
                : allCompletedIds;
              setCompletedPracticeIds(activeCompletedIds);
              setRitualStatus({
                status: activeCompletedIds.length >= modules.length && activeCompletedIds.length > 0 ? 'completed' : activeCompletedIds.length > 0 ? 'partial' : 'not_started',
                completedCount: activeCompletedIds.length,
                totalCount: modules.length
              });
              setLoading(false);
              return;
            }
          }
        }
      }

      // Build auth headers
      const headers: Record<string, string> = {};
      if (DEV_MODE) {
        headers['x-dev-user-id'] = DEV_USER.id;
      }
      const token = await getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Only timezoneOffset – ALL signals are now derived server-side
      const requestBody = {
        timezoneOffset: new Date().getTimezoneOffset(),
      };

      const { data: planData, error } = await supabase.functions.invoke('generate-mastery-plan', {
        headers,
        body: requestBody
      });

      if (error) {
        console.error('Error calling generate-mastery-plan:', error);
        setLoading(false);
        return;
      }

      const planResponse = planData as MasteryPlanResponse;
      setPlan(planResponse);
      onPreEventPlanReady?.(planResponse.preEventPlan || null);
      onJitPriorityChange?.(!!planResponse.jitPriority);

      // Store plan for stability – keyed by period
      if (user || DEV_MODE) {
        const moduleIds = planResponse.timeOfDayPlan.modules.map(m => m.contentId);
        
        // Prune stale completed_practice_ids: only retain IDs that exist in the NEW plan
        const existingRitual = await getTodayRitual(currentPeriod);
        const existingCompleted = existingRitual?.completed_practice_ids || [];
        const prunedCompleted = existingCompleted.filter(id => moduleIds.includes(id));
        
        await upsertRitual({
          ritual_date: todayDate,
          recommended_practice_ids: moduleIds,
          recommended_practices_count: moduleIds.length,
          completed_practice_ids: prunedCompleted,
          completion_status: prunedCompleted.length >= moduleIds.length && prunedCompleted.length > 0 ? 'full' : prunedCompleted.length > 0 ? 'partial' : 'skipped',
          session_period: planResponse.timeOfDayPlan.period
        });
        sessionStorage.setItem(sessionKey, 'true');
        sessionStorage.setItem(`plan-data-${todayDate}-${currentPeriod}`, JSON.stringify(planResponse));
        sessionStorage.setItem(`plan-energy-hash-${todayDate}-${currentPeriod}`, `${planResponse.timeOfDayPlan?.period || currentPeriod}:${todayCheckin?.outcome || 'none'}:${todayCheckin?.energy_balance || 0}:${todayCheckin?.clarity_level ?? 'x'}:${todayCheckin?.confidence_level ?? 'x'}`);
        console.log('[DailyRitual] Fresh plan generated and cached', { period: currentPeriod, modules: moduleIds.length, prunedCompleted: prunedCompleted.length });
      }
    } catch (error) {
      console.error('Error loading plan:', error);
    }
    setLoading(false);
  };

  const navigateToPractice = async (module: PlanModule) => {
    const modules = plan?.timeOfDayPlan?.modules || [];

    // Clear stale JIT data when starting Time-of-Day practice
    localStorage.removeItem('jitInterventionData');

    localStorage.setItem('practiceQueue', JSON.stringify(modules.map(m => ({
      id: m.contentId, title: m.title, contentType: m.contentType, category: m.contentType === 'coach' ? 'coach' : 'pause', duration: m.duration
    }))));
    const practiceIndex = modules.findIndex(m => m.contentId === module.contentId);
    localStorage.setItem('queueIndex', String(practiceIndex >= 0 ? practiceIndex : 0));
    localStorage.setItem('ritualMode', 'true');

    if (user) {
      const today = new Date().toISOString().split('T')[0];
      const currentPeriod = getCurrentTimeWindow();
      await upsertRitual({
        ritual_date: today,
        session_period: currentPeriod,
        completion_status: ritualStatus.status === 'not_started' ? 'partial' : ritualStatus.status,
        recommended_practices_count: modules.length,
        recommended_practice_ids: modules.map(m => m.contentId),
      });
    }

    if (module.isCoachCard) {
      // Find coach card prompt
      const coachCard = plan?.timeOfDayPlan?.coachCard;
      const prompt = coachCard?.prompt || "Let's take a moment to center before what's ahead.";
      navigateToCoach(prompt, module.type, undefined);
      return;
    }

    let route: string;
    if (module.contentType === 'soundbath') route = `/soundscapes/${module.contentId}`;
    else if (module.contentType === 'guided-practice') route = `/guided-practices/${module.contentId}`;
    else route = `/micro-practice/${module.contentId}/cards`;
    navigate(route, { state: { category: 'pause', fromRitual: true } });
  };

  const handleMarkComplete = async (practiceId: string) => {
    if (!user?.id || completedPracticeIds.includes(practiceId)) return;
    const today = new Date().toISOString().split('T')[0];
    const currentPeriod = getCurrentTimeWindow();
    const modules = plan?.timeOfDayPlan?.modules || [];
    const newCompletedIds = [...completedPracticeIds, practiceId];
    const result = await upsertRitual({
      ritual_date: today,
      session_period: currentPeriod,
      completed_practice_ids: newCompletedIds,
      recommended_practice_ids: modules.map(m => m.contentId),
      recommended_practices_count: modules.length,
      completion_status: newCompletedIds.length >= modules.length ? 'full' : 'partial'
    });
    if (result) {
      setCompletedPracticeIds(newCompletedIds);
      checkRitualCompletion();
    }
  };

  const handleStartRitual = async () => {
    const modules = plan?.timeOfDayPlan?.modules || [];
    if (modules.length === 0) return;

    localStorage.setItem('practiceQueue', JSON.stringify(modules.map(m => ({
      id: m.contentId, title: m.title, contentType: m.contentType, category: m.contentType === 'coach' ? 'coach' : 'pause', duration: m.duration
    }))));
    localStorage.setItem('queueIndex', '0');
    localStorage.setItem('ritualMode', 'true');
    // todayRecommendedIds removed – redundant with DB

    if (user) {
      const today = new Date().toISOString().split('T')[0];
      const currentPeriod = getCurrentTimeWindow();
      await upsertRitual({
        ritual_date: today,
        session_period: currentPeriod,
        completion_status: 'partial',
        recommended_practices_count: modules.length,
        recommended_practice_ids: modules.map(m => m.contentId),
        completed_practice_ids: []
      });
    }
    navigateToPractice(modules[0]);
  };

  const handleContinueRitual = async () => {
    const queue = localStorage.getItem('practiceQueue');
    if (!queue) { handleStartRitual(); return; }
    const queueData = JSON.parse(queue);
    const currentIndex = parseInt(localStorage.getItem('queueIndex') || '0');
    const modules = plan?.timeOfDayPlan?.modules || [];
    if (currentIndex < queueData.length) {
      const nextPractice = queueData[currentIndex];
      const module = modules.find(m => m.contentId === nextPractice.id);
      if (module) { navigateToPractice(module); return; }
    }
    handleStartRitual();
  };

  const handleRestartRitual = async () => {
    const todayDate = new Date().toISOString().split('T')[0];
    const currentPeriod = getCurrentTimeWindow();
    const modules = plan?.timeOfDayPlan?.modules || [];

    // Reset progress on the EXISTING ritual row (keep recommended_practice_ids intact)
    if (user || DEV_MODE) {
      await upsertRitual({
        ritual_date: todayDate,
        session_period: currentPeriod,
        completed_practice_ids: [],
        completion_status: 'partial',
        soundscape_completed: false,
        soundscape_completed_at: null,
        guided_practice_completed: false,
        guided_practice_completed_at: null,
        micro_exercise_completed: false,
        micro_exercise_completed_at: null,
        // Preserve the same recommended practices
        recommended_practice_ids: modules.map(m => m.contentId),
        recommended_practices_count: modules.length,
      });
    }

    // Clear local queue state so carousel restarts from the beginning
    localStorage.removeItem('practiceQueue');
    localStorage.removeItem('queueIndex');
    localStorage.removeItem('ritualMode');

    // Reset UI state – do NOT clear session cache or reload plan
    setCompletedPracticeIds([]);
    setRitualStatus({ status: 'not_started', completedCount: 0, totalCount: modules.length });
  };

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

  const rawModules = plan?.timeOfDayPlan?.modules || [];
  // Show ALL plan modules – completed ones are dimmed, not removed
  const activeModules = rawModules;

  if (activeModules.length === 0 && !loading) {
    return (
      <div className="px-4 py-5">
        <p className="text-sm text-muted-foreground">
          Your plan is being prepared. Pull down to refresh.
        </p>
      </div>
    );
  }

  const getModuleDisplay = (module: PlanModule) => {
    const labels: Record<string, string> = { regulate: 'Regulate', align: 'Align', prepare: 'Prepare', integrate: 'Integrate' };
    const protocolTypes: Record<string, string> = { regulate: 'Somatic Protocol', align: 'Mindset Protocol', prepare: 'Mind Performance Coach', integrate: 'Mind Performance Coach' };
    return { label: labels[module.type], protocolType: protocolTypes[module.type] };
  };

  const isCollapsedByJit = jitPriority && !jitExpanded;

  return (
    <div className="space-y-4 pt-2">
      <div className="px-4 max-w-lg mx-auto">
        <PostEventReflection />
      </div>

      {/* Calendar pills removed – JIT context now shown in JitCarousel */}

      {/* Progress tracker */}
      {(
        <div className="px-4 max-w-lg mx-auto space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium text-foreground font-body">
                {plan?.timeOfDayPlan?.label || 'Today'}
              </span>
              <span className="text-[11px] text-muted-foreground/60 font-body">
                ({activeModules.length}-step sequence)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-xs font-medium font-body whitespace-nowrap",
                ritualStatus.status === 'completed' ? "text-saffron" : ritualStatus.completedCount > 0 ? "text-saffron/80" : "text-muted-foreground"
              )}>
                {ritualStatus.completedCount > 0 && <Check size={12} className="inline mr-0.5 -mt-0.5" />}
                {ritualStatus.completedCount} of {ritualStatus.totalCount} completed
              </span>
              {jitPriority && (
                <button
                  onClick={() => setJitExpanded(!jitExpanded)}
                  className="p-1 rounded-md hover:bg-muted/40 transition-colors"
                  aria-label={jitExpanded ? 'Hide plan' : 'Show plan'}
                >
                  <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", jitExpanded && "rotate-180")} />
                </button>
              )}
            </div>
          </div>

          {/* JIT collapsed message */}
          {isCollapsedByJit && (
            <div className="bg-muted/20 rounded-lg px-3 py-2.5 mt-2">
              <span className="text-[13px] text-muted-foreground font-medium font-body leading-relaxed">
                Preparing for your event – your Time-of-Day plan is available after.
              </span>
            </div>
          )}

          {!isCollapsedByJit && (plan?.timeOfDayPlan?.planBrief || plan?.timeOfDayPlan?.calendarMessage) && (
            <div className="bg-muted/20 rounded-lg px-3 py-2.5 mt-2 min-h-[20px]">
              <span className="text-[13px] text-muted-foreground font-medium font-body leading-relaxed">
                <TextWithEventEmphasis text={plan.timeOfDayPlan.planBrief || plan.timeOfDayPlan.calendarMessage || ''} />
              </span>
            </div>
          )}
          {/* Check-in prompt banner */}
          {!isCollapsedByJit && noCheckinForWindow && ritualStatus.status !== 'completed' && (
            <button
              onClick={() => navigate('/daily-checkin')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15 text-xs text-primary font-medium hover:bg-primary/10 transition-colors"
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Check in to personalize your {plan?.timeOfDayPlan?.period || 'current'} plan
            </button>
          )}
        </div>
      )}

      {/* Pre-event context removed – handled by JitCarousel */}

      {/* Practice list – hidden when JIT collapses the ToD plan */}
      {!isCollapsedByJit && (<>
      {/* Vertical practice list */}
      <div className="flex flex-col gap-3 px-4 max-w-lg mx-auto">
        {activeModules.map((module, index) => {
          const isCompleted = completedPracticeIds.includes(module.contentId);
          const isCoach = module.isCoachCard;
          const display = getModuleDisplay(module);

          return (
            <div key={module.contentId}>
              <div
                onClick={() => !isCompleted && navigateToPractice(module)}
                className={cn(
                  "relative flex rounded-xl overflow-hidden h-44 transition-all duration-300",
                  "shadow-[0_4px_16px_rgba(0,0,0,0.08)]",
                  isCompleted
                    ? "bg-white/15 backdrop-blur-md border border-white/40 opacity-60 cursor-default"
                    : "bg-white/15 backdrop-blur-md border border-white/40 cursor-pointer hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
                )}
              >
                {/* Completed overlay badge */}
                {isCompleted && (
                  <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-saffron/90 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                    <Check size={10} className="stroke-[3]" />
                    Done
                  </div>
                )}

                {/* Step badge */}
                {!isCompleted && (
                  <span className="absolute top-2 right-2 z-10 text-[9px] uppercase tracking-wider text-muted-foreground/60 font-body">
                    Step {index + 1}
                  </span>
                )}

                {/* Thumbnail */}
                {isCoach ? (
                  <div className="w-32 h-full flex-shrink-0 relative overflow-hidden">
                    <img src={coachVisual} alt="" className={cn("w-full h-full object-cover object-top", isCompleted ? "brightness-50 grayscale-[30%]" : "brightness-75")} />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/30" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-headline text-white tracking-tight leading-none drop-shadow-lg">SM</span>
                      <span className="text-[8px] uppercase tracking-[0.15em] text-white/80 mt-0.5">Coach</span>
                    </div>
                    {!isCompleted && (
                      <div className="absolute top-2 right-2 bg-saffron/90 text-charcoal text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shadow-sm">
                        {module.title === 'Tiny Win and Reflection' ? 'Tiny Win & Reflection' : "Today's Plan"}
                      </div>
                    )}
                  </div>
                ) : (
                  <img
                    src={module.thumbnailUrl || getContentById(module.contentId)?.thumbnail || ''}
                    alt={module.title}
                    className={cn("w-32 h-full object-cover flex-shrink-0", isCompleted && "brightness-50 grayscale-[30%]")}
                  />
                )}

                {/* Content */}
                <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                  <div className="flex flex-col gap-0.5">
                    <span className={cn("text-xs font-medium tracking-wide uppercase font-body", isCompleted ? "text-saffron/80" : "text-saffron")}>{display.label}</span>
                    <span className="text-[10px] text-muted-foreground/60 font-body">{display.protocolType}</span>
                  </div>
                  <div className="flex items-start gap-1 mt-1.5">
                    <h4 className={cn("text-[15px] font-medium line-clamp-2 leading-snug font-body flex-1", isCompleted ? "text-foreground/50" : "text-foreground")}>{module.title}</h4>
                    {!isCoach && isFavorite(module.contentId) && (
                      <Heart size={14} className="text-saffron fill-saffron flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                  {module.reasoning && !isCompleted && (
                    <p className="text-[12px] text-muted-foreground font-medium font-body line-clamp-3 leading-snug mt-0.5">
                      {module.reasoning}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-muted-foreground font-body">{module.duration} min</span>
                  </div>
                </div>

                {isCompleted && (
                  <div className="w-8 h-8 rounded-full bg-saffron flex items-center justify-center mr-3 flex-shrink-0 self-center">
                    <Check size={16} className="text-white stroke-[3]" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Button */}
      <div className="px-4 max-w-lg mx-auto">
        {(ritualStatus.status === 'not_started' || (ritualStatus.status === 'partial' && ritualStatus.completedCount === 0)) && (
              <Button onClick={handleStartRitual} className="w-full h-12 text-[15px] font-medium bg-taupe text-white hover:bg-taupe/90 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
                Start Sequence
              </Button>
            )}
            {ritualStatus.status === 'partial' && ritualStatus.completedCount > 0 && (
              <Button onClick={handleContinueRitual} className="w-full h-12 text-base font-semibold bg-taupe text-white hover:bg-taupe/90 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
                Continue Sequence
              </Button>
            )}
            {ritualStatus.status === 'completed' && (
              <div className="flex items-center gap-2">
                <Button disabled className="flex-1 h-12 text-base font-semibold bg-taupe/80 text-white rounded-xl cursor-default">
                  <Check size={18} className="mr-2" />
                  Completed
                </Button>
                <Button onClick={handleRestartRitual} variant="outline" size="icon" className="h-12 w-12 rounded-xl border-taupe/30 hover:bg-taupe/10" title="Restart Ritual">
                  <RotateCcw size={18} className="text-muted-foreground" />
                </Button>
              </div>
            )}
      </div>
      </>)}
    </div>
  );
};

export default DailyRitual;
