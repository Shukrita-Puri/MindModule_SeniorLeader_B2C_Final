/**
 * ReflectionCorner — Inline evening Tiny Win + Stoic companion card.
 * Surfaces only inside the /plan evening "Tiny Win and Reflection" slot.
 * Not mounted on /executive-home. Not a new route.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getContentById } from '@/data/practicesAndSoundscapes';
import { getEdgeFunctionHeaders } from '@/services/authTokenService';

interface ReflectionCornerProps {
  /** When provided, switches the prompt to a post-event framing. */
  postEventTitle?: string | null;
  /** Fired after a successful save so the parent can mark the slot complete. */
  onSaved?: () => void;
}

const ReflectionCorner = ({ postEventTitle, onSaved }: ReflectionCornerProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = DEV_MODE ? DEV_USER.id : user?.id;

  const [winContent, setWinContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  const stoic = getContentById('stoic-reflection');

  // Check if a reflection_corner / post_event_reflection win already exists for today.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!userId) { setHydrating(false); return; }
      try {
        const today = new Date().toLocaleDateString('en-CA');
        const { data } = await supabase
          .from('tiny_wins')
          .select('id')
          .eq('user_id', userId)
          .eq('win_date', today)
          .in('source', ['reflection_corner', 'post_event_reflection'])
          .limit(1)
          .maybeSingle();
        if (!cancelled && data) setAlreadySaved(true);
      } catch { /* silent */ }
      finally { if (!cancelled) setHydrating(false); }
    };
    check();
    return () => { cancelled = true; };
  }, [userId]);

  const promptCopy = postEventTitle
    ? `What did you take from "${postEventTitle}"?`
    : 'Capture one thing — however small — you did right today.';

  const canSave = winContent.trim().length >= 10 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const source = postEventTitle ? 'post_event_reflection' : 'reflection_corner';
      // Edge function uses authenticateRequest → needs Auth0 bearer in prod,
      // x-dev-user-id in DEV. supabase-js does NOT inject Auth0 tokens for us.
      const { error } = await supabase.functions.invoke('store-tiny-win', {
        headers: await getEdgeFunctionHeaders(),
        body: {
          winContent: winContent.trim(),
          source,
          ...(postEventTitle ? { eventTitle: postEventTitle } : {}),
        },
      });
      if (error) throw error;
      setAlreadySaved(true);
      toast({ title: 'Win captured', description: 'Saved to your Insights.' });
      onSaved?.();
    } catch (err) {
      console.error('[ReflectionCorner] save failed', err);
      toast({ title: 'Could not save', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openStoic = () => {
    // Mirror the per-priority queue contract used by Plan: write the
    // practiceQueue + ritualMode flags so the MicroPracticePlayer treats this
    // as a tracked ritual practice. On completion, the player calls
    // updateRitualCompletion('micro_exercise', 'stoic-reflection', queue),
    // which adds 'stoic-reflection' to completed_practice_ids — the Plan's
    // integrate slot then marks itself complete and triggers feedback.
    try {
      localStorage.removeItem('jitInterventionData');
      localStorage.setItem(
        'practiceQueue',
        JSON.stringify([
          {
            id: 'stoic-reflection',
            title: stoic?.title || 'Stoic Reflection',
            contentType: 'micro-exercise',
            category: 'pause',
            duration: stoic?.duration ?? 5,
          },
        ]),
      );
      localStorage.setItem('queueIndex', '0');
      localStorage.setItem('ritualMode', 'true');
    } catch { /* localStorage may be unavailable */ }

    navigate('/micro-practice/stoic-reflection/cards', {
      state: { entryRoute: '/plan', fromRitual: true, category: 'pause' },
    });
  };

  if (hydrating) {
    return (
      <div className="rounded-xl bg-white/65 backdrop-blur-[20px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.04)] p-4">
        <div className="h-3 w-32 bg-muted/30 rounded animate-pulse mb-3" />
        <div className="h-16 bg-muted/20 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white/65 backdrop-blur-[20px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.04)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium tracking-[0.18em] uppercase text-primary/70 font-body">
            Reflection Corner
          </span>
          {alreadySaved && (
            <span className="flex items-center gap-1 text-[11px] text-taupe font-medium">
              <Check size={12} className="stroke-[3]" />
              Captured
            </span>
          )}
        </div>

        {alreadySaved ? (
          <button
            onClick={() => navigate('/insights')}
            className="w-full flex items-center justify-between text-left text-sm text-foreground/80 hover:text-foreground transition-colors"
          >
            <span className="font-body">✓ Win captured — see it in Insights</span>
            <ArrowRight size={14} className="text-muted-foreground/60" />
          </button>
        ) : (
          <>
            <p className="text-sm text-foreground/80 font-body leading-snug">
              {promptCopy}
            </p>
            <div className="isolate [transform:translateZ(0)]">
              <Textarea
                value={winContent}
                onChange={(e) => setWinContent(e.target.value)}
                placeholder="A small moment, a clean decision, a held boundary…"
                className={cn(
                  "min-h-[80px] resize-none text-sm bg-background border-black/[0.08]",
                  "focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
                )}
                maxLength={500}
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck
                enterKeyHint="done"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground/60 font-body">
                {winContent.trim().length < 10
                  ? `${10 - winContent.trim().length} more characters`
                  : `${winContent.trim().length} characters`}
              </span>
              <Button
                onClick={handleSave}
                disabled={!canSave}
                className="h-9 px-4 text-[13px] font-medium bg-taupe text-white hover:bg-taupe/90 rounded-lg disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save win'}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Stoic companion */}
      {stoic && (
        <button
          onClick={openStoic}
          className="w-full flex items-center gap-3 rounded-xl bg-white/50 backdrop-blur-[20px] border border-black/[0.06] hover:bg-white/70 hover:border-primary/20 transition-all p-3 text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/8 flex items-center justify-center flex-shrink-0">
            <Clock size={16} className="text-primary/70" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-body">
              Optional companion
            </div>
            <div className="text-sm font-medium text-foreground font-body truncate">
              {stoic.title}
            </div>
            <div className="text-[11px] text-muted-foreground/70 font-body">
              {stoic.duration} min · {stoic.steps} steps
            </div>
          </div>
          <span className="flex items-center gap-1 px-3 h-8 rounded-lg bg-taupe text-white text-[12px] font-medium font-body group-hover:bg-taupe/90 transition-colors flex-shrink-0">
            Start
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </span>
        </button>
      )}
    </div>
  );
};

export default ReflectionCorner;
