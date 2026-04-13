

# MVP Smart Nudges — Revised: 3 Action-Linked Nudges

## Design Philosophy

Every nudge leads to a **plan** — not just a screen. Some users enter through check-in (which generates their plan), others go straight to the plan, others to coach/reset studio from the plan. No aimless navigation.

Nudges are numbered 1, 2, 3 — not "morning/evening" — because Nudge 1 could be a JIT prep if there's a high-stakes event at 9am.

## The 3-Nudge System

```text
┌─────────────────────────────────────────────────────────────┐
│  NUDGE 1 — First Touch (earliest relevant moment)          │
│                                                             │
│  What fires depends on context:                             │
│                                                             │
│  A) JIT morning event (high-stakes < 2h away)              │
│     → /executive-home (plan with JIT slot 1)               │
│     "Board Review at 9:30 — your prep plan is ready"       │
│                                                             │
│  B) Loaded day (3+ meetings, first event < 2h)             │
│     → /daily-check-in (check-in generates plan)            │
│     "6 meetings today, first at 9 — set the tone now"      │
│                                                             │
│  C) Light day (0-2 meetings, first event > 2h)             │
│     → /daily-check-in                                       │
│     "Clear morning — check in to decide what to own today" │
│                                                             │
│  Calendar-aware timing:                                     │
│  - If first meeting at 10am → nudge at ~8:30-9:00          │
│  - If first meeting at 8am → nudge at ~6:30-7:00           │
│  - Never fire if user isn't in "readying" mindset          │
│                                                             │
│  Gate: No morning check-in yet (or no JIT plan started)    │
├─────────────────────────────────────────────────────────────┤
│  NUDGE 2 — Mid-day Action (plan-driven)                    │
│                                                             │
│  What fires depends on context:                             │
│                                                             │
│  A) JIT event approaching (30-360 min away)                │
│     → /executive-home (JIT slot in plan)                   │
│     "{EventTitle} at 2pm — your prep sequence is queued"   │
│                                                             │
│  B) Priorities incomplete (afternoon, 1+ priority open)    │
│     → /executive-home (plan with open priorities)          │
│     "Priority 1 still open — 4 min to complete"            │
│                                                             │
│  C) State-aware recalibrate (started low + heavy PM)       │
│     → /daily-check-in (recalibrate → plan refresh)        │
│     "You started low. Reset before {EventTitle}"           │
│                                                             │
│  Window: 9:30-16:00                                        │
│  Gate: Plan must exist (priorities generated or JIT plan)  │
├─────────────────────────────────────────────────────────────┤
│  NUDGE 3 — Evening Close (reflection + forward-set)        │
│                                                             │
│  Weekday:                                                   │
│  → /daily-check-in (evening check-in closes the loop)      │
│  "Day done — close the loop before switching off"          │
│                                                             │
│  Friday:                                                    │
│  → /daily-check-in                                          │
│  "5 days behind you — close the week"                      │
│                                                             │
│  Sunday (ONLY early evening 17:00-19:30):                  │
│  → /daily-check-in (week-prep framing)                     │
│  "Monday has {meetingCount} events — set your intent now"  │
│                                                             │
│  Saturday: No evening nudge (their time)                   │
│                                                             │
│  Gate: No evening check-in yet                             │
│  Gate: Exempt from signal richness (drive check-in KPI)    │
└─────────────────────────────────────────────────────────────┘

Daily cap: 3. Each nudge fires at most once.
```

## Key Differences from Previous Plan

| Previous | Revised |
|----------|---------|
| Nudge 1 = always morning check-in | Nudge 1 = context-dependent (JIT can be first) |
| Fixed time windows per type | Calendar-aware timing (adapts to first meeting) |
| Morning = "check in and decide" | Morning = "set the tone" (loaded vs light framing) |
| Sunday evening same as weekday | Sunday ONLY early evening (17:00-19:30) |
| Saturday evening nudge | Saturday: no evening nudge |
| Some nudges lead to screens | ALL nudges lead to a plan/action |

## Suggested Copy Library

### Nudge 1 — First Touch

| Context | Title | Body | Deep Link |
|---------|-------|------|-----------|
| JIT morning (high-stakes < 2h) | `Prep ready` | `{EventTitle} at {time} — your prep plan is built` | `/executive-home` |
| JIT morning (moderate event) | `{EventTitle} ahead` | `Your practice sequence for this is queued` | `/executive-home` |
| Loaded day (3+ meetings) | `Loaded day` | `{meetingCount} meetings today — set the tone before it sets you` | `/daily-check-in` |
| Loaded + high-stakes | `{EventTitle} today` | `{meetingCount} events including {EventTitle} — check in to sharpen` | `/daily-check-in` |
| Light day | `Your day is open` | `Light calendar — check in to decide what to own today` | `/daily-check-in` |
| Weekend (Sat) | `No agenda` | `Check in when you are ready — your day, your terms` | `/daily-check-in` |
| Weekend (Sun morning) | `Sunday reset` | `A moment to land before the week forms` | `/daily-check-in` |

### Nudge 2 — Mid-day Action

| Context | Title | Body | Deep Link |
|---------|-------|------|-----------|
| JIT < 2h | `{EventTitle} shortly` | `{minutesUntil} min window — your prep plan is ready` | `/executive-home` |
| JIT 2-6h | `Prep window open` | `{EventTitle} at {time} — practice sequence queued` | `/executive-home` |
| Priority 1 open (PM) | `Priority still open` | `{PriorityTitle} waiting — 4 min to complete` | `/executive-home` |
| State-aware (low + heavy PM) | `Recalibrate` | `Started low — reset before {EventTitle}` | `/daily-check-in` |
| Coach match | `Coach spotted this` | `Your commitment connects to {EventTitle}` | `/self-mastery-coach` |

### Nudge 3 — Evening Close

| Context | Title | Body | Deep Link |
|---------|-------|------|-----------|
| Weekday (all done) | `Day complete` | `All priorities done — close the loop` | `/daily-check-in` |
| Weekday (priorities open) | `Before you switch off` | `{remainingCount} priority still open — close or carry forward` | `/daily-check-in` |
| Friday | `Week complete` | `5 days behind you — close the week before you switch off` | `/daily-check-in` |
| Sunday (early eve) | `Monday is forming` | `{meetingCount} events Monday — set your intent tonight` | `/daily-check-in` |
| Weekday + wearable | `Body carried load` | `A proper close helps you let go of today` | `/daily-check-in` |

## Technical Changes

### `supabase/functions/smart-nudges/index.ts`

1. **Replace `evaluateMorningPrep`** with `evaluateNudgeOne` — checks JIT first, then loaded/light day. Uses existing calendar-aware timing logic (already adapts window to first event start). Add JIT-first branch: if `jit_event_context` has a qualifying morning event, fire as JIT with `/executive-home` deep link instead of check-in.

2. **Replace P1/P2/P4 evaluators** with `evaluateNudgeTwo` — unified mid-day evaluator. Priority order: JIT event → incomplete priorities → state-aware recalibrate → coach match. Only one fires. Window: 9:30-16:00. Gate: plan must exist (check `daily_ritual_completions` or `jit_event_context`).

3. **Update `evaluateEveningClose`** to become Nudge 3:
   - Sunday: window 17:00-19:30 (was 18:00-21:30)
   - Saturday: **disabled** (no nudge)
   - Remove signal richness gate (exempt for MVP — drive check-in KPI)
   - Add priority completion context to copy

4. **Wrap P2/P3/P4/P6/P7** in `const MVP_POST_LAUNCH = false` flag — code stays, doesn't execute

5. **Update deep link routing**: Nudge 1 JIT variant → `/executive-home`, Nudge 1 check-in variant → `/daily-check-in`, Nudge 2 → context-dependent, Nudge 3 → `/daily-check-in`

6. **Update cascade** (lines 1662-1712): Replace P0-P7 cascade with Nudge 1 → Nudge 2 → Nudge 3 evaluation. Each fires at most once. First qualifying nudge from each slot is kept.

### `src/hooks/usePushNotificationHandler.ts`

Update `ACTION_ROUTES` to include new nudge types (`nudge_one`, `nudge_two`, `nudge_three`) alongside existing types for backward compatibility.

### `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md`

Add MVP section documenting the 3-nudge structure, copy variants, calendar-aware timing, and which P-types are deferred to post-MVP.

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/smart-nudges/index.ts` | Replace P0 with `evaluateNudgeOne` (JIT-first + calendar-aware); replace P1/P2/P4 with `evaluateNudgeTwo`; update P5 for Sunday/Saturday rules; wrap P2/P3/P4/P6/P7 in MVP flag; update fallback copy |
| `src/hooks/usePushNotificationHandler.ts` | Add new nudge type routes |
| `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md` | Document MVP 3-nudge structure |

## Implementation Order

1. Add `evaluateNudgeOne()` — JIT-first morning evaluator
2. Add `evaluateNudgeTwo()` — unified mid-day evaluator
3. Update evening close for Sunday/Saturday rules
4. Wrap post-MVP evaluators in feature flag
5. Update cascade loop + deep link routes
6. Update client push handler routes
7. Update docs
8. Deploy + test

