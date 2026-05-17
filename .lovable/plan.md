
## Scope (Phase 1.5 — restructured by cluster)

Restructure `ceo-behaviour-rules.ts` from a flat rule list into **cluster files** under `_shared/ceo-behaviour/`. Each cluster file owns: rule(s), inline CLUSTER_DOC explaining how it lands in **brief vs plan vs nudge**, the signals it consumes, the downstream effects (copy framing, slot boost, nudge cadence). Add 13 new rules covering every behaviour in the attached doc that isn't already implemented. Travel always overrides. Multi-cal aggregates by event title only (no work/personal labels). Foreign-telecom field reserved on `SignalMatrix` for the future native bridge; calendar-end ships as the only landing signal today.

Ships in **3 batches** for safety. Phase 2 (edge-function wiring) is unchanged and still owns consumption.

---

## New file layout

```
supabase/functions/_shared/ceo-behaviour/
  index.ts              # barrel: re-exports ALL_RULES, types
  workweek.ts           # standard Mon-Fri rules (carry existing §2.11-2.17 here)
  weekend.ts            # weekend morning anchor + full sub-case ladder
  pto-holiday.ts        # PTO + public holiday reduced-touch
  travel.ts             # travel arc — PRE / DURING / POST / LANDING (overrides all)
  conference.ts         # multi-day external event (stub → full when day-counter ships)
  high-stakes-prep.ts   # 24h prep window (caps MVP at 24h per your direction)
  back-to-back.ts       # back-to-back load + meeting-prep cliff (notification-is-product)
  post-peak.ts          # post-peak hangover (existing rule, moved here)
  multi-calendar.ts     # aggregation + dedupe contract (title-based, calendar-neutral)
  decision-density.ts   # NEW — see §5 below for measurement proposal
  interpersonal.ts      # stub — needs attendee data
  empty-slot.ts         # stub — needs gap detector
  upward-reporting.ts   # stub — needs user-priority UI
```

The existing `ceo-behaviour-rules.ts` becomes a deprecated shim that re-exports from `./ceo-behaviour/index.ts` for one release, then is removed. No edge function imports break.

Cluster-file template (every file follows this shape):

```ts
/**
 * CLUSTER: <name>
 * SOURCE: doc §<x>, row <y>
 *
 * APPLICATION:
 * - BRIEF: <how copyHint shapes the morning brief body>
 * - PLAN:  <which slot gets boosted, what practiceType, severity scaling>
 * - NUDGE: <cadence override, timing rules, notification-is-product applicability>
 *
 * SIGNALS CONSUMED: <list from SignalMatrix + RuleContext>
 * OVERRIDES: <what other clusters this suppresses; e.g. Travel suppresses Weekend>
 * NOT IN MVP: <intentional exclusions>
 */
```

---

## Cluster inventory (full vs stub)

| Cluster | Rule(s) | Status | Notes |
|---|---|---|---|
| Workweek | vetoRisk, secondWind, circadianPriority, decisionLeakageGuard, postPeakHangover, personalFrictionInference, boardLevelOutcome, sundayReset, notificationIsProduct | Carry existing | Move into `workweek.ts` |
| Weekend | `weekendMorningLightTouch`, `weekendWithMeeting`, `fullWorkingWeekend`, `weekendDeepWorkBlock`, `sundayEveningWeekAhead` | **FULL (5 rules)** | Sub-case ladder per your direction |
| PTO/Holiday | `holidayReducedTouch`, `ptoWithMeetingFallback` | **FULL** | All-day title match; meeting on PTO → revert to standard prep |
| Travel | `travelPreFlightMandatory`, `travelLandingOffload`, `travelLandingPlusHighStakes`, `longHaulRecovery`, `postTripReentry` | **FULL (5 rules)** | Overrides Weekend, PTO, Workweek when active |
| Conference | `conferenceDepletion` | Stub (existing) | Lights up when `conferenceDayNumber` schema lands |
| High-stakes prep | `boardLevelOutcome` (carries), `advancePrep24h` | **FULL** | Capped at 24h per your direction; no 48h prep |
| Back-to-back | `backToBackLoadOverride`, `meetingPrepCliff` | **FULL** | Cliff: 5/15/30min gaps → notification-is-product applies |
| Post-peak | `postPeakHangover` (carries) | Already done | Move file only |
| Multi-calendar | `multiCalendarLoad` + `calendar-dedupe.ts` helper | **FULL** | Title-based dedupe, calendar-neutral, no source labels |
| Decision density | `decisionDensity` | **FULL with measurement proposal** | See §5 |
| Interpersonal | `interpersonalMeetingContext` | **Stub** | Needs attendee count |
| Empty slot | `emptySlotProtection` | **Stub** | Needs gap detector |
| Upward reporting | `upwardReporting` | **Stub** | Needs user-priority UI |

Out of MVP per your direction: stakes hierarchy refactor, returning-from-illness, recurring-event fatigue, sleep-debt accumulation (stays at LLM/edge-function level).

---

## 1. Weekend cluster — sub-case ladder

`weekend.ts` evaluates these in order; first match wins:

```ts
// 1. Travel active? → return null, let travel.ts carry
// 2. PTO/holiday active and no meeting? → return null, let pto-holiday.ts carry
// 3. Full working weekend (≥3 meetings spread across the day) → workweek rules apply,
//    return a marker flag so brief/plan/nudge know to use Mon-Fri framing
// 4. Weekend morning + work meeting in next 90min → prep framing, 60-90min pre-meeting nudge
// 5. Weekend large work-block (title matches WORK_BLOCK_RX: pitch prep|presentation|
//    deep strategy|client work|board prep|earnings prep) → workday framing,
//    late-morning nudge 8-10am, 60-90min before block
// 6. Sunday afternoon/evening (Sun 14:00+) → mandatory restore + week-ahead prep
//    (extends existing sundayReset; sundayReset becomes the 18-21 sub-window)
// 7. Saturday/Sunday morning, no work → weekendMorningLightTouch, late-start cadence,
//    restoring framing
```

Rules emitted (one per matched sub-case):

```ts
weekendWithMeeting       // severity: medium; copyHint: pivot to prep, name the meeting
fullWorkingWeekend       // severity: medium; copyHint: weekend acts as work week — protect Mon recovery
weekendDeepWorkBlock     // severity: low;    copyHint: solo deep work day, frame flow not recovery
sundayEveningWeekAhead   // severity: medium; copyHint: anchor the week; Mon is a readiness asset
weekendMorningLightTouch // severity: low;    copyHint: late-start, restoring, no day-shape framing
```

**Brief**: cluster pill in the readiness brief ("Weekend · restoring" / "Weekend · work block ahead" / "Sunday · week-ahead anchor").
**Plan**: `weekendMorningLightTouch` → suppress slot 2 and slot 3 boosts; `weekendDeepWorkBlock` → boost `prepare` (flow) into the slot before block start; `fullWorkingWeekend` → identical boosts to weekday.
**Nudge**: morning timing override — light-touch sends 08:30-10:00 local; work-block / meeting variants send 60-90min before; Sunday afternoon variant sends at 17:00-19:00 with week-ahead framing.

---

## 2. Travel cluster — overrides everything

`travel.ts` returns flags before any other cluster evaluates. Travel always wins.

```ts
travelPreFlightMandatory      // today is travel day, no landing yet → mandatory self-reg
travelLandingOffload          // landing detected, no high-stakes follow-up → decompress
travelLandingPlusHighStakes   // landing + high-stakes within 24h → offload then prep
longHaulRecovery              // duration ≥3h, return day → full decompression
postTripReentry               // yesterday was travel day, next-day calendar density ≥medium
```

Landing detection (Batch 2, ships with `signals.travelLandingDetected = true` ONLY when):
- `signals.foreignTelecomDetected === true` (reserved field, populated by future native bridge), OR
- A calendar event whose title matches `TRAVEL_RX` has just ended (within last 60 min)

You confirmed I should ship calendar-end now and reserve the telecom field. The field is added to `SignalMatrix` in Batch 1 but always set to `false` until the native bridge lands.

Landing-plus-high-stakes nudge fires **60 min after landing end-time** to account for immigration/cab time, per your spec.

**Brief**: anchors the brief to "Landing → [next event]" or "Travel day — protect tomorrow".
**Plan**: `regulate` (somatic pause) into the slot closest to landing+60min; `integrate` into the evening slot for long-haul.
**Nudge**: pre-flight 60-240min before flight; landing nudge T+60min; long-haul evening nudge fixed at 21:00 local at destination.

---

## 3. Back-to-back cluster — meeting prep cliff

`back-to-back.ts` emits two rules:

```ts
backToBackLoadOverride // ≥4h back-to-back today + ≥1 gap <15min → light-touch mode
meetingPrepCliff       // any pre-event gap ∈ {5,15,30}min before a high-stakes event → notification-is-product
```

`meetingPrepCliff` is your "2nd nudge" rule: when the user has a gap of 5/15/30min between a meeting and a high-stakes block, the **next nudge MUST be a complete micro-reframe in the body** with no "open the app" CTA. This is `notificationIsProduct` but triggered by gap structure instead of historical open rate.

Severity:
- gap == 5min → high (compressed, no time even to read more than the title)
- gap == 15min → medium (one-line reframe + 90-second cue)
- gap == 30min → low (still actionable, can include a "tap for 2-min reset" CTA)

Required `RuleContext` additions:
```ts
nextPreEventGap?: { gapMinutes: number; nextEventTitle: string; nextEventStakes: string | null } | null;
```

**Brief**: not surfaced (cliffs are intra-day, nudge-only signal).
**Plan**: no boost; the slot is already too compressed.
**Nudge**: forces notification-is-product copy contract — full reframe in body, no app-open CTA, TTL = gap minutes − 1.

---

## 4. Multi-calendar cluster — no source labels

`multi-calendar.ts` + `calendar-dedupe.ts` helper.

Per your direction: **no calendar is labeled work/personal**. High-stakes is decided purely by event title scoring (existing `isHighStakesTitle` / `highStakesScore` continue to own this). Multi-cal is purely a load-accuracy concern.

Dedupe key (calendar-neutral, picks ONE event from N duplicates):
1. Normalize titles (lowercase, trim, strip emoji/trailing punctuation).
2. Two events from different calendar sources are duplicates if:
   - Normalized title matches exactly, OR
   - Start time within ±2 min AND end time within ±2 min (title-agnostic — collapses renamed copies).
3. Same start time (no end-time check) → counted as 1 for **load** scoring (can only attend one).
4. For JIT selection: pick the variant with the highest title-based stakes score (already implemented in `highStakesScore`).
5. All-day events excluded from `backToBackHoursAggregated` (fixes load inflation from OOO/Holiday/Travel all-day blocks).
6. Log `dedupeReason: "title" | "timeslot" | "all-day-filter"` for tunability.

`multiCalendarLoad` rule fires only when `calendarSources.length ≥ 2 AND backToBackHoursAggregated ≥ 4`. Severity climbs at ≥6h.

**Brief**: evidence pill "load spans X calendars" to prevent the LLM from under-weighting cross-source load.
**Plan**: no direct boost; downstream rules read the aggregated number.
**Nudge**: nothing direct; back-to-back cluster reads the aggregated number.

---

## 5. Decision density — NEW rule with measurement proposal

`decision-density.ts` emits `decisionDensity`. Recommended measurement model (senior-engineer take, three layers, cheap to ship):

**Layer 1 — Title scoring (ships in Batch 2):**
```ts
const DECISION_KEYWORDS = [
  "decision","approval","approve","review","sign-off","sign off",
  "go/no-go","go no go","vote","budget","hiring","termination","firing",
  "promotion","investment","commit","kick-off","launch","close","offer",
];
const DECISION_BOOST_KEYWORDS = ["board","investor","exec","leadership","strategy"];
function decisionScore(title: string): number {
  // 1.0 baseline if any DECISION_KEYWORD; +0.5 if also a BOOST keyword;
  // +0.3 if attendee count ≥6 (committee); +0.2 if duration <30min (compressed).
}
```

**Layer 2 — Attendee weight (when calendar API exposes attendees):**
- attendees ≥ 6 + decision keyword → "committee decision" (weight ×1.5)
- attendees == 2 + decision keyword → "1:1 ask" (weight ×0.7)
- attendees unknown → weight ×1.0 (don't penalize iOS aggregated events)

**Layer 3 — Rolling window:**
```ts
decisionDensityScore = sum(decisionScore(e) × attendeeWeight(e)) over events in next 4h
```

Thresholds:
- score ≥ 4.0 → high
- score ≥ 2.5 → medium
- < 2.5 → null

`RuleContext` additions:
```ts
upcomingEvents: Array<{ ...existing, attendeeCount?: number, durationMinutes?: number }>;
```

`SignalMatrix` additions:
```ts
decisionDensityScore: number | null;
decisionDensityWindow: "next-4h" | null;
```

**Brief**: surfaces "X decisions clustered between Y and Z" when score ≥ medium.
**Plan**: `prepare` (mindset flow) boosted into the slot preceding the densest window; severity drives magnitude.
**Nudge**: when score ≥ high AND `meetingPrepCliff` is also firing, severity stacks to high.

Open question for you below.

---

## 6. Stubs (return null; lock API surface)

```ts
emptySlotProtection         // row 7 — needs hasUpcomingEmptyBlock detector
interpersonalMeetingContext // row 5 — needs nextInterpersonalEvent + attendees
upwardReporting             // row 11 — needs userMarkedPriorities (UI dependency)
multiCalendarLoadDistortion // covered by multiCalendarLoad above; alias kept for doc traceability
stackedStakes               // §5.2 — same-day board + emotional; needs joint stakes detector
crisisInjection             // unscheduled high-stakes pushed by user manually; UI dependency
contextSwitchingCost        // back-to-back across different domains; needs event-topic classifier
preEventSleepTarget         // tomorrow's high-stakes drives tonight's sleep target reference
timeSinceLastRecovery       // long gap since last completed practice + active stakes
```

Each ships with the standard header: trigger, required field, dependency.

---

## 7. Senior-engineer probes — gaps to confirm or skip

These are things I'd expect to handle but the doc doesn't address. Confirm full / stub / skip for each:

1. **Crisis / unscheduled high-stakes injection.** Calendar-only systems miss "board call in 90 min, just added by exec assistant" until the next calendar sync. Should we let the user manually flag a crisis in the UI (button: "Unplanned high-stakes in __ min") that feeds `RuleContext.crisisEvent`? Listed as `crisisInjection` stub above.

2. **Context-switching cost (different from back-to-back).** 4×30min Eng standups feel different from Eng→Legal→Sales→Board. Needs a topic classifier on event titles. Worth a stub now? Listed as `contextSwitchingCost`.

3. **Pre-event sleep targeting.** Tonight's evening nudge when tomorrow has a 9am board call should say "bank 7.5h, board at 9am" — different from `vetoRisk` (which is reactive). Listed as `preEventSleepTarget` stub.

4. **Time-since-last-recovery.** System already knows last completed practice timestamp. Long gap (>36h) + active high-stakes today = stronger nudge severity. Worth lighting up now?

5. **Personal calendar events on a workday.** "Personal Training 6am", "Therapy 4pm", "Kids pickup 5pm" — should these add to total cognitive load, or stay invisible to the system? Affects whether `multiCalendarLoad` should distinguish event categories.

6. **Sunday anticipation anxiety vs Sunday Reset.** Distinct case: Sun PM + heavy Monday + historically low Mon-AM open rate. The Sun-PM nudge IS the brief for tomorrow. Currently your `sundayReset` covers 18:00-21:00 — should this expand or split? I've drafted `sundayEveningWeekAhead` (Sun 14:00+) as a separate rule that complements `sundayReset` instead of replacing it.

7. **Decision density attendee data — confirm availability.** Google Calendar API exposes `attendees[]`. Microsoft Graph exposes `attendees[]`. Apple EKEvent on iOS exposes `attendees` array but commonly nil for invites synced from other systems. Confirm: should Layer 2 (attendee weight) ship in Batch 2 with the understanding that iOS-aggregated events get weight 1.0 (no penalty), or wait until we know attendee data quality?

8. **Decision-keyword false positives.** Words like "review" and "kick-off" are noisy (1:1 reviews, sprint reviews, project kick-offs). Want me to gate with a co-occurrence requirement (must include both a DECISION_KEYWORD and one of {board, exec, leadership, investor, budget, hiring}), or trust the layered score to handle noise?

---

## 8. Batch plan (ships safely in 3 PRs)

**Batch 1 — Types + restructure (no behaviour change).**
- Create `_shared/ceo-behaviour/` directory with cluster files, each containing existing rules in their correct cluster.
- Add new `RuleContext` + `SignalMatrix` fields (all optional, default false/null).
- `ceo-behaviour-rules.ts` becomes a shim re-exporting from the barrel.
- Existing 23 tests stay green. Zero edge function edits.

**Batch 2 — Full implementations.**
- `weekend.ts` (5 sub-cases), `pto-holiday.ts` (2 rules), `travel.ts` (5 rules, telecom field reserved), `back-to-back.ts` (cliff + override), `high-stakes-prep.ts` (24h cap), `multi-calendar.ts` + `calendar-dedupe.ts`.
- Tests for each cluster + dedupe helper.
- Still zero edge function edits.

**Batch 3 — Decision density + stubs.**
- `decision-density.ts` with Layer 1 + Layer 2 (attendee-aware).
- All stubs (`interpersonal.ts`, `empty-slot.ts`, `upward-reporting.ts`, `stackedStakes`, `crisisInjection`, `contextSwitchingCost`, `preEventSleepTarget`, `timeSinceLastRecovery`).
- MIGRATE-FROM-EDGE inventory documented in `mem/architecture/ceo-behaviour-shared-module-ownership.md` so the next PR can route consumers through `evaluate()` and delete the duplicate logic in `generate-mastery-plan` lines 3195-3370 and `smart-nudges` lines 940-1041.

Each batch is independently mergeable, additive, and reversible. Phase 2 wiring (consumers calling `evaluate({scope})`) remains gated behind `SHARED_MODULES_ENABLED`.

---

## 9. Tests

Per cluster file: 3-6 tests covering trigger conditions, severity ladder, override behaviour (e.g. travel suppresses weekend), and stub null-return contracts. Plus `calendar-dedupe.test.ts` for the 5 dedupe key cases including all-day filter and title-vs-timeslot dedupe reason logging.

Target: ~60 tests by end of Batch 3, up from current 23.

## Verification

- `deno test` green after every batch
- Type-check clean across `_shared/`
- `evaluate(ctx, { scope })` filtering remains correct as cluster files re-export
- Zero edits to edge functions in this plan (Phase 2 still owns wiring)
- MIGRATE-FROM-EDGE list complete in memory doc so future deletion is a 1-PR job

Answer the 8 probes inline or after the plan implements — I can start Batch 1 immediately and surface Batch 2/3 questions as we reach them.
