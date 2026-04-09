# Smart Nudges — Architecture Document

> Last updated: 2026-04-09  
> Replaces: `SMART_NUDGES_TECHNICAL_DOCUMENTATION.md`

---

## 1. System Overview

```text
┌───────────────────────────────────────────────────────────────┐
│                  pg_cron (every 15 min)                        │
│           jobid: 4, smart-nudges-every-15m                    │
└──────────────────────┬────────────────────────────────────────┘
                       │ HTTP POST (no auth — cron-invoked)
                       ▼
┌───────────────────────────────────────────────────────────────┐
│            Edge Function: smart-nudges/index.ts                │
│                    (verify_jwt=false)                          │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 1. FETCH USERS                                          │  │
│  │    notification_device_tokens → user list                │  │
│  │    profiles, notification_preferences, user_engagements  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                       │                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 2. PER-USER: SUPPRESSION STACK                          │  │
│  │    Quiet hours (22:00-06:30) → DND → Quiet days →       │  │
│  │    Daily cap (3) → 2h cooldown → 30min app-open →       │  │
│  │    In-meeting check                                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                       │                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 3. SIGNAL ASSEMBLY: buildNudgeContext()                 │  │
│  │    13 parallel DB queries → NudgeContext object          │  │
│  │    + 1 dependent query (coach_session_summaries)         │  │
│  │    + Signal Richness Gate (new)                          │  │
│  └─────────────────────────────────────────────────────────┘  │
│                       │                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 4. PRIORITY CASCADE: P0 → P7                            │  │
│  │    Each evaluator checks its own time window, triggers,  │  │
│  │    and per-type suppression rules                        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                       │                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 5. AI COPY GENERATION                                   │  │
│  │    Gemini-2.5-flash-lite via Lovable AI Gateway          │  │
│  │    System prompt → per-type user prompt → JSON parse     │  │
│  │    Post-generation validation gate (new)                 │  │
│  │    Fallback: static copy variants                        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                       │                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 6. ENGAGEMENT LEARNING                                  │  │
│  │    7-day tap rate → per-type suppression (50%)           │  │
│  │    Type diversity (3-day lookback)                       │  │
│  └─────────────────────────────────────────────────────────┘  │
│                       │                                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 7. DELIVERY                                             │  │
│  │    notification_log INSERT → APNs HTTP/2 push            │  │
│  │    Deep link route in payload                            │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────────────────────┐
│                   APNs (Apple Push)                            │
│  Host: api.push.apple.com (prod) /                            │
│        api.sandbox.push.apple.com (dev)                       │
│  Bundle: com.moonshot.mindmoduleapp                            │
│  Auth: ES256 JWT (APNS_P8_KEY, APNS_KEY_ID, APNS_TEAM_ID)    │
└──────────────────────┬────────────────────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────────────────────┐
│                    iOS Device                                  │
│  PushNotificationProvider → useDeviceTokenRegistration         │
│  usePushNotificationHandler → deep link to correct screen      │
│  useNotificationEngagement → trackTap / trackDismissed         │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Upstream Data Sources

All queries execute in `buildNudgeContext()` via `Promise.all()`.

| # | Table | What It Provides | Key Columns Used |
|---|-------|------------------|------------------|
| 1 | `calendar_events` | Today's & tomorrow's meetings | `title, start_time, end_time, external_id, is_organizer, attendees_count` |
| 2 | `wearable_data` | Latest biometrics + 30-day baseline | `hrv, resting_heart_rate, sleep_score, total_sleep_minutes, summary_date` |
| 3 | `energy_snapshots` | Today's energy snapshot | `oura_readiness, computed_data.hrv_delta_pct` |
| 4 | `coach_accountability_tracker` | Pending commitments | `commitment_text, committed_at, check_in_due_date, status, pattern_area, meta_skill` |
| 5 | `coach_pattern_observations` | Active patterns (top 5) | `pattern_description, pattern_area, observation_count` |
| 6 | `dialogue_sessions` | Coach sessions in last 7 days | `id, started_at, session_title, flow_type` |
| 7 | `coach_session_summaries` | Key topics & commitments from sessions | `session_id, key_topics, commitments_made` |
| 8 | `daily_checkins` | Today's check-ins + 30-day history | `outcome, time_window, timestamp, checkin_date` |
| 9 | `daily_ritual_completions` | Today's practice completions | `recommended_practice_ids, completed_practice_ids, session_period` |
| 10 | `jit_event_context` | JIT-qualified events (30-90 min, score ≥ 55) | `id, event_title, event_start, final_score, confidence_band` |
| 11 | `practice_sessions` | 30-day practice history (for correlation) | `completed_at, completed, content_id` |
| 12 | `notification_device_tokens` | Active device tokens per user | `user_id, device_token, platform, is_active` |
| 13 | `notification_log` | Today's + 2h suppression logs | `notification_type, variant_id, sent_at, event_reference` |
| 14 | `notification_preferences` | Per-user toggles + DND + quiet days | `morning_anchor_enabled, pre_event_prep_enabled, dnd_start, dnd_end, quiet_days[]` |
| 15 | `profiles` | Timezone, streak | `id, current_streak, timezone_offset` |
| 16 | `user_engagements` | Recent app opens (4h) | `user_id, event_type, timestamp` |

---

## 3. NudgeContext — Signal Assembly

`buildNudgeContext()` produces a single `NudgeContext` object per user containing:

### 3.1 Calendar Signals
- `todayEvents`, `tomorrowEvents` — raw calendar events
- `nonNoiseEvents` — noise-filtered (transit, logistics, placeholders removed)
- `highStakesEvents` — keyword-scored ≥ 25 (board, investor, pitch, etc.)
- `calendarGaps` — ≥ 20 min gaps between events with post-gap analysis
- `dayType` — `light` (<3), `moderate` (3-5), `heavy` (6-7), `extreme` (8+)
- `inMeetingNow` — boolean, for in-meeting suppression

### 3.2 Wearable Signals
- `sleepScore`, `hrv`, `rhr` — latest values
- `hrvBaseline30d`, `rhrBaseline30d` — 30-day rolling averages
- `hrvDeltaPct` — `((latest - baseline) / baseline) * 100`
- `rhrElevated` — `true` if RHR > baseline * 1.10
- `hasWearableData` — **boolean gate** (true only if `wearable_data` has a row)

### 3.3 Coach Signals
- `pendingCommitments` — with overdue day count, pattern area, meta-skill
- `activePatterns` — top 5 by observation count
- `stressSignals` — extracted from session summary `key_topics`
- `lastSessionAt`, `sessionsIn7d` — recency and frequency

### 3.4 Check-in Signals
- `morningCheckinOutcome`, `afternoonCheckinOutcome` — today's outcomes
- `checkinCountToday` — total check-ins today
- `lastCheckinTime` — for recency suppression

### 3.5 Performance Correlations (30-day)
- `coachSessionReadinessLift` — % outcome lift on days after coach sessions
- `practiceCompletionCorrelation` — % outcome lift on days after practice

### 3.6 Derived Signals
- `currentStreak` — from profiles
- `lastAppOpen` — from user_engagements
- `hrvDeltaPctFromSnapshot` — from energy_snapshots (may differ from wearable calc)

---

## 4. Signal Richness Gate

**Problem solved**: Without sufficient real signals, the system either sends generic productivity copy or the LLM fabricates data (e.g., "HRV down 40%" when no wearable is connected).

### Signal Counting

```
hasCalendar = nonNoiseEvents.length > 0
hasWearable = hasWearableData (boolean — true only if wearable_data has rows)
hasCheckin  = checkinCountToday > 0
hasCoach    = pendingCommitments.length > 0 || sessionsIn7d > 0
signalCount = [hasCalendar, hasWearable, hasCheckin, hasCoach].filter(Boolean).length
```

### Gating Rules

| Priority | Type | Gate | Rationale |
|----------|------|------|-----------|
| P0 | `morning_prep` | **Exempt** | Purpose is to prompt the first signal (check-in) |
| P1 | `pre_event_prep` | **Exempt** | Calendar-driven; requires JIT qualifying event |
| P2 | `calendar_gap` | **Exempt** | Calendar-driven; gap detection is self-gating |
| P3 | `coach_meeting_match` | **Exempt** | Coach-driven; requires commitment + event match |
| P4 | `state_aware_nudge` | **Gated: signalCount ≥ 2** | Needs check-in + calendar minimum |
| P5 | `evening_close` | **Gated: signalCount ≥ 2** | Needs meaningful signals to reflect on |
| P6 | `pattern_alert` | **Gated: signalCount ≥ 2** | Pattern detection requires multi-source data |
| P7 | `daily_fallback` | **Gated: signalCount ≥ 2** | No point in generic nudge without data |

When suppressed: `[smart-nudges] User ${userId}: ${signalCount} signals — suppressing P4-P7`

---

## 5. Priority Cascade (P0–P7)

### P0: Morning Preparation (`morning_prep`)
- **Window**: Weekday 6:30-9:30, Sat 7:30-10:00, Sun 8:00-10:30
- **Adaptive timing**: Window shifts based on first event start time + commute buffer
- **Trigger**: No morning check-in exists
- **Suppression**: Skip if first event < 30 min away; dedup by type
- **Deep link**: `/daily-check-in`

### P1: JIT Pre-Event (`pre_event_prep`)
- **Window**: Any time (event-driven)
- **Primary trigger**: `jit_event_context` row with `final_score ≥ 55`, event in 30-90 min
- **Fallback trigger**: Calendar event with keyword score ≥ 50 (requires 2+ matches)
- **Suppression**: Dedup by `external_id`; overrides 2h cooldown (time-critical)
- **Deep link**: `/executive-home`

### P2: Calendar Gap (`calendar_gap`)
- **Window**: During a gap (5 min into gap until gap ends)
- **Trigger**: ≥ 20 min gap AND post-gap has ≥ 2 meetings or high-stakes
- **Suppression**: Skip if checked in within 90 min; skip if in meeting
- **Deep link**: `/daily-check-in`

### P3: Coach Commitment + Meeting Match (`coach_meeting_match`)
- **Window**: Any time (event-driven)
- **Trigger**: Semantic match between pending commitment keywords and upcoming event title (45-240 min out)
- **Also checks**: Stress signals from coach session topics vs upcoming events
- **Suppression**: Skip if coach session today; skip if coach opened in 2h
- **Deep link**: `/self-mastery-coach`

### P4: State-Aware Afternoon (`state_aware_nudge`)
- **Window**: 12:00-15:00 weekdays only
- **Trigger**: Morning check-in = depleted/managing AND ≥ 1 afternoon high-stakes event
- **Suppression**: Skip weekends; skip if app opened in 3h
- **Signal gate**: Requires signalCount ≥ 2
- **Deep link**: `/executive-home`

### P5: Evening Close (`evening_close`)
- **Window**: Weekday 19:00-21:30, Friday 18:30-22:00, Sunday 18:00-22:00
- **Trigger**: Evening ritual or check-in missing
- **Guards**: Skip if `checkinCountToday ≥ 2` or `afternoonCheckinOutcome` exists; skip after 21:30
- **Signal gate**: Requires signalCount ≥ 2
- **Weekend variants**: Friday (close-the-week), Saturday (no-agenda), Sunday (week-prep)
- **Deep link**: `/daily-check-in`

### P6: Pattern Alert (`pattern_alert`)
- **Window**: Any time
- **Sub-types** (checked in order):
  1. **Feature Performance** — coach session readiness lift > 20% + upcoming high-stakes + no recent coach session
  2. **Consecutive Low** — 3 days at depleted/managing
  3. **Recovery Deficit** — HRV ≥ 20% below baseline for 3+ days
  4. **Streak Milestone** — exactly 7, 14, or 30 days
- **Suppression**: Same pattern_type suppressed for 7 days; skip if app opened in 4h
- **Signal gate**: Requires signalCount ≥ 2
- **Deep link**: `/insights`

### P7: Daily Fallback (`daily_fallback`)
- **Window**: 10:00-12:00
- **Trigger**: No other nudge qualified AND no notification sent today
- **Signal gate**: Requires signalCount ≥ 2
- **Deep link**: `/executive-home`

---

## 6. AI Copy Generation Pipeline

### 6.1 Model & Infrastructure
- **Model**: `google/gemini-2.5-flash-lite` via Lovable AI Gateway
- **Timeout**: 6 seconds (abort controller)
- **Fallback**: If AI fails or is unavailable, static copy variants are used

### 6.2 System Prompt
```
You are writing push notifications for a C-suite leader's performance coaching app.
Rules:
- Title: max 5 words, no emoji
- Body: max 15 words, performance-oriented tone
- NEVER use: wellness, mindfulness, relax, well done, great job, amazing
- For evenings/weekends: use softer, permission-to-stop tone – but still reference specific signals
- Every nudge must reference something specific (a meeting title, a number, a commitment, a state)
- If a signal is null, skip it – never fabricate data
- Return ONLY valid JSON: {"title":"...","body":"..."}
```

### 6.3 Data Validation Gates (Fabrication Prevention)

**Problem**: The LLM ignores "unavailable" signals and fabricates numbers (e.g., "HRV down 40%").

**Solution — 3 layers**:

1. **Omission** (primary): When `hasWearableData === false`, wearable signal lines are **entirely omitted** from the user prompt. No "unavailable" string — no line at all. The LLM cannot fabricate what it doesn't see.

2. **Per-field omission**: When individual fields are null (e.g., `sleepScore` null but HRV exists), only that specific line is omitted.

3. **Post-generation validation** (safety net): After parsing AI JSON, scan `body` for fabrication indicators when `hasWearableData === false`:
   - `/\d+%/` — percentage patterns ("down 40%")
   - `/\d+\s*ms/i` — HRV millisecond patterns ("45ms")
   - `/below baseline|above baseline/i` — baseline references
   - `/your HRV|recovery score/i` — wearable metric references
   
   If any match found AND `hasWearableData === false` → reject AI copy → use static fallback.

### 6.4 Per-Type User Prompts

Each nudge type builds a specific user prompt with only available signals. Examples:

- **morning_prep**: First event name/time, day type, high-stakes events, wearable signals (if available)
- **jit_pre_event**: Event name, minutes until, current state, day type
- **calendar_gap**: Gap duration, next meeting, post-gap load
- **coach_meeting_match**: Commitment text, meeting title, minutes until
- **evening_close**: Meeting count, high-stakes, weekend/day-specific tone guidance
- **pattern_alert**: Pattern description, pattern type
- **daily_fallback**: Best available signal (high-stakes > sleep > day type > streak)

### 6.5 Static Fallback Variants

When AI copy is unavailable or rejected by validation:

| Function | Variants | Signal-Aware Logic |
|----------|----------|-------------------|
| `getFallbackMorningCopy` | Recovery, High-stakes, Heavy, Weekend, Calendar-aware default | Sleep < 60 → recovery; high-stakes → name event; heavy → count; weekend → permission |
| `getFallbackJitCopy` | Single variant | Always names event + minutes |
| `getFallbackGapCopy` | Single variant | Always names duration + next event |
| `getFallbackCoachMatchCopy` | Single variant | Names commitment + meeting |
| `getFallbackEveningCopy` | Sun-stakes, Sun-count, Sun-default, Fri, Sat, RHR (gated), Heavy, Default | Day-specific tone; RHR variant only if `hasWearableData` |
| `getFallbackPerformanceStateCopy` | Feature (gated), State-aware | Feature only if `coachSessionReadinessLift !== null` |
| `getFallbackDailyFallbackCopy` | High-stakes, Calendar-count, Open-day | Names event or count; no generic "Take 30 seconds" |

---

## 7. Suppression Stack

Evaluated in order; first match skips the user or nudge type.

| # | Rule | Logic | Scope |
|---|------|-------|-------|
| 1 | **Quiet hours** | `localTime ≥ 22.0 OR localTime < 6.5` | Global — skip user |
| 2 | **DND** | Configurable `dnd_start`/`dnd_end` (wraps midnight) | Global — skip user |
| 3 | **Quiet days** | Array of day-of-week numbers to skip | Global — skip user |
| 4 | **Daily cap** | Max 3 notifications per user per day | Global — skip user |
| 5 | **2-hour cooldown** | Separate query for logs in last 2h | Global — skip all except P1 (JIT) |
| 6 | **30-min app-open** | `user_engagements.app_open` within 30 min | Combined with 2h cooldown |
| 7 | **In-meeting** | Current time falls within a calendar event | Per-nudge (checked in context) |
| 8 | **Engagement learning** | 7-day tap rate: 5+ sends with 0 taps → 50% suppression | Per-type |
| 9 | **Per-type dedup** | `alreadySentTypes` set from today's logs | Per-type |
| 10 | **Event dedup** | `sentEventRefs` set prevents same event ref | Per-event (P1) |
| 11 | **Signal richness gate** | `signalCount < 2` suppresses P4-P7 | Per-type group |

---

## 8. Client-Side Hooks

### 8.1 Token Registration
- `PushNotificationProvider` → requests permission → `PushNotifications.addListener('registration')`
- `useDeviceTokenRegistration` → upserts token to `notification_device_tokens`

### 8.2 Deep Link Routing (`usePushNotificationHandler`)
```typescript
const ACTION_ROUTES: Record<string, string> = {
  morning_prep: '/daily-check-in',
  pre_event_prep: '/executive-home',
  calendar_gap: '/daily-check-in',
  coach_meeting_match: '/self-mastery-coach',
  state_aware_nudge: '/executive-home',
  evening_close: '/daily-check-in',
  pattern_alert: '/insights',
  daily_fallback: '/executive-home',
};
```
Priority: `data.deep_link_route` (server-provided) > `ACTION_ROUTES[type]` > `/executive-home`

### 8.3 Engagement Tracking (`useNotificationEngagement`)
- `trackTap(logId)` — sets `tapped=true`, `app_opened=true`, calculates `time_to_engagement_seconds`
- `trackActionCompleted(logId)` — sets `target_action_completed=true`
- `trackDismissed(logId)` — sets `dismissed=true`

---

## 9. KPI Alignment

### KPI 1: Daily Return Rate
**Target**: User returns to the app daily.

| Nudge Type | Mechanism |
|------------|-----------|
| P0 Morning Prep | Drives first app open of the day via check-in prompt |
| P7 Daily Fallback | Safety net for days when no other nudge qualifies |
| P5 Evening Close | Drives second touch (bookend pattern) |

### KPI 2: Pre-Event Preparation Rate
**Target**: User prepares before high-stakes meetings using the Mastery Plan.

| Nudge Type | Mechanism |
|------------|-----------|
| P1 JIT Pre-Event | Direct prompt 30-90 min before qualifying event |
| P2 Calendar Gap | Prompts preparation during natural breaks |
| P3 Coach Match | Connects coach commitment to upcoming meeting |

### KPI 3: 90-Day Retention
**Target**: User maintains engagement over 3 months.

| Nudge Type | Mechanism |
|------------|-----------|
| P6 Pattern Alert | Surfaces longitudinal insights (streak, correlation, recovery trends) |
| P4 State-Aware | Contextual intervention when user is struggling (depleted + high-stakes) |
| Engagement Learning | Automatically reduces notification frequency for disengaged types |
| Signal Richness Gate | Prevents generic/irritating notifications that drive uninstalls |

---

## 10. Database Tables (Notification-Specific)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `notification_device_tokens` | Active device tokens per user | `user_id, device_token, platform, is_active` |
| `notification_log` | Every notification sent (audit + suppression + engagement) | `user_id, notification_type, variant_id, sent_at, event_reference, payload, tapped, app_opened, target_action_completed, dismissed, time_to_engagement_seconds` |
| `notification_preferences` | Per-user toggles + time windows | `morning_anchor_enabled, pre_event_prep_enabled, evening_close_enabled, pattern_alert_enabled, state_aware_nudge_enabled, morning_window_start/end, evening_window_start/end, dnd_start/end, quiet_days[]` |

---

## 11. APNs Configuration

| Secret | Purpose |
|--------|---------|
| `APNS_P8_KEY` | ECDSA P-256 private key for JWT signing |
| `APNS_KEY_ID` | Key identifier from Apple |
| `APNS_TEAM_ID` | Apple Developer Team ID |
| `APNS_ENVIRONMENT` | `production` or `development` (controls APNs host) |

**Bundle ID**: `com.moonshot.mindmoduleapp`

If any APNs secret is missing, the function runs in **dry-run mode** — logs are created but no push is sent.

---

## 12. Cron Schedule

```sql
SELECT cron.schedule(
  'smart-nudges-every-15m',
  '*/15 * * * *',
  $$ SELECT net.http_post(...) $$
);
```

---

## 13. Timezone Handling

`profiles.timezone_offset` stores the user's offset in **minutes** (e.g., IST = 330, EST = -300).

Log queries use timezone-corrected UTC boundaries:
```
localMidnightMs = Date.parse(`${todayStr}T00:00:00`)
todayStartUtc   = new Date(localMidnightMs - tzOffset * 60000)
todayEndUtc     = todayStartUtc + 24h
```

---

## 14. Changelog

| Date | Change |
|------|--------|
| 2026-04-09 | **Data integrity fixes**: Added `hasWearableData` flag, signal richness gate (P4-P7 require ≥ 2 signals), wearable line omission from AI prompts, post-generation fabrication validation, evening close guard (21:30 cutoff + checkin count), signal-aware fallback copy. |
| 2026-03-26 | **JIT alignment**: Pre-event nudges query `jit_event_context` instead of standalone keyword scoring. |
| 2026-03-25 | **Major enhancement**: Daily cap (3/day), weekend variants, engagement learning (7-day tap rate), type diversity (3-day lookback), time-of-day priority shifting. |
| 2026-03-25 | Fixed timezone bug: `todayStr` log query uses UTC-corrected boundaries. |
