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

// Helper to get Auth0 access token
async function getAccessToken(): Promise<string | null> {
  try {
    const auth0Client = (window as any).__auth0Client;
    if (auth0Client) {
      return await auth0Client.getAccessTokenSilently();
    }
    return null;
  } catch {
    return null;
  }
}

const CheckInDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [clarity, setClarity] = useState(3);
  const [confidence, setConfidence] = useState(3);
  const [saving, setSaving] = useState(false);

  const checkinDate = (location.state as any)?.checkinDate || new Date().toISOString().split('T')[0];

  const clarityLabels = ['Foggy', 'Hazy', 'Neutral', 'Clear', 'Sharp'];
  const confidenceLabels = ['Uncertain', 'Hesitant', 'Neutral', 'Steady', 'Certain'];

  const handleSave = async () => {
    setSaving(true);
    try {
      if (DEV_MODE) {
        await supabase
          .from('daily_checkins')
          .update({ clarity_level: clarity, confidence_level: confidence })
          .eq('user_id', DEV_USER.id)
          .eq('checkin_date', checkinDate);
      } else {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          console.error('[CheckInDetail] No access token available');
          navigate('/executive-home');
          return;
        }

        const { error } = await supabase.functions.invoke('daily-checkins', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: 'UPDATE_CLARITY_CONFIDENCE',
            checkinDate,
            clarity,
            confidence,
          },
        });

        if (error) {
          console.error('[CheckInDetail] Edge function error:', error);
        }
      }
    } catch (e) {
      console.error('[CheckInDetail] Save error:', e);
    }
    navigate('/executive-home');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <FloatingNavigation backPath="/daily-check-in" />
      
      <div className="relative h-auto py-8 overflow-hidden">
        <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-2">
          <h1 className="text-3xl font-headline text-foreground tracking-tight">
            Clarity & Confidence Check-In
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Rate your mental clarity and decision confidence. This shapes your readiness profile and how your day is calibrated.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 pb-32">
        <div className="w-full max-w-md animate-fade-in">
          {/* Luxury glass card wrapper */}
          <div className="relative overflow-hidden rounded-2xl p-6 space-y-10
            bg-gradient-to-br from-card via-card to-card/95
            border border-white/10 dark:border-white/5
            shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]
            backdrop-blur-sm">
            {/* Top glass highlight */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            {/* Inner glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,140,66,0.03)_0%,transparent_50%)] pointer-events-none" />

            {/* Clarity Slider */}
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-foreground font-body">Clarity</span>
                <span className="text-base font-semibold text-primary font-body">{clarityLabels[clarity - 1]}</span>
              </div>
              <Slider
                value={[clarity]}
                onValueChange={(v) => setClarity(v[0])}
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
                onValueChange={(v) => setConfidence(v[0])}
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
                disabled={saving}
                className="w-full h-12 text-sm font-semibold bg-[#1DB954] text-black hover:bg-[#1DB954]/90 rounded-xl"
              >
                {saving ? 'Saving...' : 'Continue to My Mastery Homepage'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckInDetail;
