# Verify Smart Nudges is wired to real accounts (no rebuild)

## What the checks already show

Smart Nudges is not a test-only path. It is already connected to live accounts:

- The scheduled job `smart-nudges-every-15m` is active and runs every 15 minutes against the live backend.
- The most recent runs each processed **14 real users** (not a forced single-user probe), and the 16:00 London run today sent 4 notifications successfully, 0 failures.
- Shukrita's account (`shukrita@mindmodule.me`, Europe/London) has **2 active devices** registered, last refreshed today, and all her notification channels are switched on.
- She has been receiving real notifications on working days: morning and evening nudges on 1, 2, 3 and 4 September, and the week-ahead invite today (Sunday) at 16:00 London, marked delivered.

So nothing needs re-plumbing. Two things are worth confirming rather than assuming:

1. **Saturday 5 September produced no nudge.** Every evaluation that day recorded either "nothing qualified" or "not in the week-ahead window" — the old behaviour, before today's light-day change. The new light-day cadence only went live at 16:05 London today, so it has not yet had a Saturday to act on.
2. **The new light-day path has never executed in production.** No run has recorded a light-day decision yet, because the first evaluation after deployment had not happened at the time of checking.

## Plan

### 1. Confirm the light-day path fires on live data
Run the evaluator against Shukrita's live account in diagnostic mode (evaluates and records the decision, sends nothing). Read back the recorded decision and confirm it names: whether today counts as a light day, which kind, the chosen send window, and why. Today is Sunday — the last day of the weekend — so the correct recorded outcome is *not* a light day and the week-ahead behaviour retained, which itself confirms the "last day keeps existing behaviour" rule.

### 2. Confirm tomorrow's and next Saturday's behaviour before waiting for them
Run the same diagnostic with the clock pointed at a Saturday and at a quiet weekday, and check the recorded decision is a single nudge at the expected hour (evening / 17:00 for her, because her sign-up timing choice is "let the system decide"). This proves the rule without waiting a week for real calendar days.

### 3. Confirm nothing blocks her upstream
Check she is not caught by any earlier gate on a light day: the weekend-signals preference, the do-not-disturb window, the once-every-two-hours suppression, and the per-window one-send rule. Confirm each records the expected verdict on a light day rather than silently dropping her.

### 4. Fix only what the checks expose
No code changes are planned up front. If a check shows a gate still swallowing the light-day send, fix that single gate and re-run the same check.

### 5. Live confirmation
Next Saturday, read back her record and confirm exactly one notification was sent at the expected time and reached the device.

## Technical notes

- Diagnostic runs use the admin-guarded `force_user` route with dry-run, so no push reaches her device and the delivery counters stay clean.
- Evidence comes from the evaluator trace records, which already capture the light-day verdict, kind, target window and reason added in the last change.
- Her sign-up timing preference is unset, which correctly resolves to "system decides" and therefore the evening slot.
- Her home country is unset, so the weekend defaults to Saturday/Sunday — correct for London. The Israel/Gulf Friday–Saturday variant is exercised separately with a test account, not by changing her record.
