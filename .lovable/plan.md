# Profile restructure (iOS only) + LinkedIn / Home-location save bugs

## Part 1 — Profile page restructure, iOS native shell only

All layout changes below are gated behind `isIosNativeShell()`. The web/desktop Profile page keeps its current structure and order exactly as it is today.

iOS section order:

```text
[ Avatar / name / email header card ]
1. Account Details  (User icon)        — Email, LinkedIn, Status
                                         (Admin Console row stays web/desktop only)
2. Subscription     (CreditCard icon)  — Plan, Renewal, Restore Purchases, Manage Subscription
3. Home Location    (Home icon)        — unchanged card
4. Settings         (Settings icon)    — Manage Connections, Privacy & Security, Retake Tour,
                                         Push Test, Send Feedback, Delete Local Data,
                                         Delete Account, Sign Out
```

The Subscription section on iOS is the existing Apple subscription card (Restore Purchases + Manage Subscription, plus the Upgrade CTA when not entitled), with the Plan and Renewal rows moved into it out of Account Details. It moves from the bottom of the page to directly after Account Details. Its title gains a CreditCard icon; Settings gains a Settings icon. Guideline 3.1.1 gating is untouched — no Stripe CTA appears inside the iOS shell.

On web, Plan and Renewal stay in Account Details as today.

Typography on the Profile page is normalised to the Inter sans styles already used by the Email row (consistent card titles, row labels, values, and button labels) — this pass applies to the shared Profile page so both platforms read consistently.

## Part 2 — Popover shortcuts

In the user popover box holding Retake Tour / Sign Out, add:

- **Manage Connections** → `/connected-data` (the same full experience the Profile button opens).
- **Subscription** → `/profile#subscription`, landing on the Profile page scrolled to the Subscription card.

## Part 3 — The save bugs (root cause confirmed)

Both rows fail for the same reason. The browser database client (`src/integrations/supabase/client.ts`) is created with the publishable key only, and nothing attaches the Auth0 token to database calls — only edge-function calls are token-aware (`authRetryInterceptor` patches `functions.invoke` alone). Every row-level policy on `profiles`, `user_external_profiles`, and `travel_state` requires `auth.jwt() ->> 'sub'` to equal the user id, so direct table calls from the page run with no identity and match nothing.

Effect:

- **LinkedIn row**: the direct write to `user_external_profiles` / `profiles` is rejected by policy, and the read on load returns nothing — so the URL never appears, before or after saving.
- **Home location**: the save itself works (it goes through the `set-home-location` function with the token), but the status read afterwards queries `profiles` and `travel_state` directly, gets nothing back, and the card keeps showing "Not set" — matching the screenshot.

Fix: move both reads and the LinkedIn write onto authenticated edge functions.

- Home location card reads its status from a small authenticated endpoint (or an extended `set-home-location` GET) that returns `isSet`, timezone, last sync, travel state for the caller — then refreshes after a successful save.
- LinkedIn row reads and writes through an authenticated endpoint that upserts `user_external_profiles` and mirrors `profiles.linkedin_url`, returning the saved URL so the row renders it immediately and after reload.
- Errors surface real messages instead of silently rendering an empty state.

## Technical notes

- Files: `src/pages/Profile.tsx`, `src/components/subscription/AppleSubscriptionCard.tsx` (add Plan/Renewal rows + icon), `src/components/navigation/UserSettingsPopover.tsx`, `src/components/profile/LinkedInAccountRow.tsx`, `src/components/profile/HomeLocationCard.tsx`, plus one new edge function (or two small ones) for profile-side reads/writes.
- Restructure is presentation-only and gated on `isIosNativeShell()`; no billing, routing, or entitlement logic changes.
- New endpoints validate the Auth0 bearer token and act on the caller's own user id only — no service-role data exposed to the client.

## Scope guardrail

Parts 1 and 2 are pure re-arrangement: sections and rows move position, gain icons, and get consistent text styles. No functionality, logic, gating, routing, or edge-function behaviour changes anywhere in the restructure — the same components render the same data with the same handlers, just in a different order. The only behavioural changes in this plan are the Part 3 save-bug fixes.
