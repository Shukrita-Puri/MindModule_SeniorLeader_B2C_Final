import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { getAuthHeaders } from "@/services/authTokenService";
import { openUrl } from "@/utils/openUrl";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { hasValidAccess } from "@/utils/subscriptionHelpers";

export default function Stage6Payment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { recordStep } = useOnboardingProgress();
  const { user } = useAuth();
  const currentTier = user?.subscription_tier || 'none';
  const hasValidUserAccess = hasValidAccess(user);
  const hasCompletedOnboarding = !!user?.onboarding_completed_at;

  // Beta bypass: only auto-skip during initial onboarding, not when revisiting to upgrade
  const isBetaValid = !!(user?.beta_user && user?.beta_expires_at && new Date(user.beta_expires_at) > new Date());
  const isExpiredBeta = !!(user?.beta_user && user?.beta_expires_at && new Date(user.beta_expires_at) <= new Date());
  const isExpiredTrial = !!(user?.trial_ends_at && new Date(user.trial_ends_at) <= new Date() && user?.subscription_status !== 'active');
  const querySource = new URLSearchParams(location.search).get('source');
  const stateSource = location.state && typeof location.state === 'object' && 'source' in location.state
    ? location.state.source
    : null;
  const hasExplicitUpgradeSource = [querySource, stateSource].some((source) =>
    typeof source === 'string' && (source.includes('upgrade') || source.length > 0)
  );
  const isMonthlySubscriber = currentTier === 'monthly_pro' && hasValidUserAccess;
  const isAnnualSubscriber = currentTier === 'annual_pro' && hasValidUserAccess;
  const isUpgradeVisit = hasExplicitUpgradeSource || hasCompletedOnboarding;
  const showUpgradeMode = hasExplicitUpgradeSource || (isUpgradeVisit && (isMonthlySubscriber || isExpiredBeta || isExpiredTrial || !hasValidUserAccess));

  useEffect(() => {
    if (isBetaValid && !isUpgradeVisit) {
      console.log('[Stage6Payment] Beta user in initial onboarding, skipping payment');
      recordStep('payment', { skipped: true, reason: 'beta_user' });
      navigate('/onboarding/app-intro', { replace: true });
    }
  }, [isBetaValid, isUpgradeVisit, navigate, recordStep]);

  useEffect(() => {
    if (!user) return;
    // Only auto-redirect if user has no explicit reason to be on this page
    if (isAnnualSubscriber && !hasExplicitUpgradeSource) {
      navigate('/daily-check-in', { replace: true });
    } else if (hasValidUserAccess && !showUpgradeMode && !hasExplicitUpgradeSource) {
      navigate('/daily-check-in', { replace: true });
    }
  }, [user, isAnnualSubscriber, hasValidUserAccess, showUpgradeMode, hasExplicitUpgradeSource, navigate]);

  // Determine which plans are available (hide the one user is already on)
  const availablePlans = useMemo(() => {
    if (isMonthlySubscriber) return ['annual'] as ('monthly' | 'annual')[];
    if (isAnnualSubscriber) return [] as ('monthly' | 'annual')[];

    const plans: ('monthly' | 'annual')[] = ['monthly', 'annual'];
    return plans;
  }, [isMonthlySubscriber, isAnnualSubscriber]);

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'GBP'>('USD');

  // Auto-select the first available plan
  useEffect(() => {
    if (availablePlans.length > 0 && !availablePlans.includes(selectedPlan)) {
      setSelectedPlan(availablePlans[0]);
    }
  }, [availablePlans, selectedPlan]);

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
    USD: { monthly: '$29', annual: '$24', annualTotal: '$289', crossed: '$29', savings: '17%', perSession: '$1', coachRange: '$300–$500' },
    GBP: { monthly: '£29', annual: '£24', annualTotal: '£289', crossed: '£29', savings: '17%', perSession: '£1', coachRange: '£300–£500' },
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
          body: JSON.stringify({
            plan: selectedPlan,
            currency,
            referralCode: localStorage.getItem('referral_code') || undefined,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.alreadySubscribed && data.portalUrl) {
        toast.info('Redirecting to manage your subscription.');
        await openUrl(data.portalUrl);
        return;
      }
      if (data.checkoutUrl) {
        // Clear referral code from localStorage after successful handoff to Stripe
        localStorage.removeItem('referral_code');
        await openUrl(data.checkoutUrl);
        return;
      }
      throw new Error('No checkout URL returned');
    } catch (err: any) {
      console.error('[Payment] Error:', err?.message || err);
      toast.error('Unable to start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const monthlyFeatures = [
    { label: 'Daily Check-Ins (unlimited)', included: true },
    { label: 'Reset Studio (all practices)', included: true },
    { label: 'Daily Mastery Plan', included: true },
    { label: 'Outer Readiness Brief', included: true },
    { label: 'JIT Pre-Event Prep', included: true },
    { label: 'Tiny Wins capture', included: true },
    { label: 'Calendar & Wearable integration', included: true },
    { label: 'Insights Page (all 4 cards)', included: true },
    { label: 'Unlimited AI Coach conversations', included: true },
    { label: 'Full AI Insights (all 4 cards with AI observations)', included: true },
    { label: 'Weekly Pattern Summary Email', included: true },
    { label: 'Data Export (CSV)', included: true },
    { label: 'Unlimited History', included: true },
    { label: 'Priority Support', included: false },
    { label: 'Quarterly Deep-Dive Report (PDF)', included: false },
    { label: 'Early Access to New Features', included: false },
  ];

  const annualFeatures = [
    { label: 'Everything in Monthly Pro', included: true },
    { label: 'Unlimited AI Coach conversations', included: true },
    { label: 'Full AI Insights (all 4 cards with AI observations)', included: true },
    { label: 'Weekly Pattern Summary Email', included: true },
    { label: 'Data Export (CSV)', included: true },
    { label: 'Unlimited History', included: true },
    { label: 'Priority Support', included: true },
    { label: 'Quarterly Deep-Dive Report (PDF)', included: true },
    { label: 'Early Access to New Features', included: true },
  ];

  const features = selectedPlan === 'annual' ? annualFeatures : monthlyFeatures;

  // If user is already on the best plan
  if (availablePlans.length === 0) {
    return (
      <div className="max-w-md mx-auto py-6 px-4 animate-fade-in text-center">
        <div className="py-12">
          <p className="text-[15px] font-medium mb-2">You're on the best plan!</p>
          <p className="text-sm text-muted-foreground mb-6">You already have the highest tier subscription.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pt-2 pb-6 px-4 animate-fade-in">
      {/* Toggle + Title row */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-[20px] font-headline font-bold">
          {showUpgradeMode ? 'Upgrade Plan' : 'Pricing'}
        </h1>
        {availablePlans.length > 1 ? (
          <div className="bg-muted rounded-full p-0.5 flex">
            {availablePlans.includes('annual') && (
              <button
                onClick={() => setSelectedPlan('annual')}
                className={`px-4 py-1 rounded-full text-xs font-medium transition-all ${
                  selectedPlan === 'annual'
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Annual
              </button>
            )}
            {availablePlans.includes('monthly') && (
              <button
                onClick={() => setSelectedPlan('monthly')}
                className={`px-4 py-1 rounded-full text-xs font-medium transition-all ${
                  selectedPlan === 'monthly'
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly
              </button>
            )}
          </div>
        ) : (
          <div />
        )}
      </div>

      {/* Plan Card */}
      <div className={`rounded-2xl p-5 mb-4 transition-all ${
        selectedPlan === 'annual'
          ? 'bg-foreground text-background border-2 border-saffron'
          : 'bg-card border border-border'
      }`}>
        {/* Plan name + badge */}
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-headline font-bold ${selectedPlan === 'annual' ? 'text-saffron' : ''}`}>
            {selectedPlan === 'annual' ? 'Annual Pro' : 'Monthly Pro'}
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
            <span className="text-2xl line-through opacity-40 font-bold">{p.crossed}</span>
          )}
          <span className="text-5xl font-bold">
            {selectedPlan === 'annual' ? p.annual : p.monthly}
          </span>
          <span className={`text-sm ${selectedPlan === 'annual' ? 'opacity-60' : 'text-muted-foreground'}`}>
            / month ({currency})
          </span>
        </div>
        {selectedPlan === 'annual' && (
          <p className="text-sm mb-4 opacity-60">
            {p.annualTotal} billed annually
          </p>
        )}
        {selectedPlan === 'monthly' && <div className="mb-4" />}

        {/* Separator */}
        <div className={`border-t mb-4 ${selectedPlan === 'annual' ? 'border-background/20 border-dashed' : 'border-border border-dashed'}`} />

        {/* Features */}
        <ul className="space-y-2">
          {features.map((f, i) => (
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

      {/* Trial / upgrade note */}
      <p className="text-xs text-center text-muted-foreground mb-3">
        {showUpgradeMode
          ? 'Upgrade to unlock full access instantly'
          : 'Includes 7-day free trial · Cancel anytime before for no charge'}
      </p>

      {/* CTA */}
      <Button
        className="w-full h-11 text-[14px] font-medium mb-4"
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
          showUpgradeMode ? 'Upgrade Now' : 'Start 7-Day Free Trial'
        )}
      </Button>

      {/* ROI */}
      <p className="font-body italic leading-relaxed text-center mb-4 text-sm text-foreground/70">
        30+ touchpoints/month – <span className="text-[15px] font-bold not-italic text-saffron">under {p.perSession} each</span> vs {currency === 'GBP' ? '£400' : '$400'}/per session of executive coaching.
      </p>

      {/* Legal links */}
      <div className="flex items-center justify-center gap-3 mt-2">
        <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Privacy Policy
        </a>
        <span className="text-muted-foreground/40 text-xs">·</span>
        <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Terms of Use
        </a>
        <span className="text-muted-foreground/40 text-xs">·</span>
        <a href="/powered-by-ai" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Powered by AI
        </a>
      </div>
    </div>
  );
}
