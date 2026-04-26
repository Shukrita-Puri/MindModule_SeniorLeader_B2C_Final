## Root Cause Diagnosis (verified from DB + code)

I read `supabase/functions/smart-nudges/index.ts` (1,781 lines) end-to-end and audited the last 7 days of `notification_log`. Each problem maps to a concrete defect:

| # | User-visible problem | Root cause in code/data |
|---|---|---|
| 1 | "Doesn't push the user to action / open the app" | Copy ends with passive lines like *"A moment to land"*, *"Set the frame"*, *"Day done"*. No verb that lures into Brief/Plan. AI prompt allows tone but never enforces a CTA reference to the brief/plan/check-in artefact. |
| 2 | "Feels strategic/productivity, not mental performance" | Fallback copy uses words like *"set your intent for the week"*, *"Loaded day — set the tone"*, *"close the loop"*. AI system prompt forbids "wellness" but doesn't forbid "intent/strategy/productivity" framing. No vocabulary anchored to **decision readiness / physical reserves / resilience capacity**. |
| 3 | "6am / 6:01am randomly" | `evaluateNudgeOne` floor is `morningStart = 6.5` (06:30 local). When `firstNonNoiseEvent` is null (Sunday, light day), it stays at 06:30. India users (TZ +330) saw 02:30 UTC = **08:00 IST Sunday** = the 6/8am complaint. UK users at 05:30 UTC = **06:30 BST**. **The "anchor 1–2 h before first meeting" rule only narrows the window upward; the 6:30 floor was never raised.** |
| 4 | "Two notifications back-to-back within 1–2 min" | DB shows no two notifications to the same user inside 30 min over 7 days (the 2-h suppression works). Likely the user perceived two **different** nudges firing on a shared device or saw the cron fire at `XX:00` then `XX:10` on a *different* user's pile. **However**, there is a real race: cron runs every 10 min, and Nudge 1 + Nudge 2 + Nudge 3 are evaluated in the same tick — only the 2-h *suppression* prevents stacking. We should add an **intra-tick cap of 1 push per user** plus a **same-day per-type cap = 1**. |
| 5 | "Saturday still talks productivity" | `getFallbackNudgeOneMorningCopy` → Saturday returns *"Check in when you are ready — your day, your terms"* (productivity framing). |
| 6 | "Sunday morning talks about week ahead instead of evening" | Sunday morning Nudge 1 fires at `morningStart = max(8, ...)` = 08:00 local with copy *"A moment to land before the week forms"*. Sunday evening Nudge 3 fires 17:00–19:30 with *"Monday is forming — N events Monday"*. The week-prep framing is wrongly attached to the **morning**, and the evening copy is too productivity-led. |
| 7 | "No JIT lure that pulls users in for mental prep" | `evaluateNudgeOne` JIT path requires **all** of: high-stakes event, `< 120 min` away, `confidenceBand !== 'none'`, AND `jit_horizons_surfaced != null`. In 7 days of logs across 10 active users, only **2 nudge_two events** ever fired and **0 nudge_one_jit / nudge_two_jit** variants are visible. The gate is too tight and there is no fallback wearable-driven JIT lure (e.g. "RHR elevated → recalibrate before your 3pm"). |

---

## The fix — Smart Nudges v5: "Chief of Staff for the Mind"

Single edge function update (`supabase/functions/smart-nudges/index.ts`). No DB schema changes. Cron stays at `*/10 * * * *`.

### 1. New global timing contract (kills 6am sends)

```
GLOBAL_EARLIEST_LOCAL = 8.0   // never fire any nudge before 08:00 local
GLOBAL_LATEST_LOCAL   = 21.0  // unchanged, evening close still ends 21:30 weekday
INTRA_TICK_MAX        = 1     // only one nudge per user per cron tick
```

Apply at the top of the per-user loop, **before** any evaluator runs. This is a hard floor; calendar anchoring can only push **later**, never earlier.

### 2. Calendar-anchored morning rule (when first meeting exists)

```
idealStart = firstMeetingLocalHour - (virtual ? 1.0 : 1.5)   // 60–90 min before
morningStart = max(8.0, idealStart)        // never before 8am
morningEnd   = max(morningStart + 1.5, idealStart + 1.0)
```

If no first meeting today **and** weekday: morning window is **08:00–09:30** with mental-performance copy ("Open your brief — set the day's decision posture"). If no first meeting **and** weekend: **skip morning nudge entirely** (Saturday) or **defer to evening** (Sunday).

### 3. Weekend rules (matches user's exact answer)

| Day | Morning | Evening (17:00–19:30 local) |
|---|---|---|
| **Saturday** | **Skipped** unless calendar has a meeting → then anchored 60–90 min before, recovery-framed copy ("Body needs a slower entry — open your brief before [Meeting]"). | Skipped (unchanged). |
| **Sunday** | **Skipped completely.** | Single nudge framed as **"recovery + mental prep for the week"** — references Monday's high-stakes event by name, never the word *"intent"*, *"plan the week"*, *"productivity"*. |

### 4. New copy contract (kills "productivity/strategy" tone)

Update both AI system prompt and all `getFallback*` strings to:

- **Always reference one of**: decision readiness, mental sharpness, physical reserves, resilience capacity, recovery, recalibration. (Vocabulary lifted from `mem://brand/terminology-standard-v3` and `mem://ui/performance-readiness/signal-pill-system`.)
- **Always end the body with an action verb pointing at an artefact**: `Open your brief`, `See your plan`, `Recalibrate now`, `Close the day`. Never *"check in when you are ready"*.
- **Forbidden words added to system prompt**: `intent`, `productive`, `productivity`, `strategy`, `strategic`, `plan the week`, `set the tone`, `your day, your terms`, `loaded day`, `5 days behind you`.
- **Required for JIT pre-event**: must reference (a) the meeting title, (b) the artefact (brief or plan), and (c) the mental-performance pillar at risk.

Examples (replacing current fallbacks):

| Current (bad) | New (Chief-of-Staff-for-the-Mind) |
|---|---|
| "Sunday reset — A moment to land before the week forms" | **DELETE** (no Sunday morning nudge) |
| "No agenda — Check in when you are ready, your day, your terms" (Sat) | **DELETE** unless meeting; if meeting: "Body's slower today — open your brief before [Meeting]" |
| "Monday is forming — Set your intent for the week before it sets you" (Sun PM) | "Heavy Monday ahead — 4 meetings incl. [Investor Update]. Open your brief tonight to set tomorrow's posture." |
| "Loaded day — N meetings today, set the tone before it sets you" | "N meetings, sharpness needs anchoring — open your brief to build today's plan." |
| "Day done — close the loop before switching off" | "5 meetings done. RHR elevated — close the day in 90 sec." |

### 5. JIT lures (the missing "pull into app" mechanism)

Loosen the gate and add **two** new JIT triggers (currently absent):

**A. Pre-event mental-prep lure** (existing, fixed):
- Trigger: high-stakes event in **30–180 min** (was 0–120). 
- Drop the `jit_horizons_surfaced` requirement — fire even if the JIT plan hasn't been precomputed; route depends on check-in state:
  - If check-in **not done** → `/daily-check-in` ("Open your brief — [Meeting] in 90 min, sharpness check first")
  - If check-in **done** → `/executive-home` ("Your prep plan is queued for [Meeting] — open it now")

**B. Wearable-state lure** (new):
- Trigger: `wearable.rhrElevated === true` OR `wearable.hrvDeltaPct < -15` AND user has not opened app in last 4 h AND there is at least one upcoming high-stakes event today.
- Copy: "Reserves down — recalibrate before [Next high-stakes event]". Route: `/daily-check-in`.

**C. Consecutive-low pattern lure** (new):
- Trigger: `consecutivePattern.count >= 2` AND no afternoon check-in.
- Copy: "Two days low on resilience capacity — open your brief to reset the trajectory."

Both B and C respect the global 2-h suppression and daily cap.

### 6. Hardened anti-stack rules (kills back-to-back fear)

- **Per-tick cap**: after evaluators run, sort qualified by priority and **emit at most 1**. (Currently we already pick best, but the JIT-override path can stack with priorities — close that.)
- **Per-type per-day cap = 1** (already enforced via `alreadySentTypes`, verified working).
- **Cool-down post-app-open**: if `lastAppOpen < 60 min ago`, suppress everything (currently 30 min). User just engaged → don't push.

### 7. Observability

Add a `[v5]` prefix to all logs and a `decision_trace` JSON field appended to `notification_log.payload` capturing: `{ window, anchorEvent, blockedBy, copyCategory }`. Lets us prove on a per-user basis why a nudge fired (or didn't) without re-running cron.

---

## Files to change

1. **`supabase/functions/smart-nudges/index.ts`** — full rewrite of:
   - `evaluateNudgeOne` (timing, anchor, weekend skip, JIT loosening)
   - `evaluateNudgeTwo` (add wearable-state + consecutive-low lures)
   - `evaluateNudgeThree` (Sunday recovery-mental-prep framing, no productivity vocab)
   - All `getFallback*Copy` (new vocabulary, action-verb endings)
   - `generateNudgeCopy` system prompt (forbidden words + required artefact reference)
   - Main loop: add `GLOBAL_EARLIEST_LOCAL` gate + per-tick cap + 60-min app-open cool-down
2. **`mem/features/notifications/smart-nudges-mvp-framework.md`** — update to v5 contract.
3. **No DB migrations.** Cron stays as-is. APNs config untouched.

## Validation plan (after deploy)

1. Read fresh `notification_log` rows and verify: zero sends < 08:00 local for any user.
2. Confirm **no** Sunday-morning sends; Sunday only fires once between 17:00–19:30 with Monday-prep mental-performance copy referencing a real Monday event title.
3. Confirm Saturday: zero sends unless a meeting exists; if it does, copy mentions the meeting + recovery framing.
4. Trigger a manual JIT test by inserting a fake high-stakes event 90 min ahead for a test user and re-running the function — verify the JIT lure fires with the correct route based on check-in state.
5. Inspect `payload->>'decision_trace'` on at least 5 fresh rows to confirm the trace explains the choice.

## Out of scope (intentionally deferred)

- Push-to-Android (function is iOS/APNs only today).
- Adaptive learning weights beyond the existing 7-day tap-rate model.
- New notification *types* beyond the 3 MVP categories — we keep `nudge_one`, `nudge_two`, `nudge_three` and add **variants** inside each.