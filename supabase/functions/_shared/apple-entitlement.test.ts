import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  applyAppleEntitlement,
  isTransactionActive,
  effectiveExpiry,
  tierForProductId,
  type AppleTransactionPayload,
  type AppleRenewalInfo,
} from './apple-entitlement.ts';

Deno.test('isTransactionActive correctly detects expired, active, and revoked transactions', () => {
  const now = 1700000000000;

  // Active (future expiry)
  const activeTx: AppleTransactionPayload = {
    transactionId: '1001',
    originalTransactionId: '1000',
    productId: 'me.mindmodule.pro.monthly',
    expiresDate: now + 86400000,
  };
  assertEquals(isTransactionActive(activeTx, now), true);

  // Expired (past expiry)
  const expiredTx: AppleTransactionPayload = {
    transactionId: '1002',
    originalTransactionId: '1000',
    productId: 'me.mindmodule.pro.monthly',
    expiresDate: now - 86400000,
  };
  assertEquals(isTransactionActive(expiredTx, now), false);

  // Revoked
  const revokedTx: AppleTransactionPayload = {
    transactionId: '1003',
    originalTransactionId: '1000',
    productId: 'me.mindmodule.pro.monthly',
    expiresDate: now + 86400000,
    revocationDate: now - 1000,
  };
  assertEquals(isTransactionActive(revokedTx, now), false);

  // Upgraded
  const upgradedTx: AppleTransactionPayload = {
    transactionId: '1004',
    originalTransactionId: '1000',
    productId: 'me.mindmodule.pro.monthly',
    expiresDate: now + 86400000,
    isUpgraded: true,
  };
  assertEquals(isTransactionActive(upgradedTx, now), false);
});

Deno.test('applyAppleEntitlement marks lapsed subscription as expired and drops paid access', async () => {
  const updates: Record<string, unknown>[] = [];
  const mockDb = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              subscription_provider: 'apple',
              subscription_status: 'active',
              stripe_subscription_id: null,
              subscription_current_period_end: new Date(Date.now() - 10000).toISOString(),
              apple_original_transaction_id: 'orig-1',
            },
          }),
        }),
      }),
      update: (data: Record<string, unknown>) => {
        updates.push(data);
        return {
          eq: async () => ({ error: null }),
        };
      },
    }),
  };

  const lapsedTx: AppleTransactionPayload = {
    transactionId: 'txn-2',
    originalTransactionId: 'orig-1',
    productId: 'me.mindmodule.pro.monthly',
    expiresDate: Date.now() - 60000,
  };

  const result = await applyAppleEntitlement(mockDb as any, 'user-1', lapsedTx, {
    notificationType: 'EXPIRED',
    notificationSubtype: 'VOLUNTARY',
  });

  assertEquals(result.entitled, false);
  assertEquals(updates.length, 1);
  assertEquals(updates[0].subscription_status, 'expired');
  assertEquals(updates[0].subscription_tier, 'none');
  assertEquals(typeof updates[0].subscription_canceled_at, 'string');
});

Deno.test('applyAppleEntitlement falls back to canceled when DB rejects expired with check constraint error', async () => {
  const attemptedStatuses: unknown[] = [];
  let callCount = 0;

  const mockDb = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              subscription_provider: 'apple',
              subscription_status: 'active',
              stripe_subscription_id: null,
              subscription_current_period_end: new Date(Date.now() - 10000).toISOString(),
              apple_original_transaction_id: 'orig-1',
            },
          }),
        }),
      }),
      update: (data: Record<string, unknown>) => {
        attemptedStatuses.push(data.subscription_status);
        callCount++;
        return {
          eq: async () => {
            if (callCount === 1) {
              // Simulate Postgres 23514 check_violation on profiles_subscription_status_check
              return {
                error: {
                  code: '23514',
                  message: 'new row for relation "profiles" violates check constraint "profiles_subscription_status_check"',
                },
              };
            }
            // Fallback update succeeds
            return { error: null };
          },
        };
      },
    }),
  };

  const lapsedTx: AppleTransactionPayload = {
    transactionId: 'txn-2',
    originalTransactionId: 'orig-1',
    productId: 'me.mindmodule.pro.monthly',
    expiresDate: Date.now() - 60000,
  };

  const result = await applyAppleEntitlement(mockDb as any, 'user-1', lapsedTx, {
    notificationType: 'EXPIRED',
  });

  // Access was successfully revoked and fallback prevented a 500 error
  assertEquals(result.entitled, false);
  assertEquals(attemptedStatuses, ['expired', 'canceled']);
});

Deno.test('applyAppleEntitlement marks active subscription as active with correct tier', async () => {
  const updates: Record<string, unknown>[] = [];
  const mockDb = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              subscription_provider: null,
              subscription_status: 'expired',
              stripe_subscription_id: null,
              subscription_current_period_end: null,
              apple_original_transaction_id: 'orig-1',
            },
          }),
        }),
      }),
      update: (data: Record<string, unknown>) => {
        updates.push(data);
        return {
          eq: async () => ({ error: null }),
        };
      },
    }),
  };

  const activeTx: AppleTransactionPayload = {
    transactionId: 'txn-3',
    originalTransactionId: 'orig-1',
    productId: 'me.mindmodule.pro.annual',
    expiresDate: Date.now() + 365 * 86400000,
  };

  const result = await applyAppleEntitlement(mockDb as any, 'user-1', activeTx, {
    notificationType: 'DID_RENEW',
  });

  assertEquals(result.entitled, true);
  assertEquals(updates.length, 1);
  assertEquals(updates[0].subscription_status, 'active');
  assertEquals(updates[0].subscription_provider, 'apple');
  assertEquals(updates[0].subscription_tier, 'annual_pro');
  assertEquals(updates[0].subscription_canceled_at, null);
});

Deno.test('applyAppleEntitlement preserves Pro access if Stripe subscription is still active', async () => {
  const updates: Record<string, unknown>[] = [];
  const mockDb = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              subscription_provider: 'stripe',
              subscription_status: 'active',
              stripe_subscription_id: 'sub_123',
              subscription_current_period_end: new Date(Date.now() + 86400000).toISOString(),
              apple_original_transaction_id: 'orig-1',
            },
          }),
        }),
      }),
      update: (data: Record<string, unknown>) => {
        updates.push(data);
        return {
          eq: async () => ({ error: null }),
        };
      },
    }),
  };

  const lapsedAppleTx: AppleTransactionPayload = {
    transactionId: 'txn-expired',
    originalTransactionId: 'orig-1',
    productId: 'me.mindmodule.pro.monthly',
    expiresDate: Date.now() - 60000,
  };

  const result = await applyAppleEntitlement(mockDb as any, 'user-stripe-active', lapsedAppleTx, {
    notificationType: 'EXPIRED',
  });

  // User is still entitled via Stripe!
  assertEquals(result.entitled, true);
  // Status was not overwritten to expired
  assertEquals(updates[0].subscription_status, undefined);
});
