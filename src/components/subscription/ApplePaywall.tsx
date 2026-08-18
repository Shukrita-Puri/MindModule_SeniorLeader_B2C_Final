/**
 * Apple In-App Purchase paywall — Executive Edition Specification.
 * Rendered inside the iOS/iPadOS shell (App Store Review Guideline 3.1.1 & 3.1.2).
 *
 * Rules encoded here:
 *  - Prices, currencies, billing periods, and introductory offers come from StoreKit.
 *  - Intro/trial copy renders only when Apple returns an eligible intro offer.
 *  - Restore Purchases and Manage Subscription are always visible.
 *  - Apple ID Terms of Use & Privacy Policy links included with explicit renewal disclosures.
 */
import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Loader2, Check, RotateCcw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  loadIapProductsWithDiagnostics,
  describeIapLoadDiagnostics,
  looksLikeAppStoreConnectIssue,
  purchaseIapProduct,
  restoreIapPurchases,
  openAppleManageSubscriptions,
  onIapTransactionUpdate,
  type IapProduct,
  type IapLoadDiagnostics,
} from '@/services/iap';
import { planSortOrder, planForProductId } from '@/config/iapProducts';
import { isNonApplePaidEntitlement } from '@/config/purchasePlatform';
import { hasValidAccess, type AccessUser } from '@/utils/subscriptionHelpers';
import { describeTrial, describeIntroDiscount, billingFrequencyLabel } from '@/utils/introOffer';

interface ApplePaywallProps {
  user: (AccessUser & { subscription_provider?: string | null; stripe_customer_id?: string | null }) | null;
  onEntitled: () => void;
  onRefreshProfile: () => Promise<unknown>;
}

const periodLabel = billingFrequencyLabel;

export function ApplePaywall({ user, onEntitled, onRefreshProfile }: ApplePaywallProps) {
  const [products, setProducts] = useState<IapProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [storeUnavailable, setStoreUnavailable] = useState(false);
  const [diagnostics, setDiagnostics] = useState<IapLoadDiagnostics | null>(null);

  const alreadyEntitled = hasValidAccess(user);
  const stripeLegacy = isNonApplePaidEntitlement(user) && alreadyEntitled;
  const appleEntitled = alreadyEntitled && !stripeLegacy;

  const refresh = useCallback(async () => {
    setLoadingProducts(true);
    setProductError(null);
    setStoreUnavailable(false);
    try {
      const { products: fetched, diagnostics: diag } = await loadIapProductsWithDiagnostics();
      setDiagnostics(diag);

      if (diag.outcome === 'config_invalid') {
        setProducts([]);
        setProductError(
          diag.configReason ??
            'In-app purchases are not configured for this build. Please update to the latest version.',
        );
        return;
      }
      if (diag.outcome === 'store_unavailable') {
        setProducts([]);
        setStoreUnavailable(true);
        return;
      }
      if (diag.outcome === 'fetch_error') {
        setProducts([]);
        setProductError(diag.errorMessage ?? 'Unable to reach the App Store.');
        return;
      }

      const list = [...fetched].sort(
        (a, b) => planSortOrder(a.id) - planSortOrder(b.id),
      );
      if (list.length === 0) {
        setProductError('No subscription options are available right now. Please try again later.');
      }
      setProducts(list);
    } catch (err) {
      setProducts([]);
      setProductError((err as Error)?.message ?? 'Unable to reach the App Store.');
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const onRefreshProfileRef = useRef(onRefreshProfile);
  const onEntitledRef = useRef(onEntitled);

  useEffect(() => {
    onRefreshProfileRef.current = onRefreshProfile;
    onEntitledRef.current = onEntitled;
  }, [onRefreshProfile, onEntitled]);

  useEffect(() => {
    if (stripeLegacy || appleEntitled) {
      setLoadingProducts(false);
      return;
    }
    void refresh();
  }, [refresh, stripeLegacy, appleEntitled]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    void onIapTransactionUpdate(() => {
      void onRefreshProfileRef.current().then(() => onEntitledRef.current());
    }).then((fn) => { dispose = fn; });
    return () => { dispose?.(); };
  }, []);

  const handlePurchase = async (productId: string) => {
    setBusyProductId(productId);
    try {
      const result = await purchaseIapProduct(productId);
      switch (result.status) {
        case 'purchased':
          await onRefreshProfile();
          toast.success('Welcome to Mind Module Executive Edition.');
          onEntitled();
          break;
        case 'pending':
          toast.info('Your purchase is awaiting approval. Access unlocks automatically once it completes.');
          break;
        case 'cancelled':
          break;
        default:
          toast.error(result.message || 'Purchase could not be completed.');
      }
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Purchase failed.');
    } finally {
      setBusyProductId(null);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const { restored, entitled } = await restoreIapPurchases();
      await onRefreshProfile();
      if (entitled) {
        toast.success('Purchases restored.');
        onEntitled();
      } else if (restored === 0) {
        toast.info('No previous purchases found for this Apple ID.');
      } else {
        toast.info('No active subscription found for this Apple ID.');
      }
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Restore failed.');
    } finally {
      setRestoring(false);
    }
  };

  const handleManage = async () => {
    const opened = await openAppleManageSubscriptions();
    if (!opened) {
      toast.info('Open Settings › Apple ID › Subscriptions to manage your plan.');
    }
  };

  // Dynamic StoreKit pricing labels for terms disclosure to prevent drift across international storefronts
  const monthlyProduct = products.find((p) => planForProductId(p.id) === 'monthly');
  const annualProduct = products.find((p) => planForProductId(p.id) === 'annual');
  const monthlyPriceLabel = monthlyProduct ? `${monthlyProduct.displayPrice}/month` : '£29.00/month';
  const annualPriceLabel = annualProduct ? `${annualProduct.displayPrice}/year` : '£289.00/year';

  // Existing Stripe subscriber inside the iOS app: status only, no CTA.
  if (stripeLegacy) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-4" data-testid="apple-paywall-stripe-status">
        <h1 className="text-xl font-headline font-bold">Your subscription</h1>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-500" />
            <p className="text-sm font-medium">Executive Pro access is active</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Your subscription was purchased outside the App Store and remains active here.
            Nothing to do right now — you have full access in the app.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Need help? Email support@mindmodule.me and we&apos;ll assist you.
        </p>
      </div>
    );
  }

  // Active Apple subscriber: manage/restore only, never a purchase CTA.
  if (appleEntitled) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-4" data-testid="apple-paywall-active">
        <h1 className="text-xl font-headline font-bold">Your subscription</h1>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-500" />
            <p className="text-sm font-medium">Mind Module Pro is active</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Billed through your Apple ID. Change your plan or cancel any time in your Apple ID
            subscription settings.
          </p>
        </div>
        <div className="space-y-2">
          <Button
            className="w-full justify-center"
            onClick={() => void onEntitled()}
            data-testid="apple-paywall-continue"
          >
            Continue to App
          </Button>
          <Button
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={() => void handleManage()}
            data-testid="manage-apple-subscription"
          >
            <ExternalLink className="w-4 h-4" />
            Manage Subscription
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-center gap-2"
            onClick={() => void handleRestore()}
            disabled={restoring}
            data-testid="restore-purchases"
          >
            <RotateCcw className="w-4 h-4" />
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-5" data-testid="apple-paywall">
      {/* Header Section (Headline 2 sizes bigger) */}
      <div className="space-y-2">
        <h1 className="text-lg font-headline font-bold tracking-wider uppercase text-saffron">
          MIND MODULE EXECUTIVE EDITION
        </h1>
        <p className="text-base font-medium text-foreground/95 leading-snug">
          Your mind runs everything. Now it has a chief of staff.
        </p>
      </div>

      {/* Product Loading & Error States */}
      {loadingProducts && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loadingProducts && storeUnavailable && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm">
            Purchases are disabled on this device. Check Screen Time › Content &amp; Privacy Restrictions, then try again.
          </p>
        </div>
      )}

      {!loadingProducts && productError && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <p className="text-sm">{productError}</p>
          {diagnostics && (
            <details className="text-[11px] font-mono text-muted-foreground break-all cursor-pointer">
              <summary className="hover:underline focus:outline-none">Technical Diagnostics</summary>
              <div className="mt-2 p-2 rounded bg-muted/40 space-y-1" data-testid="apple-paywall-diagnostics">
                <p>{describeIapLoadDiagnostics(diagnostics)}</p>
                {looksLikeAppStoreConnectIssue(diagnostics) && (
                  <p className="text-amber-500/90 font-sans text-xs pt-1">
                    StoreKit returned 0 products from Apple. Check App Store Connect → Paid Applications Agreement is active and product IDs (me.mindmodule.pro.monthly, me.mindmodule.pro.annual) are in Ready to Submit status.
                  </p>
                )}
              </div>
            </details>
          )}
          <Button variant="outline" size="sm" onClick={() => void refresh()}>Try again</Button>
        </div>
      )}

      {/* Plan Cards */}
      {!loadingProducts && products.map((product) => {
        const trial = describeTrial(product);
        const introDiscount = describeIntroDiscount(product);
        const plan = planForProductId(product.id);
        const isAnnual = plan === 'annual';

        return (
          <div
            key={product.id}
            className={`rounded-2xl p-5 space-y-3 relative overflow-hidden transition-all ${
              isAnnual
                ? 'border-2 border-saffron/60 bg-gradient-to-br from-saffron/10 via-card to-card shadow-md'
                : 'border border-border bg-card'
            }`}
            data-testid={`apple-plan-${product.id}`}
          >
            {/* Card Header & Title */}
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                    {isAnnual ? 'Mind Module Pro Annual' : 'Mind Module Pro Monthly'}
                  </span>
                  {isAnnual && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-saffron text-white shadow-sm">
                      FOUNDING MEMBER
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-foreground">{product.displayPrice}</span>
                  <span className="text-xs text-muted-foreground">
                    {isAnnual ? 'per year' : 'per month'}
                  </span>
                </div>
              </div>
            </div>

            {/* Trial Subtitle Line */}
            {trial.isFreeTrial && (
              <div className="space-y-0.5" data-testid={`apple-trial-${product.id}`}>
                <p className="text-xs font-semibold text-saffron">
                  {trial.headline ? `${trial.headline} then ${product.displayPrice}/${isAnnual ? 'year' : 'month'}` : trial.postTrialLine}
                </p>
              </div>
            )}
            {introDiscount && (
              <p className="text-xs text-saffron font-medium">{introDiscount}</p>
            )}

            {/* CTA Button */}
            <Button
              className={`w-full h-11 font-medium text-sm ${
                isAnnual ? 'bg-saffron hover:bg-saffron/90 text-white' : ''
              }`}
              variant={isAnnual ? 'default' : 'outline'}
              disabled={busyProductId !== null}
              onClick={() => void handlePurchase(product.id)}
            >
              {busyProductId === product.id ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Processing…
                </span>
              ) : (
                trial.isFreeTrial ? trial.ctaLabel : (isAnnual ? 'Subscribe Annual' : 'Subscribe Monthly')
              )}
            </Button>

            {/* Tagline / Pitch */}
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isAnnual
                ? 'First 100 members only. Over 3 months free versus monthly. Your rate held for 2 years.'
                : 'Full access. Cancel any time.'}
            </p>
          </div>
        );
      })}

      {/* What's Included (Clean list, minimal weight, no border lines) */}
      <div className="space-y-2 py-2 px-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          WHAT&apos;S INCLUDED
        </p>
        <ul className="space-y-1.5 text-xs text-foreground/85 leading-snug">
          <li className="flex items-start gap-1.5">
            <span className="text-saffron">•</span>
            <span>Daily Briefs to know where you stand before the day runs you</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-saffron">•</span>
            <span>Short Performance plan built around your day, your signals, your patterns</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-saffron">•</span>
            <span>Quick Protocols that work under real pressure</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-saffron">•</span>
            <span>Weekly Intelligence on what&apos;s quietly draining or restoring you</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-saffron">•</span>
            <span>Connected to your world - not your memory</span>
          </li>
        </ul>
      </div>

      {/* Compliance Terms Block */}
      <div className="pt-2 space-y-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Payment will be charged to your Apple ID at confirmation of purchase. Monthly plan renews at {monthlyPriceLabel}. Founding Member Annual plan renews at {annualPriceLabel} for 2 years from purchase date, then at the prevailing full year price with minimum 60 days advance notice. Subscription renews automatically unless cancelled at least 24 hours before the current period ends. Manage or cancel in Apple ID settings. Cancelling during the free trial means you are not charged.
        </p>

        {/* Action Controls & Legal Links */}
        <div className="space-y-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center gap-2 text-xs"
            onClick={() => void handleRestore()}
            disabled={restoring}
            data-testid="restore-purchases"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center gap-2 text-xs text-muted-foreground"
            onClick={() => void handleManage()}
            data-testid="manage-apple-subscription"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Manage Subscription
          </Button>
        </div>

        <div className="flex items-center justify-center gap-3 pt-1 text-[11px] text-muted-foreground">
          <Link to="/privacy" className="hover:underline hover:text-foreground">
            Privacy Policy
          </Link>
          <span>·</span>
          <Link to="/terms" className="hover:underline hover:text-foreground">
            Terms of Use
          </Link>
          <span>·</span>
          <Link to="/powered-by-ai" className="hover:underline hover:text-foreground">
            Powered by AI
          </Link>
        </div>
      </div>
    </div>
  );
}
