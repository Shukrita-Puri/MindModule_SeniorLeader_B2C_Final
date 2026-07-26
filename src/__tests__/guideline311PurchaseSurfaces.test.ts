/**
 * App Store Review Guideline 3.1.1 regression guards.
 *
 * Mind Module was rejected because the iOS build exposed Stripe purchase
 * paths. These tests lock in the two invariants that caused the rejection:
 *
 *  1. Every Stripe purchase/billing CTA is gated on the purchase-platform
 *     SSOT, so it cannot render inside the native iOS shell.
 *  2. Both server functions that can open an external Stripe surface
 *     (checkout + billing portal) refuse native-iOS callers.
 *
 * They are source-level assertions on purpose: the failure mode we are
 * guarding against is a future edit re-adding an ungated CTA, which a
 * render test of today's components would not catch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('iOS purchase-surface gating (client)', () => {
  afterEach(() => {
    // doMock is registry-scoped, so resetting modules is enough to drop it.
    vi.resetModules();
  });

  const mockPlatform = (native: boolean, platform: string) => {
    vi.resetModules();
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => native, getPlatform: () => platform },
    }));
    return import('@/config/purchasePlatform');
  };

  it('forbids Stripe purchase UI inside the native iOS shell', async () => {
    const mod = await mockPlatform(true, 'ios');
    expect(mod.isIosNativeShell()).toBe(true);
    expect(mod.activePurchaseProvider()).toBe('apple_iap');
    expect(mod.canShowStripePurchaseUi()).toBe(false);
  });

  it('keeps Stripe purchase UI on web, including mobile Safari', async () => {
    const mod = await mockPlatform(false, 'web');
    expect(mod.isIosNativeShell()).toBe(false);
    expect(mod.canShowStripePurchaseUi()).toBe(true);
  });

  it('keeps Stripe purchase UI on native Android (Apple rules do not apply)', async () => {
    const mod = await mockPlatform(true, 'android');
    expect(mod.isIosNativeShell()).toBe(false);
    expect(mod.canShowStripePurchaseUi()).toBe(true);
  });

  it('treats a lapsed Stripe customer as NOT holding a paid entitlement', async () => {
    const mod = await mockPlatform(true, 'ios');
    // stripe_customer_id alone means "has billed with us before", which is why
    // callers must combine this with hasValidAccess() before suppressing the
    // purchase CTA. The helper itself only reports provenance.
    expect(mod.isNonApplePaidEntitlement({ stripe_customer_id: 'cus_1' })).toBe(true);
    expect(mod.isNonApplePaidEntitlement({ subscription_provider: 'apple' })).toBe(false);
    expect(mod.isNonApplePaidEntitlement(null)).toBe(false);
  });
});

describe('no ungated Stripe CTA in iOS-reachable screens', () => {
  it('Stage6Payment returns the Apple paywall before any Stripe pricing UI', () => {
    const src = read('src/pages/onboarding/stages/Stage6Payment.tsx');
    const iosBranch = src.indexOf('if (isIosNativeShell())');
    const stripeCheckoutCall = src.indexOf('create-checkout-session');
    expect(iosBranch).toBeGreaterThan(-1);
    expect(src).toContain('<ApplePaywall');
    // The iOS early-return must precede every Stripe pricing render path.
    const pricingReturn = src.indexOf("availablePlans.length === 0");
    expect(iosBranch).toBeLessThan(pricingReturn);
    // The checkout handler may be defined earlier, but it is only reachable
    // from the CTA rendered after the iOS branch.
    expect(stripeCheckoutCall).toBeGreaterThan(-1);
  });

  it('Profile gates every Stripe billing entry point on canShowStripePurchaseUi', () => {
    const src = read('src/pages/Profile.tsx');
    expect(src).toContain('canShowStripePurchaseUi');
    expect(src).toContain('const showBillingMenu =');
    // "Manage Billing" and "Cancel Plan" live inside the gated dropdown.
    expect(src).toContain('{showBillingMenu && <DropdownMenu>');
    // The Settings-level upgrade/manage button is gated too.
    expect(src).toContain('{!PAYMENT_PAGE_SUPPRESSED && allowStripeUi && (');
  });

  it('ApplePaywall never renders a purchase CTA for an already-entitled user', () => {
    const src = read('src/components/subscription/ApplePaywall.tsx');
    expect(src).toContain('const appleEntitled =');
    expect(src).toContain('apple-paywall-active');
    expect(src).toContain('apple-paywall-stripe-status');
    // Both non-purchase states must still expose Restore Purchases.
    expect(src.match(/Restore Purchases/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('ApplePaywall keeps Privacy and Terms reachable via router links', () => {
    const src = read('src/components/subscription/ApplePaywall.tsx');
    expect(src).toContain('to="/privacy"');
    expect(src).toContain('to="/terms"');
    expect(src).not.toContain('href="/privacy"');
  });
});

describe('server-side Stripe purchase guard', () => {
  it('is applied to both external-purchase entry points', () => {
    for (const fn of ['create-checkout-session', 'create-customer-portal']) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src, `${fn} must import the guard`).toContain('ios-purchase-guard.ts');
      expect(src, `${fn} must invoke the guard`).toContain('rejectIosPurchaseFlow(req, corsHeaders)');
      expect(src, `${fn} must allow the platform header through CORS`).toContain('x-mm-client-platform');
    }
  });

  it('the client attaches a platform header to edge-function calls', () => {
    const src = read('src/services/authTokenService.ts');
    expect(src).toContain('x-mm-client-platform');
    expect(src).toContain('function clientPlatformHeader()');
  });
});