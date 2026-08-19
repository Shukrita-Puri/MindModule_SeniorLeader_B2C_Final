# Manage Subscription → Payment page for beta testers and monthly Pro users

## Goal
Both "Manage Subscription" entry points should route the same way, decided in one place:

- Active beta tester → open the payment/upgrade page (`Stage6Payment`) instead of being bounced or gated.
- Monthly Pro subscriber → open the payment page with the Annual plan pre-selected (upgrade path).
- Everyone else → unchanged (Apple subscription sheet on iOS, Stripe billing portal on web).

## One decision helper (no duplicated logic)
Add a single canonical resolver to `src/utils/subscriptionHelpers.ts`:

```
resolveManageSubscriptionTarget(user) -> 'payment_page' | 'native_manage'
```

Rules: `isValidBeta(user)` → `payment_page`; `subscription_tier === 'monthly_pro'` with valid access → `payment_page`; otherwise `native_manage`. Nothing re-implements these checks anywhere else.

## Call sites (the two buttons)
1. `src/components/subscription/AppleSubscriptionCard.tsx` — Profile → Subscription section "Manage Subscription". Consults the resolver: `payment_page` navigates to `/upgrade?source=profile-upgrade` (state `{ source: 'profile_upgrade' }`); `native_manage` keeps the existing Apple sheet call.
2. `src/components/navigation/UserSettingsPopover.tsx` — the "Subscription" item under Retake Tour. Same resolver: `payment_page` navigates straight to `/upgrade?source=profile-upgrade`; otherwise keeps today's `/profile#subscription` deep link.

The web Profile "Manage Billing" handler (`handleManageBilling`) gets the same guard at the top so beta/monthly users land on the payment page rather than the Stripe portal.

## Payment page behaviour
`Stage6Payment` already treats `profile-upgrade` as an explicit upgrade source, so valid beta users will render the pricing UI instead of the neutral loader — no gating change needed beyond confirming the beta branch is not short-circuited.

- Web pricing: `availablePlans` already collapses to `['annual']` for monthly subscribers and the auto-select effect picks it — verified, no change.
- iOS (`ApplePaywall`): currently renders every StoreKit product. For a monthly Pro subscriber it will show only the Annual product (monthly card suppressed) so the annual upgrade is the pre-selected/only CTA. Beta users see the normal full paywall.

## Non-goals
No changes to entitlement/access logic, `SubscriptionGuard`, IAP purchase or restore flows, or Stripe checkout. Presentation and routing only.

## Explicitly not gating
This change is navigation-only. Both flows start from the user already inside the app: an active beta tester and an active monthly Pro user (still inside their paid period, including month-to-month auto-renew) keep full app access and only reach the payment page when they tap "Manage Subscription" in Profile or the "Subscription" item under Retake Tour.

Existing gating stays exactly as it is: `resolveSubscriptionAccess` already blocks a monthly Pro user whose period end has passed without renewal, and `SubscriptionGuard` already acts on that verdict. That logic is correct today and will not be re-implemented, duplicated, or modified.
