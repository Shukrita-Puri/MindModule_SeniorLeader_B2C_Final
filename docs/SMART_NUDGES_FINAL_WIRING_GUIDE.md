# Smart Nudges / Notifications — FINAL Wiring Guide (redesign)

Companion to `SMART_NUDGES_FINAL_SSOT.md`. Implementation order for the Nudges refresh. Steps are marked **[CURRENT]** (as shipped) or **[TARGET]** (build this).

**Edge functions:** `smart-nudges` (runner + APNs), `register-device-token`, `notification-engagement`, `notification-receipt`, `travel-notifications`, `test-push`.

---

## 1. Read first

- `supabase/functions/smart-nudges/index.ts`
- `supabase/functions/_shared/jit/slot-allocator.ts` (the slot model nudges now mirror)
- `supabase/functions/generate-mastery-plan/index.ts` (writes `mastery_plan_snapshots.horizon_modules` with `{ mode, arcLabel, jitPhase, jitEventTitle }`)
- `supabase/functions/_shared/ceo-behaviour/back-to-back.ts` (the cliff exception)
- `supabase/functions/_shared/load-brief-behaviour-snapshot.ts`, `_shared/plan/week-ahead-nudge.ts`, `_shared/plan/action-frame.ts`, `_shared/rules/calendar-merge.ts`, `_shared/brief/copy-vocabulary.ts`
- the shared travel-aware timezone resolver (Exec wiring §15.5)
- `src/hooks/useDeviceTokenRegistration.ts`, `src/hooks/usePushNotificationHandler.ts`, `src/pages/NudgeSettings.tsx`

---

## 2. Correct wiring shape (target)

```text
Executive cards build ONCE (State 1, pre-check-in):
  compute-inner-readiness → daily_context_snapshot (MRS baseline)
  compute-outer-readiness → brief_snapshots (behaviour snapshot, CoS voice)
  generate-mastery-plan   → mastery_plan_snapshots (M/A/E slots, full-arc, modes)
        |
        |  (nudges READ these — never recompute)
        v
smart-nudges (runner)
  STEP 0  resolve effectiveTimezone via SHARED resolver (travel-aware)      [CURRENT]
  STEP 1  read today's Plan slots from mastery_plan_snapshots               [CURRENT]
  STEP 2  one nudge per allocated slot, mirroring {mode,arcLabel,jitPhase}  [CURRENT core; keep refining copy]
  STEP 3  back-to-back cliff override (notification IS product, no CTA)     [CURRENT logic, wire as exception]
  STEP 4  simplified delivery guardrails                                    [TARGET]
  STEP 5  build copy (Context + CTA, CoS voice, measured-only, no em dash)  [TARGET]
  STEP 6  dispatch via APNs (per-period TTL + collapse)                     [CURRENT + per-period TTL]
        |
        v
notification_log + notification_evaluator_runs/traces
        |
        v
usePushNotificationHandler → notification-engagement / notification-receipt
```

---

## 3. Step-by-step wiring

```
STEP 0 → Resolve clock via the SHARED resolver   [CURRENT]
  REPLACE getUserLocalDate(profiles.timezone_offset)
  WITH    resolveEffectiveTimezone(user)  // shared with the cards (Exec §15.5)
          → effectiveTimezone, circadianTimezone, isAway
  Quiet-window + DND evaluated in circadian time (home tz ~2 days post long-haul).

STEP 1 → Read the Plan slots (source of the day's shape)   [CURRENT]
  READ: mastery_plan_snapshots WHERE (user_id, plan_date=today_local, mrs_window)
        → horizon_modules[] each { slotIndex, mode, arcLabel, jitPhase, jitEventTitle, whyLine, practice }
  RULE: do NOT re-derive morning/afternoon/evening. The Plan already decided the
        day shape (M/A/E, full-arc, light, rest, Sunday→week-ahead). Fewer slots ⇒ fewer nudges.
  Also READ (State-1 parity, not recompute):
        daily_context_snapshot (MRS baseline; readiness_state baseline|awaiting)
        brief_snapshots → loadBriefBehaviourSnapshot → snapshotToWiring(snap,'nudge')
        merged events via jit_event_context / calendar-merge.ts
        cos_profile (onboarding, via shared store) → notification-relevant brief_personalisation
          (brief_timing/reset_modality/weekend_signals), goals.declared, high_stakes_map,
          cognitive_load_map. "system decides" pref ⇒ run dynamic behaviour (never forced).
          [TARGET] arrives via the shared CHIEF_OF_STAFF_PERSONA unification (Onboarding §5).

STEP 2 → Project one nudge per slot   [CURRENT core]
  for each allocated slot:
    JIT slot       → Context = event (Immediate) + measured State/pattern → CTA /daily-check-in
    State slot     → Context = measured State (sleep|rhr|hr|hrv) → CTA /daily-check-in
    JIT+State slot → event + state blend → CTA /daily-check-in
    full_arc phase → Pre/During/Post copy from the slot's arcLabel/jitPhase
  Sunday/last-PTO/last-holiday afternoon-evening → Week-Ahead nudge instead of evening
        (shouldFireWeekAheadPickerInvite; own bucket; CTA /plan?mode=week-ahead)
  rest day with no slots → no nudge (Plan already suspended)

STEP 3 → Back-to-back cliff EXCEPTION   [wire back-to-back.ts as nudge-only]
  READ: _shared/ceo-behaviour/back-to-back.ts → backToBackLoadOverride, meetingPrepCliff
  IF meetingPrepCliff fires (gap 30–60 min before high-stakes / heavy load):
     → notification IS the product: full in-body 1–2 min reframe, NO app-open CTA,
       TTL = gap minutes − 1, severity by gap (5 high / 15 medium / 30 low).
  YIELDS to travel landing window.
  ⚑ CLEANUP: back-to-back.ts must import isHighStakesTitle from events/* (not the
     executive-state-taxonomy.ts legacy shim).

STEP 4 → Simplified delivery guardrails   [TARGET]
  KEEP:   effective-local window 08:00–21:30; DND (explicit pref); per-tick max 1;
          daily cap from Plan slot count (COUNTABLE_DELIVERY_STATES accounting);
          honest-copy validation; bad-token deactivation; dry-run if APNs secrets missing.
  REMOVE: MRS LIGHT_DAY_STRONG_STATE total suppression (→ if awaiting, send a sync nudge);
          low-power/battery gate; engagement multi-day suppression.
  MOVE UP: quiet-day suppression → handled at the Plan (no slot ⇒ no nudge).
  STALE:  "period" = the app's M/A/E window (Morning/Afternoon/Evening). per-period
          TTL = end of that M/A/E window (effective-local) + per-period collapse-id
          (keyed to the period), so a missed Afternoon nudge expires and never shows
          in the Evening — only the current period's push displays.

STEP 5 → Build copy   [TARGET]
  Voice: import the shared CHIEF_OF_STAFF_PERSONA (same as Brief + Plan); FORBIDDEN_NOTIFICATION_WORDS.
  Structure: Context + CTA (JIT → event/state + CTA). Immediate/Tactical/Strategic framing.
  Signals: sleep | rhr | hr | hrv — whichever is fresh+measured. NEVER fabricate/extrapolate
           (no carrying a stale HRV when the wearable was removed).
  Em dashes: strip/relabel '—' → '-'.
  First sentence = meaning, not a bare metric.
  Generation: Claude → Gemini → validated static fallback.

STEP 6 → Dispatch + persist
  APNs: collapsed-state headline (title) = brand 'Mind Module' ALWAYS (builds brand;
        users don't know it yet) — moment headline rides subtitle (≤3 words),
        Context+CTA in body. per-period ttlSeconds (= end of M/A/E window) + collapseId, badge.
        Validator forces collapsed title to 'Mind Module'.
  WRITE notification_log (accepted) + evaluator run/traces.
  notification-receipt flips accepted→delivered; notification-engagement records tap/dismiss/complete.
```

---

## 4. Travel-phase notifications (`travel-notifications`)   [TARGET change]

```
CURRENT: re-derives pre/during/post travel phases from travel_state transitions.
TARGET:  consume the Plan's full-arc (the Pre/During/Post the slot allocator already
         fanned for the dominant travel event) so travel pushes match the Plan exactly.
         Keep idempotency (user_id, phase, anchor_key) + stale cancellation.
         Use the SHARED effectiveTimezone/circadian resolver for timing.
```

---

## 5. Do not duplicate

Single evaluator (`smart-nudges`); single APNs sender; single token table; single delivery log; single calendar merge; single event taxonomy; single CoS persona; single timezone resolver. The day-shape decision lives in the **Plan**, not in the nudge runner. If you need shared behaviour, import a `_shared` helper.

---

## 6. Verification

1. Edge functions deployed: `smart-nudges`, `register-device-token`, `notification-engagement`, `notification-receipt`, `test-push`.
2. `?diagnostic=1` healthy; `?force_user=<id>&force_dry=1` writes run+traces, no APNs.
3. For a demand day: number of nudges == number of allocated Plan slots; each nudge's mode/phase matches its slot.
4. Rest/Saturday: no nudge (or single recovery nudge) — confirm Plan suspended slots.
5. Sunday evening: week-ahead nudge with `/plan?mode=week-ahead` CTA.
6. Travelling user: local hour / window evaluated in effectiveTimezone; no pre-dawn push; travel push matches Plan full-arc.
7. Back-to-back day: cliff nudge has no CTA, TTL = gap − 1.
8. Copy: cites only fresh measured signals (sleep/RHR/HR/HRV as available), no fabricated numbers, no em dashes, CoS voice, Context+CTA.
9. Missed-period: device offline in afternoon, online in evening → only the evening nudge shows.
10. Second-last day of month: monthly Insights nudge, CTA "tap to see how you performed this month".

---

## 7. Red flags

- Nudge runner re-deriving day shape instead of reading `mastery_plan_snapshots`.
- A nudge firing on a slot the Plan did not allocate (parity break).
- Suppressing on missing wearable / low battery / inactivity.
- HRV-only copy; any fabricated or stale number; a long em dash.
- A late nudge from a past period displaying.
- `travel-notifications` re-deriving phases the Plan already fanned.
- `back-to-back.ts` still importing from `executive-state-taxonomy.ts`.
- Habit CTA routing anywhere except `/daily-check-in`.
