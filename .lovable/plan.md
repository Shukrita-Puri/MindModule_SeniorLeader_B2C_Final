

# Smart Nudges: Architecture Doc + Data Integrity Fixes

## Summary

Two deliverables: (1) a comprehensive architecture document replacing the existing `docs/SMART_NUDGES_TECHNICAL_DOCUMENTATION.md`, and (2) six fixes to `supabase/functions/smart-nudges/index.ts` that eliminate fake data fabrication, add signal richness gating, and improve copy quality.

---

## File 1: `docs/SMART_NUDGES_ARCHITECTURE.md` (new, replaces existing doc)

Full architecture document covering:

- **System diagram**: pg_cron → Edge Function → Signal Assembly → Priority Cascade → AI Copy → APNs → iOS → Client Hooks
- **Upstream data sources**: 12 tables queried in `buildNudgeContext()` (calendar_events, wearable_data, daily_checkins, energy_snapshots, coach_accountability_tracker, coach_pattern_observations, dialogue_sessions, coach_session_summaries, daily_ritual_completions, jit_event_context, practice_sessions, user_engagements) with what each provides
- **Signal assembly**: How `NudgeContext` is built from parallel queries, including wearable baseline calculations, calendar gap detection, coach signal extraction, performance correlations
- **Priority cascade**: P0-P7 with triggers, time windows, and per-type suppression rules
- **Signal richness gate** (new): Which types are exempt (P0, P1, P2, P3) vs gated (P4, P5, P6, P7)
- **AI copy generation**: Gemini-2.5-flash-lite pipeline, system prompt, per-type user prompts, fallback variants, post-generation validation
- **Suppression stack**: Quiet hours (22:00-06:30), DND, 2h gap, in-meeting, daily cap (3), 30min app-open, engagement learning (7d tap rate)
- **Client-side**: PushNotificationProvider (token registration), usePushNotificationHandler (deep link routing), useNotificationEngagement (tap/dismiss/action tracking)
- **KPI alignment**: How each nudge type maps to Daily Return Rate, Pre-Event Preparation Rate, 90-Day Retention
- **Data validation gates**: The fabrication prevention system (new)

---

## File 2: `supabase/functions/smart-nudges/index.ts` — Six Fixes

### Fix A: `hasWearableData` flag on NudgeContext

Add `hasWearableData: boolean` to the `NudgeContext` interface. Computed in `buildNudgeContext()` as `latestW !== null && latestW !== undefined`. Single source of truth for all downstream gating.

### Fix B: Omit wearable lines from AI prompts

In `generateNudgeCopy()`, for each nudge type that references wearable signals (morning_prep, jit_pre_event, calendar_gap, performance_state, evening_close):
- When `ctx.hasWearableData === false`, **omit all wearable lines entirely** from the prompt — no "unavailable", no line at all
- When individual fields are null (e.g., `sleepScore` null but HRV exists), omit only that specific line
- This removes the LLM's opportunity to fabricate numbers

### Fix C: Post-generation validation gate

After parsing AI JSON response (line 808), scan `body` for fabrication indicators when `ctx.hasWearableData === false`:
- `/\d+%/` — percentage patterns ("down 40%")
- `/\d+\s*ms/i` — HRV millisecond patterns ("45ms")
- `/below baseline|above baseline/i` — baseline references
- `/your HRV|recovery score/i` — wearable metric references

If any match found AND `hasWearableData === false`, reject AI copy and fall through to static fallback.

### Fix D: Signal richness gate (with per-type exemptions)

After building `NudgeContext`, compute signal availability:
```
hasCalendar = ctx.nonNoiseEvents.length > 0
hasWearable = ctx.hasWearableData
hasCheckin  = ctx.checkinCountToday > 0
hasCoach    = ctx.coach.pendingCommitments.length > 0 || ctx.coach.sessionsIn7d > 0
signalCount = [hasCalendar, hasWearable, hasCheckin, hasCoach].filter(Boolean).length
```

**Exempt from gate** (these have their own internal gates):
- P0 morning_prep — purpose is to prompt the first signal
- P1 pre_event_prep — calendar-driven, requires JIT qualifying event
- P2 calendar_gap — calendar-driven
- P3 coach_meeting_match — coach-driven

**Gated** (require signalCount >= 2):
- P4 state_aware_nudge
- P5 evening_close
- P6 pattern_alert
- P7 daily_fallback

When suppressed, log: `[smart-nudges] User ${userId}: ${signalCount} signals — suppressing P4-P7`

### Fix E: Evening close guard

In `evaluateEveningClose()`, add two guards:
1. If `ctx.afternoonCheckinOutcome !== null` OR `ctx.checkinCountToday >= 2`, return null (already reflected on the day)
2. If `ctx.localTime >= 21.5`, return null (21:30 cutoff — too late to be useful)

### Fix F: Improved static fallback copy

Replace generic fallbacks with signal-aware copy:

**`getFallbackMorningCopy`** default case (line 840):
- If `ctx.eventCount > 0`: `{ title: "Day Mapped", body: "${eventCount} meetings today. Check in to set your direction." }`
- If `ctx.eventCount === 0 && !ctx.isWeekend`: `{ title: "Clear Day", body: "No meetings. A rare chance to set your own agenda." }`
- Keep existing sleep/high-stakes/heavy/weekend variants (they already reference real data)

**`getFallbackDailyFallbackCopy`** default case (line 897):
- If `ctx.eventCount > 0`: `{ title: "Day Mapped", body: "${eventCount} meetings today. Your brief has your direction." }`
- If `ctx.eventCount === 0`: `{ title: "Open Day", body: "Light calendar today. Check in to set an intention." }`
- Remove: "Take 30 seconds" / "Your Compass is ready" (generic)

**`getFallbackEveningCopy`** RHR variant (line 874):
- Only show if `ctx.hasWearableData === true` (prevent referencing body load without data)

**`getFallbackPerformanceStateCopy`** (line 885):
- Replace `ctx.coachSessionReadinessLift || 20` with: only show if `ctx.coachSessionReadinessLift !== null` (don't fabricate "20%" default)

---

## What Does NOT Change

- APNs delivery logic (JWT creation, HTTP/2 push)
- pg_cron schedule
- Client-side hooks (useNotificationEngagement, usePushNotificationHandler)
- Deep link route mapping
- Engagement learning algorithm
- Daily cap enforcement (3/day — confirmed still enforced at line 1447)
- Any other edge function

## Technical Details

- The edge function will be redeployed after changes
- The architecture doc replaces `docs/SMART_NUDGES_TECHNICAL_DOCUMENTATION.md` with a more comprehensive `docs/SMART_NUDGES_ARCHITECTURE.md`
- All changes are additive guards — no existing scoring or delivery logic is removed

