/**
 * JitCarousel - Renders pre-event JIT interventions from the backend plan response.
 * This is a thin renderer — all detection logic lives in generate-mastery-plan.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, Heart, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/hooks/useFavorites';
import { supabase } from '@/integrations/supabase/client';
import MetricInfoModal from '@/components/home/MetricInfoModal';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

interface PreEventModule {
  type: string;
  contentId: string;
  title: string;
  contentType: string;
  duration: number;
  focus: string;
  intensity: string;
  isFavorite: boolean;
  isCoachCard?: boolean;
  reasoning: string;
}

interface PreEventPlan {
  eventTitle: string;
  eventType: string;
  minutesUntil: number;
  timePill: string;
  contextDescription: string;
  modules: PreEventModule[];
  coachCard: any;
  progressTracked: boolean;
}

interface JitCarouselProps {
  preEventPlan?: PreEventPlan | null;
}

const JitCarousel = ({ preEventPlan }: JitCarouselProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = DEV_MODE ? DEV_USER.id : user?.id;
  const { isFavorite } = useFavorites();

  const [dismissed, setDismissed] = useState(false);
  const [snoozed, setSnoozed] = useState(false);

  if (!preEventPlan || dismissed || snoozed) return null;

  const handleDismiss = async () => {
    setDismissed(true);
    if (!userId) return;
    try {
      await supabase.from('jit_preferences').insert({
        user_id: userId,
        event_type: preEventPlan.eventType,
        action: 'dismissed',
        event_title: preEventPlan.eventTitle,
      });
    } catch { /* silent */ }
  };

  const handleSnooze = async () => {
    setSnoozed(true);
    if (!userId) return;
    try {
      await supabase.from('jit_preferences').insert({
        user_id: userId,
        event_type: preEventPlan.eventType,
        action: 'snoozed',
        event_title: preEventPlan.eventTitle,
      });
    } catch { /* silent */ }
  };

  const handleStartPrep = () => {
    const modules = preEventPlan.modules;
    if (modules.length > 0) {
      // Store JIT data for post-practice coach nav
      if (preEventPlan.coachCard?.prompt) {
        localStorage.setItem('jitInterventionData', JSON.stringify({
          coachPrompt: preEventPlan.coachCard.prompt,
          flowType: 'prepare',
          eventTitle: preEventPlan.eventTitle,
        }));
      }
      const first = modules[0];
      if (first.isCoachCard) {
        navigate('/coach', {
          state: {
            flowType: 'prepare',
            initialPrompt: preEventPlan.coachCard?.prompt || "Let's prepare for what's ahead.",
            fromIntervention: true,
            eventTitle: preEventPlan.eventTitle
          }
        });
        return;
      }
      let route = first.contentType === 'soundbath'
        ? `/soundscapes/${first.contentId}`
        : first.contentType === 'guided-practice'
          ? `/guided-practices/${first.contentId}`
          : `/micro-practice/${first.contentId}/cards`;
      navigate(route, { state: { category: 'pause', fromIntervention: true } });
    } else if (preEventPlan.coachCard?.prompt) {
      navigate('/coach', { state: { flowType: 'prepare', initialPrompt: preEventPlan.coachCard.prompt, fromIntervention: true, eventTitle: preEventPlan.eventTitle } });
    }
  };

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
            description="A focused preparation sequence for the high-stakes moment ahead. Two or three minutes of targeted practice — regulation, alignment, and a coaching prompt — designed to bring your best self into the room."
          />
        </div>
      </div>

      {/* JIT Card */}
      <div className="px-4 md:px-6 max-w-lg mx-auto">
        <div className={cn(
          "relative rounded-xl overflow-hidden",
          "bg-white/50 backdrop-blur-[16px] border border-black/[0.04]",
          "shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
        )}>
          <div className="p-4 space-y-3">
            {/* Time pill + dismiss */}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-background border border-black/[0.08] text-foreground">
                {preEventPlan.timePill}
              </span>
              <button
                onClick={handleDismiss}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X size={18} />
              </button>
            </div>

            {/* Event title */}
            <div>
              <h3 className="text-lg font-semibold text-foreground font-body">
                {preEventPlan.eventTitle || 'Upcoming Event'}
              </h3>
            </div>

            {/* Context description */}
            <p className="text-sm text-muted-foreground italic font-body leading-relaxed">
              {preEventPlan.contextDescription}
            </p>

            {/* Practice recommendations */}
            {preEventPlan.modules.length > 0 && (
              <div className="space-y-1.5">
                {preEventPlan.modules.map((m, i) => (
                  <div key={m.contentId || i} className="flex items-center gap-2 text-xs">
                    <span className="font-medium uppercase text-saffron w-16">
                      {m.type === 'regulate' ? 'Regulate' : m.type === 'align' ? 'Align' : m.type === 'prepare' ? 'Prepare' : 'Integrate'}
                    </span>
                    <span className="text-muted-foreground">—</span>
                    <span className="text-foreground truncate flex-1">{m.title}</span>
                    {isFavorite(m.contentId) && <Heart size={10} className="fill-saffron text-saffron flex-shrink-0" />}
                    <span className="text-muted-foreground flex-shrink-0">({m.duration}m)</span>
                  </div>
                ))}
              </div>
            )}

            {/* Start Pack button */}
            <Button
              onClick={handleStartPrep}
              className="w-full h-10 text-sm font-semibold bg-taupe text-white hover:bg-taupe/90 rounded-xl"
            >
              Start Pack
            </Button>

            {/* Snooze */}
            <button
              onClick={handleSnooze}
              className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Snooze <ChevronDown size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JitCarousel;
