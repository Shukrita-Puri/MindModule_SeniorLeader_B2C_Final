# Mind Module Agent Rules

## Purpose
This file gives AI coding tools clear project-specific rules for working on Mind Module.

Mind Module is an executive self-mastery app. It combines calendar context, wearable signals, check-ins, readiness state, Brief, Plan, nudges, and subscription access. Changes must be made carefully because small regressions can affect scoring, user trust, notifications, or production access.

## Tech Context
- Frontend: React / Lovable-generated UI
- Backend: Supabase database and Edge Functions
- Mobile: Capacitor iOS app
- Auth: Auth0
- Wearables: Apple HealthKit / iOS native bridge
- Calendar: Apple Calendar / EventKit, Google Calendar, Microsoft Calendar
- Notifications: APNs and scheduled backend jobs / cron
- Payments: Stripe subscriptions and trials
- AI logic: LLM-generated Brief, Plan, nudges, readiness explanations

## Golden Rule
Always inspect the existing implementation and identify the actual root cause before editing code.

Do not make broad rewrites. Do not change unrelated files. Do not remove existing behavior unless it is proven broken and the replacement is safer.

## Required Workflow For Every Task
1. Read the relevant files first.
2. Map the data flow before changing logic.
3. Identify whether the issue is frontend, backend, database, cron, iOS native, permission, cache, stale state, or device-level.
4. Make the smallest safe fix.
5. Preserve current API contracts and database shape unless a migration is truly required.
6. Add logs or diagnostics when the issue needs proof.
7. Run available checks: build, lint, tests, Edge Function tests, or manual verification steps.
8. Provide a final report with:
   - Root cause
   - Files changed
   - Exact fix
   - Test evidence
   - Manual QA steps
   - Regression risk
   - Rollback plan

## High-Risk Areas
Do not change these areas casually:
- Auth0 authentication and token verification
- Supabase RLS, auth helpers, or security-sensitive Edge Function code
- Stripe subscription, trial, referral, or paid-tier logic
- APNs registration, notification scheduling, cron, or device-token handling
- HealthKit permissions, freshness, or wearable signal interpretation
- Apple / Google / Microsoft calendar sync and stale-signal logic
- MRS readiness score, awaiting/baseline/refined state mapping
- Brief generation, Plan generation, LLM prompts, deterministic fallbacks, cache rules
- Onboarding and profile completion gates
- Production deployment settings and environment variables

If a change is required in a high-risk area, first explain:
- Why this area must be changed
- Which behavior is currently wrong
- What the minimal safe change is
- How it will be tested

## Forbidden Actions
Never:
- Read, print, commit, or expose `.env` values, tokens, secrets, private keys, or production credentials.
- Disable authentication or security checks to make a feature work.
- Hardcode user IDs, Auth0 IDs, test tokens, API keys, or device tokens.
- Delete Edge Functions, database tables, migrations, or major logic without proving they are unused.
- Change Stripe pricing, entitlement logic, or trial behavior without explicit approval.
- Change readiness scoring formulas unless the task explicitly requires it.
- Hide errors silently in the UI or backend.
- Force-push, rewrite Git history, or make destructive file/database changes.
- Use fake success states in the UI when backend/device state is not confirmed.

## Frontend Rules
- Preserve existing design language unless the task asks for UI changes.
- Keep web and iOS behavior separate when needed.
- For iOS bugs, check safe-area insets, fixed headers, scroll containers, viewport height, Capacitor behavior, and page mount scroll position.
- Do not patch only one profile page if the same layout issue affects all profile pages.
- Avoid adding new dependencies unless clearly necessary.
- Do not expose raw backend objects, deltas, or debug payloads in user-facing UI.

## Backend / Supabase Rules
- Preserve Edge Function request and response contracts.
- Keep structured logs for notification, calendar, readiness, and AI generation flows.
- Use migrations for schema changes. Do not directly modify production schema without a migration plan.
- Keep auth validation strict in production.
- If adding logs, avoid logging PII, tokens, secrets, full calendar content, or sensitive health data.
- Any migration must include rollback notes and impact on existing users.

## iOS / Capacitor Rules
For iOS-only issues, inspect:
- Capacitor plugin bridge behavior
- Native permission state
- App resume/background behavior
- Safe-area and viewport layout
- Scroll containers and fixed elements
- Notification registration callbacks
- Device-level notification settings
- Focus mode / Notification Summary possibility

Acceptance for iOS UI fixes:
- Page title is visible at the top
- Page opens from top, not middle
- Full page scroll works
- Sign-out button is reachable
- No screen shake during scan/navigation
- No black screen during page transitions
- Profile tab opens without noticeable lag

## Notification Debugging Rules
For notification issues, verify the full chain before marking fixed:
1. Cron is scheduled correctly.
2. Cron actually invokes the backend function.
3. Backend selects the expected user.
4. User has a valid latest APNs token.
5. Token belongs to the correct Auth0 user after login/user switch.
6. APNs request is sent.
7. APNs response is captured and logged.
8. iOS app receives foreground/background notification callbacks.
9. Device notification permission is enabled.
10. Device settings, Focus mode, or Notification Summary are not blocking delivery.

Do not conclude this is a device issue unless backend logs prove the notification was successfully sent to the correct token.

## Calendar / Wearable Rules
- Freshness matters. Stale calendar or wearable data must not be treated as fresh.
- Apple Calendar uses iOS/EventKit behavior and may differ from Google/Microsoft cloud sync.
- If the UI says connected/disconnected, it must reflect real permission/token/sync state.
- Background sync limitations on iOS must be handled honestly. Do not promise continuous background execution unless supported.
- HealthKit data must only be used when permission and freshness checks pass.

## Readiness / Brief / Plan Rules
Before changing readiness, Brief, or Plan logic, document:
1. Which Edge Function returns the data
2. Which hook consumes it
3. Which component renders it
4. Which cache/local state may override it
5. Which fallback logic exists
6. How awaiting, baseline, and refined states are handled

Rules:
- Full Read requires required fresh signals according to current business logic.
- Awaiting Signals must not leak old Plan/Brief content.
- Baseline/Early Read must not appear as Full Read.
- Deterministic fallback must not override intended LLM output unless explicitly designed.
- Do not change scoring formulas without explicit approval.

## Testing Expectations
Use the strongest available test evidence for the type of change:
- Frontend: build, lint, component/unit tests, manual UI steps
- Supabase Edge Functions: local tests, function logs, sample payload verification
- Notifications: cron logs, function logs, APNs response, device receipt evidence
- iOS: simulator/device QA, permission state, native bridge logs
- Calendar/HealthKit: permission state, freshness state, sync timestamp, UI state
- Stripe/Auth: do not test by weakening security; use safe staging/test mode only

## Final Report Format
Every completed task must end with:

```text
Root cause:

Files changed:

Fix implemented:

Test evidence:

Manual QA steps:

Regression risk:

Rollback plan:

Notes / follow-ups:
```

## Recommended Agent Prompt
Use this prompt for issue work:

```text
You are working on Mind Module.

First inspect the existing implementation and identify the true root cause before making changes.

Do not rewrite large areas.
Do not change unrelated files.
Do not change Auth0, Stripe, Supabase RLS, readiness scoring, Brief, Plan, HealthKit, Calendar, or notification logic unless directly required.

Issue:
[PASTE ISSUE HERE]

Required process:
1. Inspect relevant frontend, backend, Supabase Edge Function, Capacitor iOS, and database usage.
2. Identify whether this is frontend UI, backend API, cron, database, iOS device, permission, APNs, cache, or stale-state issue.
3. Make the smallest safe fix.
4. Add logs/diagnostics if the issue needs proof.
5. Run available tests/build checks.
6. Provide final report with root cause, files changed, exact fix, test steps, risk, and rollback plan.
```
