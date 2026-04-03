/**
 * PostEventReflection - Micro-reflection card after high-stakes events
 * Shows for 2 hours after a high-stakes calendar event ends.
 * Two-tap flow: behavior type → energy level → save + navigate to Coach
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

interface RecentEvent {
  id: string;
  title: string;
  endTime: Date;
  minutesSinceEnd: number;
}

const HIGH_STAKES_KEYWORDS = [
  'board', 'investor', 'presentation', 'interview', 'pitch',
  'negotiation', 'quarterly', 'review', 'performance', 'keynote',
  'client', 'stakeholder', 'executive', 'ceo', 'cfo'
];

const isHighStakesEvent = (title: string): boolean => {
  const lower = title.toLowerCase();
  return HIGH_STAKES_KEYWORDS.some(kw => lower.includes(kw));
};

type BehaviorType = 'avoided' | 'confronted' | 'listened';
type EnergyAfter = 'down' | 'same' | 'up';

const PostEventReflection = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = DEV_MODE ? DEV_USER.id : user?.id;

  const [recentEvent, setRecentEvent] = useState<RecentEvent | null>(null);
  const [step, setStep] = useState<'behavior' | 'energy' | 'done'>('behavior');
  const [selectedBehavior, setSelectedBehavior] = useState<BehaviorType | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    detectRecentHighStakesEvent();
  }, [userId]);

  const detectRecentHighStakesEvent = async () => {
    if (!userId) return;

    try {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Get today's calendar events that ended recently
      const { data: events } = await supabase
        .from('calendar_events')
        .select('id, title, end_time')
        .eq('user_id', userId)
        .gte('end_time', twoHoursAgo.toISOString())
        .lte('end_time', now.toISOString())
        .order('end_time', { ascending: false });

      if (!events?.length) return;

      // Filter for high-stakes events
      const highStakes = events.filter(e => isHighStakesEvent(e.title || ''));
      if (!highStakes.length) return;

      const event = highStakes[0];
      const endTime = new Date(event.end_time);
      const minutesSinceEnd = Math.floor((now.getTime() - endTime.getTime()) / (1000 * 60));

      // Check if we already have a behavior_log for this event
      const { data: existingLog } = await supabase
        .from('behavior_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('event_title', event.title || '')
        .gte('created_at', endTime.toISOString())
        .maybeSingle();

      if (existingLog) return; // Already reflected

      setRecentEvent({
        id: event.id,
        title: event.title || 'Event',
        endTime,
        minutesSinceEnd,
      });
    } catch (error) {
      console.error('[PostEventReflection] Error detecting events:', error);
    }
  };

  const handleBehaviorSelect = (behavior: BehaviorType) => {
    setSelectedBehavior(behavior);
    setStep('energy');
  };

  const handleEnergySelect = async (energy: EnergyAfter) => {
    if (!userId || !recentEvent || !selectedBehavior) return;
    setSaving(true);

    try {
      // 1. Save to behavior_logs
      await supabase.from('behavior_logs').insert({
        user_id: userId,
        context_event_id: recentEvent.id,
        event_title: recentEvent.title,
        behavior_type: selectedBehavior,
        energy_after: energy,
      });

      // 2. Save coach insight for memory
      await supabase.from('user_coach_insights').insert({
        user_id: userId,
        insight_type: 'behavior_pattern',
        insight_content: `${recentEvent.title} - You ${selectedBehavior} and felt ${energy === 'down' ? 'drained' : energy === 'up' ? 'energized' : 'same'}`,
        confidence_score: 0.85,
        content_reference: 'post_event_reflection',
      });

      setStep('done');

      // 3. Navigate to Coach for deeper reflection
      const energyLabel = energy === 'down' ? 'drained' : energy === 'up' ? 'energized' : 'about the same';
      navigate('/coach', {
        state: {
          flowType: 'guided-reflection',
          initialPrompt: `You just came out of "${recentEvent.title}". You said you ${selectedBehavior} and feel ${energyLabel}. Let's process that together. What was the moment where you made that choice?`,
          eventTitle: recentEvent.title,
          behaviorType: selectedBehavior,
          energyLevel: energy,
          sourceFlow: 'post_event_reflection',
          entryContext: { entryPoint: 'check_in', lastAction: `completed post-event reflection for "${recentEvent.title}"`, triggeredBy: null },
        },
      });
    } catch (error) {
      console.error('[PostEventReflection] Error saving:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!recentEvent || step === 'done') return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium tracking-widest uppercase text-primary/70 font-body">
          Post-Event Reflection
        </span>
      </div>

      <div className="relative rounded-xl overflow-hidden bg-white/65 backdrop-blur-[20px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.04)] p-4">
        {step === 'behavior' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle size={14} className="text-primary" />
              <span className="text-sm font-medium text-foreground">
                Your "{recentEvent.title}" just ended
              </span>
            </div>
            <p className="text-xs text-muted-foreground">How did you show up?</p>
            <div className="flex gap-2">
              {([
                { value: 'avoided' as BehaviorType, label: 'Avoided' },
                { value: 'confronted' as BehaviorType, label: 'Confronted' },
                { value: 'listened' as BehaviorType, label: 'Listened' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleBehaviorSelect(opt.value)}
                  className={cn(
                    "flex-1 py-2.5 px-3 rounded-lg text-xs font-medium transition-all",
                    "border border-black/[0.06] bg-white/50 hover:bg-primary/10 hover:border-primary/30",
                    "text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'energy' && (
          <div className="space-y-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-2">
              <MessageCircle size={14} className="text-primary" />
              <span className="text-sm font-medium text-foreground">
                How's your energy now?
              </span>
            </div>
            <div className="flex gap-2">
              {([
                { value: 'down' as EnergyAfter, label: 'Drained' },
                { value: 'same' as EnergyAfter, label: 'Same' },
                { value: 'up' as EnergyAfter, label: 'Energized' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleEnergySelect(opt.value)}
                  disabled={saving}
                  className={cn(
                    "flex-1 py-2.5 px-3 rounded-lg text-xs font-medium transition-all",
                    "border border-black/[0.06] bg-white/50 hover:bg-primary/10 hover:border-primary/30",
                    "text-foreground",
                    saving && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60 text-center">
              After saving, we'll open your Coach to dig deeper
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PostEventReflection;
