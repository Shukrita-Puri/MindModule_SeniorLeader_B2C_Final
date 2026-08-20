# Paywall trial states: audit + evidence for both first-time and post-trial users

## What the audit found

Your reading is correct. `ApplePaywall` already renders two distinct states, driven entirely by what StoreKit returns for the signed-in Apple ID:

- **First-time user (eligible for the introductory offer)** — orange line "7-day free trial then <price>/month" (and "/year") under each price, and both buttons read "Start 7-day free trial".
- **User who already used the trial (ineligible)** — no orange trial line, buttons read "Subscribe Monthly" / "Subscribe Annual".

The screenshot I shared earlier was the second state, because the mock product data had no introductory offer attached. It was not a regression — but it was the wrong state to show you, and I did not label it.

Nothing in the trial copy is hardcoded: the "7-day" duration, the price and the currency all come from Apple at runtime, so a UK Apple ID shows £34.99 / £299.99 while the US test account in your screenshot shows $.

## Work in this change

1. **Evidence for both states** — render the paywall twice with GBP StoreKit fixtures: one product set with an eligible 7-day free trial (first-time user), one without (post-trial user). Capture a screenshot of each so you can compare them side by side against your reference image.
2. **Lock the two states with a test** — a component test asserting that with an eligible free-trial product the paywall shows the orange "7-day free trial then £34.99/month" and "…£299.99/year" lines with "Start 7-day free trial" buttons, and that with an ineligible product it shows neither trial line and falls back to "Subscribe Monthly" / "Subscribe Annual".
3. **Currency check inside those states** — assert the rendered trial and renewal copy contains £ and no $ in both states (the existing currency guard only covers source literals).

No change to purchase, restore, eligibility or gating logic — this is verification plus test coverage. If step 1 reveals the first-time state renders anything other than the attached reference (in £), I will report it before touching code.

## Technical notes
- Files: new test under `src/__tests__/` exercising `src/components/subscription/ApplePaywall.tsx`; fixtures shaped like `IapProduct` with `isEligibleForIntroOffer: true` and an `introOffer` of `paymentMode: 'freeTrial'`, `periodUnit: 'day'`, `periodValue: 7`.
- `src/utils/introOffer.ts` (`describeTrial`) stays unchanged — it is already the single source for trial copy.
