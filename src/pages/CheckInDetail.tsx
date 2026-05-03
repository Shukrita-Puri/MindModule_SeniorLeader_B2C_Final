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
import TodayStepper from '@/components/today/TodayStepper';
import TodayHero from '@/components/today/TodayHero';
import TodayGreeting from '@/components/today/TodayGreeting';
import { getAuthToken as getAccessToken } from '@/services/authTokenService';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { clearTodayCheckinCache, getCurrentTimeWindow } from '@/utils/dailyCheckins';
import { clear as clearPersistent, cacheKeys, localISODate } from '@/utils/persistentBriefCache';
import { clearEnergyStateCache } from '@/utils/energyStateEngine';
import { clearOuterReadinessCache } from '@/hooks/useOuterReadiness';

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
  const roundedClarity = Math.round(clarity);
  const roundedConfidence = Math.round(confidence);
  const roundedMentalSharpness = Math.round(mentalSharpness);

  const checkinDate = (location.state as any)?.checkinDate || localISODate();
  const timeWindow = (location.state as any)?.timeWindow;
  const checkinId = (location.state as any)?.checkinId;

  const sharpnessLabels = ['Depleted', 'Dull', 'Stable', 'Acute', 'Peak'];
  const clarityLabels = ['Clouded', 'Obscured', 'Neutral', 'Lucid', 'Crystal'];
  const confidenceLabels = ['Reactive', 'Uncertain', 'Poised', 'Certain', 'Unshakable'];

  const handleSave = async () => {
    setSaving(true);
    try {
      if (DEV_MODE) {
        let updateQuery = supabase
          .from('daily_checkins')
          .update({
            clarity_level: roundedClarity,
            confidence_level: roundedConfidence,
            mental_sharpness_level: roundedMentalSharpness,
          })
          .eq('user_id', DEV_USER.id);

        updateQuery = checkinId
          ? updateQuery.eq('id', checkinId)
          : updateQuery.eq('checkin_date', checkinDate).eq('time_window', timeWindow || getCurrentTimeWindow());

        const { data, error } = await updateQuery.select('id').limit(1);

        if (error) throw error;
        if (!data?.length) throw new Error('No matching check-in row found to update');
      } else {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          console.error('[CheckInDetail] No access token available');
          toast({ title: 'Authentication error', description: 'Please log in again.', variant: 'destructive' });
          setSaving(false);
          return;
        }

        const { data: fnResponse, error } = await supabase.functions.invoke('daily-checkins', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: 'UPDATE_CLARITY_CONFIDENCE',
            checkinDate,
            clarity: roundedClarity,
            confidence: roundedConfidence,
            mentalSharpness: roundedMentalSharpness,
            timeWindow,
            checkinId,
          },
        });

        if (error) {
          console.error('[CheckInDetail] Edge function error:', error);
          throw error;
        }

        if (!fnResponse?.data) {
          throw new Error('No matching check-in row found to update');
        }
      }

      // Clear any persisted "awaiting signals" brief payload across all three
      // windows for today so the synchronous initialData hydrate cannot
      // replay a stale awaiting view on the next mount.
      const todayDate = localISODate();
      const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;
      if (effectiveUserId) {
        for (const p of ['morning', 'afternoon', 'evening']) {
          clearPersistent(cacheKeys.brief(effectiveUserId, p, todayDate));
        }
      }
      clearTodayCheckinCache();
      clearEnergyStateCache();
      clearOuterReadinessCache(effectiveUserId);
      // Also wipe today's awaiting markers across all periods so the next
      // brief fetch can promote to a real brief without replaying an
      // earlier "no signal" decision.
      if (effectiveUserId) {
        for (const p of ['morning', 'afternoon', 'evening']) {
          clearPersistent(cacheKeys.briefAwaiting(effectiveUserId, p, todayDate));
        }
      }

      // Clear ALL mastery plan session caches to force fresh plan generation
      // Wipe every period variant to prevent any stale cache from surviving
      for (const p of ['morning', 'afternoon', 'evening']) {
        sessionStorage.removeItem(`plan-loaded-${todayDate}-${p}`);
        sessionStorage.removeItem(`plan-data-${todayDate}-${p}`);
        sessionStorage.removeItem(`plan-energy-hash-${todayDate}-${p}`);
        sessionStorage.setItem(cacheKeys.planForceRefresh(todayDate, p), '1');
      }

      queryClient.invalidateQueries({ queryKey: ['energy-state'] });
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });

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
    <div className="h-[100dvh] max-h-[100dvh] min-h-0 flex w-full bg-background overflow-hidden">
      <LeftSidebar />
      <SidebarInset className="w-full h-full min-h-0 overflow-x-hidden overflow-y-hidden">
    <div className="h-full min-h-0 flex flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top,0px)] pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)]">
      <div className="relative">
        <TodayHero />
        <TodayGreeting />
        <header className="absolute top-0 left-0 right-0 z-40 flex items-center px-3 md:px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3">
          <SidebarDiscoveryPulse />
        </header>
      </div>
      <TodayStepper current={1} />

      <h1 className="sr-only">Performance Readiness Assessment</h1>

      <div className="flex-1 flex min-h-0 items-start justify-center px-4 pt-1 pb-0">
        <div className="w-full max-w-lg animate-fade-in">
          {/* Luxury glass card wrapper */}
          <div className="relative overflow-hidden rounded-2xl p-5 space-y-6
            bg-white/65 backdrop-blur-[30px] backdrop-saturate-150
            border border-black/[0.08]
            shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]">

            {/* Eyebrow row inside card (matches Brief card) */}
            <div className="-mt-1 mb-1 flex items-center justify-between">
              <span className="text-eyebrow text-[hsl(var(--muted-foreground-v2))]">
                Performance Readiness Assessment
              </span>
              <span className="text-caption text-[hsl(var(--muted-foreground-v2))]">
                Mental Performance State Check
              </span>
            </div>

            {/* Mental Sharpness Slider (Renewal) */}
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground font-body">Sharpness</span>
                <span className="text-[14px] font-medium text-primary font-body">{sharpnessLabels[roundedMentalSharpness - 1]}</span>
              </div>
              <Slider
                value={[mentalSharpness]}
                onValueChange={(v) => { setMentalSharpness(v[0]); setMentalSharpnessTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="sharpness"
                className="w-full py-0.5"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Depleted</span>
                <span>Peak</span>
              </div>
            </div>

            {/* Mental Clarity Slider (Resolve) */}
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground font-body">Clarity</span>
                <span className="text-[14px] font-medium text-primary font-body">{clarityLabels[roundedClarity - 1]}</span>
              </div>
              <Slider
                value={[clarity]}
                onValueChange={(v) => { setClarity(v[0]); setClarityTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="clarity"
                className="w-full py-0.5"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Clouded</span>
                <span>Crystal</span>
              </div>
            </div>

            {/* Confidence Slider (Recalibration) */}
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground font-body">Confidence</span>
                <span className="text-[14px] font-medium text-primary font-body">{confidenceLabels[roundedConfidence - 1]}</span>
              </div>
              <Slider
                value={[confidence]}
                onValueChange={(v) => { setConfidence(v[0]); setConfidenceTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="confidence"
                className="w-full py-0.5"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Reactive</span>
                <span>Unshakable</span>
              </div>
            </div>

            {/* Inline CTA (now lives inside the card, replacing the sticky bar) */}
            <button
              onClick={handleSave}
              disabled={saving || !allThreeTouched}
              className={`mt-2 w-full h-12 rounded-xl font-body text-[15px] font-medium transition-all duration-200 ${
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

    </div>
    </SidebarInset>
    </div>
    </SidebarProvider>
  );
};

export default CheckInDetail;
