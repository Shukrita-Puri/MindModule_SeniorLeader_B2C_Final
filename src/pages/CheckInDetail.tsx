/**
 * CheckInDetail - Clarity & Confidence Check-In
 * Mandatory step in the check-in flow for C-Suite leaders.
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import FloatingNavigation from '@/components/navigation/FloatingNavigation';
import { getAuthToken as getAccessToken } from '@/services/authTokenService';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getCurrentTimeWindow } from '@/utils/dailyCheckins';

const CheckInDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [clarity, setClarity] = useState(3);
  const [confidence, setConfidence] = useState(3);
  const [clarityTouched, setClarityTouched] = useState(false);
  const [confidenceTouched, setConfidenceTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const bothTouched = clarityTouched && confidenceTouched;

  const checkinDate = (location.state as any)?.checkinDate || new Date().toISOString().split('T')[0];
  const timeWindow = (location.state as any)?.timeWindow;

  const clarityLabels = ['Foggy', 'Hazy', 'Neutral', 'Clear', 'Sharp'];
  const confidenceLabels = ['Uncertain', 'Hesitant', 'Neutral', 'Steady', 'Certain'];

  const handleSave = async () => {
    setSaving(true);
    try {
      if (DEV_MODE) {
        const { getCurrentTimeWindow } = await import('@/utils/dailyCheckins');
        await supabase
          .from('daily_checkins')
          .update({ clarity_level: clarity, confidence_level: confidence })
          .eq('user_id', DEV_USER.id)
          .eq('checkin_date', checkinDate)
          .eq('time_window', timeWindow || getCurrentTimeWindow());
      } else {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          console.error('[CheckInDetail] No access token available');
          toast({ title: 'Authentication error', description: 'Please log in again.', variant: 'destructive' });
          setSaving(false);
          return;
        }

        const { error } = await supabase.functions.invoke('daily-checkins', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: 'UPDATE_CLARITY_CONFIDENCE',
            checkinDate,
            clarity,
            confidence,
            timeWindow,
          },
        });

        if (error) {
          console.error('[CheckInDetail] Edge function error:', error);
          throw error;
        }
      }

      // Invalidate all relevant caches so dashboard reflects new state immediately
      queryClient.invalidateQueries({ queryKey: ['energy-state'] });
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
      
      // Clear ALL mastery plan session caches to force fresh plan generation
      // Wipe every period variant to prevent any stale cache from surviving
      const todayDate = new Date().toISOString().split('T')[0];
      for (const p of ['morning', 'afternoon', 'evening']) {
        sessionStorage.removeItem(`plan-loaded-${todayDate}-${p}`);
        sessionStorage.removeItem(`plan-data-${todayDate}-${p}`);
        sessionStorage.removeItem(`plan-energy-hash-${todayDate}-${p}`);
      }

      navigate('/executive-home');
    } catch (e) {
      console.error('[CheckInDetail] Save error:', e);
      toast({ title: 'Save failed', description: 'Unable to save clarity & confidence. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <FloatingNavigation backPath="/daily-check-in" />
      
      <div className="relative h-auto py-8 overflow-hidden">
        <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-2">
          <h1 className="text-3xl font-headline text-foreground tracking-tight">
            Performance Readiness Assessment
          </h1>
          <p className="text-base font-semibold uppercase tracking-widest text-foreground/70 font-body">Clarity & Confidence State</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Rate your mental clarity and decision confidence. This shapes your readiness profile and how your day is calibrated.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 pb-32">
        <div className="w-full max-w-md animate-fade-in">
          {/* Luxury glass card wrapper */}
          <div className="relative overflow-hidden rounded-2xl p-6 space-y-10
            bg-white/65 backdrop-blur-[30px] backdrop-saturate-150
            border border-black/[0.08]
            shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]">

            {/* Clarity Slider */}
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-foreground font-body">Clarity</span>
                <span className="text-base font-semibold text-primary font-body">{clarityLabels[clarity - 1]}</span>
              </div>
              <Slider
                value={[clarity]}
                onValueChange={(v) => { setClarity(v[0]); setClarityTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="luxury"
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/60">
                <span>Foggy</span>
                <span>Sharp</span>
              </div>
            </div>

            {/* Confidence Slider */}
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-foreground font-body">Confidence</span>
                <span className="text-base font-semibold text-primary font-body">{confidenceLabels[confidence - 1]}</span>
              </div>
              <Slider
                value={[confidence]}
                onValueChange={(v) => { setConfidence(v[0]); setConfidenceTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="luxury"
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/60">
                <span>Uncertain</span>
                <span>Certain</span>
              </div>
            </div>

            {/* Save button */}
            <div className="pt-2">
              <Button
                onClick={handleSave}
                disabled={saving || !bothTouched}
                className={`w-full h-12 text-sm font-semibold rounded-xl transition-colors ${
                  bothTouched
                    ? 'bg-[hsl(var(--saffron))] text-white hover:brightness-110'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                {saving ? 'Saving...' : 'Continue to my Performance Dashboard'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckInDetail;
