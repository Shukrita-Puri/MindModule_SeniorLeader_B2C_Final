import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PostEventReflection from '@/components/home/PostEventReflection';
import { Button } from '@/components/ui/button';
import { Check, RotateCcw, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { toast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';
import { useFavorites } from '@/hooks/useFavorites';
import { getTodayRitual, upsertRitual } from '@/utils/dailyRituals';
import { getTodayCheckin } from '@/utils/dailyCheckins';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { fetchOuterReadiness } from '@/hooks/useOuterReadiness';
import { getActiveCoachInsights } from '@/utils/coachInsightsExtractor';
import { getContentById } from '@/data/practicesAndSoundscapes';

// Background images for Coach cards
import coachVisual from '@/assets/coach-visual-calm.jpeg';

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
}

interface MasteryPlanResponse {
  timeOfDayPlan: {
    label: string;
    period: 'morning' | 'afternoon' | 'evening';
    modules: PlanModule[];
    coachCard: CoachCardData | null;
    totalDuration: number;
    progressTracked: boolean;
  };
  calendarPills: CalendarPill[];
  preEventPlan: PreEventPlan | null;
  meta: {
    generatedAt: string;
    scenarioId: string | null;
    durationCeiling: number;
    maxModules: number;
  };
}

// Check if current time is evening (after 5pm)
const isEvening = (): boolean => {
  const hour = new Date().getHours();
  return hour >= 17;
};

const DailyRitual = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { favorites, isFavorite } = useFavorites();
  const [plan, setPlan] = useState<MasteryPlanResponse | null>(null);
  const [activeView, setActiveView] = useState<'timeOfDay' | 'preEvent'>('timeOfDay');
  const [loading, setLoading] = useState(true);
  const [completedPracticeIds, setCompletedPracticeIds] = useState<string[]>([]);
  const [ritualStatus, setRitualStatus] = useState<{
    status: 'not_started' | 'partial' | 'completed';
    completedCount: number;
    totalCount: number;
  }>({ status: 'not_started', completedCount: 0, totalCount: 0 });
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const prevCompletedIdsRef = useRef<string[]>([]);

  // Navigate to Coach with context
  const navigateToCoach = (prompt: string, flowType: string, eventTitle?: string) => {
    navigate('/coach', {
      state: { initialPrompt: prompt, flowType, eventTitle }
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

  useEffect(() => {
    if (!carouselApi) return;
    setSlideCount(carouselApi.scrollSnapList().length);
    setCurrentSlide(carouselApi.selectedScrollSnap());
    carouselApi.on("select", () => setCurrentSlide(carouselApi.selectedScrollSnap()));
  }, [carouselApi]);

  useEffect(() => {
    if (!carouselApi) return;
    const onPointerDown = () => setIsDragging(false);
    const onPointerUp = () => setTimeout(() => setIsDragging(false), 100);
    const onScroll = () => setIsDragging(true);
    carouselApi.on('pointerDown', onPointerDown);
    carouselApi.on('pointerUp', onPointerUp);
    carouselApi.on('scroll', onScroll);
    return () => {
      carouselApi.off('pointerDown', onPointerDown);
      carouselApi.off('pointerUp', onPointerUp);
      carouselApi.off('scroll', onScroll);
    };
  }, [carouselApi]);

  useEffect(() => {
    loadPlan();
    checkRitualCompletion();
    const interval = setInterval(() => checkRitualCompletion(), 15000);
    return () => clearInterval(interval);
  }, [user?.id]);

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
    const data = await getTodayRitual();
    const modules = plan?.timeOfDayPlan?.modules || [];
    
    if (!data) {
      setRitualStatus({ status: 'not_started', completedCount: 0, totalCount: modules.length || 0 });
      setCompletedPracticeIds([]);
      return;
    }

    const completedIds = data.completed_practice_ids || [];
    setCompletedPracticeIds(completedIds);
    const totalRecommended = data.recommended_practices_count || modules.length || 3;
    const effectiveCompletedCount = completedIds.length;

    let status: 'not_started' | 'partial' | 'completed' = 'not_started';
    if (data.completion_status === 'full') status = 'completed';
    else if (effectiveCompletedCount >= totalRecommended && effectiveCompletedCount > 0) {
      status = 'completed';
      await upsertRitual({ ritual_date: new Date().toISOString().split('T')[0], completion_status: 'full' });
    } else if (effectiveCompletedCount > 0) status = 'partial';

    setRitualStatus({ status, completedCount: effectiveCompletedCount, totalCount: totalRecommended });
  };

  const loadPlan = async () => {
    setLoading(true);
    try {
      // Check for stored plan first
      const todayRitual = await getTodayRitual();
      const todayCheckin = await getTodayCheckin();
      const todayDate = new Date().toISOString().split('T')[0];
      const sessionKey = `plan-loaded-${todayDate}`;
      const sessionLoaded = sessionStorage.getItem(sessionKey);

      const storedPracticeIds = todayRitual?.recommended_practice_ids;
      const hasStoredPlan = storedPracticeIds && storedPracticeIds.length > 0;
      let shouldRegenerate = !hasStoredPlan;

      if (hasStoredPlan && todayCheckin && todayRitual) {
        const checkinTime = new Date(todayCheckin.timestamp);
        const planTime = new Date(todayRitual.updated_at || todayRitual.created_at || todayRitual.ritual_date);
        if (checkinTime.getTime() > planTime.getTime() + 60000) {
          shouldRegenerate = true;
          sessionStorage.removeItem(sessionKey);
          await upsertRitual({
            ritual_date: todayDate,
            completion_status: 'partial',
            completed_practice_ids: [],
            soundscape_completed: false,
            guided_practice_completed: false,
            micro_exercise_completed: false
          });
          setCompletedPracticeIds([]);
          setRitualStatus({ status: 'not_started', completedCount: 0, totalCount: 0 });
        }
      }

      // Use session cache if available
      if (!shouldRegenerate && sessionLoaded === 'true') {
        const cachedPlan = sessionStorage.getItem(`plan-data-${todayDate}`);
        if (cachedPlan) {
          const parsed = JSON.parse(cachedPlan) as MasteryPlanResponse;
          setPlan(parsed);
          const completedIds = todayRitual?.completed_practice_ids || [];
          setCompletedPracticeIds(completedIds);
          const modules = parsed.timeOfDayPlan?.modules || [];
          setRitualStatus({
            status: completedIds.length >= modules.length && completedIds.length > 0 ? 'completed' : completedIds.length > 0 ? 'partial' : 'not_started',
            completedCount: completedIds.length,
            totalCount: modules.length
          });
          setLoading(false);
          return;
        }
      }

      // Generate fresh plan via backend
      const energyState = await computeEnergyState(user?.id);
      const outerBrief = await fetchOuterReadiness(user?.id);
      const favoriteIds = Array.from(favorites.keys());
      const coachInsights = user?.id ? await getActiveCoachInsights(user.id) : [];
      const completedToday = todayRitual?.completed_practice_ids || [];

      // Fetch calendar events
      let calendarEvents: any[] = [];
      if (user?.id) {
        const now = new Date();
        const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const { data: events } = await supabase
          .from('calendar_events')
          .select('id, title, start_time, end_time, is_organizer, attendees_count, is_recurring')
          .eq('user_id', user.id)
          .gte('start_time', now.toISOString())
          .lte('start_time', in48h.toISOString());
        calendarEvents = (events || []).map(e => ({
          id: e.id,
          title: e.title,
          startTime: e.start_time,
          endTime: e.end_time,
          isOrganizer: e.is_organizer,
          attendeesCount: e.attendees_count,
          isRecurring: e.is_recurring
        }));
      }

      // Check consecutive low pattern
      let patternInsight: any = undefined;
      if (user?.id) {
        const { data: checkins } = await supabase
          .from('daily_checkins')
          .select('outcome')
          .eq('user_id', user.id)
          .order('checkin_date', { ascending: false })
          .limit(7);
        if (checkins?.length) {
          const first = checkins[0].outcome;
          const lowStates = ['overwhelmed', 'drained', 'scattered'];
          if (lowStates.includes(first)) {
            let count = 1;
            for (let i = 1; i < checkins.length; i++) {
              if (checkins[i].outcome === first) count++;
              else break;
            }
            if (count >= 3) patternInsight = { count, state: first };
          }
        }
      }

      // Fetch onboarding tags from profile
      let practicePriorityTag = '';
      let pressureContextTag = '';
      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('practice_priority_tag, pressure_context_tag')
          .eq('id', user.id)
          .maybeSingle();
        practicePriorityTag = profile?.practice_priority_tag || '';
        pressureContextTag = profile?.pressure_context_tag || '';
      }

      // Fetch effective content IDs (practices rated 4-5 stars)
      let effectiveContentIds: string[] = [];
      if (user?.id) {
        const { data: effectiveFeedback } = await supabase
          .from('content_relevance_feedback')
          .select('content_id')
          .eq('user_id', user.id)
          .gte('star_rating', 4);
        effectiveContentIds = effectiveFeedback?.map(f => f.content_id) || [];
      }

      const requestBody = {
        userId: user?.id || '',
        innerReadinessTier: energyState.energyTier,
        innerReadinessScore: energyState.overallBalance || 50,
        outerReadinessPhrase: outerBrief?.phrase || 'Steady execution.',
        outerReadinessDriver: outerBrief?.driver || 'state',
        calendarLoad: energyState.calendarLoad || 'none',
        calendarPressure: energyState.calendarPressure || 'none',
        calendarEvents,
        favorites: favoriteIds,
        completedToday,
        timezoneOffset: new Date().getTimezoneOffset(),
        clarityLevel: 0,
        confidenceLevel: 0,
        checkInOutcome: energyState.checkInOutcome || 'steady',
        archetype: '',
        coachInsights: coachInsights.map(i => ({ id: i.id, type: i.type, content: i.content, contentReference: i.contentReference, confidence: i.confidence })),
        effectiveContent: effectiveContentIds,
        patternInsight,
        practicePriorityTag,
        pressureContextTag
      };

      const { data: planData, error } = await supabase.functions.invoke('generate-mastery-plan', {
        body: requestBody
      });

      if (error) {
        console.error('Error calling generate-mastery-plan:', error);
        setLoading(false);
        return;
      }

      const planResponse = planData as MasteryPlanResponse;
      setPlan(planResponse);

      // Store plan for stability
      if (user) {
        const moduleIds = planResponse.timeOfDayPlan.modules.map(m => m.contentId);
        await upsertRitual({
          ritual_date: todayDate,
          recommended_practice_ids: moduleIds,
          recommended_practices_count: moduleIds.length,
          session_period: planResponse.timeOfDayPlan.period
        });
        sessionStorage.setItem(sessionKey, 'true');
        sessionStorage.setItem(`plan-data-${todayDate}`, JSON.stringify(planResponse));
      }

      setRitualStatus(prev => ({
        ...prev,
        totalCount: planResponse.timeOfDayPlan.modules.length,
        status: prev.completedCount >= planResponse.timeOfDayPlan.modules.length && prev.completedCount > 0 ? 'completed' : prev.completedCount > 0 ? 'partial' : 'not_started'
      }));
    } catch (error) {
      console.error('Error loading plan:', error);
    }
    setLoading(false);
  };

  const navigateToPractice = async (module: PlanModule) => {
    const modules = activeView === 'preEvent' && plan?.preEventPlan
      ? plan.preEventPlan.modules
      : plan?.timeOfDayPlan?.modules || [];

    localStorage.setItem('practiceQueue', JSON.stringify(modules.map(m => ({
      id: m.contentId, title: m.title, contentType: m.contentType, category: m.contentType === 'coach' ? 'coach' : 'pause', duration: m.duration
    }))));
    const practiceIndex = modules.findIndex(m => m.contentId === module.contentId);
    localStorage.setItem('queueIndex', String(practiceIndex >= 0 ? practiceIndex : 0));
    localStorage.setItem('ritualMode', 'true');

    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await upsertRitual({
        ritual_date: today,
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
    const modules = plan?.timeOfDayPlan?.modules || [];
    const newCompletedIds = [...completedPracticeIds, practiceId];
    const result = await upsertRitual({
      ritual_date: today,
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
    const modules = activeView === 'preEvent' && plan?.preEventPlan
      ? plan.preEventPlan.modules
      : plan?.timeOfDayPlan?.modules || [];
    if (modules.length === 0) return;

    localStorage.setItem('practiceQueue', JSON.stringify(modules.map(m => ({
      id: m.contentId, title: m.title, contentType: m.contentType, category: m.contentType === 'coach' ? 'coach' : 'pause', duration: m.duration
    }))));
    localStorage.setItem('queueIndex', '0');
    localStorage.setItem('ritualMode', 'true');
    localStorage.setItem('todayRecommendedIds', JSON.stringify(modules.map(m => m.contentId)));

    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await upsertRitual({
        ritual_date: today,
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
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('daily_ritual_completions').delete().eq('user_id', user.id).eq('ritual_date', today);
    }
    localStorage.removeItem('practiceQueue');
    localStorage.removeItem('queueIndex');
    localStorage.removeItem('ritualMode');
    const todayDate = new Date().toISOString().split('T')[0];
    sessionStorage.removeItem(`plan-loaded-${todayDate}`);
    sessionStorage.removeItem(`plan-data-${todayDate}`);
    setRitualStatus({ status: 'not_started', completedCount: 0, totalCount: plan?.timeOfDayPlan?.modules?.length || 0 });
    await loadPlan();
  };

  if (loading) {
    return (
      <div className="px-4 py-5">
        <div className="space-y-3">
          <div className="h-4 bg-muted/30 animate-pulse rounded-lg" />
          <div className="h-4 bg-muted/30 animate-pulse rounded-lg w-3/4" />
        </div>
      </div>
    );
  }

  const activeModules = activeView === 'preEvent' && plan?.preEventPlan
    ? plan.preEventPlan.modules
    : plan?.timeOfDayPlan?.modules || [];

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
    const protocolTypes: Record<string, string> = { regulate: 'Somatic Protocol', align: 'Mindset Protocol', prepare: 'Inner Mastery Coach', integrate: 'Inner Mastery Coach' };
    return { label: labels[module.type], protocolType: protocolTypes[module.type] };
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="px-4 max-w-lg mx-auto">
        <PostEventReflection />
      </div>

      {/* Calendar context pills - only show if there are calendar events */}
      {plan?.calendarPills && plan.calendarPills.length > 0 && (
        <div className="px-4 max-w-lg mx-auto">
          <div className="flex items-center gap-2 flex-wrap">
            {plan.calendarPills.map((pill, i) => (
              <button
                key={pill.eventId || i}
                onClick={() => setActiveView(activeView === 'preEvent' ? 'timeOfDay' : 'preEvent')}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                  activeView === 'preEvent'
                    ? "bg-taupe text-white shadow-sm"
                    : "bg-background border border-black/[0.08] text-foreground hover:bg-muted/50"
                )}
              >
                <span>{pill.label}</span>
                <span className="text-[10px] opacity-70">· {pill.timePill}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Progress tracker - only for time-of-day */}
      {activeView === 'timeOfDay' && (
        <div className="px-4 max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground font-body">
              {plan?.timeOfDayPlan?.label || 'Today'}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
              {plan?.timeOfDayPlan?.period === 'evening' ? 'Evening' : plan?.timeOfDayPlan?.period === 'afternoon' ? 'Afternoon' : 'Morning'}
            </span>
          </div>
          <span className={cn(
            "text-xs font-medium font-body",
            ritualStatus.status === 'completed' ? "text-saffron" : "text-muted-foreground"
          )}>
            {ritualStatus.completedCount} of {ritualStatus.totalCount} completed
          </span>
        </div>
      )}

      {/* Pre-event context if active */}
      {activeView === 'preEvent' && plan?.preEventPlan && (
        <div className="px-4 max-w-lg mx-auto">
          <p className="text-sm text-muted-foreground italic font-body leading-relaxed">
            {plan.preEventPlan.contextDescription}
          </p>
        </div>
      )}

      {/* Carousel */}
      <div className="relative w-full">
        <Carousel opts={{ align: 'start', loop: false, watchDrag: true }} className="w-full" setApi={setCarouselApi}>
          <CarouselContent className="-ml-3 pl-4 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: 'pan-y' }}>
            {activeModules.map((module, index) => {
              const isCompleted = completedPracticeIds.includes(module.contentId);
              const isCoach = module.isCoachCard;
              const display = getModuleDisplay(module);
              const isLastCard = index === activeModules.length - 1;

              return (
                <CarouselItem key={module.contentId} className="pl-4 basis-[80%] sm:basis-[70%] md:basis-[45%] lg:basis-[30%]">
                  <div
                    onClick={() => !isDragging && !isCompleted && navigateToPractice(module)}
                    className={cn(
                      "flex rounded-xl overflow-hidden h-40 cursor-pointer transition-all duration-300",
                      "bg-white/65 backdrop-blur-[20px] border border-black/[0.06]",
                      "shadow-[0_4px_16px_rgba(0,0,0,0.04)]",
                      isCompleted ? "opacity-50 cursor-not-allowed" : "hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
                      isLastCard && "mr-4"
                    )}
                  >
                    {/* Thumbnail */}
                    {isCoach ? (
                      <div className="w-32 h-full flex-shrink-0 relative overflow-hidden">
                        <img src={coachVisual} alt="" className="w-full h-full object-cover object-top brightness-75" />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/30" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-headline text-white tracking-tight leading-none drop-shadow-lg">SM</span>
                          <span className="text-[8px] uppercase tracking-[0.15em] text-white/80 mt-0.5">Coach</span>
                        </div>
                        <div className="absolute top-2 right-2 bg-saffron/90 text-charcoal text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shadow-sm">
                          {module.title === 'Tiny Win and Reflection' ? 'Tiny Win & Reflection' : "Today's Plan"}
                        </div>
                      </div>
                    ) : (
                      <img
                        src={module.thumbnailUrl || getContentById(module.contentId)?.thumbnail || ''}
                        alt={module.title}
                        className="w-32 h-full object-cover flex-shrink-0"
                      />
                    )}

                    {/* Content */}
                    <div className="flex-1 p-4 flex flex-col justify-center min-w-0">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium tracking-wide uppercase text-saffron font-body">{display.label}</span>
                        <span className="text-[10px] text-muted-foreground/60 font-body">{display.protocolType}</span>
                      </div>
                      <div className="flex items-start gap-1 mt-1.5">
                        <h4 className="text-base font-semibold text-foreground line-clamp-2 leading-snug font-body flex-1">{module.title}</h4>
                        {!isCoach && isFavorite(module.contentId) && (
                          <Heart size={14} className="text-saffron fill-saffron flex-shrink-0 mt-0.5" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-muted-foreground font-body">{module.duration} min</span>
                      </div>
                    </div>

                    {isCompleted && (
                      <div className="w-8 h-8 rounded-full bg-saffron flex items-center justify-center mr-3 flex-shrink-0 self-center">
                        <Check size={16} className="text-white" />
                      </div>
                    )}
                  </div>
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none md:hidden" />
      </div>

      {/* Pagination Dots */}
      {slideCount > 1 && (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: slideCount }).map((_, index) => (
            <button key={index} onClick={() => carouselApi?.scrollTo(index)} className={cn("h-2 rounded-full transition-all", index === currentSlide ? "bg-primary w-4" : "bg-muted-foreground/30 w-2")} />
          ))}
        </div>
      )}

      {/* Action Button */}
      <div className="px-4 max-w-lg mx-auto">
        {activeView === 'preEvent' && plan?.preEventPlan ? (
          <Button
            onClick={handleStartRitual}
            className="w-full h-12 text-base font-semibold bg-taupe text-white hover:bg-taupe/90 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
          >
            Start Pack
          </Button>
        ) : (
          <>
            {(ritualStatus.status === 'not_started' || (ritualStatus.status === 'partial' && ritualStatus.completedCount === 0)) && (
              <Button onClick={handleStartRitual} className="w-full h-12 text-base font-semibold bg-taupe text-white hover:bg-taupe/90 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
                Start Your Mastery Plan
              </Button>
            )}
            {ritualStatus.status === 'partial' && ritualStatus.completedCount > 0 && (
              <Button onClick={handleContinueRitual} className="w-full h-12 text-base font-semibold bg-taupe text-white hover:bg-taupe/90 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
                {(() => {
                  const queue = localStorage.getItem('practiceQueue');
                  const currentIndex = parseInt(localStorage.getItem('queueIndex') || '0');
                  if (queue) {
                    try {
                      const queueData = JSON.parse(queue);
                      const nextPractice = queueData[currentIndex];
                      if (nextPractice?.title) {
                        const title = nextPractice.title.length > 22 ? nextPractice.title.slice(0, 22) + '...' : nextPractice.title;
                        return `Continue: ${title}`;
                      }
                    } catch { /* fallback */ }
                  }
                  return 'Continue Flow';
                })()}
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
          </>
        )}
      </div>
    </div>
  );
};

export default DailyRitual;
