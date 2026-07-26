/**
 * Apple In-App Purchase paywall — the ONLY purchase surface rendered inside
 * the iOS/iPadOS shell (App Store Review Guideline 3.1.1).
 *
 * Rules encoded here:
 *  - Prices, titles and periods come from StoreKit, never from our own table.
 *  - Intro/trial copy renders only when Apple actually returns an intro offer.
 *  - Restore Purchases is always visible.
 *  - Manage Subscription points at Apple, never Stripe.
 *  - A user who already holds a non-Apple (Stripe) paid entitlement sees a
 *    read-only status message and NO purchase button, so they are never asked
 *    to repurchase through Apple.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Check, RotateCcw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  loadIapProducts,
  purchaseIapProduct,
  restoreIapPurchases,
  openAppleManageSubscriptions,
  isIapAvailable,
  onIapTransactionUpdate,
  type IapProduct,
} from '@/services/iap';
import { isIapConfigured } from '@/config/iapProducts';
import { isNonApplePaidEntitlement } from '@/config/purchasePlatform';
import { hasValidAccess, type AccessUser } from '@/utils/subscriptionHelpers';

interface ApplePaywallProps {
  user: (AccessUser & { subscription_provider?: string | null; stripe_customer_id?: string | null }) | null;
  onEntitled: () => void;
  onRefreshProfile: () => Promise<unknown>;
}

function periodLabel(product: IapProduct): string {
  if (!product.periodUnit) return '';
  const value = product.periodValue ?? 1;
  return value === 1 ? `per ${product.periodUnit}` : `every ${value} ${product.periodUnit}s`;
}

export function ApplePaywall({ user, onEntitled, onRefreshProfile }: ApplePaywallProps) {
  const [products, setProducts] = useState<IapProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [storeUnavailable, setStoreUnavailable] = useState(false);

  const alreadyEntitled = hasValidAccess(user);
  const stripeLegacy = isNonApplePaidEntitlement(user) && alreadyEntitled;
  // An Apple subscriber who lands back on /upgrade (deep link, back-nav, stale
  // route) must never be shown another "Subscribe" button — that invites a
  // duplicate purchase for a plan they already hold.
  const appleEntitled = alreadyEntitled && !stripeLegacy;

  const refresh = useCallback(async () => {
    setLoadingProducts(true);
    setProductError(null);
    try {
      if (!isIapConfigured()) {
        setProductError(
          'In-app purchases are not configured for this build. Please update to the latest version.',
        );
        return;
      }
      const available = await isIapAvailable();
      if (!available) {
        setStoreUnavailable(true);
        return;
      }
      const list = await loadIapProducts();
      if (list.length === 0) {
        setProductError('No subscription options are available right now. Please try again later.');
      }
      setProducts(list);
    } catch (err) {
      setProductError((err as Error)?.message ?? 'Unable to reach the App Store.');
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    if (stripeLegacy || appleEntitled) {
      setLoadingProducts(false);
      return;
    }
    void refresh();
  }, [refresh, stripeLegacy, appleEntitled]);

  // Out-of-band transactions (Ask to Buy approval, interrupted purchase,
  // renewal while backgrounded) land here.
  useEffect(() => {
    let dispose: (() => void) | undefined;
    void onIapTransactionUpdate(() => {
      void onRefreshProfile().then(() => onEntitled());
    }).then((fn) => { dispose = fn; });
    return () => { dispose?.(); };
  }, [onEntitled, onRefreshProfile]);

  const handlePurchase = async (productId: string) => {
    setBusyProductId(productId);
    try {
      const result = await purchaseIapProduct(productId);
      switch (result.status) {
        case 'purchased':
          await onRefreshProfile();
          toast.success('Subscription active. Welcome to Pro.');
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

  // Existing Stripe subscriber inside the iOS app: status only, no CTA.
  if (stripeLegacy) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-4" data-testid="apple-paywall-stripe-status">
        <h1 className="text-[20px] font-headline font-bold">Your subscription</h1>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-saffron" />
            <p className="text-[15px] font-medium">Pro access is active</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Your subscription was purchased outside the App Store and is managed on the web.
            Nothing to do here — you have full access in the app.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Need to change or cancel it? Sign in at app.mindmodule.me from a browser, or email
          support@mindmodule.me.
        </p>
      </div>
    );
  }

  // Active Apple subscriber: manage/restore only, never a purchase CTA.
  if (appleEntitled) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-4" data-testid="apple-paywall-active">
        <h1 className="text-[20px] font-headline font-bold">Your subscription</h1>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-saffron" />
            <p className="text-[15px] font-medium">Mind Module Pro is active</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Billed through your Apple ID. Change your plan or cancel any time in your Apple ID
            subscription settings.
          </p>
        </div>
        <div className="space-y-2">
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
    <div className="max-w-md mx-auto px-4 py-6 space-y-4" data-testid="apple-paywall">
      <h1 className="text-[20px] font-headline font-bold">Mind Module Pro</h1>
      <p className="text-sm text-muted-foreground">
        Full access to your daily Brief, Mastery Plan, Reset Studio, JIT prep and AI coach.
      </p>

      {loadingProducts && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loadingProducts && storeUnavailable && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm">
            Purchases are disabled on this device. Check Screen Time › Content &amp; Privacy
            Restrictions, then try again.
          </p>
        </div>
      )}

      {!loadingProducts && productError && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <p className="text-sm">{productError}</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>Try again</Button>
        </div>
      )}

      {!loadingProducts && products.map((product) => (
        <div key={product.id} className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-headline font-bold">{product.title}</h2>
            <div className="text-right">
              <p className="text-2xl font-bold">{product.displayPrice}</p>
              {periodLabel(product) && (
                <p className="text-xs text-muted-foreground">{periodLabel(product)}</p>
              )}
            </div>
          </div>
          {product.description && (
            <p className="text-sm text-muted-foreground">{product.description}</p>
          )}
          {product.introOffer && (
            <p className="text-xs text-saffron">
              Introductory offer: {product.introOffer.displayPrice} for{' '}
              {product.introOffer.periodValue} {product.introOffer.periodUnit}
              {product.introOffer.periodValue === 1 ? '' : 's'}
            </p>
          )}
          <Button
            className="w-full h-11"
            variant="critical"
            disabled={busyProductId !== null}
            onClick={() => void handlePurchase(product.id)}
          >
            {busyProductId === product.id ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Processing…
              </span>
            ) : (
              'Subscribe'
            )}
          </Button>
        </div>
      ))}

      <p className="text-xs text-muted-foreground leading-relaxed">
        Payment is charged to your Apple ID at confirmation of purchase. The subscription renews
        automatically unless cancelled at least 24 hours before the end of the current period. You
        can manage or cancel it in your Apple ID settings at any time.
      </p>

      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full justify-center gap-2"
          onClick={() => void handleRestore()}
          disabled={restoring}
          data-testid="restore-purchases"
        >
          <RotateCcw className="w-4 h-4" />
          {restoring ? 'Restoring…' : 'Restore Purchases'}
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-center gap-2"
          onClick={() => void handleManage()}
          data-testid="manage-apple-subscription"
        >
          <ExternalLink className="w-4 h-4" />
          Manage Subscription
        </Button>
      </div>

      <div className="flex items-center justify-center gap-3 pt-2">
        <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground">Privacy Policy</a>
        <span className="text-muted-foreground/40 text-xs">·</span>
        <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground">Terms of Use</a>
      </div>
    </div>
  );
}