# Mind Module Project Memory

## Product Summary
Mind Module is an executive self-mastery app that prepares users before important moments by combining calendar context, wearable signals, check-ins, readiness state, Brief, Plan, nudges, and AI-generated guidance.

The product promise is not just tracking. It should act like a mental performance system / chief of staff for the mind: reading the user's day, state, patterns, and upcoming moments, then preparing them before it matters.

## Core Stack
- Frontend: React / Lovable
- Backend: Supabase database and Edge Functions
- Mobile: Capacitor iOS app
- Auth: Auth0
- Wearables: Apple HealthKit
- Calendar: Apple Calendar / EventKit, Google Calendar, Microsoft Calendar
- Notifications: APNs, scheduled backend jobs / cron
- Payments: Stripe
- AI: LLM-generated Brief, Plan, nudges, and readiness-related guidance

## Important Product Rules
- Mind Module must feel reliable, calm, and executive-grade.
- User-facing output should not expose raw backend objects or internal debug structures.
- Fixes should be root-cause-first and minimal, not broad rewrites.
- Signal freshness is critical. Stale data should not be presented as current.
- UI should clearly explain missing signals instead of showing misleading readiness or Plan content.
- Existing business rules should be preserved unless the task explicitly asks for a product change.

## Auth / User Rules
- Auth0 is used for login/authentication.
- Production auth checks must stay strict.
- Do not use development user headers or hardcoded user IDs in production.
- Device tokens, calendar tokens, and wearable state must stay linked to the correct logged-in user.
- On logout/user switch, stale user-specific data must not leak into the next session.

## Subscription Rules
- Stripe handles subscription access.
- Trialing users are treated as paid-tier where already implemented.
- Existing monthly/annual pricing and referral logic must not be changed without explicit approval.
- Subscription gates should not be bypassed from frontend only.

## Readiness / MRS Rules
- Readiness state must correctly distinguish awaiting, baseline, and refined states.
- Full Read should only appear when required fresh signals are available according to current logic.
- Baseline/Early Read must not be shown as Full Read.
- Awaiting Signals should be used when required signals are missing or stale.
- Check-in-only or stale wearable/calendar cases must not incorrectly produce a full readiness experience.
- Frontend labels must match backend readiness state.

## Brief Rules
- Brief should follow the intended LLM direction when LLM path is required.
- Deterministic fallback should not override intended LLM output unless explicitly designed.
- Awaiting state should not show misleading full Brief content.
- Cached Brief content must not leak into an awaiting or stale-signal state.
- User-facing Brief copy should be clean, calm, and not expose implementation details.

## Plan Rules
- Plan should respect readiness state, signal freshness, and the 24-hour rule where applicable.
- Plan content should not leak when the app is awaiting required signals.
- Old cached Plan content must not appear as if it is current.
- Plan slot composition and selectors should preserve existing business logic unless a specific change is requested.
- Do not change Plan scoring or prioritization formulas without approval.

## Wearable / HealthKit Rules
- HealthKit is currently the primary wearable source.
- HealthKit permission and freshness must be verified before wearable data affects readiness.
- Stale wearable data must not be treated as fresh.
- App should clearly communicate when wearable data is missing, stale, or not connected.
- Background refresh behavior on iOS must be handled realistically because iOS may limit continuous background execution.

## Oura Rules
- Oura should not be shown as connectable unless the actual integration and connect flow are available.
- If Oura UI is present, it must include a working connect button and sync path.
- If Oura is not supported in the current product scope, UI should not mislead users into thinking it can be connected.

## Calendar Rules
- Apple Calendar uses iOS/EventKit.
- Google Calendar and Microsoft Calendar use cloud integration flows.
- The iOS integration screen should clearly show Apple, Google, and Microsoft options where required.
- Connected/disconnected UI must reflect real permission, token, and sync state.
- Calendar freshness and last sync timestamp must be accurate.
- Calendar sync bugs should be investigated separately for Apple iOS, Google, and Microsoft.
- Stale calendar data must not drive current readiness/Plan decisions as if fresh.

## Notification Rules
- Notifications use APNs for iOS delivery.
- Notification diagnosis must verify the full chain: cron, backend function, user eligibility, APNs token, APNs response, app receipt, and device settings.
- A successful backend send does not automatically prove device receipt.
- A missing device receipt does not automatically prove backend failure.
- Device-level settings such as notification permission, Focus mode, and Notification Summary may block visible delivery.
- Test push should confirm latest APNs token, correct Auth0 user linkage, APNs response, and device receipt where possible.

## iOS UI / Profile Rules
Current iOS-sensitive areas:
- Profile pages may cut off headlines if safe-area/header handling is wrong.
- Profile pages must open at the top, not in the middle.
- Profile pages must be fully scrollable, including sign out button.
- Profile tab from home should not lag.
- Scan/navigation should not shake the screen.
- Page transitions should not show black screen.

For any iOS layout fix, check safe-area, viewport height, scroll containers, fixed headers/footers, Capacitor behavior, and page mount scroll reset.

## Known Recent Client Issues
- Notifications still not received by client.
- Sunday week-ahead notification traceability needs checking in DB/logs.
- Remote test push was sent but not received on the device.
- Need to verify whether notification issue is cron setup, backend, APNs, or device-level.
- Oura slab/page does not have a connect button on iOS, so user cannot connect or sync.
- Apple Calendar clicked/connected but still not showing correctly on iOS.
- iOS integration page should mirror web more clearly with Google, Microsoft, and Apple calendar options.
- Profile section pages on iOS cut off headlines.
- Some profile pages are not scrollable enough; sign out is not reachable.
- Profile pages may open mid-page instead of top.
- Purple Profile button on home lags on iPhone.
- Some page transitions show black screen.
- Scan feature in Customer and Customer Due List shakes after update.

## Recent Technical Decisions / Notes
- Use a root-cause-first workflow for all fixes.
- Use Lovable for suitable UI-level changes, but deeper logic should follow stricter agent rules.
- Add `AGENTS.md` or `CLAUDE.md` for coding-agent behavior.
- Add `PROJECT_MEMORY.md` so product decisions, known issues, and business rules persist across sessions.
- For notifications, do not assume frontend issue until cron/backend/APNs/device chain is checked.
- For iOS issues, inspect native/mobile layout behavior and not only web CSS.

## Recommended Debug Checklist: Notifications
For notification issues, collect evidence for:
1. Cron schedule exists and runs at expected time.
2. Backend function receives the cron call.
3. Notification rule selects the expected user.
4. User has a valid latest APNs token.
5. Token belongs to the correct current Auth0 user.
6. APNs request is sent.
7. APNs response is success/failure and logged.
8. iOS app receives foreground/background callbacks.
9. Device notification permissions are enabled.
10. Focus mode / Notification Summary / device settings are not suppressing alerts.

## Recommended Debug Checklist: Calendar
For calendar issues, collect evidence for:
1. Which provider is affected: Apple, Google, Microsoft.
2. Permission/token state.
3. Last successful sync timestamp.
4. Backend sync state if provider is cloud-based.
5. iOS native EventKit state if Apple Calendar.
6. Whether UI connected/disconnected state matches real state.
7. Whether stale calendar data is being displayed.
8. Whether app resume/background behavior affects sync.

## Recommended Debug Checklist: Readiness / Brief / Plan
Before fixing readiness, Brief, or Plan:
1. Identify backend function returning data.
2. Identify frontend hook consuming data.
3. Identify component rendering data.
4. Check cache/local state override.
5. Check awaiting/baseline/refined mapping.
6. Check stale wearable/calendar/check-in logic.
7. Check deterministic fallback versus LLM output.
8. Confirm no raw backend objects are rendered.

## Standard Final Report Expected From AI Coding Tool
For every completed fix, report:

```text
Root cause:

Files changed:

Fix implemented:

Test evidence:

Manual QA steps:

Regression risk:

Rollback plan:

Open questions / follow-ups:
```

## Notes For Future Updates
Keep this file short and practical. Add only decisions and facts that will help future coding sessions. Remove outdated notes when they are no longer true.
