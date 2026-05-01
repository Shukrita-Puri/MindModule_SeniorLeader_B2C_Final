# Smart Notifications / Smart Nudges — Technical Documentation

> Last updated: 2026-03-25

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│                    pg_cron (every 15 min)                │
│              jobid: 4, smart-nudges-every-15m            │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP POST
                        ▼
┌─────────────────────────────────────────────────────────┐
│           Edge Function: smart-nudges/index.ts           │
│                   (verify_jwt=false)                     │
│                                                         │
│  1. Fetch all users with active device tokens           │
│  2. Batch-fetch profiles, preferences, recent engagement│
│  3. Per-user evaluation loop:                           │
│     a. DND / Quiet Day / Daily Cap check                │
│     b. Engagement profile + type diversity lookup       │
│     c. Priority cascade evaluation (7 types)            │
│     d. Diversity-aware sort with engagement weighting   │
│  4. Send via APNs HTTP/2 (iOS only)                     │
│  5. Log to notification_log table                       │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                 APNs (Apple Push)                        │
│  Host: api.push.apple.com (prod) /                      │
│        api.sandbox.push.apple.com (dev)                  │
│  Bundle: com.moonshot.mindmoduleapp                      │
│  Auth: ES256 JWT (APNS_P8_KEY, APNS_KEY_ID, APNS_TEAM_ID)│
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  iOS Device                              │
│  PushNotificationProvider → useDeviceTokenRegistration   │
│  usePushNotificationHandler → routes to correct screen   │
│  useNotificationEngagement (trackTap/trackDismissed)     │
└─────────────────────────────────────────────────────────┘
```

---

## Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `notification_device_tokens` | Active device tokens per user | `user_id, device_token, platform, is_active` |
| `notification_log` | Every notification sent (audit + suppression + engagement) | `user_id, notification_type, variant_id, sent_at, event_reference, payload, tapped, app_opened, target_action_completed, dismissed, time_to_engagement_seconds` |
| `notification_preferences` | Per-user toggles + time windows | `morning_anchor_enabled, pre_event_prep_enabled, evening_close_enabled, pattern_alert_enabled, state_aware_nudge_enabled, morning_window_start/end, evening_window_start/end, dnd_start/end, quiet_days[]` |

---

## Timezone Handling

The `profiles.timezone_offset` field stores the user's offset in **minutes** (e.g. IST = 330, EST = -300). This value is synced on every login/app-open via `sync-profile`.

**Log queries use timezone-corrected UTC boundaries:**
```
localMidnightMs = Date.parse(`${todayStr}T00:00:00`)
todayStartUtc   = new Date(localMidnightMs - tzOffset * 60000)
todayEndUtc     = todayStartUtc + 24h
```

This ensures the "already sent today" deduplication is accurate regardless of timezone. A separate recent-logs query (last 2 hours, no date filter) handles suppression independently, preventing midnight-crossover gaps.

---

## Daily Global Cap

**Maximum 3 notifications per user per day.** After fetching `todayLogs`, the system checks:

```
if (todayLogs.length >= 3) → skip user entirely
```

This hard-caps total notifications regardless of how many types qualify. The cap prevents notification fatigue while still allowing a healthy mix of morning + evening + one contextual nudge (e.g. pre-event or pattern alert).

---

## Notification Types — Full Logic

**Weekday Priority Order (highest → lowest):**
1. Pre-Event Prep (P1)
2. Pattern Alert (P2)
3. Morning Anchor (P3)
4. State-Aware Nudge (P4)
5. Evening Close (P5)
6. Afternoon Check-In (P6)
7. Daily Fallback (P7)

### Type 1: Pre-Event Prep (P1 — highest priority)

| Property | Value |
|----------|-------|
| **Window** | Any time |
| **Primary trigger** | `jit_event_context` row exists with `final_score >= 55`, `confidence_band != 'none'`, event starting in 30–90 min |
| **Fallback trigger** | If no `jit_event_context` data: `calendar_events` with keyword score ≥ 50, noise-filtered |
| **Data needed** | `jit_event_context` (primary), `calendar_events` (fallback), `daily_checkins` (inner tier) |
| **Suppression** | Max 3/day, dedup by `external_id`, 2-hour global |
| **Weekend** | Active (high-stakes events can happen on weekends) |
| **Engagement learning** | Subject to 50% reduction if 0 taps in 5+ sends over 7 days |
| **Variant selection** | strong/peak → PE-3, depleted/managing → PE-4, else round-robin |
| **Copy variants** | PE-1 through PE-6 |

**JIT alignment:** Pre-event nudges now use the same gate as the JIT Mastery Plan pipeline (`final_score >= 55`, `dim_a >= 10`, `dim_b >= 8`). If JIT didn't build a plan for an event, the nudge won't fire. This prevents false positives from education/learning events the user is merely attending.

**Fallback keywords** (only used when `jit_event_context` has no data): board, investor, presentation, negotiation, pitch, review, performance, strategy, stakeholder, crisis, conflict, termination, layoff, restructure, merger, acquisition, due diligence, fundraise, ipo, media, press, interview, keynote, panel, town hall, all-hands, offsite, retreat. Each match = +25 pts, threshold = 50 (requires 2+ matches). Noise filter applied (transit, logistics, admin events excluded).

**Removed from keywords:** `executive`, `workshop`, `training` — these are ambiguous (attending vs leading) and are better handled by JIT's multi-dimensional scoring.

### Type 2: Pattern Alert (P2)

| Property | Value |
|----------|-------|
| **Window** | Any time |
| **Weekend** | Active (patterns don't pause for weekends) |
| **Suppression** | Max 1/day, same pattern_type suppressed for 7 days, skip if app opened in last 4 hours |
| **Engagement learning** | Subject to 50% reduction if ineffective |

**5 pattern sub-types (checked in priority order):**

1. **Consecutive Low** — 3 days at depleted/managing → PA-1
2. **Effectiveness Milestone** — 5+ completions of a practice with avg rating ≥ 4.0/5 → PA-2
3. **Streak Milestone** — exactly 7, 14, or 30 days → PA-3
4. **Calendar Correlation** — event type appears on 5+ low-readiness days in 30 days → PA-4
5. **Recovery Deficit** — HRV ≥ 20% below baseline for 3+ consecutive days → PA-5

### Type 3: Morning Anchor (P3)

| Property | Value |
|----------|-------|
| **Window (weekday)** | `morning_window_start` (default 6) to `morning_window_end - 0.5` (default 8:30) |
| **Window (Saturday)** | 7:30 to 10:00 (shifted later) |
| **Window (Sunday)** | 8:00 to 10:30 (shifted later) |
| **Trigger** | No daily check-in exists for today |
| **Data needed** | `daily_checkins`, `calendar_events` (count), `profiles.current_streak` |
| **Weekend variants** | Used when calendar pressure is not high: MA-W1, MA-W2 |
| **Weekday variant selection** | High calendar pressure → MA-2, streak ≥ 3 → MA-5, else round-robin |
| **Copy variants** | Weekday: MA-1 through MA-6 · Weekend: MA-W1, MA-W2 |

### Type 4: State-Aware Nudge (P4)

| Property | Value |
|----------|-------|
| **Window** | 12:00 – 15:00 local time |
| **Trigger** | Morning check-in outcome is depleted/managing AND no afternoon reset completed AND ≥ 1 high-stakes event in next 4 hours |
| **Weekend** | **DISABLED** — requires structured calendar pressure |
| **Suppression** | 3-hour minimum gap, skip if app opened in 3 hours, max 1/day, must be only queued notification |
| **Copy variants** | SN-1 through SN-4 |

### Type 5: Evening Close (P5)

| Property | Value |
|----------|-------|
| **Window (weekday)** | `evening_window_start` (default 19) to `evening_window_end - 0.5` (default 21:30) |
| **Window (Sunday)** | Extended to 22:00 for week-prep nudge |
| **Trigger** | Evening ritual OR evening check-in missing |
| **Data needed** | `daily_ritual_completions`, `daily_checkins`, `calendar_events`, `energy_snapshots` (HRV) |

**Weekend-specific evening variants:**

| Day | Variants | Copy |
|-----|----------|------|
| **Friday** (dayOfWeek=5) | EC-F1, EC-F2 | "Week complete. What are you carrying into the weekend?" / "Five days behind you. Close the week before you unplug." |
| **Saturday** (dayOfWeek=6) | EC-W1 | "No agenda tonight. Just notice how you're landing." |
| **Sunday** (dayOfWeek=0) | EC-S1, EC-S2 | "Monday is mapped. Set your intention before the week begins." / "Sunday close. What do you want to carry into the new week?" |
| **Weekday (missing check-in)** | ECI-1, ECI-2 | Standard evening check-in copy |
| **Weekday (missing ritual)** | EC-1 through EC-6 | Context-aware: HRV delta ≥ 15% → EC-4, high calendar load → EC-2, streak ≥ 3 → EC-5 |

### Type 6: Afternoon Check-In (P6)

| Property | Value |
|----------|-------|
| **Window** | 12:30 – 14:30 local time |
| **Trigger** | No afternoon check-in (`time_window = 'afternoon'`) exists for today |
| **Weekend** | **DISABLED** — skipped on Saturday and Sunday |
| **Copy variants** | AC-1 through AC-3 |

### Type 7: Daily Fallback (P7)

| Property | Value |
|----------|-------|
| **Window** | 10:00 – 12:00 local time |
| **Trigger** | No other nudge qualified AND no notification sent today at all |
| **Weekend** | Active (ensures minimum 1 touch/day) |
| **Copy variants** | FB-1 through FB-3 |

---

## Weekend Rules Summary

| Rule | Weekday | Saturday | Sunday | Friday |
|------|---------|----------|--------|--------|
| Morning window | 6:00–8:30 | 7:30–10:00 | 8:00–10:30 | Standard |
| Morning variants | MA-1 to MA-6 | MA-W1, MA-W2 | MA-W1, MA-W2 | Standard |
| Afternoon check-in | ✅ Active | ❌ Disabled | ❌ Disabled | ✅ Active |
| Evening variants | EC/ECI standard | EC-W1 | EC-S1, EC-S2 | EC-F1, EC-F2 |
| Evening window | Standard | Standard | Extended to 22:00 | Standard |
| State-Aware nudge | ✅ Active | ❌ Disabled | ❌ Disabled | ✅ Active |
| Pre-Event prep | ✅ Active | ✅ Active | ✅ Active | ✅ Active |
| Pattern Alert | ✅ Active | ✅ Active | ✅ Active | ✅ Active |
| Daily Fallback | ✅ Active | ✅ Active | ✅ Active | ✅ Active |

---

## Global Suppression Rules

| Rule | Logic |
|------|-------|
| **Daily cap** | Max 3 notifications per user per day across all types |
| **2-hour cooldown** | Separate query for logs in last 2 hours (not date-filtered). Prevents midnight crossover gaps. |
| **DND** | Configurable `dnd_start`/`dnd_end` hours; wraps midnight |
| **Quiet Days** | Array of day-of-week numbers (0=Sun…6=Sat) to skip entirely. Schema supports it; no defaults set. User-configurable in NudgeSettings. |
| **Priority cascade** | When multiple qualify and suppressed, keep highest priority only (determined by time-of-day priority) |

---

## Type Diversity Guarantee

The system ensures users see a variety of notification types, not just the same ones daily.

### 3-Day Lookback
Before evaluating notifications, the system fetches the last 3 days of `notification_log` grouped by `notification_type` to build a **type frequency map**.

### Diversity-Aware Sorting
When multiple notification types qualify in the same evaluation cycle:

1. **Pre-Event always wins** — time-critical, never deprioritized
2. **Unseen types get a boost** — types not sent in 3+ days receive a `-10` priority score boost (higher priority)
3. **Effective types get a boost** — types with >50% tap rate over 7 days receive a `-5` priority score boost
4. **Time-of-day context** — base priority shifts by time window (see below)

This ensures that if Pattern Alert and Morning Anchor both qualify, the one the user hasn't seen recently gets preference.

---

## Engagement-Based Learning

The system learns from user behavior using data already captured in `notification_log`.

### 7-Day Feedback Loop

The `getUserEngagementProfile()` function queries the last 7 days of notifications and calculates:

| Metric | Calculation |
|--------|-------------|
| **Per-type tap rate** | `tapped_count / sent_count` for each `notification_type` |
| **Suppressed types** | Types sent 5+ times with 0 taps → marked for 50% reduction |

### How Suppression Works

- Types in the `suppressedTypes` list are **not fully disabled** — they fire on ~50% of qualifying occasions
- Suppression uses a deterministic hash (`userId + type + todayStr`) so it's consistent within a day but varies across days
- The `suppression_note` field in the payload logs when engagement suppression is applied, enabling debugging

### What the System Does NOT Do (by design)

- Does not fully disable any notification type (always allows 50% through to detect recovery)
- Does not adjust timing windows based on tap timing (planned for Phase 3)
- Does not cross-reference across users (per-user only)

---

## Time-of-Day Priority Shifting

Priority is **not static** — it shifts based on the user's current local time to match contextual relevance.

| Time Window | Priority Order (highest → lowest) |
|-------------|-----------------------------------|
| **Morning (6–11)** | Morning Anchor → Pre-Event → Pattern Alert → State-Aware → Evening → Afternoon → Fallback |
| **Midday (11–15)** | Pre-Event → Pattern Alert → State-Aware → Afternoon → Morning → Evening → Fallback |
| **Evening (18–22)** | Evening Close → Pattern Alert → Pre-Event → State-Aware → Morning → Afternoon → Fallback |
| **Other (15–18, 22+)** | Pre-Event → Pattern Alert → State-Aware → Afternoon → Fallback → Morning → Evening |

**Exception:** Pre-Event Prep always wins within its 30–90 min trigger window regardless of time-of-day priority, because it is inherently time-critical.

---

## Variant Round-Robin Logic

The `selectVariant()` function picks the next variant in sequence based on the last variant sent for that type (read from `todayLogs`). If no previous variant exists, it defaults to the first variant. Context-specific overrides (calendar pressure, streak, inner tier, HRV delta, weekend) take precedence over round-robin.

---

## Engagement Tracking (Client-Side)

| Hook | File | Purpose |
|------|------|---------|
| `useNotificationEngagement.trackTap(logId)` | `src/hooks/useNotificationEngagement.ts` | Records tap, calculates `time_to_engagement_seconds` |
| `useNotificationEngagement.trackActionCompleted(logId)` | same | Records target action completion |
| `useNotificationEngagement.trackDismissed(logId)` | same | Records dismissal |
| `usePushNotificationHandler` | `src/hooks/usePushNotificationHandler.ts` | Routes tapped notification to correct screen via ROUTE_MAP |

### Route Map (Push Tap → Screen)

| notification_type | Route |
|-------------------|-------|
| pre_event_prep | /executive-home |
| pattern_alert | /insights |
| morning_anchor | /daily-check-in |
| afternoon_checkin | /daily-check-in |
| evening_close | /daily-check-in |
| state_aware_nudge | /recalibrate |
| daily_fallback | /daily-check-in |

---

## Upstream Data Dependencies

| Data Source | Used By | Table |
|-------------|---------|-------|
| Check-in outcome | Pre-Event (tier), Pattern (consecutive low), State-Aware (low trigger) | `daily_checkins` |
| Calendar events | Pre-Event (scoring), Morning (pressure), Evening (load), State-Aware (pressure), Pattern (correlation) | `calendar_events` |
| Practice sessions | Pattern (effectiveness milestone) | `practice_sessions` |
| Streak | Morning (variant), Evening (variant), Pattern (streak milestone) | `profiles.current_streak` |
| HRV/Wearable | Evening (HRV variant), Pattern (recovery deficit) | `energy_snapshots` |
| Calendar classifications | Pattern (calendar correlation) | `calendar_event_classifications` |
| App opens | Pattern + State-Aware (suppression) | `user_engagements` |
| Ritual completions | Evening (missing ritual), State-Aware (no afternoon reset) | `daily_ritual_completions` |
| Notification engagement | Engagement learning (tap rates, suppression) | `notification_log.tapped, .dismissed` |

---

## Downstream Clients

| Component | File | Usage |
|-----------|------|-------|
| `SmartNudge` | `src/components/SmartNudge.tsx` | In-app nudge card UI |
| `SmartNudgeNotification` | `src/components/SmartNudgeNotification.tsx` | Lock-screen style in-app notification |
| `PushNotificationProvider` | `src/components/PushNotificationProvider.tsx` | Registers device token |
| `useDeviceTokenRegistration` | `src/hooks/useDeviceTokenRegistration.ts` | Persists token to `notification_device_tokens` |

---

## APNs Configuration

| Secret | Purpose |
|--------|---------|
| `APNS_P8_KEY` | ECDSA P-256 private key for JWT signing |
| `APNS_KEY_ID` | Key identifier from Apple |
| `APNS_TEAM_ID` | Apple Developer Team ID |
| `APNS_ENVIRONMENT` | `production` or `development` (controls APNs host) |

**Bundle ID:** `com.moonshot.mindmoduleapp`

If any APNs secret is missing, the function runs in **dry-run mode** — logs are created but no push is sent.

---

## Cron Schedule

```sql
-- pg_cron job (jobid: 4)
SELECT cron.schedule(
  'smart-nudges-every-15m',
  '*/15 * * * *',
  $$ SELECT net.http_post(...) $$
);
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-26 | **JIT alignment:** Pre-event nudges now query `jit_event_context` instead of standalone keyword scoring. If JIT didn't build a plan, no nudge fires. Fallback keyword path retains noise filter + raised threshold (50, was 25). Removed `executive`, `workshop`, `training` from fallback keywords. Fixed PE-1, PE-6, SN-3 copy to remove hardcoded duration claims ("3-min prep ready" → "Open your prep"). |
| 2026-03-25 | **Priority reorder:** State-Aware Nudge moved above Afternoon Check-In (P4 vs P6). Engagement feedback loop shortened from 14 days to 7 days for faster learning. Updated time-of-day priority tables. |
| 2026-03-25 | **Major enhancement:** Added daily global cap (max 3/day), weekend-aware morning/evening variants (Fri/Sat/Sun), disabled afternoon check-in and state-aware nudge on weekends, shifted weekend morning windows (Sat 7:30–10, Sun 8–10:30), extended Sunday evening window. Added engagement-based learning (7-day tap rate analysis, 50% suppression of ineffective types). Added type diversity guarantee (3-day lookback, least-recently-sent boost). Added time-of-day priority shifting (dynamic priority based on morning/midday/evening). |
| 2026-03-25 | Fixed timezone bug: `todayStr` log query now uses UTC-corrected boundaries. Added separate 2-hour suppression query independent of date filter. This fixes duplicate notifications and enables Pattern Alert / State-Aware nudges to fire correctly. |

---

## V8 Copy Contract — Meaning-Forward, Mind-Prep CTA (May 2026)

**Scope of V8.** V8 evolves the copy principles only. Cascade, suppression, frequency caps, slot priority, signal-strength comparator, routing, deep-links, A/B bucketing assignment, scheduling, wearable/calendar/JIT logic, and notification log schema are **unchanged**. Telemetry tags bumped to `architecture: 'cos-mind-v8-meaning-forward'` and `cta_experiment: 'cta-action-verb-v2'` so V8 traffic does not pool with V5–V7.

### The three V8 principles

1. **Lead with meaning, not the data point.** Raw metrics never lead. The first sentence translates what the data MEANS for the user's day. The number, if used, sits inside the meaning sentence (parenthetical or clause).
   - ❌ `HRV -22% today — log in to prep.`
   - ✅ `Your body's running below baseline (HRV -22%). Close the day before tomorrow loads up — log in to recalibrate your mind.`
2. **Title = state or moment. Body = context + one clear action.** Title names a moment a CEO recognises. Body delivers the so-what plus a specific in-app action.
3. **CTA always ends at a specific app screen via a "log in / check in / open" verb — and the prep is always MENTAL.** Plain `prep` is ambiguous (a CEO reads it as "prep the deck"). Every CTA must qualify the prep as MIND / STATE / RECALIBRATE / CLOSE / SET / LAND.

### V8 allowed CTA verbs (verbatim end of body)

| CTA verb | Implied screen |
|---|---|
| `log in to prep your mind` | `/executive-home` (JIT plan) |
| `log in to prep your mind tonight` | `/executive-home` (Sunday/eve, high-stakes Monday) |
| `log in to prep your state` | `/executive-home` (JIT, depleted state) |
| `log in to recalibrate your mind` | `/recalibrate` (evening recovery) |
| `check in to recalibrate` | `/recalibrate` (mid-day reset) |
| `check in to set your intention` | `/daily-check-in` (morning anchor) |
| `check in to set tomorrow` | `/daily-check-in` (Sunday close) |
| `check in to close the day` | `/daily-check-in` (evening close) |
| `check in to close the week` | `/daily-check-in` (Friday close) |
| `check in to land the weekend` | `/daily-check-in` (Saturday) |
| `open your insights` | `/insights` (pattern alerts only) |

### V8 banned verbs (added to `FORBIDDEN_WORDS_V6`)

- **Passive consumption** (presents the work as already done): `your prep is ready`, `your plan is ready`, `your brief is ready`, `see your prep`, `see your plan`, `see your readiness`, `tap to prep`.
- **Unqualified V7 prep verbs** (CEO reads as strategic prep): `open the app to prep`, `check into the app to prep`, `go to the app to prep`, `prep now`, `open the app to prep tonight`, `open the app to prep with a cool-down`.

### V8 body contract

Body MUST satisfy ALL of:
- **Meaning sentence first** — first sentence is not a bare metric (`violatesMeaningSentence`).
- **At least one named context token** — event title from ctx, numeric physiological signal with unit, countable today-state (`5 meetings`, `3 priorities`), check-in outcome word the user logged, or minutes-until / clock time for a real event (`requiresNamedContextToken`).
- **Ends with a V8 qualified mind-prep CTA verb** (verbatim, modulo trailing punctuation).
- ≤ 22 words and ≤ 140 chars (raised from V7's 16/95 — meaning-forward bodies are longer than metric-led ones).
- No forbidden words, no placeholder tokens.

Title: ≤ 6 words, no emoji, names the state/moment.
JIT prefix `From your morning Plan:` / `From your plan:` retained for plan-anchored bodies.
Pattern citation: brief, human, no percent or n.

### Gold-standard examples (used in the system prompt and as fallback shapes)

| Slot / context | Title | Body |
|---|---|---|
| Evening · 7 meetings | Evening cool-down | `Seven meetings, no real break for your mind today. Close the day before it carries into tomorrow — log in to recalibrate your mind.` |
| Evening · HRV deficit | Recovery in progress | `Your body's running below baseline (HRV -22%). Close the day with a short reset before tomorrow loads up — log in to recalibrate your mind.` |
| Morning · yesterday depleted + heavy day | Starting from where you are | `Yesterday was heavy and today has 5 meetings ahead. Manage your energy instead of reacting to it — check in to set your intention.` |
| Morning · JIT board in 60m | Preparing mental performance | `Board Review in an hour. Walk in with the edge, not the anxiety — log in to prep your mind.` |
| Afternoon · morning was low | Mid-day reset window | `Your morning state was low and the afternoon is still ahead. This is the recovery window — check in to recalibrate.` |
| Afternoon · 3 more meetings | Recalibrating mid-day | `Halfway through with three more meetings ahead. Stay sharp instead of running on fumes — check in to recalibrate.` |
| Pre-event · investor 60m | You're ready for this | `Investor Update in an hour. Your mental prep is built for exactly this moment — log in to prep your mind.` |
| Pre-event · board 45m, depleted | Managing the moment | `Board Review in 45 minutes and you're running low. Short, sharp, built for right now — log in to prep your state.` |
| Friday close | Week complete | `Five heavy days behind you. Close the week before you disconnect so it doesn't bleed into the weekend — check in to close the week.` |
| Sunday · heavy Monday | Monday is already mapped | `Tomorrow opens with Board Review and a full calendar. Three minutes of clarity tonight beats two hours of catch-up — check in to set tomorrow.` |
| Sunday · high-stakes Monday | Big Monday — pre-loading now | `Tomorrow opens with a high-stakes moment. Wake up ahead instead of behind — log in to prep your mind tonight.` |
| Saturday · low HRV | The body's still catching up | `Recovery from the week isn't instant — your HRV is still below baseline. A short check-in tells you what kind of weekend you actually need — check in to land the weekend.` |
| Pattern · 3 days in red | Three days in the red | `You've been running depleted for three days in a row. That's a pattern worth looking at, not pushing through — open your insights.` |

### V8 A/B variant arms (`cta-action-verb-v2`)

| Arm | Brief route (`/daily-check-in`, `/recalibrate`, `/insights`) | Plan route (`/executive-home`) |
|---|---|---|
| **A** control | `check in to set your intention` | `log in to prep your mind` |
| **B** state | `check in to recalibrate` | `log in to prep your state` |
| **C** urgency | `log in to recalibrate your mind` | `log in to prep your mind` |
| **D** close | `check in to close the day` | `check in to close the week` |

### Verification (per-deploy)

1. `supabase--test_edge_functions` on `smart-nudges` — V8 contract tests pass.
2. Dry-run POST across N1/N2/N3 slots; confirm `payload.architecture === 'cos-mind-v8-meaning-forward'` and `payload.cta_experiment === 'cta-action-verb-v2'`.
3. Tail edge logs for one cron tick — zero `[smart-nudges v8] Rejected AI copy` lines expected; if any, refine prompt examples and redeploy.
4. SQL spot-check on the last 10 V8 `notification_log` rows — every body contains a named token, every body's first sentence is a meaning sentence (not a bare metric), every body ends in one of the 11 V8 verbs.

### Changelog

| Date | Change |
|------|--------|
| 2026-05-01 | **V8 copy evolution.** Renamed contract to "Meaning-Forward, Mind-Prep CTA". `violatesCopyContractV7 → violatesCopyContractV8` (adds `requiresNamedContextToken` + `violatesMeaningSentence`, raises ceilings to 22 words / 140 chars). `ALLOWED_CTA_VERBS_V7 → ALLOWED_CTA_VERBS_V8` (qualified mind-prep verbs only). `FORBIDDEN_WORDS_V6` extended with V7 unqualified-prep verbs and V8 passive-consumption verbs. `CTA_PHRASES` rewritten for the 4 V8 arms. System prompt rewritten with the three principles, the gold-standard examples above, and explicit "this is a mental-performance system; `prep` always means mental prep" instruction. Static fallback library rewritten one-for-one to the V8 shape. Telemetry bumped: `architecture='cos-mind-v8-meaning-forward'`, `cta_experiment='cta-action-verb-v2'`. **Scope:** copy/principle only — cascade, suppression, frequency, routing, scheduling unchanged. |
