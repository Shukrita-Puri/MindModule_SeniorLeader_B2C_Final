# First-time users go to the payment page, not the "Trial Limit Reached" popup

## Problem
A brand-new user who has never had a trial or subscription is currently shown the "Trial Limit Reached" popup. That message is wrong for them — they have not used anything yet. It should only appear to someone whose free trial has actually ended and who now needs to convert to Pro.

## Change (behaviour)
- **First-time user** (no trial ever started, no past or present subscription): instead of the popup, they are sent straight to the existing payment page (`/upgrade`) with the prices and the free-trial sign-up option. Everything before that point in the flow stays exactly as it is.
- **Post-trial user** (trial started and now expired, or a subscription ended/cancelled): unchanged — they still see the "Trial Limit Reached" popup asking them to convert to Pro monthly or annual.
- No other flow, gating, purchase or routing change.

## How "first-time" is decided (one place only)
Add a single helper next to the existing canonical access logic in `src/utils/subscriptionHelpers.ts`:

```
isFirstTimeUser(user) -> boolean
```

True only when access is already blocked **and** there is no history of a trial or subscription:
- no `trial_ends_at`
- no `subscription_current_period_end`
- no `subscription_canceled_at`
- `subscription_status` is empty/`none` and `subscription_tier` is empty/`none`
- not a valid beta user

Any evidence of a past trial or subscription (an expired `trial_ends_at`, a past period end, `expired`/`canceled`/`past_due`, or a real tier) means **not** first-time, so the popup stays.

## Where it is used
1. `src/components/SubscriptionGuard.tsx` — when the decision is `block`, check `isFirstTimeUser(user)` first: if true, redirect to `/upgrade?source=first-run` (React Router `<Navigate replace>`) instead of rendering `UpgradeModal`. Otherwise render the popup exactly as today.
2. `src/pages/SelfMasteryCoach.tsx` — the same guard before showing the modal there, so a first-time user hitting the coach lands on the payment page instead of the popup.

The payment page (`Stage6Payment`) already renders prices and the free-trial CTA for a blocked user, and on iOS routes to the Apple paywall — no change needed there.

## Payment page title change
On `/upgrade` (`Stage6Payment`):
- Replace the existing title text "Mind Module Executive Edition" with "Choose your Subscription".
- Render it in black (`text-foreground`, `#1F1F1F`) using the same font class and sizing as the "Mental Performance Insights" title in `src/pages/Insights.tsx`:
  - `font-headline font-medium leading-tight tracking-tight text-[26px] md:text-[42px]`
- Keep placement and surrounding layout unchanged; no other copy, colour, code or rule changes.

## Tests
- Unit tests for `isFirstTimeUser`: clean new profile → true; expired trial → false; cancelled/expired subscription → false; valid beta → false.
- Component test: `SubscriptionGuard` renders the popup for an expired-trial user and redirects for a first-time user.

