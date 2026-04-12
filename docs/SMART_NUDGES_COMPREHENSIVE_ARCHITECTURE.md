# Smart Nudges — Comprehensive Architecture Document

> Last updated: 2026-04-12
> Edge Function: `supabase/functions/smart-nudges/index.ts` (1,901 lines)
> Replaces: `SMART_NUDGES_ARCHITECTURE.md`, `SMART_NUDGES_TECHNICAL_DOCUMENTATION.md`

---

## 1. System Purpose

Smart Nudges is a **signal-first, context-aware push notification engine** that delivers timely, personalised prompts to C-suite leaders based on their real-time physiological, calendar, coaching, and check-in signals. The system follows an **Artifact-First Gating** philosophy: notifications only fire if a corresponding concrete artifact (JIT plan, uncompleted ritual, etc.) exists to act on.

---

## 2. Architecture Overview

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
│  1. FETCH USERS — notification_device_tokens → user list       │
│  2. BATCH FETCH — profiles, preferences, engagements           │
│  3. PER-USER SUPPRESSION STACK                                 │
│     Quiet hours (22:00-06:30) → DND → Quiet days →            │
│     Daily cap (3) → 2h cooldown → 30min app-open →            │
│     In-meeting check                                          │
│  4. SIGNAL ASSEMBLY — buildNudgeContext()                      │
│     13 parallel DB queries → NudgeContext object               │
│     + 1 dependent query (coach_session_summaries)              │
│     + Signal Richness Gate                                    │
│  5. PRIORITY CASCADE — P0 → P7                                │
│     Each evaluator checks time window, triggers, suppression   │
│  6. AI COPY GENERATION                                        │
│     Claude Haiku via _shared/anthropic.ts                      │
│     System prompt → per-type user prompt → JSON parse          │
│     Post-generation fabrication validation                     │
│     Fallback: static signal-aware copy variants               │
│  7. ENGAGEMENT LEARNING                                       │
│     7-day tap rate → per-type suppression (50%)               │
│     Type diversity (3-day lookback)                            │
│  8. DELIVERY                                                  │
│     notification_log INSERT → APNs HTTP/2 push                │
│     Deep link route in payload                                │
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
                       ▼
┌───────────────────────────────────────────────────────────────┐
│                    iOS Device                                  │
│  PushNotificationProvider → useDeviceTokenRegistration         │
│  usePushNotificationHandler → deep link to correct screen      │
│  useNotificationEngagement → trackTap / trackDismissed         │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Invocation & Scheduling

| Property | Value |
|----------|-------|
| **Trigger** | `pg_cron` every 15 minutes |
| **JWT** | `verify_jwt=false` (cron-invoked, no user auth) |
| **Auth** | Uses `SUPABASE_SERVICE_ROLE_KEY` for all DB access |
| **Batch Processing** | All users with active device tokens processed in a single invocation |

---

## 4. Upstream Data Sources

All queries execute in `buildNudgeContext()` via `Promise.all()` (13 parallel + 1 dependent).

| # | Table | What It Provides | Key Columns |
|---|-------|------------------|-------------|
| 1 | `calendar_events` | Today's & tomorrow's meetings | `title, start_time, end_time, external_id, is_organizer, attendees_count` |
| 2 | `wearable_data` | Latest biometrics + 30-day baseline | `hrv, resting_heart_rate, sleep_score, total_sleep_minutes, summary_date` |
| 3 | `energy_snapshots` | Today's energy snapshot | `oura_readiness, computed_data.hrv_delta_pct` |
| 4 | `coach_accountability_tracker` | Pending commitments | `commitment_text, committed_at, check_in_due_date, status, pattern_area, meta_skill` |
| 5 | `coach_pattern_observations` | Active patterns (top 5) | `pattern_description, pattern_area, observation_count` |
| 6 | `dialogue_sessions` | Coach sessions in last 7 days | `id, started_at, session_title, flow_type` |
| 7 | `coach_session_summaries` | Key topics & commitments (dependent) | `session_id, key_topics, commitments_made` |
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

## 5. NudgeContext — Signal Assembly Object

`buildNudgeContext()` produces a single `NudgeContext` object per user.

### 5.1 Calendar Signals
- `todayEvents`, `tomorrowEvents` — raw calendar events
- `nonNoiseEvents` — noise-filtered (transit, logistics, placeholders removed via `NOISE_KEYWORDS` + `NOISE_PATTERN`)
- `highStakesEvents` — keyword-scored ≥ 25 (`HIGH_STAKES_KEYWORDS`: board, investor, pitch, etc.)
- `calendarGaps` — ≥ 20 min gaps between events with post-gap analysis (`postGapMeetingCount`, `postGapHasHighStakes`)
- `dayType` — `light` (<3), `moderate` (3-5), `heavy` (6-7), `extreme` (8+)
- `inMeetingNow` — boolean, for in-meeting suppression

### 5.2 Wearable Signals
- `sleepScore`, `hrv`, `rhr` — latest values
- `hrvBaseline30d`, `rhrBaseline30d` — 30-day rolling averages
- `hrvDeltaPct` — `((latest - baseline) / baseline) * 100`
- `rhrElevated` — `true` if RHR > baseline × 1.10
- `hasWearableData` — **boolean gate** (true only if `wearable_data` has a row)

### 5.3 Coach Signals
- `pendingCommitments` — with overdue day count, pattern area, meta-skill
- `activePatterns` — top 5 by observation count
- `stressSignals` — extracted from session summary `key_topics` (keywords: stress, anxiety, worried, nervous, overwhelm, dread)
- `lastSessionAt`, `sessionsIn7d` — recency and frequency

### 5.4 Check-in Signals
- `morningCheckinOutcome`, `afternoonCheckinOutcome` — today's outcomes
- `checkinCountToday` — total check-ins today
- `lastCheckinTime` — for recency suppression

### 5.5 Performance Correlations (30-day)
- `coachSessionReadinessLift` — % outcome lift on days after coach sessions (requires ≥2 data points each group)
- `practiceCompletionCorrelation` — % outcome lift on days after practice completion

### 5.6 Derived Signals
- `currentStreak` — from `profiles.current_streak`
- `lastAppOpen` — from `user_engagements`
- `hrvDeltaPctFromSnapshot` — from `energy_snapshots` (may differ from wearable calc)

---

## 6. Signal Richness Gate

### Signal Counting
```
hasCalendar = nonNoiseEvents.length > 0
hasWearable = hasWearableData (boolean)
hasCheckin  = checkinCountToday > 0
hasCoach    = pendingCommitments.length > 0 || sessionsIn7d > 0
signalCount = [hasCalendar, hasWearable, hasCheckin, hasCoach].filter(Boolean).length
```

### Gating Rules

| Priority | Type | Gate | Rationale |
|----------|------|------|-----------|
| P0 | `morning_prep` | **Exempt** | Prompts the first signal (check-in) |
| P1 | `pre_event_prep` | **Exempt** | Calendar-driven; requires JIT qualifying event |
| P2 | `calendar_gap` | **Exempt** | Calendar-driven; gap detection is self-gating |
| P3 | `coach_meeting_match` | **Exempt** | Coach-driven; requires commitment + event match |
| P4 | `state_aware_nudge` | **Gated: signalCount ≥ 2** | Needs check-in + calendar minimum |
| P5 | `evening_close` | **Gated: signalCount ≥ 2** | Needs meaningful signals to reflect on |
| P6 | `pattern_alert` | **Gated: signalCount ≥ 2** | Pattern detection requires multi-source data |
| P7 | `daily_fallback` | **Gated: signalCount ≥ 2** | No point in generic nudge without data |

---

## 7. Priority Cascade (P0–P7) — Full Logic

### P0: Morning Preparation (`morning_prep`)
- **Window**: Weekday 6:30-9:30, Sat 7:30-10:00, Sun 8:00-10:30
- **Adaptive timing**: Window shifts based on first event start time + commute buffer (virtual=0.5h, in-person=1.25h)
- **Trigger**: No morning check-in exists
- **Suppression**: Skip if first event < 30 min away; dedup by type
- **Deep link**: `/daily-check-in`
- **Preference toggle**: `morning_anchor_enabled`

### P1: JIT Pre-Event (`pre_event_prep`)
- **Window**: Any time (event-driven)
- **Primary trigger**: `jit_event_context` row with `final_score ≥ 55`, event in 30-90 min
- **Artifact gate**: Verifies JIT plan exists with modules (`jit_horizons_surfaced IS NOT NULL`, `dismissed_by_user = false`)
- **Fallback trigger**: Calendar event with keyword score ≥ 50 (requires 2+ matches) + JIT plan verification
- **Suppression**: Dedup by `external_id`; **overrides 2h cooldown** (time-critical)
- **Deep link**: `/executive-home`
- **Preference toggle**: `pre_event_prep_enabled`

### P2: Calendar Gap (`calendar_gap`)
- **Window**: During a gap (5 min into gap until gap ends)
- **Trigger**: ≥ 20 min gap AND post-gap has ≥ 2 meetings or high-stakes
- **Artifact gate**: Requires uncompleted practice slot (`pendingPracticeIds.length > 0`)
- **Suppression**: Skip if checked in within 90 min; skip if in meeting
- **Deep link**: `/executive-home`

### P3: Coach Commitment + Meeting Match (`coach_meeting_match`)
- **Window**: Any time (event-driven)
- **Trigger**: Semantic match between pending commitment keywords and upcoming event title (45-240 min out)
- **Also checks**: Stress signals from coach session topics vs upcoming events
- **Suppression**: Skip if coach session today; skip if coach opened in 2h
- **Deep link**: `/self-mastery-coach?context=commitment&commitment=...&meeting=...`
- **Context pass-through**: Commitment text and meeting title encoded in deep link for coach pre-population

### P4: State-Aware Afternoon (`state_aware_nudge`)
- **Window**: 12:00-15:00 weekdays only
- **Trigger**: Morning check-in = depleted/managing AND ≥ 1 afternoon high-stakes event
- **Suppression**: Skip weekends; skip if app opened in 3h
- **Signal gate**: Requires signalCount ≥ 2
- **Deep link**: `/daily-check-in`
- **Preference toggle**: `state_aware_nudge_enabled`

### P5: Evening Close (`evening_close`)
- **Window**: Weekday 19:00-21:30, Friday 18:30, Sunday 18:00
- **Trigger**: Evening ritual or check-in missing
- **Guards**: Skip if `checkinCountToday ≥ 2` or `afternoonCheckinOutcome` exists; hard cutoff at 21:30
- **Signal gate**: Requires signalCount ≥ 2
- **Weekend variants**: Friday (close-the-week), Saturday (no-agenda), Sunday (week-prep with Monday signals)
- **Deep link**: `/daily-check-in`
- **Preference toggle**: `evening_close_enabled`

### P6: Pattern Alert (`pattern_alert`)
- **Window**: Any time
- **Sub-types** (checked in order):
  1. **Feature Performance** — coach session readiness lift > 20% + upcoming high-stakes + no recent coach session → `/executive-home`
  2. **Consecutive Low** — 3 days at depleted/managing (from 30-day checkin history) → `/insights?highlight=consecutive_low`
  3. **Recovery Deficit** — HRV ≥ 20% below baseline for 3+ days → `/insights?highlight=recovery_deficit`
  4. **Streak Milestone** — exactly 7, 14, or 30 days → `/executive-home`
- **Suppression**: Same pattern_type suppressed for 7 days; skip if app opened in 4h
- **Signal gate**: Requires signalCount ≥ 2
- **Preference toggle**: `pattern_alert_enabled`

### P7: Daily Fallback (`daily_fallback`)
- **Window**: 10:00-12:00
- **Trigger**: No other nudge qualified AND no notification sent today
- **Signal gate**: Requires signalCount ≥ 2
- **Deep link**: `/executive-home`

---

## 8. AI Copy Generation Pipeline

### 8.1 Model & Infrastructure
- **Model**: `claude-haiku-3-5-20241022` via `callClaudeText()` (shared Anthropic helper)
- **Timeout**: 6 seconds (AbortController)
- **Fallback**: If AI fails, static signal-aware copy variants are used
- **Secret**: `ANTHROPIC_API_KEY`

### 8.2 System Prompt
```
You are writing push notifications for a C-suite leader's performance coaching app.
Rules:
- Title: max 5 words, no emoji
- Body: max 15 words, performance-oriented tone
- NEVER use: wellness, mindfulness, relax, well done, great job, amazing
- For evenings/weekends: use softer, permission-to-stop tone – still reference specific signals
- Every nudge must reference something specific (a meeting title, a number, a commitment, a state)
- CRITICAL: Only reference data that is explicitly provided below. Do NOT invent numbers.
- If no wearable/biometric data is provided, do NOT mention HRV, sleep, recovery, heart rate.
- Return ONLY valid JSON: {"title":"...","body":"..."}
```

### 8.3 Per-Type User Prompts

Each nudge type builds a specific user prompt with **only available signals**:

| Type | Key Signals Included | Priority Hints |
|------|---------------------|----------------|
| `morning_prep` | First event name/time, day type, high-stakes, wearable (if available) | Lead with high-stakes event name if present |
| `jit_pre_event` | Event name, minutes until, current state, day type | Must mention event by name + "prep plan is ready" |
| `calendar_gap` | Gap duration, next meeting, post-gap load, wearable (if available) | Reference gap duration and what comes after |
| `coach_meeting_match` | Coach commitment text, meeting title, minutes until | "Your coach spotted this connection" tone |
| `performance_state` | Morning state, afternoon high-stakes, wearable (if available) | Reference specific state and what's ahead |
| `evening_close` | Day type, high-stakes, wearable (if available), weekend context, tomorrow signals | Permission to stop, not another task |
| `pattern_alert` | Pattern description, pattern type | Curious observation, not alarm |
| `daily_fallback` | Best available signal (cascaded: high-stakes → sleep → day type → streak → meetings) | Gentle invitation, not pressure |

### 8.4 Data Validation Gates (Fabrication Prevention)

**3-layer defence**:

1. **Omission** (primary): When `hasWearableData === false`, wearable signal lines are **entirely omitted** from the user prompt.
2. **Per-field omission**: When individual fields are null (e.g., `sleepScore` null but HRV exists), only that specific line is omitted.
3. **Post-generation validation**: After parsing AI JSON, scan `body` for fabrication indicators when `hasWearableData === false`:
   - `/\d+%/` — percentage patterns
   - `/\d+\s*ms/i` — HRV millisecond patterns
   - `/below baseline|above baseline/i` — baseline references
   - `/your HRV|recovery score/i` — wearable metric references
   
   If any match → reject AI copy → use static fallback.

### 8.5 Static Fallback Copy System

Each nudge type has a dedicated fallback function that generates signal-aware copy without LLM:

| Function | Signal-Awareness |
|----------|-----------------|
| `getFallbackMorningCopy()` | Wearable recovery → high-stakes → heavy day → weekend → calendar → clear day |
| `getFallbackJitCopy()` | Event title + minutes until |
| `getFallbackGapCopy()` | Gap duration + next event title |
| `getFallbackCoachMatchCopy()` | Commitment text + meeting title |
| `getFallbackEveningCopy()` | Sunday (Monday signals) → Friday → Saturday → RHR elevated → heavy day |
| `getFallbackPerformanceStateCopy()` | Coach lift % (or qualitative) → afternoon high-stakes count |
| `getFallbackDailyFallbackCopy()` | High-stakes → calendar count → open day |

---

## 9. Suppression Stack (Ordered)

| Layer | Logic | Scope |
|-------|-------|-------|
| 1. Quiet hours | 22:00–06:30 local time | Global |
| 2. DND | Configurable `dnd_start`/`dnd_end` (wraps midnight) | Per-user |
| 3. Quiet days | Array of day-of-week numbers (0=Sun…6=Sat) | Per-user |
| 4. Daily cap | Max 3 notifications per day (timezone-corrected UTC boundaries) | Per-user |
| 5. 2h cooldown | Separate query for logs in last 2h (not date-filtered) | Per-user |
| 6. App open | 30-min suppression if user opened app recently | Per-user |
| 7. In-meeting | Check if currently between event start/end times | Per-user |
| 8. Engagement suppression | 50% reduction for types with 0 taps in 5+ sends over 7 days | Per-type |
| 9. JIT override | P1 `pre_event_prep` overrides 2h cooldown (time-critical) | Per-type |

---

## 10. Engagement Learning System

### 7-Day Feedback Loop (`getUserEngagementProfile()`)

| Metric | Calculation |
|--------|-------------|
| Per-type tap rate | `tapped_count / sent_count` for each `notification_type` |
| Suppressed types | Types sent 5+ times with 0 taps → marked for 50% reduction |

### Deterministic Suppression
- Uses hash: `(userId + type + todayStr).charCodes.sum() % 2 === 0` → suppress
- Consistent within a day, varies across days
- Never fully disables (always 50% through for recovery detection)

### Type Diversity Guarantee (3-Day Lookback)
- Types not sent in 3+ days get priority boost
- Types with >50% tap rate get secondary boost
- Pre-event always wins regardless of diversity

---

## 11. Timezone Handling

```
localMidnightMs = Date.parse(`${todayStr}T00:00:00`)
todayStartUtc   = new Date(localMidnightMs - tzOffset * 60000)
todayEndUtc     = todayStartUtc + 24h
```

- `profiles.timezone_offset` stores minutes (e.g., IST = 330, EST = -300)
- Synced on every login/app-open via `sync-profile`
- All "today" log queries use timezone-corrected UTC boundaries

---

## 12. Weekend Rules Summary

| Rule | Weekday | Saturday | Sunday | Friday |
|------|---------|----------|--------|--------|
| Morning window | 6:00–9:30 | 7:30–10:00 | 8:00–10:30 | Standard |
| State-Aware | ✅ Active | ❌ Disabled | ❌ Disabled | ✅ Active |
| Evening window | 19:00–21:30 | Standard | 18:00–21:30 | 18:30–21:30 |
| Evening tone | Standard | "No agenda" | "Week-prep" | "Close the week" |

---

## 13. Deep Link Routes

| notification_type | Default Route | P6 Sub-type Overrides |
|-------------------|---------------|----------------------|
| `morning_prep` | `/daily-check-in` | — |
| `pre_event_prep` | `/executive-home` | — |
| `calendar_gap` | `/executive-home` | — |
| `coach_meeting_match` | `/self-mastery-coach?context=...` | — |
| `state_aware_nudge` | `/daily-check-in` | — |
| `evening_close` | `/daily-check-in` | — |
| `pattern_alert` | `/insights` | `feature_performance` → `/executive-home`, `streak_milestone` → `/executive-home`, `consecutive_low` → `/insights?highlight=consecutive_low`, `recovery_deficit` → `/insights?highlight=recovery_deficit` |
| `daily_fallback` | `/executive-home` | — |

---

## 14. Database Tables (Write)

| Table | Operation | When |
|-------|-----------|------|
| `notification_log` | INSERT | Every notification sent (even dry run) |

### `notification_log` Schema
- `user_id`, `notification_type`, `variant_id`, `event_reference`, `sent_at`
- `payload` (JSON: title, body, deep_link_route, architecture version, pattern_type)
- `tapped`, `app_opened`, `target_action_completed`, `dismissed`
- `time_to_engagement_seconds`

---

## 15. Client-Side Components

| Component/Hook | File | Purpose |
|----------------|------|---------|
| `PushNotificationProvider` | `src/components/PushNotificationProvider.tsx` | Registers device token on mount |
| `useDeviceTokenRegistration` | `src/hooks/useDeviceTokenRegistration.ts` | Persists token to `notification_device_tokens` |
| `usePushNotificationHandler` | `src/hooks/usePushNotificationHandler.ts` | Routes tapped notification to correct screen via ROUTE_MAP |
| `useNotificationEngagement` | `src/hooks/useNotificationEngagement.ts` | `trackTap()`, `trackActionCompleted()`, `trackDismissed()` |

---

## 16. Secrets Required

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Database access |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB access |
| `ANTHROPIC_API_KEY` | AI copy generation (Claude Haiku) |
| `APNS_P8_KEY` | ECDSA P-256 private key for APNs JWT |
| `APNS_KEY_ID` | Apple Key identifier |
| `APNS_TEAM_ID` | Apple Developer Team ID |
| `APNS_ENVIRONMENT` | `development` or `production` (determines APNs host) |

---

## 17. Feature Flags / Configuration

| Flag | Location | Default | Effect |
|------|----------|---------|--------|
| `morning_anchor_enabled` | `notification_preferences` | `true` | Enables/disables P0 |
| `pre_event_prep_enabled` | `notification_preferences` | `true` | Enables/disables P1 |
| `state_aware_nudge_enabled` | `notification_preferences` | `true` | Enables/disables P4 |
| `evening_close_enabled` | `notification_preferences` | `true` | Enables/disables P5 |
| `pattern_alert_enabled` | `notification_preferences` | `true` | Enables/disables P6 |
| `dnd_start` / `dnd_end` | `notification_preferences` | `null` | Custom DND hours |
| `quiet_days` | `notification_preferences` | `[]` | Days to skip entirely |
| `APNS_ENVIRONMENT` | Edge function secret | `development` | APNs sandbox vs production |
| `DAILY_NOTIFICATION_CAP` | Code constant | `3` | Max notifications per day |

---

## 18. Error Handling & Resilience

- **AI timeout**: 6s AbortController; falls through to static fallback
- **AI unavailable**: `ANTHROPIC_API_KEY` missing → static fallback (no error)
- **APNs failure**: Logs error; deactivates invalid tokens (410, 400 status)
- **APNs missing secrets**: DRY RUN mode — notifications logged but not sent
- **DB query failure**: Entire function wrapped in try/catch; returns 500 with error
- **Fabrication detection**: AI copy rejected → static fallback used

---

## 19. Performance Correlation Calculations

### Coach Session Readiness Lift
```
For each morning check-in date:
  If previous day had a coach session → coachDayAfterOutcomes
  Else → nonCoachDayOutcomes

outcomeScore: peak=5, strong=4, steady=3, managing=2, depleted=1

lift = ((coachAvg - nonCoachAvg) / nonCoachAvg) * 100
```
Requires ≥2 data points in each group. Used by P6 `feature_performance`.

### Practice Completion Correlation
Same methodology but checks `practice_sessions.completed_at` dates.
