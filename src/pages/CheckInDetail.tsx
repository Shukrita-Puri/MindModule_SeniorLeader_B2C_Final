/**
 * CheckInDetail - Optional clarity/confidence sliders after daily check-in
 * User can skip straight to Executive Home or add detail.
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
        // DEV_MODE: Direct DB update
        await supabase
          .from('daily_checkins')
          .update({ clarity_level: clarity, confidence_level: confidence })
          .eq('user_id', DEV_USER.id)
          .eq('checkin_date', checkinDate);
      } else {
        // Production: Route through edge function with Auth0 token
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

  const handleSkip = () => {
    navigate('/executive-home');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <FloatingNavigation />
      
      <div className="relative h-auto py-8 overflow-hidden">
        <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-2">
          <h1 className="text-3xl font-headline text-foreground tracking-tight">
            Want to add more detail?
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Optional — helps personalize your insights over time.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 pb-32">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Clarity Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground font-body">Clarity</span>
              <span className="text-sm font-semibold text-primary font-body">{clarityLabels[clarity - 1]}</span>
            </div>
            <Slider
              value={[clarity]}
              onValueChange={(v) => setClarity(v[0])}
              min={1}
              max={5}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/60">
              <span>Foggy</span>
              <span>Sharp</span>
            </div>
          </div>

          {/* Confidence Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground font-body">Confidence</span>
              <span className="text-sm font-semibold text-primary font-body">{confidenceLabels[confidence - 1]}</span>
            </div>
            <Slider
              value={[confidence]}
              onValueChange={(v) => setConfidence(v[0])}
              min={1}
              max={5}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/60">
              <span>Uncertain</span>
              <span>Certain</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-12 text-base font-semibold bg-saffron text-charcoal hover:bg-saffron/90 rounded-xl"
            >
              {saving ? 'Saving...' : 'Save & Continue'}
            </Button>
            <Button
              onClick={handleSkip}
              variant="ghost"
              className="w-full h-10 text-sm text-muted-foreground"
            >
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckInDetail;
