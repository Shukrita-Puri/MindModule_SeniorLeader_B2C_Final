import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, X, Shield, Zap, ArrowLeft } from "lucide-react";
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
    USD: { monthly: '$29', annual: '$19', annualBilled: '$228', savings: '35%', symbol: '$', perSession: '$1' },
    GBP: { monthly: '£29', annual: '£19', annualBilled: '£228', savings: '35%', symbol: '£', perSession: '£1' },
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
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      throw new Error('No checkout URL returned');
    } catch (err: any) {
      console.error('[Payment] Error:', err?.message || err);
      recordStep('payment', { selected_plan: selectedPlan });
      navigate('/onboarding/context-connection');
    } finally {
      setLoading(false);
    }
  };

  const allFeatures = [
    { label: 'Daily energy check-ins', monthly: true, annual: true },
    { label: 'Self-regulation practices', monthly: true, annual: true },
    { label: 'Inner Readiness Score', monthly: true, annual: true },
    { label: '10 AI coaching sessions', monthly: true, annual: false },
    { label: 'Unlimited AI coaching', monthly: false, annual: true },
    { label: 'Full insights dashboard', monthly: true, annual: true },
    { label: 'Calendar & wearable sync', monthly: true, annual: true },
    { label: 'Micro-intervention nudges', monthly: true, annual: true },
    { label: 'Priority support', monthly: false, annual: true },
  ];

  const currentFeatures = allFeatures.map(f => ({
    label: f.label,
    included: selectedPlan === 'annual' ? f.annual : f.monthly,
  }));

  return (
    <div className="max-w-md mx-auto py-6 px-4 animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="bg-muted rounded-full p-1 flex">
          <button
            onClick={() => setSelectedPlan('annual')}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedPlan === 'annual'
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Annual
          </button>
          <button
            onClick={() => setSelectedPlan('monthly')}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedPlan === 'monthly'
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
        </div>
        <div className="w-8" />
      </div>

      {/* Title */}
      <h1 className="text-3xl font-headline font-bold mb-6">Pricing</h1>

      {/* Plan Card */}
      <div className={`rounded-2xl p-6 mb-5 transition-all ${
        selectedPlan === 'annual'
          ? 'bg-foreground text-background border-2 border-saffron'
          : 'bg-card border border-border'
      }`}>
        {/* Plan name + badge */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-headline font-bold">
            {selectedPlan === 'annual' ? 'Mind Module Pro' : 'Mind Module'}
          </h2>
          {selectedPlan === 'annual' && (
            <span className="bg-saffron text-black text-xs font-bold px-3 py-1 rounded-full">
              Save {p.savings}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2 mb-1">
          {selectedPlan === 'annual' && (
            <span className="text-2xl line-through opacity-40 font-bold">{p.monthly}</span>
          )}
          <span className="text-5xl font-bold">
            {selectedPlan === 'annual' ? p.annual : p.monthly}
          </span>
          <span className={`text-sm ${selectedPlan === 'annual' ? 'opacity-60' : 'text-muted-foreground'}`}>
            / month ({currency})
          </span>
        </div>
        {selectedPlan === 'annual' && (
          <p className={`text-sm mb-4 ${selectedPlan === 'annual' ? 'opacity-60' : 'text-muted-foreground'}`}>
            {p.annualBilled} billed yearly
          </p>
        )}
        {selectedPlan === 'monthly' && <div className="mb-4" />}

        {/* Separator */}
        <div className={`border-t mb-4 ${selectedPlan === 'annual' ? 'border-background/20 border-dashed' : 'border-border border-dashed'}`} />

        {/* Features */}
        <ul className="space-y-3">
          {currentFeatures.map((f, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              {f.included ? (
                <div className="w-5 h-5 rounded-full bg-saffron/20 flex items-center justify-center flex-shrink-0">
                  <Check size={12} className="text-saffron" />
                </div>
              ) : (
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  selectedPlan === 'annual' ? 'bg-background/10' : 'bg-muted'
                }`}>
                  <X size={12} className="opacity-40" />
                </div>
              )}
              <span className={!f.included ? 'opacity-40' : ''}>{f.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 7-day trial note */}
      <p className="text-xs text-center text-muted-foreground mb-4">
        Includes 7-day free trial · Cancel anytime before for no charge
      </p>

      {/* CTA */}
      <Button
        className="w-full h-12 text-base font-semibold mb-6"
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

      {/* ROI */}
      <p className="text-lg font-subheadline italic text-saffron leading-relaxed text-center mb-6">
        Daily check-ins + unlimited coaching + micro insights = 30+ touchpoints/month. That's less than {p.perSession} per session vs {currency === 'GBP' ? '£500' : '$600'} for executive coaching.
      </p>

      {/* Trust */}
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
