/**
 * CheckInDetail — Body Performance State Check (Page 2 of /daily-check-in).
 * Matches Page 1 (Mental Performance) styling: same glass card, luxury
 * sliders, InsightInfoModal tooltips, saffron CTA.
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import LeftSidebar from '@/components/navigation/LeftSidebar';
import SidebarDiscoveryPulse from '@/components/navigation/SidebarDiscoveryPulse';
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
import InsightInfoModal from '@/components/insights/InsightInfoModal';

const qualityLabels = ['Poor', 'OK', 'Good', 'Great'];
const wakeLabels = ['Groggy', 'Alarm', 'Natural'];
const tensionLabels = ['Tight', 'Strained', 'Moderate', 'Relaxed', 'Loose'];
const energyLabels = ['Depleted', 'Low', 'Decent', 'Strong', 'Peak'];
const recoveryLabels = ['None', 'Sedentary', 'Light', 'Active'];
const carryLabels = ['Fumes', 'Heavy', 'Some', 'Fresh'];

const CheckInDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Sleep
  const [sleepHours, setSleepHours] = useState(7.0);
  const [sleepQuality, setSleepQuality] = useState(3); // 1..4
  const [sleepWake, setSleepWake] = useState(2); // 1..3
  const [tension, setTension] = useState(3); // 1..5
  const [energy, setEnergy] = useState(3); // 1..5
  const [recovery, setRecovery] = useState(3); // 1..4
  const [carry, setCarry] = useState(3); // 1..4

  const [hoursTouched, setHoursTouched] = useState(false);
  const [qualityTouched, setQualityTouched] = useState(false);
  const [wakeTouched, setWakeTouched] = useState(false);
  const [tensionTouched, setTensionTouched] = useState(false);
  const [energyTouched, setEnergyTouched] = useState(false);
  const [recoveryTouched, setRecoveryTouched] = useState(false);
  const [carryTouched, setCarryTouched] = useState(false);

  const [saving, setSaving] = useState(false);

  const allTouched =
    hoursTouched && qualityTouched && wakeTouched &&
    tensionTouched && energyTouched && recoveryTouched && carryTouched;

  const rQuality = Math.round(sleepQuality);
  const rWake = Math.round(sleepWake);
  const rTension = Math.round(tension);
  const rEnergy = Math.round(energy);
  const rRecovery = Math.round(recovery);
  const rCarry = Math.round(carry);

  const checkinDate = (location.state as any)?.checkinDate || localISODate();
  const timeWindow = (location.state as any)?.timeWindow;
  const checkinId = (location.state as any)?.checkinId;

  const adjHours = (delta: number) => {
    const next = Math.max(3, Math.min(12, Math.round((sleepHours + delta) * 2) / 2));
    setSleepHours(next);
    setHoursTouched(true);
  };

  const handleSave = async () => {
    if (!allTouched || saving) return;
    setSaving(true);
    try {
      const payload = {
        sleepHours,
        sleepQuality: rQuality,
        sleepWakeType: rWake,
        tension: rTension,
        energy: rEnergy,
        recovery: rRecovery,
        carry: rCarry,
      };

      if (DEV_MODE) {
        let updateQuery = supabase
          .from('daily_checkins')
          .update({
            sleep_hours: sleepHours,
            sleep_quality: rQuality,
            sleep_wake_type: rWake,
            body_tension_level: rTension,
            body_energy_level: rEnergy,
            recovery_yesterday_level: rRecovery,
            carry_load_level: rCarry,
          })
          .eq('user_id', DEV_USER.id);

        updateQuery = checkinId
          ? updateQuery.eq('id', checkinId)
          : updateQuery
              .eq('checkin_date', checkinDate)
              .eq('time_window', timeWindow || getCurrentTimeWindow());

        const { data, error } = await updateQuery.select('id').limit(1);
        if (error) throw error;
        if (!data?.length) throw new Error('No matching check-in row found to update');
      } else {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          toast({ title: 'Authentication error', description: 'Please log in again.', variant: 'destructive' });
          setSaving(false);
          return;
        }

        const { data: fnResponse, error } = await supabase.functions.invoke('daily-checkins', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: 'UPDATE_BODY_CHECKIN',
            checkinDate,
            timeWindow,
            checkinId,
            ...payload,
          },
        });

        if (error) throw error;
        if (!fnResponse?.data) throw new Error('No matching check-in row found to update');
      }

      // Cache invalidation (mirrors prior behaviour)
      const todayDate = localISODate();
      const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;
      if (effectiveUserId) {
        for (const p of ['morning', 'afternoon', 'evening']) {
          clearPersistent(cacheKeys.brief(effectiveUserId, p, todayDate));
          clearPersistent(cacheKeys.briefAwaiting(effectiveUserId, p, todayDate));
        }
      }
      clearTodayCheckinCache();
      clearEnergyStateCache();
      clearOuterReadinessCache(effectiveUserId);

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
      toast({ title: 'Save failed', description: 'Unable to save body check-in. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
    <div className="h-[100dvh] max-h-[100dvh] min-h-0 flex w-full bg-background overflow-hidden">
      <LeftSidebar />
      <SidebarInset className="w-full h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
    <div className="bg-background pt-[env(safe-area-inset-top,0px)] pb-[calc(env(safe-area-inset-bottom,0px)+8rem)]">
      <div className="relative">
        <TodayHero />
        <TodayGreeting />
        <header className="absolute top-0 left-0 right-0 z-40 flex items-center px-3 md:px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3">
          <SidebarDiscoveryPulse />
        </header>
      </div>
      <TodayStepper current={1} />

      <h1 className="sr-only">Body Performance State Check</h1>

      <div className="flex items-start justify-center pt-1 pb-4">
        <div className="w-full max-w-lg animate-fade-in">
          <div className="relative overflow-hidden rounded-t-2xl md:rounded-2xl p-5 space-y-6
            bg-white/65 backdrop-blur-[30px] backdrop-saturate-150
            border border-black/[0.08]
            shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]">

            {/* Eyebrow row — matches Page 1 */}
            <div className="-mt-1 mb-1 flex items-center justify-between">
              <span className="text-eyebrow text-[hsl(var(--muted-foreground-v2))]">
                Performance Readiness Assessment
              </span>
              <span className="text-caption text-[hsl(var(--muted-foreground-v2))]">
                Body Performance State Check
              </span>
            </div>

            {/* Sleep group — Hours, Quality, Wake nested as sub-sections */}
            <section className="relative space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-eyebrow text-[hsl(var(--muted-foreground-v2))]">
                  Sleep
                </span>
              </div>

              <div className="pl-3 border-l border-black/10 space-y-5">
                {/* Hours (stepper) */}
                <div className="relative space-y-2">
                  <div className="flex items-center justify-between pr-1">
                    <span className="text-[13px] font-medium text-foreground/80 font-body inline-flex items-center gap-1.5">
                      Hours
                      <InsightInfoModal
                        title="Sleep Hours"
                        explanation="Sleep duration. Combines with quality and wake type to triangulate how restorative the night actually was."
                      />
                    </span>
                    <span className="text-[13px] font-medium text-primary font-body tabular-nums">
                      {sleepHours.toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-4 py-0.5">
                    <button
                      onClick={() => adjHours(-0.5)}
                      className="w-8 h-8 rounded-full border border-border bg-background/70 text-foreground text-lg leading-none hover:bg-muted transition-colors"
                      aria-label="decrease sleep hours"
                    >
                      −
                    </button>
                    <span className="text-[20px] font-medium text-foreground tabular-nums min-w-[56px] text-center">
                      {sleepHours.toFixed(1)}
                    </span>
                    <button
                      onClick={() => adjHours(0.5)}
                      className="w-8 h-8 rounded-full border border-border bg-background/70 text-foreground text-lg leading-none hover:bg-muted transition-colors"
                      aria-label="increase sleep hours"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Quality */}
                <div className="relative space-y-2 max-w-[92%]">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-foreground/80 font-body inline-flex items-center gap-1.5">
                      Quality
                      <InsightInfoModal
                        title="Sleep Quality"
                        explanation="Subjective sleep quality — how restorative the night actually felt, independent of hours."
                      />
                    </span>
                    <span className="text-[13px] font-medium text-primary font-body">{qualityLabels[rQuality - 1]}</span>
                  </div>
                  <Slider
                    value={[sleepQuality]}
                    onValueChange={(v) => { setSleepQuality(v[0]); setQualityTouched(true); }}
                    min={1}
                    max={4}
                    step={1}
                    variant="clarity"
                    className="w-full py-0.5"
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground/60">
                    <span>Poor</span>
                    <span>Great</span>
                  </div>
                </div>

                {/* Wake */}
                <div className="relative space-y-2 max-w-[92%]">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-foreground/80 font-body inline-flex items-center gap-1.5">
                      Wake
                      <InsightInfoModal
                        title="Wake Type"
                        explanation="How you woke up. Natural waking signals deeper recovery; groggy alarm signals sleep debt or poor sleep depth."
                      />
                    </span>
                    <span className="text-[13px] font-medium text-primary font-body">{wakeLabels[rWake - 1]}</span>
                  </div>
                  <Slider
                    value={[sleepWake]}
                    onValueChange={(v) => { setSleepWake(v[0]); setWakeTouched(true); }}
                    min={1}
                    max={3}
                    step={1}
                    variant="confidence"
                    className="w-full py-0.5"
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground/60">
                    <span>Groggy</span>
                    <span>Natural</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Tension */}
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground font-body inline-flex items-center gap-1.5">
                  Tension
                  <InsightInfoModal
                    title="Physical Tension"
                    explanation="Somatic stress signature — tight chest, jaw, shoulders. Often the earliest physical stress signal before it shows up cognitively."
                  />
                </span>
                <span className="text-[14px] font-medium text-primary font-body">{tensionLabels[rTension - 1]}</span>
              </div>
              <Slider
                value={[tension]}
                onValueChange={(v) => { setTension(v[0]); setTensionTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="emotion"
                className="w-full py-0.5"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Tight</span>
                <span>Loose</span>
              </div>
            </div>

            {/* Energy */}
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground font-body inline-flex items-center gap-1.5">
                  Energy
                  <InsightInfoModal
                    title="Physical Energy"
                    explanation="Body fuel available right now. A direct recovery readiness signal — separate from cognitive sharpness."
                  />
                </span>
                <span className="text-[14px] font-medium text-primary font-body">{energyLabels[rEnergy - 1]}</span>
              </div>
              <Slider
                value={[energy]}
                onValueChange={(v) => { setEnergy(v[0]); setEnergyTouched(true); }}
                min={1}
                max={5}
                step={1}
                variant="ember"
                className="w-full py-0.5"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Depleted</span>
                <span>Peak</span>
              </div>
            </div>

            {/* Recovery yesterday */}
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground font-body inline-flex items-center gap-1.5">
                  Recovery
                  <InsightInfoModal
                    title="Recovery Yesterday"
                    explanation="What you actually did yesterday. Determines whether carry-over load is resilient or compounding into the next day."
                  />
                </span>
                <span className="text-[14px] font-medium text-primary font-body">{recoveryLabels[rRecovery - 1]}</span>
              </div>
              <Slider
                value={[recovery]}
                onValueChange={(v) => { setRecovery(v[0]); setRecoveryTouched(true); }}
                min={1}
                max={4}
                step={1}
                variant="vitality"
                className="w-full py-0.5"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>None</span>
                <span>Active</span>
              </div>
            </div>

            {/* Carry */}
            <div className="relative space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium text-foreground font-body inline-flex items-center gap-1.5">
                  Carry
                  <InsightInfoModal
                    title="Carry-over Load"
                    explanation="Allostatic load — cumulative stress debt you brought into today. The primary burnout signal we track over time."
                  />
                </span>
                <span className="text-[14px] font-medium text-primary font-body">{carryLabels[rCarry - 1]}</span>
              </div>
              <Slider
                value={[carry]}
                onValueChange={(v) => { setCarry(v[0]); setCarryTouched(true); }}
                min={1}
                max={4}
                step={1}
                variant="sharpness"
                className="w-full py-0.5"
              />
              <div className="flex justify-between text-xs text-muted-foreground/60">
                <span>Fumes</span>
                <span>Fresh</span>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={handleSave}
              disabled={saving || !allTouched}
              className={`mt-2 w-full h-12 rounded-xl font-body text-[15px] font-medium transition-all duration-200 ${
                allTouched
                  ? 'bg-saffron text-saffron-foreground hover:brightness-110 active:scale-[0.98]'
                  : 'bg-muted text-foreground/60 cursor-not-allowed'
              }`}
            >
              {saving ? 'Saving...' : "Continue to Today's Brief"}
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
