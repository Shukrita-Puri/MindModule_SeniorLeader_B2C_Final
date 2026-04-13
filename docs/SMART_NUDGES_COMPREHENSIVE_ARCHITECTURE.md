# Smart Nudges — Comprehensive Architecture Document

> Last updated: 2026-04-13
> Edge Function: `supabase/functions/smart-nudges/index.ts`
> Architecture: MVP 3-Nudge System (v4)

---

## 1. System Purpose

Smart Nudges is a **signal-first, context-aware push notification engine** that delivers timely, personalised prompts to C-suite leaders. Every nudge leads to a **plan** — not just a screen.

### MVP Design Philosophy

- **3 nudges max per day** — no notification fatigue
- **Every nudge is action-linked** — check-in → plan, plan directly, or coach/reset
- **Calendar-aware timing** — adapts to first meeting, not fixed windows
- **Nudges are numbered 1, 2, 3** — not "morning/evening" — because Nudge 1 could be JIT prep

### KPIs Driven

| KPI | Which Nudge |
|-----|-------------|
| Daily check-in rate | Nudge 1 (morning) + Nudge 3 (evening) |
| Practice completion rate | Nudge 2 (priorities/JIT) |
| Daily return rate | All 3 (spaced across the day) |

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
│  5. MVP 3-NUDGE CASCADE                                        │
│     Nudge 1 → Nudge 2 → Nudge 3                              │
│     Each fires at most once per day                            │
│  6. AI COPY GENERATION                                        │
│     Claude Haiku → JSON parse → fabrication validation         │
│     Fallback: static signal-aware copy variants               │
│  7. DELIVERY                                                  │
│     notification_log INSERT → APNs HTTP/2 push                │
│     Deep link route in payload                                │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. MVP 3-Nudge System

### Nudge 1 — First Touch (earliest relevant moment)

```text
What fires depends on context:

A) JIT morning event (high-stakes < 2h away)
   → /executive-home (plan with JIT slot 1)
   "Board Review at 9:30 — your prep plan is ready"

B) Loaded day (3+ meetings, first event < 2h)
   → /daily-check-in (check-in generates plan)
   "6 meetings today, first at 9 — set the tone now"

C) Light day (0-2 meetings, first event > 2h)
   → /daily-check-in
   "Your day is open — check in to decide what to own today"

Calendar-aware timing:
- If first meeting at 10am → nudge at ~8:30-9:00
- If first meeting at 8am → nudge at ~6:30-7:00
- Weekday: 6:30-9:30 (shifts based on first event)
- Saturday: 7:30-10:00
- Sunday: 8:00-10:30

Gate: No morning check-in yet (or no JIT plan started)
```

#### Copy Library

| Context | Title | Body | Deep Link |
|---------|-------|------|-----------|
| JIT morning (high-stakes < 2h) | `Prep ready` | `{EventTitle} in {min} min — your prep plan is built` | `/executive-home` |
| Loaded + high-stakes | `{EventTitle} today` | `{count} events including {EventTitle} — check in to sharpen` | `/daily-check-in` |
| Loaded day (3+) | `Loaded day` | `{count} meetings today — set the tone before it sets you` | `/daily-check-in` |
| Light day | `Your day is open` | `Light calendar — check in to decide what to own today` | `/daily-check-in` |
| Saturday | `No agenda` | `Check in when you are ready — your day, your terms` | `/daily-check-in` |
| Sunday morning | `Sunday reset` | `A moment to land before the week forms` | `/daily-check-in` |
| Low recovery (wearable) | `Ground First` | `Low recovery last night. Ground yourself before the day starts.` | `/daily-check-in` |

### Nudge 2 — Mid-day Action (plan-driven)

```text
What fires depends on context:

A) JIT event approaching (30-360 min away)
   → /executive-home (JIT slot in plan)
   "{EventTitle} at 2pm — your prep sequence is queued"

B) Priorities incomplete (afternoon, 13:00+)
   → /executive-home (plan with open priorities)
   "Priority 1 still open — 4 min to complete"

C) State-aware recalibrate (started low + heavy PM)
   → /daily-check-in (recalibrate → plan refresh)
   "You started low. Reset before {EventTitle}"

Window: 9:30-16:00
Gate: Plan must exist (priorities generated or JIT plan)
```

#### Copy Library

| Context | Title | Body | Deep Link |
|---------|-------|------|-----------|
| JIT < 2h | `{EventTitle} shortly` | `{min} min window — your prep plan is ready` | `/executive-home` |
| JIT 2-6h | `Prep window open` | `{EventTitle} at {time} — practice sequence queued` | `/executive-home` |
| Priority open (PM) | `Priority still open` | `{PriorityTitle} waiting — 4 min to complete` | `/executive-home` |
| Recalibrate | `Recalibrate` | `Started low — reset before {EventTitle}` | `/daily-check-in` |

### Nudge 3 — Evening Close (reflection + forward-set)

```text
Weekday:
→ /daily-check-in (evening check-in closes the loop)

Friday:
→ /daily-check-in (close-the-week)

Sunday (ONLY early evening 17:00-19:30):
→ /daily-check-in (week-prep framing)
"Monday has {meetingCount} events — set your intent tonight"

Saturday: NO EVENING NUDGE (their time)

Gate: No evening check-in yet
Gate: Exempt from signal richness (drive check-in KPI)
```

#### Copy Library

| Context | Title | Body | Deep Link |
|---------|-------|------|-----------|
| All priorities done | `Day complete` | `All priorities done — close the loop` | `/daily-check-in` |
| Priorities open | `Before you switch off` | `{remaining} priority still open — close or carry forward` | `/daily-check-in` |
| Friday | `Week complete` | `5 days behind you — close the week before you switch off` | `/daily-check-in` |
| Sunday (high-stakes Mon) | `Monday is forming` | `{count} events Monday including {EventTitle} — set your intent tonight` | `/daily-check-in` |
| Sunday (normal Mon) | `Monday is forming` | `{count} events Monday — set your intent tonight` | `/daily-check-in` |
| Wearable (RHR elevated) | `Body carried load` | `A proper close helps you let go of today` | `/daily-check-in` |
| Heavy day | `Heavy day done` | `{count} meetings done — one check-in to close the loop` | `/daily-check-in` |
| Default | `Evening close` | `Day done — close the loop before switching off` | `/daily-check-in` |

---

## 4. Suppression Stack

All 7 layers apply to all nudge types:

| Layer | Rule | Override |
|-------|------|---------|
| 1. Quiet Hours | 22:00-06:30 local | None |
| 2. DND | User-configured `dnd_start`/`dnd_end` | None |
| 3. Quiet Days | User-configured `quiet_days[]` | None |
| 4. Daily Cap | 3 notifications max per day | None |
| 5. 2-hour Cooldown | No notification within 2h of last | JIT nudges override |
| 6. App-open | Skip if app opened within 30 min + suppressed | None |
| 7. In-meeting | Skip if currently in a calendar event | None |

---

## 5. Signal Assembly (NudgeContext)

`buildNudgeContext()` runs 13 parallel DB queries + 1 dependent query per user.

### Data Sources

| # | Table | Signals |
|---|-------|---------|
| 1 | `calendar_events` | Today/tomorrow events, noise filtering, high-stakes detection |
| 2 | `wearable_data` | HRV, RHR, sleep score, 30-day baselines |
| 3 | `energy_snapshots` | Today's HRV delta from snapshot |
| 4 | `coach_accountability_tracker` | Pending commitments |
| 5 | `coach_pattern_observations` | Active patterns (top 5) |
| 6 | `dialogue_sessions` | Coach sessions in last 7 days |
| 7 | `coach_session_summaries` | Stress signals from session topics |
| 8 | `daily_checkins` | Today's outcomes + 30-day history |
| 9 | `daily_ritual_completions` | Pending/completed practice IDs |
| 10 | `jit_event_context` | JIT-qualified events (30-360 min, score ≥ 55) |
| 11 | `practice_sessions` | 30-day practice history |
| 12 | `notification_device_tokens` | Active device tokens |
| 13 | `notification_log` | Today's logs + 2h suppression |

---

## 6. AI Copy Generation

- **Model**: `claude-haiku-3-5-20241022` via shared Anthropic helper
- **Timeout**: 6 seconds
- **Fallback**: Static signal-aware copy variants per nudge type
- **Fabrication prevention**: 3-layer defence (omission → per-field omission → post-generation validation)

---

## 7. Client-Side Push Handling

### `usePushNotificationHandler.ts`

The `ACTION_ROUTES` map handles routing for both MVP and legacy nudge types:

```typescript
const ACTION_ROUTES: Record<string, string> = {
  nudge_one: '/daily-check-in',      // Default; JIT uses deep_link_route
  nudge_two: '/executive-home',       // Default; recalibrate uses deep_link_route
  nudge_three: '/daily-check-in',     // Evening close
  // Legacy backward compat
  morning_prep: '/daily-check-in',
  pre_event_prep: '/executive-home',
  ...
};
```

Priority: `deep_link_route` from payload > `ACTION_ROUTES` > `/executive-home` fallback.

---

## 8. Deferred Nudge Types (Post-MVP)

These evaluators exist in code but are wrapped in `MVP_POST_LAUNCH = false`:

| Type | Description | When to Enable |
|------|------------|----------------|
| P2: `calendar_gap` | Fires during ≥20 min gaps between meetings | After MVP launch |
| P3: `coach_meeting_match` | Semantic match: commitment ↔ upcoming event | After MVP launch |
| P4: `state_aware_nudge` | Low morning + afternoon high-stakes | After MVP launch |
| P6: `pattern_alert` | Consecutive low, recovery deficit, streaks | After MVP launch |
| P7: `daily_fallback` | Generic fallback when nothing else fires | After MVP launch |

To activate: set `const MVP_POST_LAUNCH = true` in `smart-nudges/index.ts`.

---

## 9. Notification Types Reference

| Notification Type | MVP Active | Deep Link | Preference Toggle |
|------------------|-----------|-----------|-------------------|
| `nudge_one` | ✅ | Context-dependent | `morning_anchor_enabled` |
| `nudge_two` | ✅ | Context-dependent | `pre_event_prep_enabled` |
| `nudge_three` | ✅ | `/daily-check-in` | `evening_close_enabled` |
| `calendar_gap` | ❌ | `/executive-home` | — |
| `coach_meeting_match` | ❌ | `/self-mastery-coach` | — |
| `state_aware_nudge` | ❌ | `/daily-check-in` | `state_aware_nudge_enabled` |
| `pattern_alert` | ❌ | `/insights` | `pattern_alert_enabled` |
| `daily_fallback` | ❌ | `/executive-home` | — |
