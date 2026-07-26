/**
 * Apple introductory-offer presentation logic.
 *
 * Mind Module's 7-day free trial is an Apple *Introductory Offer* attached to
 * the two existing auto-renewable subscriptions inside the "Mind Module Pro"
 * subscription group. There is NO separate trial product and no trial product
 * id.
 *
 * Nothing here invents trial availability, duration, currency or price: every
 * value comes from StoreKit at runtime. If Apple does not return an eligible
 * introductory offer for the signed-in Apple ID, the paywall renders standard
 * paid pricing with no trial copy at all.
 */
import type { IapProduct, IapIntroOffer } from '@/services/iap';

export interface TrialPresentation {
  /** Apple returned an eligible free-trial introductory offer. */
  isFreeTrial: boolean;
  /** e.g. "7-day free trial" — built only from Apple's period data. */
  headline: string | null;
  /** e.g. "then £12.99 per month" — localized price straight from StoreKit. */
  postTrialLine: string | null;
  /** Purchase CTA label. */
  ctaLabel: string;
  /** Auto-renewal + cancellation disclosure required by Apple. */
  disclosure: string;
}

export function billingFrequencyLabel(product: IapProduct): string {
  if (!product.periodUnit) return '';
  const value = product.periodValue ?? 1;
  return value === 1 ? `per ${product.periodUnit}` : `every ${value} ${product.periodUnit}s`;
}

function offerDuration(offer: IapIntroOffer): string {
  const unitCount = (offer.periodValue ?? 1) * (offer.periodCount ?? 1);
  const unit = offer.periodUnit ?? 'day';
  return `${unitCount}-${unit}`;
}

/**
 * An intro offer counts as a free trial only when Apple says the payment mode
 * is `freeTrial`. Pay-up-front / pay-as-you-go intro offers are discounts, not
 * trials, and must never be described as free.
 */
export function isEligibleFreeTrial(product: IapProduct): boolean {
  if (product.isEligibleForIntroOffer === false) return false;
  const mode = product.introOffer?.paymentMode?.toLowerCase();
  return mode === 'freetrial';
}

const AUTO_RENEW_DISCLOSURE =
  'Payment is charged to your Apple ID at confirmation of purchase. The subscription renews automatically unless cancelled at least 24 hours before the end of the current period. You can cancel any time in your Apple ID subscription settings.';

const TRIAL_DISCLOSURE =
  'Your free trial converts to a paid subscription automatically unless you cancel at least 24 hours before it ends. Cancel any time in your Apple ID subscription settings; cancelling during the trial means you are not charged.';

export function describeTrial(product: IapProduct): TrialPresentation {
  if (!isEligibleFreeTrial(product) || !product.introOffer) {
    return {
      isFreeTrial: false,
      headline: null,
      postTrialLine: null,
      ctaLabel: 'Subscribe',
      disclosure: AUTO_RENEW_DISCLOSURE,
    };
  }
  const duration = offerDuration(product.introOffer);
  const frequency = billingFrequencyLabel(product);
  return {
    isFreeTrial: true,
    headline: `${duration} free trial`,
    postTrialLine: `then ${product.displayPrice}${frequency ? ` ${frequency}` : ''}`,
    ctaLabel: `Start ${duration} free trial`,
    disclosure: TRIAL_DISCLOSURE,
  };
}

/** Non-trial introductory offers (discounted intro price) render factually. */
export function describeIntroDiscount(product: IapProduct): string | null {
  const offer = product.introOffer;
  if (!offer || isEligibleFreeTrial(product)) return null;
  if (product.isEligibleForIntroOffer === false) return null;
  return `Introductory offer: ${offer.displayPrice} for ${offerDuration(offer)} period`;
}
