# CEO Behaviour Rule Map (.ts ↔ Edge / LLM / Docs)

Cross-reference for `_shared/ceo-behaviour/`. Each rule maps to:

- **Doc anchor** — where the originating behaviour is described.
- **Signals consumed** — fields read off `SignalMatrix` / `RuleContext`.
- **Edge / LLM seam** — triangulation or side-effects the rule depends on but
  does NOT own (per the boundary in `mem/architecture/ceo-behaviour-shared-
  module-ownership.md`).

Phase 4 (flag flip + legacy detector deletion) is **paused** pending
triangulation-side work in Edge/LLM (mood × HRV × wearable-absence fusion).
The `.ts` library is being completed first so that the seam is unambiguous.

---

## Workweek cluster (`workweek.ts`)

| Rule | Doc | Signals consumed | Edge/LLM seam |
|---|---|---|---|
| `vetoRisk` | Brief §2.11 / Plan §2.11 / Nudges "veto risk" | hrvDeviationPct, sleepBelow6h, rhrDeviationPct, mentalSharpness, confidence, highStakesEventInNext24h, isHighVisibilityToday | None — pure shape over wearable + felt-state |
| `secondWind` | Brief §2.12 | morningWasCompressed, middayRecoveryDetected, highStakesEventInNext24h, localHour | Edge sets `middayRecoveryDetected` from HR/HRV trend |
| `circadianPriority` | Brief §2.13 / Plan §2.13 / Nudges travel framing | timezoneShift48hHours, travelDay | None |
| `decisionLeakageGuard` (4h, brief+nudge+plan) | Brief §2.14 / Nudges "decision_leakage" | emotionalDrainEventInNext4h, hrElevatedProxy, hrvDeviationPct, emotionalSelfDeclared | Mood gating is INSIDE this rule today (legacy parity). Edge owns the wider fusion in `personalFrictionWindow`. |
| `decisionLeakageGuardPlan` (24h tail, plan-only) — **Batch 4** | Plan §2.14 (legacy `decision_leakage` lines 3195–3370 in `generate-mastery-plan/index.ts`) | emotionalDrainEventInNext24h, emotionalDrainEventInNext4h (suppression guard) | Mood × HRV fusion stays in Edge; this rule only fires shape. |
| `personalFrictionInference` (stub) | Brief §2.16 | `signals.personalFrictionWindow` when populated | **Edge owns the detector** (mood × wearable-absence × Sun-pm/Mon-am window). Shared rule stays null until Edge writes the signal. |
| `boardLevelOutcome` | Brief §2.17 / Plan §2.17 / Nudges | isHighVisibilityToday, highStakesEventInNext24h | None |
| `sundayReset` | Nudges §5.2 | dayOfWeek, localHour | None |
| `notificationIsProduct` (nudge-only) | Nudges §5.2 + Smart Nudges Comprehensive Architecture | backToBackHoursToday, historicalAppOpenRateLow | Historical open-rate computed in Edge |

## Post-peak (`post-peak.ts`)

| Rule | Doc | Signals | Seam |
|---|---|---|---|
| `postPeakHangover` | Brief §2.15 / Plan §2.15 | yesterdayScore ≥ 75, hrvDeviationPct ≤ -10, sleepBelow6h, rhrDeviationPct ≥ 8 (any) | None — pure shape |

## Conference (`conference.ts`)

| Rule | Doc | Signals | Seam |
|---|---|---|---|
| `conferenceDepletion` (stub) | Brief §2.18 | `conferenceDayNumber` | Edge populates day-counter once `conference_day_number` field ships |

## Weekend ladder (`weekend.ts`)

| Rule | Doc | Signals | Seam |
|---|---|---|---|
| `weekendMorningLightTouch` | Weekend ladder spec | dayOfWeek, localHour | None |
| `weekendWithMeeting` | Weekend ladder | dayOfWeek, hasWorkMeetingOnWeekend | Edge classifies meeting vs personal |
| `fullWorkingWeekend` | Weekend ladder | dayOfWeek, weekendMeetingCountToday | None |
| `weekendDeepWorkBlock` | Weekend ladder | dayOfWeek, weekendWorkBlockToday | Edge detects deep-work block |
| `sundayEveningWeekAhead` | Weekend ladder + Brief §5.2 | dayOfWeek, localHour | None |

## PTO / Holiday (`pto-holiday.ts`)

| Rule | Doc | Signals | Seam |
|---|---|---|---|
| `holidayReducedTouch` | PTO ladder | ptoTodayAllDay | Edge classifies PTO/holiday |
| `ptoWithMeetingFallback` | PTO ladder | ptoTodayAllDay, hasWorkMeetingOnWeekend (or `ptoMeetingPresent` once populated) | Edge classifies |

## Travel (`travel.ts`) — overrides all other clusters

| Rule | Doc | Signals | Seam |
|---|---|---|---|
| `travelPreFlightMandatory` (tightened in Batch 4) | Nudges Tech Doc + Plan §2.13 travel | travelDay, **preFlightWindowMinutes** (first travel event of day), nextTravelEventTitle | Mechanical window in `brief-signal-coverage.ts` |
| `travelLandingOffload` | Nudges landing detector | travelLandingDetected, lastTravelEventEndedMinutesAgo, longHaulFlight, highStakesEventInNext24h | Edge owns landing detection (telecom signal) |
| `travelLandingPlusHighStakes` | Nudges landing+meeting | travelLandingDetected, highStakesEventInNext24h | Same as above |
| `longHaulRecovery` | Brief long-haul | longHaulFlight ≥3h | Edge sets duration |
| `postTripReentry` | Brief / Plan reentry | postTripReentryRisk | Edge computes risk |
| `travelInFlightConnection` (Batch 4) | New — derived from user direction on multi-leg travel | **inFlightConnectionMinutes**, nextTravelEventTitle | **Edge decides** if gap is a true connection (short layover, WiFi-realistic) vs long stopover (→ falls through to `advancePrep24h`) vs personal time (silent) |

## High-stakes prep (`high-stakes-prep.ts`)

| Rule | Doc | Signals | Seam |
|---|---|---|---|
| `advancePrep24h` | Brief §2.17 prep / Nudges 24h-ahead | highStakesEventInNext24h | None |

## Back-to-back + meeting-prep cliff (`back-to-back.ts`)

| Rule | Doc | Signals | Seam |
|---|---|---|---|
| `backToBackLoadOverride` | Brief back-to-back / Plan slot pressure | backToBackHoursToday | Edge computes back-to-back hours |
| `meetingPrepCliff` (nudge-only) | Nudges meeting-prep cliff | upcomingEvents with 5/15/30 min gaps | None |

## Multi-calendar (`multi-calendar.ts`)

| Rule | Doc | Signals | Seam |
|---|---|---|---|
| `multiCalendarLoad` | Brief multi-calendar | calendarSources, backToBackHoursAggregated | Edge dedupes across sources |

## Decision density (`decision-density.ts`) — Batch 3

| Rule | Doc | Signals | Seam |
|---|---|---|---|
| `decisionDensity` | New — Batch 3 | upcomingEvents (rolling 4h title scoring), decisionDensityScore | None |

## Batch 3 stubs (API surface locked; null until detectors land)

| Rule | Eventual signal | Edge/LLM seam |
|---|---|---|
| `interpersonalMeetingContext` | TBD | Detector lives in Edge |
| `emptySlotProtection` | TBD | Detector lives in Edge |
| `upwardReporting` | TBD | Detector lives in Edge |
| `stackedStakes` | TBD | Edge fuses multi-event stakes |
| `crisisInjection` | TBD | Edge consumes crisis signal |
| `contextSwitchingCost` | TBD | Edge computes per-day switching score |
| `preEventSleepTarget` (nudge-only) | TBD | Edge owns sleep-target math |
| `timeSinceLastRecovery` (nudge-only) | TBD | Edge tracks recovery timestamps |

## Delivery cluster (`delivery.ts`) — Batch 4, nudge-only

Ported from offline / DND / airplane-mode handling currently scattered inside
`smart-nudges/index.ts`. These rules are **policy shape only** — the edge
function still owns the outbox, APNS dispatch, and the retry mechanics.

| Rule | Signals consumed | Edge/LLM seam (side-effect owner) |
|---|---|---|
| `nudgeDeferOffline` | deviceOnline, airplaneModeActive | Edge: park nudge in `notification_outbox`; re-fire on next online event |
| `nudgeSuppressDND` | dndActive, dndEndsInMinutes | Edge: hold in outbox until `dndEndsInMinutes`, then re-evaluate |
| `nudgeStaleSkip` | deviceOnline, lastSeenOnlineMinutesAgo + upcomingEvents (TTL anchor check) | Edge: drop nudge from outbox without dispatch |
| `nudgeBatchOnReturn` | deviceOnline, lastSeenOnlineMinutesAgo | Edge: drain outbox as one APNS coalesced push instead of multiple |

---

## Phase 4 deletion targets (still parked)

- `supabase/functions/generate-mastery-plan/index.ts` lines ~3195–3485 (`detectCeoRealities`, `CeoRealityTag`, `strategicAnchorClause`, `tacticalClause`, `immediateClause`)
- `supabase/functions/smart-nudges/index.ts` lines ~937–1041 + `dayContext` consumers (~1325, 1346, 1700, 2046, 2253, 2437, 3059) + `buildDayShapeLine` (~1029)
- `supabase/functions/_shared/ceo-behaviour-rules.ts` (deprecated shim)

Deletion happens **after**:
1. `SHARED_MODULES_ENABLED = true` is flipped in consumers.
2. Triangulation fields (`personalFrictionWindow`, `inFlightConnectionMinutes`, `ptoMeetingPresent`, `deviceOnline`/`dndActive`/etc.) are populated by Edge before calling `evaluate({ scope })`.

---

## Conference / Summit cluster (v2)

Severity = engagement-type base × consecutive-day amplifier (capped at `high`).
Base ladder: attend-only=`low` | drop-in or stand-alone speaking=`medium` | attend + speaking inside a wrapper=`high`.
Amplifier: `+1` step per consecutive day beyond Day 1.

Every rule fires across `brief`, `plan`, `nudge` and includes a `· open-brief` or `· open-plan` hand-off in `copyHint`, **except** `conferenceMidSessionReset` which is nudge-only and carries `· inline-somatic` (no UI hand-off).

| Rule | Scopes | Trigger | Base severity | Hand-off |
| --- | --- | --- | --- | --- |
| `conferenceNightBeforeSummit` | brief, plan, nudge | `conferenceStartsTomorrow` AND `localHour ≥ 17`; escalates to `high` when `yesterdayWasTravelDay` or `travelDay` | medium → high (travel) | open-brief |
| `conferenceDayAttend` | brief, plan, nudge | `conferenceDayNumber ≥ 1` AND no `speakingBlocksToday` | low (day-count amplified) | open-plan |
| `conferenceDayWithSpeaking` | brief, plan, nudge | conference day AND ≥1 speaking block; suppresses attend rule | high | open-plan |
| `dropInSpeakingHighStakes` | brief, plan, nudge | ≥1 speaking block AND no conference wrapper; suppresses `advancePrep24h` for same anchor | medium | open-plan |
| `conferenceMidSessionReset` | **nudge only** | conference day AND `firstSessionGapMinutesToday ≥ 30` | medium | inline-somatic |
| `conferenceCarryFatigue` | brief, plan, nudge | `conferenceDaysInTrailing4 ≥ 1` AND today is not a conference day | low/medium/high (tracks `trailingConferenceLoad`) | open-plan |
| `postConferenceReentry` | brief, plan, nudge | `conferenceDayNumberYesterday ≥ 2`; escalates to `high` when `nextThreeDaysMeetingCount ≥ 10` | medium → high | open-brief |
| `conferenceDepletion` (legacy) | unchanged | `conferenceDayNumber ≥ 2` | medium/high | — |

### Travel ↔ Summit handoff

Travel cluster still overrides on the travel day itself. The single intentional co-fire is `conferenceNightBeforeSummit` reading `yesterdayWasTravelDay` / `travelDay` to escalate evening framing toward "offload travel + ground for summit."

### Signal source

All mechanical conference fields (`conferenceDayNumber`, `speakingBlocksToday`, `hasFullDayConferenceWrapper`, `firstSessionGapMinutesToday`, `conferenceDaysInTrailing4`, `trailingConferenceLoad`, `nextThreeDaysMeetingCount`, `conferenceStartsTomorrow`, `conferenceDayNumberYesterday`, `conferenceTotalDays`, `conferenceEventTitle`) are populated by `_shared/brief-signal-coverage.ts` for **all** surfaces (brief, plan, nudge). User-tag overrides (`userTaggedConferenceToday`, `userTaggedSpeakingToday`) and post-MVP `conferenceSocialLoadHigh` are written by the Edge consumer.

### MVP boundaries

- No 24h advance prep for speaking — proximity-only (morning + 45-min + night-before-summit).
- No automatic presenting-vs-attending beyond regex + user override.
- No social-load fusion yet — `conferenceSocialLoadHigh` is a stub field.
- No UI for user-tagging conference/speaking days (follow-up).
- `SHARED_MODULES_ENABLED` stays OFF until Phase 4.
3. One week of parity logging (console-first) shows no diffs against legacy detectors.