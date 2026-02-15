/**
 * JitCarousel - Separate carousel for JIT interventions
 * Shows event-specific prep cards with "Prepare Now" badges,
 * event name, classification pills, and skip/show-less buttons.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Clock, X, Heart, Play, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useCalendarSync } from '@/hooks/useCalendarSync';
import { useFavorites } from '@/hooks/useFavorites';
import { getTodayRitual } from '@/utils/dailyRituals';
import { supabase } from '@/integrations/supabase/client';
import { generateRecommendations, type Recommendation } from '@/utils/recommendationEngine';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import MetricInfoModal from '@/components/home/MetricInfoModal';

// ─── Types ───────────────────────────────────────────────────

interface UpcomingEvent {
  id: string;
  title: string;
  startTime: Date;
  minutesUntil: number;
  isHighStakes: boolean;
  eventType: string;
}

export interface InterventionData {
  trigger: 'calendar' | 'wearable' | 'pattern' | 'consecutive-low';
  event?: UpcomingEvent;
  stressLevel?: 'elevated' | 'high';
  consecutiveState?: { days: number; state: string };
  modules: ('regulate' | 'align' | 'prepare' | 'integrate')[];
  practices: Recommendation[];
  coachPrompt?: string;
  showCoachCard?: boolean;
  hasFavorites?: boolean;
}

// ─── Constants ───────────────────────────────────────────────

const HIGH_STAKES_KEYWORDS = [
  'board', 'investor', 'presentation', 'interview', 'pitch',
  'negotiation', 'quarterly', 'review', 'performance', 'keynote',
  'meeting', 'call', 'client', 'stakeholder', 'executive', 'ceo', 'cfo'
];

const LOW_ENERGY_STATES = ['overwhelmed', 'drained', 'scattered'];

const EVENT_TYPE_MAP: Record<string, string> = {
  board: 'Board Meeting',
  investor: 'Investor',
  presentation: 'Presentation',
  interview: 'Interview',
  pitch: 'Pitch',
  negotiation: 'Negotiation',
  quarterly: 'Quarterly Review',
  review: 'Performance Review',
  keynote: 'Keynote',
  client: 'Client Meeting',
  stakeholder: 'Stakeholder',
  executive: 'Executive',
};

// ─── Helpers ─────────────────────────────────────────────────

const isHighStakesEvent = (title: string): boolean => {
  const lower = title.toLowerCase();
  return HIGH_STAKES_KEYWORDS.some(kw => lower.includes(kw));
};

const classifyEventType = (title: string): string => {
  const lower = title.toLowerCase();
  for (const kw of HIGH_STAKES_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return 'meeting';
};

const getEventPillLabel = (title: string): string => {
  const type = classifyEventType(title);
  return EVENT_TYPE_MAP[type] || 'High Stakes';
};

const getCoachPrompt = (intervention: InterventionData): string => {
  if (intervention.trigger === 'calendar' && intervention.event) {
    return `You have "${intervention.event.title}" in ${intervention.event.minutesUntil} minutes. Let's take a moment to mentally prepare. What outcome would make this a success for you?`;
  }
  if (intervention.trigger === 'consecutive-low' && intervention.consecutiveState) {
    return `You've been feeling ${intervention.consecutiveState.state} for ${intervention.consecutiveState.days} days now. This pattern often signals something deeper. What's been weighing on you?`;
  }
  return `Let's take a moment to center before what's ahead. What's on your mind?`;
};

// ─── Component ───────────────────────────────────────────────

const JitCarousel = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = DEV_MODE ? DEV_USER.id : user?.id;
  const { events: calendarEvents } = useCalendarSync();
  const { isFavorite } = useFavorites();

  const [interventions, setInterventions] = useState<InterventionData[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideCount, setSlideCount] = useState(0);

  useEffect(() => {
    detectInterventions();
  }, [calendarEvents, userId]);

  useEffect(() => {
    if (!carouselApi) return;
    setSlideCount(carouselApi.scrollSnapList().length);
    setCurrentSlide(carouselApi.selectedScrollSnap());
    carouselApi.on('select', () => setCurrentSlide(carouselApi.selectedScrollSnap()));
  }, [carouselApi]);

  const detectInterventions = async () => {
    if (!userId) { setLoading(false); return; }
    const now = new Date();
    const results: InterventionData[] = [];

    // Query skip preferences to deprioritize
    let skippedTypes: string[] = [];
    try {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const { data: skips } = await supabase
        .from('jit_preferences')
        .select('event_type')
        .eq('user_id', userId)
        .eq('action', 'skipped')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (skips) {
        const counts: Record<string, number> = {};
        skips.forEach(s => { counts[s.event_type || ''] = (counts[s.event_type || ''] || 0) + 1; });
        skippedTypes = Object.entries(counts).filter(([, c]) => c >= 3).map(([t]) => t);
      }
    } catch { /* ignore */ }

    // 1. Calendar events approaching (10-60 min)
    const upcoming = calendarEvents
      .map(event => {
        const startTime = new Date((event as any).start_time || event.startTime);
        const minutesUntil = Math.floor((startTime.getTime() - now.getTime()) / (1000 * 60));
        const title = (event as any).title || 'Event';
        return {
          id: (event as any).id || (event as any).external_id,
          title,
          startTime,
          minutesUntil,
          isHighStakes: isHighStakesEvent(title),
          eventType: classifyEventType(title),
        };
      })
      .filter(e => e.minutesUntil >= 10 && e.minutesUntil <= 60 && e.isHighStakes)
      .filter(e => !skippedTypes.includes(e.eventType))
      .sort((a, b) => a.minutesUntil - b.minutesUntil);

    for (const event of upcoming) {
      const practices = await getQuickPractices(['regulate', 'align']);
      const interventionData: InterventionData = {
        trigger: 'calendar',
        event,
        modules: ['regulate', 'align', 'prepare'],
        practices,
        showCoachCard: true,
        hasFavorites: practices.some(p => isFavorite(p.id)),
      };
      interventionData.coachPrompt = getCoachPrompt(interventionData);

      // Auto-classify event
      persistClassification(event);

      results.push(interventionData);
    }

    // 2. Consecutive low state pattern (if no calendar JIT)
    if (results.length === 0) {
      const consec = await checkConsecutiveLow();
      if (consec) {
        const practices = await getQuickPractices(['regulate', 'align']);
        const data: InterventionData = {
          trigger: 'consecutive-low',
          consecutiveState: consec,
          modules: ['regulate', 'align', 'prepare'],
          practices,
          showCoachCard: true,
          hasFavorites: practices.some(p => isFavorite(p.id)),
        };
        data.coachPrompt = getCoachPrompt(data);
        results.push(data);
      }
    }

    setInterventions(results);
    setLoading(false);
  };

  const persistClassification = async (event: UpcomingEvent) => {
    if (!userId) return;
    try {
      await supabase.from('calendar_event_classifications').upsert({
        user_id: userId,
        calendar_event_id: event.id,
        event_type: event.eventType,
        stakes_level: 'high',
        classified_by: 'system',
      }, { onConflict: 'user_id,calendar_event_id' }).select();
    } catch { /* silent */ }
  };

  const checkConsecutiveLow = async () => {
    if (!userId) return null;
    try {
      const { data } = await supabase
        .from('daily_checkins')
        .select('outcome')
        .eq('user_id', userId)
        .order('checkin_date', { ascending: false })
        .limit(7);
      if (!data?.length) return null;
      const first = data[0].outcome;
      if (!LOW_ENERGY_STATES.includes(first)) return null;
      let count = 1;
      for (let i = 1; i < data.length; i++) {
        if (data[i].outcome === first) count++;
        else break;
      }
      return count >= 3 ? { days: count, state: first } : null;
    } catch { return null; }
  };

  const getQuickPractices = async (modules: string[]): Promise<Recommendation[]> => {
    try {
      const energyState = await computeEnergyState(userId);
      const recs = await generateRecommendations(energyState);
      let filtered = recs.practices
        .filter(p => {
          if (modules.includes('regulate') && (p.contentType === 'soundbath' || p.tags?.some(t => t.toLowerCase().includes('breathing')))) return p.duration <= 3;
          if (modules.includes('align') && p.contentType === 'micro-practice' && p.duration <= 3) return true;
          return false;
        });
      filtered.sort((a, b) => (isFavorite(b.id) ? 1 : 0) - (isFavorite(a.id) ? 1 : 0));
      return filtered.slice(0, 2);
    } catch { return []; }
  };

  const handleSkip = async (intervention: InterventionData) => {
    if (!userId) return;
    const eventType = intervention.event?.eventType || intervention.trigger;
    const eventTitle = intervention.event?.title || intervention.consecutiveState?.state || '';

    // Persist skip preference
    try {
      await supabase.from('jit_preferences').insert({
        user_id: userId,
        event_type: eventType,
        action: 'skipped',
        event_title: eventTitle,
      });
    } catch { /* silent */ }

    // Remove from local state
    const key = intervention.event?.id || intervention.trigger;
    setDismissedIds(prev => new Set([...prev, key]));
  };

  const handleSnooze = async (intervention: InterventionData) => {
    const key = intervention.event?.id || intervention.trigger;
    setSnoozedIds(prev => new Set([...prev, key]));
    
    if (!userId) return;
    const eventType = intervention.event?.eventType || intervention.trigger;
    const eventTitle = intervention.event?.title || intervention.consecutiveState?.state || '';
    try {
      await supabase.from('jit_preferences').insert({
        user_id: userId,
        event_type: eventType,
        action: 'snoozed',
        event_title: eventTitle,
      });
    } catch { /* silent */ }
  };

  const handleStartPrep = (intervention: InterventionData) => {
    if (intervention.practices.length > 0) {
      // Store JIT data for post-practice coach nav
      if (intervention.showCoachCard && intervention.coachPrompt) {
        localStorage.setItem('jitInterventionData', JSON.stringify({
          coachPrompt: intervention.coachPrompt,
          flowType: 'prepare',
          eventTitle: intervention.event?.title,
        }));
      }
      const practice = intervention.practices[0];
      let route = practice.contentType === 'soundbath'
        ? `/soundscapes/${practice.id}`
        : practice.contentType === 'guided-practice'
          ? `/guided-practices/${practice.id}`
          : `/micro-practice/${practice.id}/cards`;
      navigate(route, { state: { category: practice.category, fromIntervention: true } });
    } else if (intervention.coachPrompt) {
      navigate('/coach', { state: { flowType: 'prepare', initialPrompt: intervention.coachPrompt, fromIntervention: true, eventTitle: intervention.event?.title } });
    }
  };

  // Get contextual description for the intervention
  const getContextDescription = (intervention: InterventionData): string => {
    if (intervention.trigger === 'calendar' && intervention.event) {
      const title = intervention.event.title;
      if (intervention.event.minutesUntil <= 60) {
        return `${title} in ${intervention.event.minutesUntil} minutes. Start preparing now with practice and mental rehearsal.`;
      }
      const days = Math.ceil(intervention.event.minutesUntil / (60 * 24));
      return `${title} in ${days} day${days > 1 ? 's' : ''}. Start preparing now with practice and mental rehearsal.`;
    }
    if (intervention.trigger === 'consecutive-low' && intervention.consecutiveState) {
      return `You've been feeling ${intervention.consecutiveState.state} for ${intervention.consecutiveState.days} days. Reset during this pattern.`;
    }
    return 'Contextual preparation for your upcoming moment.';
  };

  // Get time pill label (e.g., "In 2 days", "In 30 min")
  const getTimePill = (intervention: InterventionData): string => {
    if (intervention.trigger === 'calendar' && intervention.event) {
      if (intervention.event.minutesUntil < 60) {
        return `In ${intervention.event.minutesUntil} min`;
      }
      const hours = Math.floor(intervention.event.minutesUntil / 60);
      if (hours < 24) {
        return `In ${hours} hr${hours > 1 ? 's' : ''}`;
      }
      const days = Math.ceil(intervention.event.minutesUntil / (60 * 24));
      return `In ${days} day${days > 1 ? 's' : ''}`;
    }
    if (intervention.trigger === 'consecutive-low') {
      return 'Pattern Alert';
    }
    return 'Upcoming';
  };

  // Filter dismissed
  const visibleInterventions = interventions.filter(i => {
    const key = i.event?.id || i.trigger;
    return !dismissedIds.has(key) && !snoozedIds.has(key);
  });

  if (loading || visibleInterventions.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="px-4 md:px-6 max-w-lg mx-auto">
        <div className="flex items-center justify-between py-1">
          <span className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground/70 font-body">
            Just-in-Time
          </span>
          <MetricInfoModal
            title="Just-in-Time Preparation"
            description="When a high-stakes event is approaching, the system assembles a quick preparation sequence. These do not count toward your daily plan progress — they're additional support for specific moments."
          />
        </div>
      </div>

      {/* JIT Cards - vertical stack, not carousel */}
      <div className="px-4 md:px-6 max-w-lg mx-auto space-y-4">
        {visibleInterventions.map((intervention, idx) => {
          const event = intervention.event;

          return (
            <div key={event?.id || `jit-${idx}`} className={cn(
              "relative rounded-xl overflow-hidden",
              "bg-white/50 backdrop-blur-[16px] border border-black/[0.04]",
              "shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
            )}>
              <div className="p-4 space-y-3">
                {/* Time pill + dismiss */}
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-background border border-black/[0.08] text-foreground">
                    {getTimePill(intervention)}
                  </span>
                  <button
                    onClick={() => handleSkip(intervention)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Dismiss"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Event title */}
                <div>
                  <h3 className="text-lg font-semibold text-foreground font-body">
                    {event?.title || 'Upcoming Event'}
                  </h3>
                  {event && (
                    <p className="text-sm text-muted-foreground font-body">
                      {getEventPillLabel(event.title)}
                    </p>
                  )}
                </div>

                {/* Context description */}
                <p className="text-sm text-muted-foreground italic font-body leading-relaxed">
                  {getContextDescription(intervention)}
                </p>

                {/* Practice recommendations */}
                {intervention.practices.length > 0 && (
                  <div className="space-y-1.5">
                    {intervention.practices.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 text-xs">
                        <span className="font-medium uppercase text-saffron w-16">
                          {intervention.modules[i] === 'regulate' ? 'Regulate' : 'Align'}
                        </span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-foreground truncate flex-1">{p.title}</span>
                        {isFavorite(p.id) && <Heart size={10} className="fill-saffron text-saffron flex-shrink-0" />}
                        <span className="text-muted-foreground flex-shrink-0">({p.duration}m)</span>
                      </div>
                    ))}
                    {intervention.showCoachCard && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium uppercase text-saffron w-16">Prepare</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-foreground">Mental Rehearsal</span>
                        <span className="text-muted-foreground ml-auto">(Coach)</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Start Pack button */}
                <Button
                  onClick={() => handleStartPrep(intervention)}
                  className="w-full h-10 text-sm font-semibold bg-taupe text-white hover:bg-taupe/90 rounded-xl"
                >
                  <Play size={14} className="mr-1.5" />
                  Start Pack
                </Button>

                {/* Snooze */}
                <button
                  onClick={() => handleSnooze(intervention)}
                  className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  Snooze <ChevronDown size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default JitCarousel;
