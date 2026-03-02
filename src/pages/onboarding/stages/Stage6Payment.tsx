import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Shield, Zap, TrendingUp } from "lucide-react";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { getAuthHeaders } from "@/services/authTokenService";

export default function Stage6Payment() {
  const navigate = useNavigate();
  const { recordStep } = useOnboardingProgress();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'GBP'>('USD');

  useEffect(() => {
    detectCurrency();
  }, []);

  const detectCurrency = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      if (data.country_code === 'GB') setCurrency('GBP');
    } catch {
      // Default USD
    }
  };

  const prices = {
    USD: { monthly: '$29', annual: '$289', perMonth: '$24', savings: '$59' },
    GBP: { monthly: '£29', annual: '£289', perMonth: '£24', savings: '£59' },
  };

  const p = prices[currency];

  const handleStartTrial = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: selectedPlan, currency }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Redirect to Stripe Checkout URL
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      throw new Error('No checkout URL returned');
    } catch (err: any) {
      console.error('[Payment] Error:', err?.message || err);
      // Fallback: record step and proceed without payment
      recordStep('payment', { selected_plan: selectedPlan });
      navigate('/onboarding/context-connection');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    'Unlimited check-ins & practices',
    '10 AI coach conversations',
    'Full insights dashboard',
    'Calendar & wearable sync',
  ];

  return (
    <div className="max-w-md mx-auto space-y-6 py-6 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-headline font-bold">Start Your Journey</h2>
        <p className="text-sm text-muted-foreground">Choose your plan · Cancel anytime</p>
      </div>

      {/* Free Trial Banner */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles size={20} className="text-primary" />
          </div>
          <div>
            <p className="font-bold text-sm">7-Day Free Trial</p>
            <p className="text-xs text-muted-foreground">Full access, no charge</p>
          </div>
        </div>

        <ul className="space-y-2">
          {features.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <Check size={14} className="text-primary flex-shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground text-center">
          Credit card required · Cancel before day 7 for no charge
        </p>
      </div>

      {/* Plan Toggle */}
      <div className="bg-muted rounded-xl p-1 flex">
        <button
          onClick={() => setSelectedPlan('monthly')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            selectedPlan === 'monthly'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setSelectedPlan('annual')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all relative ${
            selectedPlan === 'annual'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Annual
          <span className="absolute -top-2 -right-1 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            Save 17%
          </span>
        </button>
      </div>

      {/* Price Display */}
      <div className="text-center space-y-1 py-2">
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-4xl font-bold">
            {selectedPlan === 'monthly' ? p.monthly : p.annual}
          </span>
          <span className="text-muted-foreground text-sm">
            /{selectedPlan === 'monthly' ? 'month' : 'year'}
          </span>
        </div>
        {selectedPlan === 'annual' && (
          <p className="text-xs text-primary font-semibold">
            {p.perMonth}/month · Save {p.savings}/year
          </p>
        )}
      </div>

      {/* CTA */}
      <Button
        className="w-full h-12 text-base font-semibold"
        variant="critical"
        onClick={handleStartTrial}
        disabled={loading}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Processing...
          </span>
        ) : (
          'Start 7-Day Free Trial'
        )}
      </Button>

      {/* ROI Section */}
      <div className="rounded-xl bg-muted/50 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <TrendingUp size={18} className="text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">9.3x ROI</p>
            <p className="text-xs text-muted-foreground">
              Save 30 min/month in decision-making = {currency === 'GBP' ? '£125' : '$125'} value
              for {p.monthly}.
            </p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5 pl-[30px]">
          <p>Executive coach: {currency === 'GBP' ? '£200–500' : '$250–600'}/session</p>
          <p>Therapist: {currency === 'GBP' ? '£80–150' : '$100–180'}/session</p>
          <p className="font-medium text-foreground">
            MIND MODULE: {p.monthly}/mo, unlimited access
          </p>
        </div>
      </div>

      {/* Trust Badges */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Shield size={14} /> Secure
        </span>
        <span className="flex items-center gap-1">
          <Zap size={14} /> Cancel anytime
        </span>
      </div>
    </div>
  );
}
