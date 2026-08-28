/**
 * iOS-only subscription surface in Settings/Profile.
 *
 * Replaces the Stripe "Manage Billing" / "Upgrade Plan" entries inside the
 * native app (App Store Review Guideline 3.1.1). Offers exactly three
 * actions, none of which is an external purchase link:
 *   - Upgrade  → in-app Apple IAP paywall at /upgrade
 *   - Restore Purchases
 *   - Manage Subscription → Apple's own subscription sheet
 *
 * A user whose access came from Stripe sees a read-only status message and no
 * purchase CTA, so they are never pushed to repurchase through Apple or back
 * to a web billing flow from inside the app.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RotateCcw, ExternalLink, Sparkles, CreditCard, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { restoreIapPurchases, openAppleManageSubscriptions } from '@/services/iap';
import { isNonApplePaidEntitlement } from '@/config/purchasePlatform';
import {
  hasValidAccess,
  resolveManageSubscriptionTarget,
  MANAGE_SUBSCRIPTION_UPGRADE_PATH,
  type AccessUser,
} from '@/utils/subscriptionHelpers';

interface Props {
  user: (AccessUser & { subscription_provider?: string | null; stripe_customer_id?: string | null }) | null;
  onRefreshProfile: () => Promise<unknown>;
  /** Current plan label (e.g. "Free", "Annual Pro"). Rendered as a row. */
  planLabel?: string;
  /** Renewal / expiry sentence. Rendered as a row when present. */
  expiryLabel?: string | null;
}

export function AppleSubscriptionCard({ user, onRefreshProfile, planLabel, expiryLabel }: Props) {
  const navigate = useNavigate();
  const [restoring, setRestoring] = useState(false);

  const entitled = hasValidAccess(user);
  const stripeLegacy = entitled && isNonApplePaidEntitlement(user);
  const appleSubscriber = user?.subscription_provider === 'apple';

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const { restored, entitled: nowEntitled } = await restoreIapPurchases();
      await onRefreshProfile();
      if (nowEntitled) toast.success('Purchases restored.');
      else if (restored === 0) toast.info('No previous purchases found for this Apple ID.');
      else toast.info('No active subscription found for this Apple ID.');
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Restore failed.');
    } finally {
      setRestoring(false);
    }
  };

  const handleManage = async () => {
    // Beta testers and active monthly Pro users manage/upgrade in-app.
    if (resolveManageSubscriptionTarget(user) === 'payment_page') {
      navigate(MANAGE_SUBSCRIPTION_UPGRADE_PATH, { state: { source: 'profile_upgrade' } });
      return;
    }
    const opened = await openAppleManageSubscriptions();
    if (!opened) toast.info('Open Settings › Apple ID › Subscriptions to manage your plan.');
  };

  return (
    <Card id="subscription" data-testid="apple-subscription-card">
      <CardHeader>
        <CardTitle className="text-[15px] font-sans font-medium flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          Subscription
        </CardTitle>
        <CardDescription className="font-sans">
          {stripeLegacy
            ? 'Your Pro access is active.'
            : appleSubscriber
              ? 'Managed through your Apple ID.'
              : 'Subscribe or restore a previous purchase.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {planLabel && (
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div className="flex items-center gap-3">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Plan</span>
            </div>
            <span className="text-sm">{planLabel}</span>
          </div>
        )}

        {expiryLabel && (
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Renewal</span>
            </div>
            <span className="text-sm">{expiryLabel}</span>
          </div>
        )}

        {!entitled && (
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => navigate('/upgrade?source=profile-upgrade', { state: { source: 'profile_upgrade' } })}
          >
            <Sparkles className="h-4 w-4" />
            Upgrade Plan
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => void handleRestore()}
          disabled={restoring}
          data-testid="profile-restore-purchases"
        >
          <RotateCcw className="h-4 w-4" />
          {restoring ? 'Restoring…' : 'Restore Purchases'}
        </Button>

        {entitled && !stripeLegacy && (
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => void handleManage()}
            data-testid="profile-manage-apple-subscription"
          >
            <ExternalLink className="h-4 w-4" />
            Manage Subscription
          </Button>
        )}

        {stripeLegacy && (
          <p className="text-xs text-muted-foreground">
            Need help with that subscription? Email support@mindmodule.me and we&apos;ll help.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
