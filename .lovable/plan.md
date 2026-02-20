
# Add Phase 2 Scaffolding to Smart Nudges Edge Function

## What This Does

Adds the complete logic for **Pattern Alert (Type 4)** and **State-Aware Nudge (Type 5)** into the existing `smart-nudges` edge function as documented, production-ready code -- but clearly marked as **Phase 2** with comments explaining these activate naturally as users accumulate data. No feature flags or artificial gates needed; the trigger conditions themselves (3 consecutive low days, 5+ practice completions with 80%+ effectiveness, 7-day streaks, etc.) inherently require sufficient user history before they can fire.

## Changes to `supabase/functions/smart-nudges/index.ts`

### 1. New copy variant functions (added after existing variant functions, ~line 90)

**`getPatternAlertVariants(ctx)`** -- 5 variants:
- PA-1: "Day 3 at [tier]. Your system is showing a pattern worth noticing."
- PA-2: "[Practice name] works for you -- 80% followed by stronger days."
- PA-3: "[N] days. Your practice is becoming a rhythm." (7/14/30 milestones)
- PA-4: "[Event type] consistently drain you. That pattern is worth naming."
- PA-5: "Your HRV has been low for 3 days. Recovery is the priority."

**`getStateAwareVariants(ctx)`** -- 4 variants:
- SN-1: "[N] high-stakes events ahead. 5-min reset available now."
- SN-2: "You started low. The afternoon is heavy. Recalibrate first."
- SN-3: "Afternoon Reset: [practice name]. 3 min."
- SN-4: "[Next event title] in 90 min. Reset now or push through?"

### 2. Pattern Alert evaluation block (inserted after Pre-Event Prep, before Morning Anchor)

Checks five independent pattern detectors in sequence. First match wins (max 1 per day):

| Pattern | Data Source | Query |
|---|---|---|
| Consecutive low state (3 days) | `daily_checkins` | Last 3 checkins by date desc, all outcome = depleted/managing |
| Effectiveness milestone | `practice_sessions` | Group by content_id over 30 days, find any with 5+ completions and avg effectiveness_rating >= 4 |
| Streak milestone (7/14/30) | `profiles.current_streak` | Already available in batch-fetched profile data |
| Calendar correlation | `calendar_event_classifications` + `daily_checkins` | Join over 30 days, find event_type with 5+ low-readiness correlations |
| Recovery deficit | `energy_snapshots` | Last 3 snapshots by date desc, all with HRV >= 20% below baseline |

**Suppression rules:**
- Skip if user opened app in last 4 hours (query `user_engagements` for recent `app_open` events)
- Skip if same pattern type was sent in last 7 days (query `notification_log`)
- Max 1 pattern alert per day

### 3. State-Aware Nudge evaluation block (inserted after Evening Close, lowest priority)

All conditions must be true:
- Local time is 12:00--15:00
- Morning check-in exists today with outcome = `depleted` or `managing`
- Afternoon has high calendar pressure (3+ high-stakes events in next 4 hours)
- No app open in last 3 hours (query `user_engagements`)
- No `state_aware_nudge` already sent today
- No afternoon reset practice completed today (query `daily_ritual_completions` for afternoon session)

Variant selection: SN-1 if 3+ high-stakes events, SN-4 if a specific event 60-120 min away, SN-2 as default.

### 4. Updated priority cascade (line ~438)

Change from:
```
['pre_event_prep', 'morning_anchor', 'evening_close']
```
to:
```
['pre_event_prep', 'pattern_alert', 'morning_anchor', 'evening_close', 'state_aware_nudge']
```

State-Aware Nudge gets stricter suppression: only sends if no other notification fired in last **3 hours** (vs 2-hour general rule).

## No Database Changes Needed

The `notification_preferences` table already has `pattern_alert_enabled` and `state_aware_nudge_enabled` columns (both default `true`). The `notification_log` table accepts any `notification_type` string. All source tables (`daily_checkins`, `practice_sessions`, `energy_snapshots`, `calendar_event_classifications`, `user_engagements`, `profiles`) already exist.

## Why No Artificial Gate Is Needed

The trigger thresholds themselves are the gate:
- A new user cannot have 3 consecutive low-state days until day 3+
- Effectiveness milestones require 5+ practice completions with ratings
- Streak milestones require 7+ days of usage
- Calendar correlations require 5+ occurrences of the same pattern
- Recovery deficit requires 3+ days of wearable data
- State-Aware Nudge requires a completed morning check-in + calendar data

These conditions will naturally return empty/false for new users, so the code runs but produces no notifications until sufficient data exists.
