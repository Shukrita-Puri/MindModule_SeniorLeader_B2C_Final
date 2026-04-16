/**
 * CheckInDetail - Clarity & Confidence Check-In
 * Mandatory step in the check-in flow for C-Suite leaders.
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import LeftSidebar from '@/components/navigation/LeftSidebar';
import SidebarDiscoveryPulse from '@/components/navigation/SidebarDiscoveryPulse';
import FloatingPillNav from '@/components/navigation/FloatingPillNav';
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
  const [mentalSharpness, setMentalSharpness] = useState(3);
  const [clarityTouched, setClarityTouched] = useState(false);
  const [confidenceTouched, setConfidenceTouched] = useState(false);
  const [mentalSharpnessTouched, setMentalSharpnessTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const allThreeTouched = clarityTouched && confidenceTouched && mentalSharpnessTouched;

  const checkinDate = (location.state as any)?.checkinDate || new Date().toISOString().split('T')[0];
  const timeWindow = (location.state as any)?.timeWindow;

  const sharpnessLabels = ['Depleted', 'Dull', 'Stable', 'Acute', 'Peak'];
  const clarityLabels = ['Clouded', 'Obscured', 'Neutral', 'Lucid', 'Crystal'];
  const confidenceLabels = ['Reactive', 'Uncertain', 'Poised', 'Certain', 'Unshakable'];

  const handleSave = async () => {
    setSaving(true);
    try {
      if (DEV_MODE) {
        const { getCurrentTimeWindow } = await import('@/utils/dailyCheckins');
        await supabase
          .from('daily_checkins')
          .update({
            clarity_level: clarity,
            confidence_level: confidence,
            mental_sharpness_level: mentalSharpness,
          })
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
            mentalSharpness,
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
    <SidebarProvider defaultOpen={false}>
    <div className="h-screen flex w-full bg-background overflow-hidden">
      <LeftSidebar />
      <SidebarInset className="w-full overflow-x-hidden overflow-y-auto">
    <div className="min-h-screen flex flex-col bg-background pt-24 pb-[248px]">
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center px-3 md:px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-background/80 backdrop-blur-sm">
        <SidebarDiscoveryPulse />
      </header>
      
      <div className="relative h-auto py-7 mt-2 mb-3 overflow-hidden">
        <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-2">
          <h1 className="text-[28px] sm:text-3xl font-headline font-bold text-foreground tracking-tight leading-tight">
            Performance Readiness Assessment
          </h1>
          <p className="text-sm tracking-[0.08em] uppercase text-muted-foreground/60 font-body leading-none">Mental Performance Signals</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 pb-24 mt-8">
        <div className="w-full max-w-lg animate-fade-in">
          {/* Luxury glass card wrapper */}
          <div className="relative overflow-hidden rounded-2xl p-6 space-y-10
            bg-white/65 backdrop-blur-[30px] backdrop-saturate-150
            border border-black/[0.08]
            shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]">

            {/* Mental Sharpness Slider (Renewal) */}
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-foreground font-body">Sharpness</span>
                <span className="text-[15px] font-medium text-primary font-body">{sharpnessLabels[mentalSharpness - 1]}</span>
              </div>
              <Slider
                value={[mentalSharpness]}
                onValueChange={(v) => { setMentalSharpness(v[0]); setMentalSharpnessTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="luxury"
                className="w-full py-1"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Depleted</span>
                <span>Peak</span>
              </div>
            </div>

            {/* Mental Clarity Slider (Resolve) */}
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-foreground font-body">Clarity</span>
                <span className="text-[15px] font-medium text-primary font-body">{clarityLabels[clarity - 1]}</span>
              </div>
              <Slider
                value={[clarity]}
                onValueChange={(v) => { setClarity(v[0]); setClarityTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="luxury"
                className="w-full py-1"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Clouded</span>
                <span>Crystal</span>
              </div>
            </div>

            {/* Confidence Slider (Recalibration) */}
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-foreground font-body">Confidence</span>
                <span className="text-[15px] font-medium text-primary font-body">{confidenceLabels[confidence - 1]}</span>
              </div>
              <Slider
                value={[confidence]}
                onValueChange={(v) => { setConfidence(v[0]); setConfidenceTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="luxury"
                className="w-full py-1"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Reactive</span>
                <span>Unshakable</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom CTA – sits above pill nav, behind sidebar overlay */}
      <div className="fixed left-0 right-0 z-30 px-4 pt-3 bg-gradient-to-t from-background via-background to-background/0"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 88px)' }}
      >
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSave}
            disabled={saving || !allThreeTouched}
            className={`w-full h-12 rounded-xl font-body text-[15px] font-medium transition-all duration-200 ${
              allThreeTouched
                ? 'bg-saffron text-saffron-foreground hover:brightness-110 active:scale-[0.98]'
                : 'bg-muted text-foreground/60 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving...' : "Continue to Today's Performance"}
          </button>
        </div>
      </div>
    </div>
    <FloatingPillNav />
    </SidebarInset>
    </div>
    </SidebarProvider>
  );
};

export default CheckInDetail;
