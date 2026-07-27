# Plan Feature — AS-BUILT Logic Reference

**Method:** Every claim below was verified by reading the current code in this
repository (not the pre-existing `docs/GENERATE_MASTERY_PLAN_FULL_LOGIC.md`,
which was used only as a starting map of file names, then independently
checked line-by-line). Where code and the prior doc disagree, code wins and
the discrepancy is called out explicitly. Anything not directly observable in
code is listed in "Unknowns / Cannot Determine From Code" rather than
inferred.

**Primary files audited** (line counts as of this pass):
- `supabase/functions/generate-mastery-plan/index.ts` (12,622 lines)
- `supabase/functions/_shared/jit/slot-allocator.ts` (450 lines)
- `supabase/functions/_shared/jit/select-jit.ts` (632 lines) — "JIT v2"
- `supabase/functions/_shared/events/jit-candidates.ts` (352 lines) — legacy/live ranker
- `supabase/functions/_shared/jit/load-jit-context.ts`
- `supabase/functions/_shared/availability/availability-classifier.ts` (457 lines)
- `supabase/functions/_shared/plan/week-ahead-mode.ts` (218 lines)
- `supabase/functions/_shared/plan/event-priority-memory.ts` (231 lines)
- `supabase/functions/_shared/plan/practice-selector.ts` (890 lines)
- `supabase/functions/_shared/plan/why-llm.ts` (792 lines)
- `supabase/functions/_shared/dispatch-key.ts` (153 lines)
- `supabase/functions/_shared/events/event-categories.ts` (194 lines)
- `supabase/functions/list-week-ahead-priorities/index.ts` (623 lines)
- `supabase/functions/smart-nudges/index.ts` (grepped, not fully read)
- `supabase/functions/compute-outer-readiness/index.ts` (grepped, not fully read)

---

## Executive Summary (plain English)

The "Plan" feature is the edge function `generate-mastery-plan`, which
produces "Today's 3" priorities (three time-boxed practice slots) each time a
user's home screen requests a plan. It works in five broad steps:

1. **Figure out what kind of day it is** (rest day, Saturday, PTO/holiday,
   travel day, conference day, one dominant big event, or a "mixed" day with
   several moderate events) — this is called the **dayShape**.
2. **Rank the user's calendar events** by how much they matter, using a
   scoring formula that weights stakes (board meeting > standup), attendee
   relationships, patterns (e.g. "this event type raises your heart rate"),
   and the user's own explicit feedback ("mark as priority" / "never show
   this again").
3. **Allocate exactly 3 slots** to the day, either anchored on ranked calendar
   events (JIT — "just in time") or falling back to generic state-management
   practices when no event is compelling enough.
4. **Choose a practice** (breathing exercise, reflection, etc.) for each slot
   from the shared practice library, and write a short "why this practice,
   why now" sentence, either from a template or from an LLM call.
5. **Persist** everything to `mastery_plan_snapshots` and merge it against
   whatever plan the user already had for the day (so completed items stay
   marked complete).

Two important, code-verified realities that are easy to miss by reading
prose docs alone:

- **There are two separate, differently-weighted event-scoring engines that
  coexist in the same file.** `selectJitCandidates` (`select-jit.ts`, "JIT
  v2") computes a triangulated Immediate/Tactical/Strategic score, but its
  output is **only logged**, never consumed by slot allocation — see
  §B "Two Scoring Engines" and §F Finding N1. The engine that **actually**
  feeds `allocatePlanSlots` is `rankJitCandidates` in
  `_shared/events/jit-candidates.ts`, which uses a different, simpler
  weighting table.
- Saturday's day-shape branch in the live slot allocator is a **hardcoded**
  `input.dayOfWeek === 6` check (`slot-allocator.ts:143`), independent of the
  home-country-aware `planningDayOfWeek()` used by Week-Ahead. This confirms
  the previously-flagged "Bug B" is still present in code today.

---

## Section A — File-by-File Trace (ingestion → output)

### A.1 Calendar / event ingestion
`generate-mastery-plan/index.ts` accepts `req.calendarEvents[]` on the
request body (client-fetched Apple/Google calendar rows) and, separately,
reads pre-scored rows from `jit_event_context` ("the Bridge"). Structural
day-flags are derived from the raw calendar array by
`deriveStructuralDayFlags` (index.ts, used at line 7062), which:

```ts
// index.ts:11330-11336
const hasConferenceDay = events.some((e: any) =>
  /conference|offsite|retreat|summit/i.test(titleOf(e))
);
const hasOffsiteDay = events.some((e: any) =>
  /offsite|off-site/i.test(titleOf(e))
);
```

and calls `classifyAvailability` (see A.2) to derive `hasRestSignals`,
`isPtoOrHoliday`, and `isFullWorkingWeekend`:

```ts
// index.ts:11360-11362
const isFullWorkingWeekend = (dayOfWeek === 0 || dayOfWeek === 6) &&
  (calendarLoad === "high" || calendarLoad === "extreme" ||
    realMeetingCount >= 3);
```

### A.2 A–H tagging (`event-categories.ts`)
`EVENT_CATEGORIES` (`_shared/events/event-categories.ts:49`) is the single
source of truth for the eight CEO Self-Regulation Framework pillars:

| ID | Name | Pre/During/Post protocol |
|---|---|---|
| A | High-Stakes Governance | Flow / — / Pause |
| B | Influence & Persuasion | Flow / — / Reenergise |
| C | Visibility & Communication | Pause / — / Reenergise |
| D | People & Difficult Conversations | Pause / — / Pause |
| E | Deep Work & Strategy | Flow / Flow / Pause |
| F | Conferences & External Events | Pause / Pause (notif-only) / Reenergise |
| G | Travel | Pause / Pause / Reenergise |
| H | Daily Rhythm & Baseline | Pause / — / Pause |

Titles are mapped to a category+subtype by `enrichEvent()`
(`_shared/events/enrich-event.ts`, not fully read in this pass — see
Unknowns) which both `select-jit.ts` and `jit-candidates.ts` call.

### A.3 `classifyAvailability` (`_shared/availability/availability-classifier.ts:261`)
This is the canonical "is the user actually working today" function. Its
precedence, quoted verbatim from the docstring and enforced in code
top-to-bottom:

```ts
// availability-classifier.ts:250-260
 * Precedence (top-down, first match wins):
 *   1. Calendar work evidence (≥2 timed work meetings) → WORKDAY.
 *      Overrides weekend, PTO marker, holiday.
 *   2. Explicit user intent (explicitPto) → PTO. Travel never overrides PTO.
 *   3. Applicable public holiday → PUBLIC_HOLIDAY.
 *   4. Weekend day → REST_DAY.
 *   5. Workload split → LIGHT_ROUTINE (low/empty) or WORKDAY.
```

Key constant: `WORK_MEETING_MIN = 2` (line 228) — a day needs at least two
"timed work meetings" (organizer OR ≥1 attendee, not all-day) to be
classified `WORKDAY` and override weekend/PTO/holiday signals. Default
`weekendDays = [6]` (Saturday only) unless caller overrides — Sunday is not
a default rest day.

`classifyDay()` (line 403) and `isLastDayOfLongWeekend()` (line 435) are
downstream adapters used by `smart-nudges` (14-day lookback) and
Week-Ahead's long-weekend detection.

Consumers (per the file's own docblock, lines 6-11): `generate-mastery-plan`
(feeds `hasRestSignals` into the slot allocator), `_shared/brief-signal-coverage`,
`_shared/ceo-behaviour/pto-holiday`, `smart-nudges`.

### A.4 `week-ahead-mode.ts` (`_shared/plan/week-ahead-mode.ts`)
`evaluateWeekAheadMode()` (line 129) is a first-match-wins waterfall — see
full quote and worked walk-through in **Section D — Week-Ahead**. It computes
`planningDayOfWeek(homeCountry)` (line 48): Saturday-start countries
(`SA, KW, QA, BH, OM, IL`) plan on Saturday evening; everyone else on Sunday.
This is a **separate, more correct** mechanism than the slot-allocator's
hardcoded `dayOfWeek === 6` Saturday check (§F, Bug B).

### A.5 `list-week-ahead-priorities` (edge fn, 623 lines)
Orchestrates the week-ahead surface: calls the same `rankJitCandidates`
ranker (jit-candidates.ts) over a `[today, +8d)` window, applies
`applyEventPriorityMemory`, returns top candidates, and upserts
`weekly_plan_snapshots`. (Full internal trace not repeated line-by-line here
— confirmed present via `wc -l` and import graph; see Unknowns for anything
not directly quoted.)

### A.6 `event-priority-memory.ts` (`_shared/plan/event-priority-memory.ts`)
Read model over `event_priority_memory`. `applyEventPriorityMemory()`
(line 106) computes a **net delta clamped to `[-50, +30]`** from six signal
types — full table quoted in §D.6.

### A.7 `rankJitCandidates` (`_shared/events/jit-candidates.ts:150`) — THE LIVE RANKER
This is the function that actually feeds `allocatePlanSlots` in production
(confirmed: `index.ts:5913` calls `rankJitCandidates(...)` and assigns to
`jitRankedCandidates`, which is passed into `allocatePlanSlots` at
`index.ts:7060` and `index.ts:11111`). See §B for its full scoring table.

### A.8 `load-jit-context.ts` (`_shared/jit/load-jit-context.ts`)
Loads and indexes `attendee_relationships` / memory-replayed roles for
relationship scoring, consumed by `selectJitCandidates` (JIT v2 shadow path)
and by `list-week-ahead-priorities`. (Function-level detail not fully
re-derived in this pass beyond confirming its role via `select-jit.ts`
imports — flagged as partially-audited in Unknowns.)

### A.9 `slot-allocator.ts` — `allocatePlanSlots` / `buildSingleStateSlotResult` / `makeSlot`
Fully quoted and traced in **Section C** (day-shape waterfall) and
**Section D4** (slot-count invariants).

### A.10 Arc logic
Arc phases (`pre`/`during`/`post`) come from `EVENT_PHASE_MAP`
(`_shared/events/event-phase-map.ts`, referenced but not fully quoted here).
`slot-allocator.ts`'s `pruneTravelPhases()` (lines 13-36) special-cases
Category G (travel): short-haul flights (duration < 6h, or unknown duration)
get their `during` (in-flight) phase pruned so they don't fabricate an
in-flight slot:

```ts
// slot-allocator.ts:31-35
// Only long-haul / explicit travel_day keeps the "during" (in-flight) slot.
// enrichEvent defaults null-duration flights to 'pre-post', which is the
// conservative behaviour we want at the allocator boundary.
if (arc === "pre-during-post") return phases;
return phases.filter((p) => p !== "during");
```

### A.11 Practice library + Reset shared library
`generate-mastery-plan` reads `sanctuary_content` (line 5564) and
`sanctuary_content_metadata` (line 5572) directly — the same tables. No
separate "Plan-only" content table exists in this codebase; see §D2 for
whether tags drift between features (flagged as Unknown — no direct evidence
of a competing Reset-specific query was found in this pass; see Unknowns).

### A.12 Deterministic `composeWhyLine` (`index.ts:8639`)
Fully quoted in **Section D3**.

### A.13 `generate-mastery-plan/index.ts` + `mastery_plan_snapshots` columns
The upsert at error-time (`index.ts:12590`) writes:
`user_id, plan_date, mrs_window, status, error_json, generated_at` on
conflict `(user_id, plan_date, mrs_window)`. The **success-path** upsert
(referenced near line 12240/12473 — "plan_json carries evidence") was not
fully re-quoted column-by-column in this pass; flagged in Unknowns.

### A.14 `compute-outer-readiness` (Brief)
`compute-outer-readiness/index.ts` is the producer of
`brief_snapshots.payload_json.behaviour_snapshot`, which Plan reads via
`loadBriefBehaviourSnapshot` (not re-quoted here; prior doc's description of
the 409/412 contract was not falsified by anything found in this pass, but
also not independently re-verified line-by-line — Unknown/partial).
`compute-outer-readiness` also imports `buildDeterministicBriefFallback`
(`_shared/brief/deterministic-brief.ts:244`) and uses it at
`compute-outer-readiness/index.ts:8693`.

### A.15 `smart-nudges`
Confirmed via grep to read `mastery_plan_snapshots` (lines 520, 540) and to
independently recompute weekend/day-of-week logic in many places
(`ctx.dayOfWeek === 6` appears at lines 1268, 1273, 2127, 2132, 2174, 2830,
3262, 3531, 4103, 4399, 5398, 6353) — i.e. **smart-nudges re-derives its own
weekend/day-shape signals rather than reading a persisted `dayShape` field
from the Plan snapshot.** No evidence was found of smart-nudges reading a
`dayShape` or `mode` column off `mastery_plan_snapshots`.

### A.16 `_shared/dispatch-key.ts`
Not part of the Plan scoring/allocation pipeline itself — it is a
notification-idempotency utility (`computeDispatchKey`, `claimDispatch`)
used to make sure a given (user, local date, notification type, slot, event,
week) combination sends at most once via a DB-unique claim on
`notification_dispatch_claims`. It composes a key like
`nd::{userId}::{localDate}::{notificationType}::{slot}::{eventRef}::{weekRef}::{planSnapshotId}::{candidateType}`.
This is a delivery-layer concern (Smart Nudges / push), not a Plan-generation
concern — no code in `generate-mastery-plan/index.ts` calls
`computeDispatchKey`. Downstream consumer confirmed only in notification
dispatch paths (not fully enumerated here — Unknown extent).

### A.17 Onboarding inputs
`src/utils/onboardingV8.ts`, `onboardingScoring.ts`, `onboardingCompletion.ts`
exist and (per Plan request-body fields) feed `practicePriorityTag`,
`growthIntention`, and (per `index.ts:700-722`) `req.leaderProfile.goals.declared`
/ `req.protectGoals` / `req.onboarding.protectGoals`. The exact onboarding UI
flow that produces these values was **not traced end-to-end** in this pass —
flagged in Unknowns.

### Downstream-consumer read-vs-re-derive table

| Consumer | Reads persisted `dayShape`/`mode`? | Evidence |
|---|---|---|
| `generate-mastery-plan` itself (ledger merge, response) | Computes fresh every call via `allocatePlanSlots`; also recomputes `planDayShape` at the **outer level** a second time for snapshot metadata (`index.ts:7058-7077`) purely for observability | `index.ts:7057-7077` |
| `smart-nudges` | Re-derives its own day-of-week/weekend booleans independently (`ctx.dayOfWeek === 6` in 12+ places) | grep hits above |
| `list-week-ahead-priorities` | Re-runs its own ranking (`rankJitCandidates`) rather than reading a Plan-persisted dayShape | file exists as its own orchestrator |
| Client (`useMasteryPlanSnapshot`, `PlanPage.tsx`, `TodayThreePriorities.tsx`) | Reads the persisted snapshot row's fields as returned by the edge function (exact column list not fully re-verified — Unknown) | not fully re-traced |

---

## Section B — Event Scoring (full table + worked examples)

### B.0 Two Scoring Engines Coexist — Critical Finding

There are **two independent scoring functions**, and only one of them drives
production slot allocation:

| | `selectJitCandidates` (`select-jit.ts`) | `rankJitCandidates` (`jit-candidates.ts`) |
|---|---|---|
| Call site | `index.ts:725` | `index.ts:5913` |
| Result variable | `result` (logged only, `[jit-v2-shadow]`) | `jitRankedCandidates` |
| Feeds `allocatePlanSlots`? | **No** | **Yes** (`index.ts:7060`, `11111`) |
| Category base weights | A=40,C=32,B=30,D=22(cap 38),F=18,G=12,E=10,H=5 | A=20,C=15,D=15,B=10,F=10,E=5,G=5,H=0 |
| Floor / gate | `MIN_IMMEDIATE = 25` on immediate/tactical/tierWeighted | `MIN_CANDIDATE_SCORE = 25` predicate-based floor (`getJitCandidateDropReason`) |
| Sovereign/memory layering | Explicit Immediate/Tactical/Strategic + tier weights + sovereign + memory (§B.2 below) | Additive: `score = base + catW + sevW + demW + prox - skipPenalty + memory` |

```ts
// index.ts:725-732
const result = selectJitCandidates(input, {
  accountAgeDays,
  signalSummary,
  skipCountsByBucket: {}, // PR 1: empty; PR 2 wires jit_preferences
  followThroughByBucket: {},
  goals,
  nowMs: Date.now(),
});
```
```ts
// index.ts:734-737 — the ONLY use of `result` is a log line
console.log(
  `[generate-mastery-plan][jit-v2-shadow] tier=${result.tier.tier} ...`,
);
```
```ts
// index.ts:5913-5954
jitRankedCandidates = rankJitCandidates(
  preFilteredEvents.map((e) => { /* ...memoryDelta, memoryHardDemote... */ }),
  nowMsForJit,
);
```

**Practical implication:** the elaborate Immediate/Tactical/Strategic/tier
system, relationship-source precedence, and interview classification
described in the old prose doc (§4.4) is real code that runs, but it is
**shadow-only telemetry**. The score that actually decides what appears in
the Plan comes from the simpler `jit-candidates.ts` formula below. Any future
change to `select-jit.ts` weights will have **zero effect** on user-visible
plan output until/unless a code path is added to consume `result.ranked`
instead of (or in addition to) `jitRankedCandidates`.

### B.1 `rankJitCandidates` — the live scoring formula (`jit-candidates.ts:150-248`)

```ts
// jit-candidates.ts:169-193 (per phase, per event)
const base = STAKES_BASE[(ev.stakesLevel || '').toLowerCase()] ?? 5;
const catW = CATEGORY_WEIGHT[enriched.categoryId];
const skipPenalty = ev.skipPenalty ?? 0;
const memory = ev.memoryDelta ?? 0;
...
const sevW = SEVERITY_WEIGHT[severity];
const demW = demandWeight(phase, enriched.demandProfile);
const prox = proximityScore(nowMs, winStart, winEnd);
const score = base + catW + sevW + demW + prox - skipPenalty + memory;
```

**Weight tables:**

| STAKES_BASE (`ev.stakesLevel`) | Points |
|---|---|
| board | 40 |
| external | 35 |
| investor | 35 |
| critical | 30 |
| high | 22 |
| medium | 12 |
| low | 4 |
| (unmatched / null) | 5 |

| CATEGORY_WEIGHT | A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|---|
| Points | 20 | 10 | 15 | 15 | 5 | 10 | 5 | 0 |

| SEVERITY_WEIGHT | high | medium | low |
|---|---|---|---|
| Points | 15 | 8 | 3 |

`demandWeight(phase, d)` (line 87-92):
```ts
if (phase === 'pre')    return (d.cog + d.emo) * 2;   // max 12
if (phase === 'during') return d.cog * 3;             // max 9
/* post */              return (d.ene + d.cir) * 3;   // max 18
```

`proximityScore` is clamped to **±5** as a tiebreaker (line 122-129), fed by
`computeRawProximity` (lines 131-148): peaks near the middle of the
eligibility window, fades in from 30 min (+8) → 6h (+6) → 24h (+3) → 0 when
still further ahead, and is **−5** once the window has passed.

`MAX_JIT_HORIZON_MS = 24 * 60 * 60_000` (24h) — candidates whose window
starts more than 24h out are dropped (`jit-candidates.ts:80,187`).
`STALE_PHASE_GRACE_MS`: pre=30min, during=30min, post=2h — candidates are
dropped once the window has been over for longer than this grace period.

Sorting: `out.sort((a, b) => b.score - a.score)` (line 236) — **pure score
descending**, no secondary tiebreaker column beyond what's already baked into
`score` via the ±5 proximity nudge.

### B.2 The Meaningful-Candidate Floor (`getJitCandidateDropReason`, lines 300-344)

`MIN_CANDIDATE_SCORE = 25` (line 265) is the **numeric fallback**, but the
real gate is a predicate tree, evaluated in this exact order:

1. `hasStrongStakes` (stakes ∈ {board, external, investor, critical, high})
   → **always kept**, regardless of score.
2. `hasPositiveMemory` (`components.memory ≥ 10`) → **always kept**.
3. Title matches `ADMIN_COMPLIANCE_NOISE_KEYWORDS` (e.g. "r&d tax", "vat",
   "payroll", "invoice", "audit prep") → **dropped**, reason
   `admin_compliance_noise`.
4. `categoryId === 'H'` (personal/daily-rhythm) with no explicit stakes →
   **dropped**, reason `personal_category_without_explicit_stakes`.
5. Structural categories (`A, C, F, G`): kept if `hasMediumStakes` OR
   `severity === 'high'` OR `demand ≥ 8`; else falls through to the numeric
   floor.
6. Non-structural (`B, D, E`): kept only if **≥2** of
   {mediumStakes, highSeverity, strongDemand} are true; else falls through.
7. Final numeric floor: `score >= 25` → kept; else dropped as
   `below_meaningful_floor`.

### B.3 `memoryHardDemote` rule
Per `jit-candidates.ts:157`: `if (ev.memoryHardDemote) continue;` — a
candidate is skipped entirely, before any phase/scoring logic runs, if the
caller marks `memoryHardDemote: true`. That flag is set upstream in
`index.ts:5935-5938`:
```ts
memoryHardDemote = mem.hardDemote || titleMem.hardDemote;
if (derived?.permanent_flag && derived.net_importance <= -999) {
  memoryHardDemote = true;
}
```
i.e. hard demote fires when `event_priority_memory` has a `never` signal on
either the coarse category+type key OR the exact title-normalised key
(`applyEventPriorityMemory` sets `hardDemote = true` and `delta -= 40` for
any `never` row — `event-priority-memory.ts:133-136`), OR when a derived
memory row is permanently flagged with `net_importance <= -999`.

### B.4 Three worked examples (arithmetic shown against the LIVE ranker, §B.1)

**Example 1 — Board meeting, tomorrow morning, `pre` phase.**
Assume `stakesLevel = 'board'` (base 40), category A (`catW = 20`),
`severity = 'high'` (sevW 15), `demandProfile.cog=3, emo=3` → `demW = (3+3)*2 = 12`,
window opens in ~18h so `computeRawProximity` returns 3 (24h fade band),
`skipPenalty = 0`, `memory = +10` (one prior `priority` signal, ≤60d, per
`event-priority-memory.ts:142-146`).
`score = 40 + 20 + 15 + 12 + 3 - 0 + 10 = 100`. Comfortably clears the
`hasStrongStakes` floor exemption (kept regardless of score) and would also
clear the 25-point numeric floor on its own.

**Example 2 — Recurring internal 1:1 with a direct report, category D, no
special stakes.**
`stakesLevel` unset → base 5, `catW = 15` (D), `severity = 'medium'` → sevW 8,
`demandProfile.cog=1, emo=1` → `demW = (1+1)*2 = 4`, window is right now
(`computeRawProximity` mid-window ≈ +9, clamped to +5), `skipPenalty = 3`
(one prior dismissal, `skipPenaltyFor` bucket=1 → −3 per the earlier doc's
§4.4.3 table — value not re-derived from `tactical-signals.ts` in this pass,
flagged Unknown-partial), `memory = 0`.
`score = 5 + 15 + 8 + 4 + 5 - 3 + 0 = 34`. Non-structural category D needs
≥2 of {mediumStakes(true), highSeverity(false), strongDemand(false)} = only
1 true → floor predicate fails → falls to numeric floor: `34 ≥ 25` → **kept**.

**Example 3 — "R&D Tax Credit Claim Review" admin meeting, category H.**
Regardless of computed score, title matches `ADMIN_COMPLIANCE_NOISE_KEYWORDS`
(`'r&d tax'`) → **dropped** with reason `admin_compliance_noise` before the
numeric floor is even considered (`jit-candidates.ts:317-320`).

---

## Section C — Day-Shape Determination Waterfall (`slot-allocator.ts:allocatePlanSlots`, exact coded order)

Numbered exactly as the `if` statements appear in `allocatePlanSlots`
(lines 125-278):

**1. Week-Ahead** (checked first, unconditionally):
```ts
// slot-allocator.ts:139-141
if (input.isWeekAhead) {
  return buildSingleStateSlotResult("week_ahead", "week_ahead_planning", ranked.length, input.preferredPracticeWindows);
}
```

**2. Saturday / weekend rest — hardcoded `dayOfWeek === 6`:**
```ts
// slot-allocator.ts:143-145
if (input.dayOfWeek === 6 && !input.isFullWorkingWeekend) {
  return buildSingleStateSlotResult("saturday", "saturday_habit_only", ranked.length, input.preferredPracticeWindows);
}
```
This is literally hardcoded to Saturday (`6`), not derived from
`planningDayOfWeek(homeCountry)`. Confirmed **not** removed — see §F Bug B.

**3. PTO / holiday:**
```ts
// slot-allocator.ts:147-149
if (input.isPtoOrHoliday) {
  return buildSingleStateSlotResult("holiday_pto", "holiday_habit_only", ranked.length, input.preferredPracticeWindows);
}
```

**4. Travel day (full arc) — "working weekend" escape hatch is implicit
upstream, not inside the allocator itself:**
```ts
// slot-allocator.ts:151-153
if (input.hasTravelDay && (!top || top.categoryId === "G")) {
  return buildNamedFullArcResult("travel_day", "travel_day_full_arc", ranked, "G");
}
```
Note: the "working weekend escape hatch" (`isFullWorkingWeekend`) only
matters at step 2 (it does not gate step 4). `isFullWorkingWeekend` itself is
computed **upstream** in `index.ts:11360-11362` (quoted in A.1) from
`calendarLoad ∈ {high, extreme}` OR `realMeetingCount ≥ 3`, and is passed
into `allocatePlanSlots` as `input.isFullWorkingWeekend`.

**5. Conference day (full arc):**
```ts
// slot-allocator.ts:155-157
if (input.hasConferenceDay && (!top || top.categoryId === "F")) {
  return buildNamedFullArcResult("conference_day", "conference_day_full_arc", ranked, "F");
}
```

**6. Same-event-fan detection** (not a day-shape branch itself, but decides
whether "dominant_structural_event" applies when the #2/#3 ranked items are
just other phases of the SAME event):
```ts
// slot-allocator.ts:159-173
const sameEventFan =
  !!top && !!topEventId && !differentEventCandidate && ranked.length > 1;
const topIsStructural =
  !!top && (top.categoryId === "A" || top.categoryId === "C" || top.categoryId === "F" || top.categoryId === "G" || forceArcCategoryIds.has(top.categoryId));
const dominantStructuralEvent =
  topIsStructural && (!hasSecondCandidate || sameEventFan || !differentEventCandidate);
```

**7. Final dayShape ternary (`rest_day` > `mixed_day` (two conditions) >
`dominant_structural_event` > `light_routine` > default `mixed_day`):**
```ts
// slot-allocator.ts:174-182
const dayShape: DayShape = restSignals
  ? "rest_day"
  : structuralSignals >= 2 || (top && top.categoryId === "F" && hasSecondCandidate && hasThirdCandidate && !!differentEventCandidate)
    ? "mixed_day"
    : dominantStructuralEvent
      ? "dominant_structural_event"
      : ranked.length <= 1
        ? "light_routine"
        : "mixed_day";
```
Where `restSignals = input.hasRestSignals === true` (comes from
`classifyAvailability(...).isRestDay`, §A.3) and `structuralSignals` is a
count (0-3) of `[hasTravelDay, hasConferenceDay, hasOffsiteDay]` truthy
flags (line 135). Note: by the time this ternary runs, travel/conference-day
top-structural cases (steps 4-5) have already returned — this branch only
fires for travel/conference signals that did **not** produce a top=G/F
candidate (e.g. travel is present as a background signal but a bigger board
meeting outranked it).

**8. `light_routine` reachability** — confirmed reachable: it fires whenever
none of steps 1-7's earlier branches matched AND `ranked.length <= 1`
(0 or 1 total candidate). This is **not** dead code.

**9. `light_day_strong_state`** — this DayShape name **does not exist** in
the current `DayShape` union type (`slot-allocator.ts:38-47` lists only
`light_routine | dominant_structural_event | mixed_day | rest_day |
saturday | holiday_pto | week_ahead | travel_day | conference_day`). It is
**not present anywhere in the codebase** (confirmed via the type
declaration; no other value is ever assigned to `DayShape`). Any prior
documentation reference to `light_day_strong_state` describes something that
does not exist in code today — either fully removed or never built.

**10. Mode derivation** (immediately after dayShape, lines 184-188):
```ts
const mode: SlotMode =
  dayShape === "rest_day" ? "state" :
  dayShape === "light_routine" ? "jit+state" :
  dayShape === "dominant_structural_event" ? "full_arc" :
  "jit+state";
```
So `light_routine` mode is **not** a separately-hardcoded string independent
of dayShape — it is one branch of this same ternary, always evaluating to
`"jit+state"`. See §F Bug A re-check: the "hardcoded mode" concern is
technically true in the sense that `light_routine → "jit+state"` is an
unconditional mapping with no further JIT-vs-state weighting inside this
function — there is no code path where a `light_routine` day picks pure
`"jit"` or pure `"state"` mode; it is always the same fixed string. Confirmed
still true in current code.

### `rest_day` short-circuit (Sprint 4 / Phase 6 rest-day contract)
```ts
// slot-allocator.ts:196-211
if (dayShape === "rest_day") {
  return {
    dayShape, mode, restDay: true,
    allocationReason: "rest_day_no_priorities",
    slots: [],
    debug: { dayShape, mode, candidateCount: ranked.length, multiPhaseEligible: false, sameEventFan: false },
  };
}
```
A true rest day returns **zero slots** — the comment explicitly states the
team does not want to "fabricate three state_anchor slots."

---

## Section D — Arcs, Week-Ahead, Memory

### D.1 Arc triggers (pre/during/post) and travel arcs
For `dominant_structural_event`, phases are picked **by the dominant event's
own EVENT_PHASE_MAP entry**, never by array position (`slot-allocator.ts:213-239`):
```ts
// slot-allocator.ts:216-218
// Category A (board / governance) only defines pre + post, so slot 1
// MUST fall back to a state slot rather than fabricate a "During".
```
Category A gets a special 3-slot layout: `pre`, then a fixed
**"board protect" state slot** (`makeBoardProtectSlot`, line 294-305,
`allocationReason: "board_protect_state"`), then `post` — i.e. Category A
never gets a real "during" JIT slot, by design, because the framework
protocol for A has no `during` intervention (`event-categories.ts:66`:
`protocol: { pre: "Flow", during: null, post: "Pause" }`).

For travel (`buildNamedFullArcResult`, "G"), the `during` (in-flight) slot is
only included if `pruneTravelPhases` (§A.10) determines the flight is
long-haul; short-haul degrades slot 2 to a plain state anchor
(`slot-allocator.ts:369-373`).

### D.2 — Practice Library

The Plan reads the same tables the rest of the product uses:
`sanctuary_content` (`index.ts:5564`) and `sanctuary_content_metadata`
(`index.ts:5572`), plus `sanctuary_content_steps` per the input inventory.
No Plan-specific content table was found — this supports (but does not
100%-prove, since the Reset feature's query code was not read in this pass)
the "shared library" claim. **Flagged in Unknowns**: whether Reset's own
query filters on different columns and could see tag drift.

**Selection algorithm** (`_shared/plan/practice-selector.ts`):

1. `deriveSlotIntent()` (line 70) maps `(stateAction, ceoVerb, anchorCategory,
   anchorPhase, practicePriorityTag)` to a `SlotIntent` via a **first-match
   waterfall** (order matters, quoted from code):
   - **0. Pre-decision clarity** (lines 89-108) — checked FIRST specifically
     so it "cannot be shadowed by `verb === 'decide'`" (comment, line 79-81).
     Fires on `action` containing clarify/clarity/detach/reactive/"decision
     fatigue"/"pre-decision", OR `anchorCategory==='A' && anchorPhase==='pre'`,
     OR `verb ∈ {clarify, detach}`, OR `tag ∈ {decision_fatigue,
     pre_decision_clarity}`, OR `combo === 'mindset.pause'`.
   - **1. Focus/flow-mastery** (110-123): action contains "focus" OR
     `verb ∈ {sharpen, decide}` OR `tag === 'focus_clarity'` OR
     `anchorCategory === 'E'`.
   - **2. Recovery/renewal** (125-139): action contains
     recover/restore/settle/decompress OR `verb ∈ {recover, reset, land}` OR
     `tag === 'recovery_resilience'` OR `anchorPhase === 'post'`.
   - **3. Circadian** (141-149): action contains "circadian" OR
     `anchorCategory === 'G'`.
   - **4. Activation/presence** (151-163): action contains "activate"/"build
     capacity" OR `verb ∈ {present, lead}` OR `tag === 'energy_endurance'`.
   - **5. Default — regulation/composure** (165-171): unconditional
     fallback → `meta-recalibration` / `pause` / `somatic.pause`.

2. Scoring against `SlotIntent`: `scoreStructuredTags()` (line 390) awards a
   per-`intentLabel` bespoke point total from `structuredTags` (pillar,
   masterySubtypes, goalTags, contextTags, cognitiveLoadHelp, energyDirection)
   — e.g. for `focus/flow-mastery` (lines 464-500): `pillar==='flow'` +8,
   matching subtypes +5, matching goals +7, matching cognitiveLoadHelp +4,
   direction clarify/stabilize +2, and a **guardrail penalty of −8** if
   `pillar==='renewal'` and no clarity-family goal is present (prevents
   renewal content masquerading as focus content).

3. `scoreLeaderGoalAlignment()` (line 300) separately scores against the
   user's onboarding leader-goal tags (`prepare|patterns|sustain`),
   contributing 0 / 9 / 14 points for 0 / 1 / 2+ matched goals
   (line 373: `matchedGoals.size === 0 ? 0 : matchedGoals.size === 1 ? 9 : 14`).

4. `practiceWindowPreferenceBoost()` (line 273): +4 if the content declares
   a preferred time window matching the user's current window AND that
   window is in the user's `preferredPracticeWindows`; **−2** if the content
   declares preferred windows but the current one isn't among them.

(Full scoring table for the remaining intent labels — recovery/renewal,
circadian, activation/presence, regulation/composure, pre-decision-clarity —
exists in the same `switch` at lines 390-500+ of `practice-selector.ts` but
was only partially quoted here due to length; the file continues past line
500 with more `case` branches not fully re-read in this pass — **flagged in
Unknowns** for exhaustive per-branch point values beyond what's quoted
above.)

### Full Practice-Library Tag Table
**Not produced.** Enumerating every row of `sanctuary_content` with every
tag would require a live database query against production content, which
this read-only code audit did not perform (no DB credentials were used to
dump table contents). This is listed in Unknowns rather than fabricated.

### D.2 Worked examples (selection)
Only the **algorithm**, not fabricated example scores, is given here because
concrete numeric outcomes depend on actual `sanctuary_content` rows not
inspected in this pass (see Unknowns).

### D.3 — Deterministic copy (`composeWhyLine`, `index.ts:8639-8751`)

Clause build order, quoted:
```ts
// index.ts:8682-8691
let strat = strategicAnchorClause(req, ceo, slotAnchorCategoryId);
let tac = tacticalClause(req, shared, hrvCorrelations, ceo);
let imm = immediateClause(req, ceo, slotAnchorCategoryId, { ... });

if (strat && clauseOverlapsBrief(strat, briefClaim)) strat = null;
if (tac && clauseOverlapsBrief(tac, briefClaim)) tac = null;
if (imm && clauseOverlapsBrief(imm, briefClaim)) imm = null;
```
So the three candidate clauses are **strategic → tactical → immediate**, each
independently nulled if it duplicates something the Brief already said
(`clauseOverlapsBrief`, anti-dup against `briefClaim` set). Final assembly
order (lines 8739-8749):
```ts
const parts: string[] = [];
if (eventSpecificWhy) {
  parts.push(eventSpecificWhy);
} else if (allOverlap) {
  parts.push("Following your brief:");
} else {
  if (strat) parts.push(strat);
  if (tac) parts.push(tac);
  if (imm) parts.push(imm);
}
parts.push(`${arcLabel}: ${verb} ${forContext}.`);
```
i.e. if an event-specific clause (`buildModuleEventWhyLine`) exists, it wins
outright and strat/tac/imm are discarded; otherwise strategic, then
tactical, then immediate are appended in that fixed order (any/all may be
null); the sentence always ends with a fixed `"{ArcLabel}: {verb}
{forContext}."` closer.

`arcLabel` derivation (lines 8704-8713), same file:
```ts
const arcLabel: "Prepare" | "During" | "Recover" | "Steady" =
  phase === "post" || hm.slotKind === "end_of_day"
    ? "Recover"
    : phase === "during"
    ? "During"
    : phase === "pre" || hm.slotKind === "jit" || hm.slotKind === "start_of_day"
    ? "Prepare"
    : "Steady";
```

**Per-practice copy sources**: deterministic `composeWhyLine` is computed
**first, always** as `fallbackWhyLine` (`index.ts:8869-8881`), then an LLM
call (`why-llm.ts`, `generateWhyStatement`) is attempted in parallel per slot
(per prior-doc §8, not independently re-quoted here in full — the
Promise.all fan-out and Gemini call were not re-read line-by-line this pass;
flagged partial-Unknown). If the LLM output fails validation
(`validateWhyLine`), code falls back to the deterministic line — confirmed
by the **deterministic valence guard** at lines 8882-8926:
```ts
// index.ts:8895-8926
const detVerdict = validateWhyLine({ text: fallbackWhyLine, stateBand: detBand, slotAnchor: detSlotAnchor, echoTexts: [...] });
if (!detVerdict.ok && (detVerdict.reason === "valence_firing_recovery" || detVerdict.reason === "valence_depleted_push")) {
  ...
  fallbackWhyLine = composeWhyLine(hm, req, shared, hrvCorrelations, ceo, briefClaim, fusion, { timeOfDay: timeOfDayForWhy, windowSignals: null });
}
```
i.e. even the **deterministic** fallback line is itself re-validated against
the same `validateWhyLine` used for the LLM path, and re-composed (dropping
window-signal clauses) if it fails a valence check. This shows the
deterministic path is not merely a naive template — it shares the safety
validator with the LLM path.

**Brief overlap with `buildDeterministicBriefFallback`**: this is a
**Brief-side** function (`_shared/brief/deterministic-brief.ts:244`, used by
`compute-outer-readiness/index.ts:8693`), not a Plan-side function. The Plan
side's analogous deterministic fallback is `composeWhyLine` itself, which is
a **different, independently-implemented** deterministic text generator
living in `generate-mastery-plan/index.ts`, not a shared import of
`buildDeterministicBriefFallback`. **No code was found showing Plan importing
or reusing `buildDeterministicBriefFallback`** — the two deterministic-copy
systems (Brief's and Plan's) are separate implementations that both exist to
avoid depending on the LLM, but do not share code. This is a notable
"Vocabulary rules diff": Plan's `composeWhyLine` vocabulary
(strat/tac/imm clauses + arcLabel closer) is entirely local to
`generate-mastery-plan/index.ts` and was not verified to match Brief's clause
vocabulary token-for-token (flagged Unknown — would require reading
`deterministic-brief.ts` in full, not done this pass).

### D.4 — Mandatory Invariants

**Slot-count guarantee per day-shape** (from `slot-allocator.ts`):

| dayShape | Slot count | Source |
|---|---|---|
| `rest_day` | **0** (explicit contract) | `slots: []`, `restDay: true` (lines 196-211) |
| `saturday`, `holiday_pto`, `week_ahead` | **1** | `buildSingleStateSlotResult` (lines 307-344) |
| `travel_day`, `conference_day` | **3** (full arc: pre/during-or-state/post) | `buildNamedFullArcResult` (346-394) |
| `dominant_structural_event` | **3** (phase-mapped; Category A gets pre/board-protect-state/post) | lines 244-255 |
| `mixed_day`, `light_routine` (default) | **3** (top/second/third, may degrade to state fallback per-slot) | lines 256-264 |

**Week-Ahead plan-mode field diff**: `buildSingleStateSlotResult("week_ahead", ...)`
returns a single slot whose `slotRole` depends on `preferredPracticeWindows`
(lines 312-318): `evening` preference → `close_of_day`; otherwise
`state_anchor`. `allocationReason` is suffixed with the preferred window
name when present (line 319: `` `${allocationReason}_${preferredWindow}` ``).
No JIT fields are ever populated (`jitPhase: null, jitEventTitle: null,
jitEventId: null, jitCategoryId: null` — lines 328-332). A full
field-by-field diff against the persisted `mastery_plan_snapshots` schema
columns was **not performed** because the full success-path upsert payload
(near `index.ts:12240`) was not read in this pass — **Unknown**.

**Generation timing/idempotency**: the error-path upsert
(`index.ts:12590`) uses `onConflict: "user_id,plan_date,mrs_window"`,
implying the success-path upsert almost certainly uses the same natural key
— **one row per (user, plan_date, mrs_window)** — but this was not
independently confirmed by reading the success-path upsert call itself
(Unknown-partial). The error path explicitly protects against clobbering:
```ts
// index.ts:12577-2588
// Overwrite protection: never clobber a valid ready snapshot for
// this (user, date, window) with an error row. If a ready row
// exists, the UI keeps rendering it and the error is captured in
// logs / `executive_home_card_runs`.
```

**Staleness / caps**: `MAX_JIT_HORIZON_MS = 24h` and
`STALE_PHASE_GRACE_MS` (pre/during 30min, post 2h) in `jit-candidates.ts`
govern candidate eligibility windows (§B.1). No plan-snapshot-level TTL/staleness
field was found in the code read this pass (Unknown).

### Consolidated Invariants Table

| Rule | Enforced where | Violable path? |
|---|---|---|
| Rest day ships 0 slots | `slot-allocator.ts:196-211` | None found — hard `return` before any slot-building |
| Saturday (non-working-weekend) ships exactly 1 state slot | `slot-allocator.ts:143-145` + `buildSingleStateSlotResult` | Bypassed if `isFullWorkingWeekend` true (computed upstream, §A.1) |
| PTO/holiday ships exactly 1 state slot | `slot-allocator.ts:147-149` | Bypassed if `isPtoOrHoliday` false, e.g. work-evidence override in `classifyAvailability` step 1 |
| Category A never gets a real "during" JIT slot | `slot-allocator.ts:245-249`, `event-categories.ts:66` (`during: null`) | None found — protocol-driven, not merely candidate-availability-driven |
| Short-haul travel never gets an in-flight slot | `pruneTravelPhases` (`slot-allocator.ts:13-36`) | Falls back to "conservative" `pre-post` only when duration is unknown too, per code comment — same effective outcome |
| Candidate horizon ceiling 24h | `jit-candidates.ts:80,187` (`MAX_JIT_HORIZON_MS`) | None found in this function; upstream event pre-filtering could theoretically narrow further but was not found to widen it |
| `memoryHardDemote` fully excludes a candidate | `jit-candidates.ts:157` | None — `continue` before any scoring |
| Numeric floor `MIN_CANDIDATE_SCORE=25` | `jit-candidates.ts:265,341` | Bypassed by `hasStrongStakes` or `hasPositiveMemory` (lines 314-315) — these are explicit, coded exemptions, not bugs |
| Memory delta clamp [-50, +30] | `event-priority-memory.ts:166-167` | None found |
| Saturday day-shape uses raw `dayOfWeek===6`, ignoring home-country planning day | `slot-allocator.ts:143` | This is itself the violation — see Bug B below; the "correct" per-country logic (`planningDayOfWeek`) exists in `week-ahead-mode.ts` but is not plumbed into this check |

---

## Section E — Ordering Comparison (current coded vs. a hypothetical alternative)

Per instructions, no new order is implemented — this section only narrates
what the **current code** does for six test days, walking `allocatePlanSlots`
step-by-step in its actual coded sequence (Section C), and separately notes
what a plausible alternative ordering might change, without building it.

| # | Scenario | Coded path taken (first matching branch, in order) | Result dayShape |
|---|---|---|---|
| 1 | Weekday, 2 strong JIT candidates (e.g. board pre + client pitch) | Not week-ahead, not Sat/PTO/travel/conference at top. `structuralSignals` likely 0. `dominantStructuralEvent` check: if top is category A/C/F/G AND second candidate exists but is a *different* event → `dominantStructuralEvent = topIsStructural && !hasSecondCandidate=false...&& sameEventFan=false && !differentEventCandidate=false` → **false**. Falls to `ranked.length<=1`? No (≥2) → **`mixed_day`** | `mixed_day`, mode `jit+state`, slots = top/second/third by array position (line 261-263) |
| 2 | Weekday, zero JIT candidates | `ranked.length <= 1` (0) and not rest/structural → **`light_routine`** | `light_routine`, mode `jit+state`, slots built from `top=null, second=null, third=null` → all three slots degrade to state fallback (`makeSlot` with `candidate=null` → `isJit=false`, `allocationReason: "state_fallback_no_meaningful_jit"`) |
| 3 | UK Saturday, ordinary weekend (no big meetings) | `classifyAvailability` → `REST_DAY` (weekend, no work evidence) → `hasRestSignals=true`. But dayShape check order puts the **hardcoded Saturday branch before the rest_day ternary is even reached** — `input.dayOfWeek===6 && !isFullWorkingWeekend` fires first (step 2) → **`saturday`**, 1 slot. (Never reaches the `restSignals ? "rest_day" : ...` ternary at all, because step 2 already returned.) | `saturday` (not `rest_day`) — these two states overlap in meaning but are structurally different return paths in code |
| 4 | Israeli Friday (home country IL — Sat-start work week; Friday would be a "weekend" per that convention, but `slot-allocator.ts` does not know home country) | The allocator's Saturday check is `dayOfWeek===6` only — **Friday (`dayOfWeek===5`) does not match it at all**, regardless of home country. `classifyAvailability`'s own `weekendDays` default is `[6]` unless the caller passes a different set — no evidence was found in this pass that `generate-mastery-plan` passes a country-aware `weekendDays` array into `classifyAvailability` for the allocator's own `hasRestSignals` computation (see `index.ts:11339-11355`, no `weekendDays` key passed) → Friday for an Israeli user is very likely treated as an **ordinary workday** by the Plan slot-allocator today, even though `week-ahead-mode.ts`'s `planningDayOfWeek('IL') === 6` correctly knows the region convention **for the Week-Ahead trigger only** | Likely `mixed_day`/`light_routine`/`dominant_structural_event` per normal event-driven rules — **not** treated as a rest/Saturday-equivalent day. Flagged as a real country-sensitivity gap, distinct from Bug B (see §F, New Finding N2) |
| 5 | PTO day with one stray meeting on the calendar | `classifyAvailability` step 1 (work evidence ≥2 timed meetings) would need to see 2+ meetings to override PTO; a single stray meeting does **not** meet `WORK_MEETING_MIN=2`, so PTO/holiday classification stands → `isPtoOrHoliday=true` → allocator step 3 fires → **`holiday_pto`**, 1 slot. The stray meeting is never surfaced as a JIT slot because `buildSingleStateSlotResult` ignores `rankedCandidates` content entirely (only uses `.length` for debug telemetry) | `holiday_pto` |
| 6 | Travel day with a destination board meeting on arrival | `hasTravelDay=true`. Step 4 checks `!top || top.categoryId === "G"`. If the board meeting (category A) out-scores the travel event and becomes `top`, then `top.categoryId !== "G"` → **step 4 does NOT fire** (travel is not the day-shape driver) → falls through to later checks; if `top` (board, category A) is structural and has no differing second candidate → **`dominant_structural_event`** with the board's own pre/board-protect/post arc. The travel event itself may still surface as one of the 3 slots only if it independently ranks into `phaseCandidates` for the dominant event's fan — but since it's a *different* event from the board meeting, it would only appear if it beats other candidates for a slot in the **non-dominant** branch, which is not reached here since `dominantStructuralEvent` is true. Net effect: travel context can be **entirely dropped** from the day's 3 slots if a same-day destination board meeting outranks it, unless travel's own G-phases separately rank high enough to be `second`/`third` for the dominant event's own fan (they won't, because `phaseCandidates` restricts to `c.eventId === topEventId`, line 233) | `dominant_structural_event` (board), travel context likely absent from slots |

**Proposed alternative order**: not designed or implemented per instructions
(explicitly out of scope for this document).

---

## Section F — Bug Re-Verification + New Findings

### Bug A — "light_routine hardcoded mode" — **CONFIRMED STILL PRESENT**
```ts
// slot-allocator.ts:184-188
const mode: SlotMode =
  dayShape === "rest_day" ? "state" :
  dayShape === "light_routine" ? "jit+state" :
  dayShape === "dominant_structural_event" ? "full_arc" :
  "jit+state";
```
Every `light_routine` day unconditionally gets `mode = "jit+state"` — there
is no code path (in this function) that would give a light-routine day a
pure `"jit"` or pure `"state"` mode based on e.g. how many real candidates
exist. Given `light_routine` is reached specifically when `ranked.length<=1`
(§C step 8), a `light_routine` day with **zero** real candidates still gets
labeled `mode: "jit+state"` even though there is no JIT content to speak of
— the mode label doesn't reflect the actual composition of slot 0/1/2 in
that case (all three would degrade to `state_fallback_no_meaningful_jit`).

### Bug B — hardcoded `dayOfWeek===6` weekend check — **CONFIRMED STILL PRESENT**
```ts
// slot-allocator.ts:143
if (input.dayOfWeek === 6 && !input.isFullWorkingWeekend) {
```
This ignores the home-country-aware `planningDayOfWeek()` logic that exists
elsewhere in the codebase (`week-ahead-mode.ts:48-53`) for Saturday-start
work-week countries (SA, KW, QA, BH, OM, IL). The Plan's own day-shape
allocator has no knowledge of `homeCountry` at all — `SlotAllocationInput`
(lines 63-81) has no `homeCountry` field. This is a genuine, still-present
inconsistency between Week-Ahead's country-aware cadence and the day-of-plan
allocator's hardcoded Western-weekend assumption.

### Already-solved / not-built items (per brief's referenced list) — status found in code
- **Rest-day zero-slot contract**: solved — `slot-allocator.ts:190-211` is an
  explicit "Sprint 4 (Phase 6)" implementation with a code comment
  documenting exactly this fix.
- **Same-event-fan de-duplication** (a single event's multiple phases
  shouldn't count as multiple "candidates" for day-shape purposes): solved —
  `sameEventFan` logic, `slot-allocator.ts:159-173`, explicitly commented as
  a "Sprint 1 fix."
- **Meaningful-candidate floor** (weak classifier hits shouldn't anchor real
  slots): solved — `jit-candidates.ts:250-344`, "Sprint 3 (Phase 5)."
- **JIT v2 triangulated scorer replacing the legacy ranker**: **NOT YET
  LIVE** — `selectJitCandidates` exists and runs but is shadow-only
  (§B.0). This is the single most significant "not-built" (or rather,
  "built-but-not-switched-on") item found in this audit.

### New Findings (not previously called out, discovered during this audit)

- **N1. Two live scoring engines, only one consumed.** See §B.0. This is the
  most consequential finding of this whole audit: any documentation,
  discussion, or future engineering work based on `select-jit.ts`'s
  Immediate/Tactical/Strategic/tier-weighted/sovereign model as "the"
  scoring system is describing dead-for-users code. The category weights
  differ substantially between the two engines (e.g. Category D is 22-38 in
  `select-jit.ts` vs. 15 in `jit-candidates.ts`; Category G is 12 vs. 5).
- **N2. Country-sensitivity gap in the day-shape allocator (distinct from
  Bug B in spirit, worth tracking separately).** Even setting aside the
  literal `dayOfWeek===6` line, `SlotAllocationInput` has no `homeCountry`
  field at all, so there is no way for `allocatePlanSlots` to ever treat a
  Friday as a weekend day for Sat-start-week countries, regardless of any
  future patch to the `===6` check alone — a fix would need to also thread
  `homeCountry` (or a pre-computed `weekendDays` set) through
  `deriveStructuralDayFlags` → `allocatePlanSlots`.
- **N3. `light_day_strong_state` does not exist in the `DayShape` type at
  all** (§C step 9) — confirmed via the type union, not merely "unreachable
  code" but literally absent as a string anywhere in `slot-allocator.ts`.
- **N4. `classifyAvailability`'s default `weekendDays=[6]`** is passed with
  no override from `generate-mastery-plan/index.ts:11339-11355` — meaning
  even the "correct", non-hardcoded classifier is still effectively
  Saturday-only for rest-day purposes in the Plan's calling context, unless
  some other caller further upstream overrides it (not found in this pass).
- **N5. Two independently-implemented deterministic why-line/copy systems**
  (Brief's `buildDeterministicBriefFallback` vs. Plan's `composeWhyLine`) —
  see §D3 — with no shared vocabulary module found between them.
- **N6. `smart-nudges` re-derives day-of-week/weekend logic independently in
  12+ call sites** rather than reading any persisted Plan `dayShape` — a
  maintenance-burden finding (any future day-shape rule fix must be
  independently ported to `smart-nudges`, it will not "just work" because
  Plan was fixed).

---

## All Constants Table

| Constant | Value | Meaning | File : Function/Scope |
|---|---|---|---|
| `WORK_MEETING_MIN` | 2 | Min timed work meetings to force `WORKDAY` classification | `availability-classifier.ts:228` |
| default `weekendDays` | `[6]` (Saturday) | Days treated as weekend by `classifyAvailability` unless overridden | `availability-classifier.ts:265` |
| `SATURDAY_WEEKLY_COUNTRIES` | `{SA,KW,QA,BH,OM,IL}` | Countries whose weekly planning day is Saturday (Sun-start work week) | `week-ahead-mode.ts:45-47` |
| `dayOfWeek === 6` (Saturday day-shape) | 6 | Hardcoded Saturday check in the live slot allocator, ignoring home country | `slot-allocator.ts:143` |
| `MIN_IMMEDIATE` | 25 | Strategic-axis gate + floor-pass threshold in the shadow-only JIT v2 engine | `select-jit.ts:269` |
| `D_BOOSTED_CAP` | 38 | Cap on Category D's category-base after interpersonal-stakes boost (JIT v2, shadow-only) | `select-jit.ts:43` |
| `CATEGORY_BASE` (JIT v2, shadow) | A=40,C=32,B=30,D=22,F=18,G=12,E=10,H=5 | Stakes ladder used by `selectJitCandidates` (not live) | `select-jit.ts:31-40` |
| `STAKES_BASE` (live) | board=40, external=35, investor=35, critical=30, high=22, medium=12, low=4, default=5 | Live scoring base by `stakesLevel` | `jit-candidates.ts:70-73` |
| `CATEGORY_WEIGHT` (live) | A=20,B=10,C=15,D=15,E=5,F=10,G=5,H=0 | Live per-category additive weight | `jit-candidates.ts:75-77` |
| `SEVERITY_WEIGHT` (live) | high=15, medium=8, low=3 | Live severity weight | `jit-candidates.ts:79` |
| `MAX_JIT_HORIZON_MS` (live) | 24h | Candidates whose window opens further out are dropped | `jit-candidates.ts:80` |
| `STALE_PHASE_GRACE_MS` (live) | pre=30min, during=30min, post=2h | Grace period after window end before a phase is dropped as stale | `jit-candidates.ts:81-85` |
| proximity clamp | ±5 | Proximity is a tiebreaker only, cannot dominate other weights | `jit-candidates.ts:122-129` |
| `MIN_CANDIDATE_SCORE` | 25 | Numeric floor fallback for the meaningful-candidate predicate | `jit-candidates.ts:265` |
| memory delta clamp | [-50, +30] | Net clamp on `applyEventPriorityMemory` delta | `event-priority-memory.ts:166-167` |
| memory signal deltas | priority +10 (≤60d); cancelled_keep_surfacing +5 (≤60d); cancelled_now −8 (≤7d); not_this_week −15 (≤14d); cancelled_as_noise −25 (≤60d); never −40 + hardDemote (always) | Per-signal scoring/decay | `event-priority-memory.ts:130-157` |
| leader-goal alignment score | 0 / 9 / 14 for 0 / 1 / 2+ matched goals | Practice selector goal-fit score | `practice-selector.ts:373` |
| window-preference boost | +4 match / −2 declared-but-mismatched / 0 no declaration | Practice selector time-of-day fit | `practice-selector.ts:273-291` |
| pre-decision-clarity structured-tag score | pillar pause +7; grounding/composure/deep-calm subtype +5; clarity-family goal +6; high-pressure/etc. context +4; decision/cognitive-load help +3; stabilize/clarify direction +2; renewal-without-clarity penalty −8 | `practice-selector.ts:401-462` |
| focus/flow-mastery structured-tag score | pillar flow +8; optimize/maintain-peak/activate subtype +5; focus-family goal +7; concentration/decision/focus/creative loadHelp +4; clarify/stabilize direction +2; renewal-without-focus penalty −8 | `practice-selector.ts:464-500` |
| `ADMIN_COMPLIANCE_NOISE_KEYWORDS` | list incl. "r&d tax","vat","payroll","invoice","audit prep",… | Titles that are dropped outright regardless of score | `jit-candidates.ts:279-294` |
| `PERSONAL_CATEGORY` | `"H"` | Category dropped without explicit stakes signal | `jit-candidates.ts:278,324` |
| `STRUCTURAL_CATEGORIES` | `{A,C,F,G}` | Categories eligible for relaxed floor pass (mediumStakes/highSeverity/strongDemand) | `jit-candidates.ts:277` |
| `demandWeight` formula | pre=(cog+emo)×2 [max 12]; during=cog×3 [max 9]; post=(ene+cir)×3 [max 18] | Live demand-based scoring | `jit-candidates.ts:87-92` |

---

## Section 0 — End-to-End Data-Flow Diagram (exact field names)

```
Client (PlanPage.tsx / TodayThreePriorities.tsx)
   │  POST /generate-mastery-plan
   │  body: { userId, timeOfDay, timezoneOffsetMinutes, innerReadinessTier,
   │          calendarEvents[], practicePriorityTag, growthIntention,
   │          protectGoals[], leaderProfile.goals.declared[],
   │          expectedSignatureHash, mode }
   ▼
generate-mastery-plan/index.ts
   │
   ├─► classifyAvailability({ now, userHomeCountry, userCurrentCountry,
   │       explicitPto, calendarLoad, events[] })                 [availability-classifier.ts]
   │       → { state, isRestDay, workEvidence, holiday, reason }
   │       (index.ts:11339-11356: only `isRestDay` is consumed downstream
   │        as `hasRestSignals`)
   │
   ├─► deriveStructuralDayFlags(calendarEvents, calendarLoad, opts)
   │       → { hasTravelDay, hasConferenceDay, hasOffsiteDay,
   │           hasRestSignals, dayOfWeek, isWeekAhead, isPtoOrHoliday,
   │           isFullWorkingWeekend }                              [index.ts:11330-11397]
   │           (internally calls evaluateWeekAheadMode({dayOfWeek,...})
   │            [week-ahead-mode.ts] → { active, reason, lookbackDays,
   │            lookaheadDays })
   │
   ├─► selectJitCandidates(input, ctx)  ── SHADOW ONLY (result unused
   │       downstream except a log line)                           [select-jit.ts:400]
   │       → { ranked[], excluded[], tier, crisisEvents[] }
   │
   ├─► rankJitCandidates(events.map(e=>({event:{id,title,start_time,
   │       end_time}, stakesLevel, score, memoryDelta, memoryHardDemote})),
   │       nowMsForJit)                 ── LIVE                    [jit-candidates.ts:150]
   │       → RankedJitCandidate[] = { eventId, title, phase,
   │           categoryId, comboKey, severity, leadTimeMin,
   │           demandProfile, durationMinutes, windowStartMs,
   │           windowEndMs, eligible, minutesUntilWindow, score,
   │           components{...} }
   │       memoryDelta/memoryHardDemote sourced from
   │       applyEventPriorityMemory(priorityMemoryIndex, {eventCategory,
   │       eventTypeKey})                                          [event-priority-memory.ts:106]
   │       assigned to `jitRankedCandidates`
   │
   ├─► briefAnchorEventTitles(shared.briefBehaviour) → re-sort
   │       jitRankedCandidates so Brief-flagged titles float to top
   │       (stable sort)                                           [index.ts:5959-5986]
   │
   ├─► allocatePlanSlots({ nowMs, rankedCandidates: jitRankedCandidates,
   │       hasTravelDay, hasConferenceDay, hasOffsiteDay, hasRestSignals,
   │       dayOfWeek, isWeekAhead, isPtoOrHoliday, isFullWorkingWeekend,
   │       mrsWindow, preferredPracticeWindows, forceArcCategoryIds })
   │                                                                [slot-allocator.ts:125]
   │       → SlotAllocation = { dayShape, mode, restDay?, slots[] = {
   │           index, slotRole, arcLabel, jitPhase, jitEventTitle,
   │           jitEventId, jitCategoryId, allocationReason }, debug{...} }
   │
   ├─► selectPracticeForSlot(...) per slot                         [practice-selector.ts]
   │       intent = deriveSlotIntent({ stateAction, ceoVerb,
   │           anchorCategory, anchorPhase, practicePriorityTag })
   │       → SlotIntent { metaSkills[], recalibrateCategories[],
   │           combo, intentLabel }
   │       scored against sanctuary_content rows
   │       → { selected: [practice], usedProtocolFallback }
   │
   ├─► buildPriorityTitle(...) → deterministic HorizonModule.title
   │
   ├─► composeWhyLine(hm, req, shared, hrvCorrelations, ceo,
   │       briefClaim, fusionEventTitle, opts) → fallbackWhyLine     [index.ts:8639]
   │       (validated via validateWhyLine — shared with the LLM path)
   │       + parallel LLM Why-line attempts (generateWhyStatement) that
   │       overwrite fallbackWhyLine on success                     [why-llm.ts]
   │
   ├─► mergeWithLedger(freshModules, ledgerModules, completedIds, ...)
   │       reads daily_ritual_completions.plan_ledger                [index.ts:11417]
   │
   └─► upsert mastery_plan_snapshots
           key: (user_id, plan_date, mrs_window)                    [index.ts:12590 error-path;
                                                                       success-path not fully re-quoted]
   ▼
Response → client: { signatureHash, timeOfDay, horizonModules[],
    calendarPills[], preEventPlan, coachCard, ledger, observability }

Parallel / independent consumers (do NOT read a persisted dayShape field —
each re-derives its own day/weekend logic):
   smart-nudges/index.ts  ── re-derives dayOfWeek===6 in 12+ places
   list-week-ahead-priorities/index.ts ── re-runs rankJitCandidates over
       [today, +8d), writes weekly_plan_snapshots
```

---

## Unknowns / Cannot Determine From Code

1. **`load-jit-context.ts` internal function-by-function trace** (relationship
   source precedence, `RELATIONSHIP_TAXONOMY` weight table) was referenced by
   `select-jit.ts` imports but not independently re-read and re-quoted line
   by line in this pass — and since `select-jit.ts` is shadow-only (§B.0),
   its practical relevance to live user-facing output is itself unclear
   without further tracing of whether `load-jit-context.ts` is ALSO used by
   the live `jit-candidates.ts` path (evidence found: `jit-candidates.ts`
   does not import from `load-jit-context.ts` at all — grep confirms no such
   import in the file as read — so this relationship-resolution machinery
   appears to also be shadow-path-only, but this was not exhaustively
   confirmed against every call site).
2. **Full `sanctuary_content` / `sanctuary_content_metadata` schema and live
   row tag inventory** — not dumped (no DB query performed); the "full
   practice library table with every tag per practice" requested in the
   brief could not be produced from static code alone.
3. **Whether the Reset feature queries `sanctuary_content` with different
   filters that could cause tag drift** — Reset's source files were not
   located/read in this pass.
4. **`why-llm.ts` full prompt-block text and Gemini call parameters** —
   confirmed the file exists (792 lines) and is invoked from
   `applyV51Enrichment`, but the exact prompt string blocks, model name, and
   `validateWhyLine` internals were not re-quoted from source in this pass
   (relied on the prior doc's characterization for narrative context only,
   flagged rather than re-asserted as independently verified).
5. **Full success-path `mastery_plan_snapshots` upsert column list** — only
   the error-path upsert (`index.ts:12590`) was directly quoted; the
   success-path upsert near line 12240 was not opened and quoted.
6. **`compute-outer-readiness`'s 409/412 Brief↔Plan handshake contract** —
   referenced via file existence and one `buildDeterministicBriefFallback`
   call site, not re-verified line-by-line against `load-brief-behaviour-snapshot.ts`.
2. **Onboarding UI flow** producing `practicePriorityTag` / `growthIntention`
   / `protectGoals` — files located (`onboardingV8.ts` etc.) but not opened;
   only their consumption inside `generate-mastery-plan/index.ts:700-723` was
   confirmed.
7. **Exhaustive `practice-selector.ts` scoring for every intentLabel branch**
   beyond `pre-decision-clarity` and `focus/flow-mastery` (file is 890 lines;
   only the first ~500 were read in this pass).
8. **`dispatch-key.ts` consumers** beyond confirming it is unrelated to Plan
   generation itself — the full set of call sites in notification/nudge
   dispatch code was not enumerated.
9. **Whether any caller ever overrides `classifyAvailability`'s default
   `weekendDays=[6]`** with a country-aware set anywhere else in the
   codebase outside the Plan's own call — only the Plan's own call site
   (which does not override it) was checked.

---

## New Findings List (summary, cross-referenced to §F)

- **N1** — Two live/coexisting event-scoring engines; only `jit-candidates.ts`'s
  `rankJitCandidates` feeds actual slot allocation. `select-jit.ts`'s
  `selectJitCandidates` (the more sophisticated Immediate/Tactical/Strategic
  model) is shadow-telemetry only.
- **N2** — The day-shape allocator has no `homeCountry` awareness at all,
  so Sat-start-work-week countries' actual "weekend" day (Friday, for IL/
  Gulf states) is never treated as rest/reduced-touch by `allocatePlanSlots`,
  independent of the literal Bug B line.
- **N3** — `light_day_strong_state` does not exist anywhere in the current
  `DayShape` type or codebase.
- **N4** — `classifyAvailability` is called by the Plan with the library
  default `weekendDays=[6]`, not a country-derived set, even though the
  function signature supports overriding it.
- **N5** — Brief's `buildDeterministicBriefFallback` and Plan's
  `composeWhyLine` are two independently-implemented deterministic-copy
  systems with no shared vocabulary module found between them.
- **N6** — `smart-nudges` independently re-derives day-of-week/weekend logic
  in at least 12 separate locations rather than consuming a persisted Plan
  `dayShape`/`mode`, creating duplicate-logic maintenance risk.

## Section H — Runtime Step-by-Step Walkthrough

### H.1 Full Execution Sequence (Steps 1–15), in actual code order

#### Step 1 — Request arrival: auth, body parse, tz/local-date resolution (`generate-mastery-plan/index.ts:11828-12000`, `Deno.serve` handler)
- **Receives:** raw HTTP `POST` request (headers, JSON body). No prior step — this is the entry point.
- **Does:**
  1. CORS preflight: `if (req.method === "OPTIONS") return new Response(null, {headers: corsHeaders})` (`index.ts:11830-11832`) → early return, nothing downstream runs for OPTIONS requests.
  2. `authenticateRequest(req, corsHeaders)` (`index.ts:11844`). If it errors:
     - Sub-branch a: service-role bypass — if `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` **and** an `x-dev-user-id` header are both present, `userId` is taken from that header and execution continues (`index.ts:11849-11858`).
     - Sub-branch b: dev bypass — if not in `production` env **and** `x-dev-user-id` header present, `userId` taken from it (`index.ts:11862-11870`).
     - Sub-branch c: otherwise → `return auth.errorResponse` — **Steps 2–15 never run** (`index.ts:11871-11876`).
  3. Else `userId = auth.userId` (`index.ts:11879`).
  4. Body read: `rawBodyText = await req.text()`; on throw → `return` 400 `{error:"Invalid request body", reason:"Unable to read request body"}` — early return, rest of function never runs (`index.ts:11888-11906`).
  5. `bodyIsEmpty` check → if empty, logs a warning and **defaults `body = {}`** rather than erroring (`index.ts:11927-11938`) — no early return here.
  6. Else `JSON.parse(rawBodyText)`; on throw → `return` 400 `{reason:"Malformed JSON"}`, early return (`index.ts:11940-11961`).
  7. Shape guard: `if (!body || typeof body !== 'object' || Array.isArray(body)) return` 400 `{reason:"Expected JSON object"}` (`index.ts:11963-11981`) — early return.
  8. `clientTimezoneOffset = body.timezoneOffset ?? new Date().getTimezoneOffset()` (`index.ts:11982-11983`).
  9. `clientLocalDate = typeof body.localDate === "string" ? body.localDate : null` (`index.ts:11984-11986`).
  10. Additional per-request fields normalised: `todayCheckinId`, `selectedCalendarEventIds` (filtered to non-empty strings), `slotReplacements` (per-slot event-binding map, keyed `"0"|"1"|"2"`) (`index.ts:11987-12000`).
  11. Later in the same handler, local-date resolution for context-building falls back per §Step 2: `const today = req.localDate || serverLocalDate` (`index.ts:5364`) and, for the Brief handshake specifically, `const localDateForLookup = req.localDate || today` (`index.ts:5091`).
- **Emits / hands to next step:** `userId` (consumed by every subsequent DB read/write, Steps 2, 9, 13), `body` fields (`calendarEvents[]`, `practicePriorityTag`, `growthIntention`, `protectGoals[]`, `leaderProfile.goals.declared[]`, `expectedSignatureHash`, `mode`, `localDate`, `timezoneOffset`, `todayCheckinId`, `selectedCalendarEventIds`, `slotReplacements`) → Step 2 (context loading), Step 5 (tagging), Step 6 (memory), Step 9 (allocator inputs), Step 12 (final object). `clientTimezoneOffset`/`clientLocalDate` → Step 2's `today` resolution and Step 13's `planDate` key.
- **Side effects:** none yet beyond logging (`[generate-mastery-plan][request-body]` structured log, `index.ts:11914-11925`).

#### Step 2 — Loading context: profile, onboarding, priority memory, prior snapshot, `expectedSignatureHash` handshake (`index.ts:5091-5442`, `buildSharedContext`-region)
- **Receives:** `userId`, `req.localDate`/`clientLocalDate`, `req.expectedSignatureHash` (Step 1).
- **Does:** detail: existing doc §A.14/§A.17 already establishes the Brief-handshake existence and onboarding-field consumption without full re-derivation; only the gaps below were newly confirmed by reading code this pass.
  1. `today = req.localDate || serverLocalDate` (`index.ts:5364`) — resolves the plan's working local date; if the client didn't send one, server-computed UTC-derived date is used (no further timezone correction visible at this line).
  2. `localDateForLookup = req.localDate || today` (`index.ts:5091`) is used specifically to query the Brief behaviour snapshot for the day (`loadBriefBehaviourSnapshot`, called with `localDateForLookup`, `timeOfDay`, `expectedSignatureHash: expectedSig` — `index.ts:5106-5110`).
  3. If the strict Brief handshake fails (signature mismatch / missing), a warning is logged (`[buildSharedContext] strict Brief handshake failed...`, `index.ts:5125`) and the code falls back to a **local rebuild** of Brief-equivalent context rather than erroring (`index.ts:5134`, `[buildSharedContext] briefBehaviour fallback to local rebuild`) — no early return; plan generation continues without the Brief's payload.
  4. `clientLocalDate: req.localDate || null` is also stamped into the shared context object for downstream use (`index.ts:5442`).
  5. Profile / onboarding fields (`practicePriorityTag`, `growthIntention`, `req.leaderProfile.goals.declared`, `req.protectGoals`, `req.onboarding.protectGoals`) are read directly off the request body at `index.ts:700-722` — per existing doc §A.17, the UI flow that produces these was not traced further; treated as given inputs here.
  6. Prior-snapshot-for-the-day lookup and priority-memory index loading occur later in the handler as part of allocator-input assembly (see Step 6 for `event_priority_memory` and Step 13 for the prior-row read used for merge/idempotency, `index.ts:12136-12175`).
- **Emits / hands to next step:** `today`/`localDateForLookup` (planDate string) → Steps 3, 4, 9, 13; Brief behaviour snapshot (or its local-rebuild fallback) → Step 11 (`briefClaim`/`clauseOverlapsBrief`, `briefAnchorEventTitles` re-sort in Step 8); onboarding fields (`practicePriorityTag`, `growthIntention`, goal tags) → Step 10 (practice-selector intent/goal scoring).
- **Side effects:** DB reads for Brief snapshot / onboarding-derived rows (not fully enumerated — existing doc Unknown #6, #2); structured logs on handshake success/fallback.

#### Step 3 — `classifyAvailability` (`_shared/availability/availability-classifier.ts:261`)
- **Receives:** `{ now, userHomeCountry, userCurrentCountry, explicitPto, calendarLoad, events[] }` assembled from Step 1's `calendarEvents` and Step 2's profile/onboarding fields (per data-flow diagram, doc §Section 0).
- **Does:** detail: §A.3 — copied verbatim, precedence is first-match-wins top-to-bottom:
  1. Calendar work evidence (≥2 timed work meetings, `WORK_MEETING_MIN = 2`, organizer OR ≥1 attendee, not all-day) → `WORKDAY`, overriding weekend/PTO/holiday.
  2. Explicit user intent (`explicitPto`) → `PTO` (travel never overrides PTO).
  3. Applicable public holiday → `PUBLIC_HOLIDAY`.
  4. Weekend day (default `weekendDays = [6]`, i.e. Saturday only — **N4**: Plan's call site does not override this with a country-aware set, `index.ts:11339-11355`) → `REST_DAY`.
  5. Workload split → `LIGHT_ROUTINE` (low/empty) or `WORKDAY`.
  Internal decision order matches the docstring quoted at `availability-classifier.ts:250-260`.
- **Consumed vs discarded outputs:** the function returns `{ state, isRestDay, workEvidence, holiday, reason }`, but per §Section 0 (`index.ts:11339-11356`) **only `isRestDay` is consumed downstream**, re-labelled `hasRestSignals`. `state`, `workEvidence`, `holiday`, `reason` are computed but not read by `deriveStructuralDayFlags` or `allocatePlanSlots` in this call path — DEAD for the day-of Plan pipeline (they are read elsewhere by `smart-nudges` and `_shared/ceo-behaviour/pto-holiday` per the file's own docblock, §A.3, but not by this pipeline).
- **Emits / hands to next step:** `hasRestSignals` (= `isRestDay`) → Step 4 (`deriveStructuralDayFlags` output field) → Step 9 (`allocatePlanSlots` `restSignals` in the dayShape ternary, §Section C step 7).
- **Side effects:** none (pure function over passed-in event/context data).

#### Step 4 — `deriveStructuralDayFlags` (`index.ts:11330-11397`, called at `index.ts:7062`)
- **Receives:** `calendarEvents`, `calendarLoad`, `opts` (Step 1/2), plus `classifyAvailability`'s `isRestDay` (Step 3).
- **Does:** detail: §A.1, §Section 0 — every flag in computed order:
  1. `hasConferenceDay = events.some(e => /conference|offsite|retreat|summit/i.test(titleOf(e)))` (`index.ts:11330-11333`).
  2. `hasOffsiteDay = events.some(e => /offsite|off-site/i.test(titleOf(e)))` (`index.ts:11334-11336`).
  3. `hasTravelDay` (title/category-derived; existing doc references this flag by name at `index.ts:11330-11397` and consumes it at Step 9/allocator but does not re-quote its exact regex — treated as parallel to `hasConferenceDay`/`hasOffsiteDay` construction).
  4. `hasRestSignals` = `classifyAvailability(...).isRestDay` (Step 3's output, folded in here per §A.1/§A.3).
  5. `dayOfWeek` — raw JS day-of-week integer (0-6), computed from `now`/local date; this is the **same raw value** later consumed unmodified by the hardcoded Saturday check in the allocator (§Bug B) — no home-country adjustment happens at this layer.
  6. **Embedded call:** `evaluateWeekAheadMode({ dayOfWeek, ... })` (`week-ahead-mode.ts:129`) — first-match-wins waterfall (full quote in doc §Section D / referenced §A.4); computes `planningDayOfWeek(homeCountry)` (`week-ahead-mode.ts:48`): Saturday-start countries (`SA, KW, QA, BH, OM, IL`) plan on Saturday evening, everyone else on Sunday. Returns `{ active, reason, lookbackDays, lookaheadDays }`.
     - **What Week-Ahead active changes:** if `active === true`, `isWeekAhead = true` is folded into the flags object and becomes the **first** check the live allocator makes (§Section C step 1) — it short-circuits the entire day-shape waterfall (Saturday/PTO/travel/conference/dominant/mixed/light_routine are all skipped) and instead returns a single `week_ahead` slot. It also changes `lookbackDays`/`lookaheadDays` used by `list-week-ahead-priorities`' own separate orchestration (§A.5) and the persisted `horizon_iso` computation at Step 13 (`index.ts:12198-2210`: `lookaheadDays` from `weekAheadDecision` extends the horizon timestamp instead of the default 24h `DAY_OF_HORIZON_MS`).
  7. `isPtoOrHoliday` — folded from `classifyAvailability`'s `PTO`/`PUBLIC_HOLIDAY` states (per §A.3's precedence) — note this is a *separate* consumption of `classifyAvailability`'s output than `hasRestSignals` (`isRestDay`); both are read from the same underlying call.
  8. `isFullWorkingWeekend = (dayOfWeek === 0 || dayOfWeek === 6) && (calendarLoad ∈ {high, extreme} || realMeetingCount ≥ 3)` (`index.ts:11360-11362`, quoted verbatim in §A.1).
- **Emits / hands to next step:** `{ hasTravelDay, hasConferenceDay, hasOffsiteDay, hasRestSignals, dayOfWeek, isWeekAhead, isPtoOrHoliday, isFullWorkingWeekend }` → Step 9 (`allocatePlanSlots` input fields, verbatim per §Section 0 data-flow diagram) and `isWeekAhead`/`lookaheadDays` → Step 13 (horizon persistence).
- **Side effects:** none beyond internal logging inferred from surrounding code style; no DB calls in this function itself.

#### Step 5 — Event tagging / A–H category resolution (upstream of this pipeline; tags assumed pre-present at ranking time)
- **Receives:** raw `calendarEvents[]` (Step 1) and pre-scored rows from `jit_event_context` ("the Bridge", per §A.1).
- **Does:** Titles are mapped to a category (`A`–`H`) + subtype by `enrichEvent()` (`_shared/events/enrich-event.ts`), called by **both** `select-jit.ts` (Step 7, shadow) and `jit-candidates.ts` (Step 8, live) — per §A.2. `EVENT_CATEGORIES` (`_shared/events/event-categories.ts:49`) is the single source of truth for the eight pillars and their pre/during/post protocol (table reproduced from §A.2):

  | ID | Name | Pre/During/Post protocol |
  |---|---|---|
  | A | High-Stakes Governance | Flow / — / Pause |
  | B | Influence & Persuasion | Flow / — / Reenergise |
  | C | Visibility & Communication | Pause / — / Reenergise |
  | D | People & Difficult Conversations | Pause / — / Pause |
  | E | Deep Work & Strategy | Flow / Flow / Pause |
  | F | Conferences & External Events | Pause / Pause (notif-only) / Reenergise |
  | G | Travel | Pause / Pause / Reenergise |
  | H | Daily Rhythm & Baseline | Pause / — / Pause |

  By the time Steps 6-8 run, each event carries `categoryId`, `stakesLevel`, `severity`, `demandProfile`, and phase-eligibility windows as attached fields — this tagging step is **assumed complete upstream** of `applyEventPriorityMemory`/`rankJitCandidates`/`selectJitCandidates`; `enrich-event.ts` itself was not fully re-read this pass (existing doc flags it "not fully read").
- **Emits / hands to next step:** enriched per-event `{categoryId, stakesLevel, severity, demandProfile, phase windows}` → Step 6 (memory lookup keys `eventCategory`/`eventTypeKey`), Step 7 (shadow scorer), Step 8 (live scorer weight-table lookups).
- **Side effects:** none observed at this layer (pure enrichment); category taxonomy itself is a static table, no DB read per event visible in the audited excerpt.

#### Step 6 — `applyEventPriorityMemory` (`_shared/plan/event-priority-memory.ts:106`)
- **Receives:** `priorityMemoryIndex` (loaded from `event_priority_memory` table, per Step 2/context) and per-event `{eventCategory, eventTypeKey}` keys (Step 5).
- **Does:** detail: §A.6, §B.3, Constants Table — computes a **net delta clamped to `[-50, +30]`** (`event-priority-memory.ts:166-167`) from six signal types, quoted verbatim from the Constants Table:

  | Signal | Delta | Decay window |
  |---|---|---|
  | `priority` | +10 | ≤60d |
  | `cancelled_keep_surfacing` | +5 | ≤60d |
  | `cancelled_now` | −8 | ≤7d |
  | `not_this_week` | −15 | ≤14d |
  | `cancelled_as_noise` | −25 | ≤60d |
  | `never` | −40 **+ hardDemote = true (always, no decay)** | — |

  Hard-demote rule (§B.3): any `never` row sets `hardDemote = true` and `delta -= 40` (`event-priority-memory.ts:133-136`). Upstream, `index.ts:5935-5938` additionally folds in `titleMem.hardDemote` (exact-title-key memory) and forces `memoryHardDemote = true` whenever a derived memory row is permanently flagged with `net_importance <= -999`.
- **Emits / hands to next step:** per-event `memoryDelta` and `memoryHardDemote` → Step 8 (`rankJitCandidates`'s `score = ... + memory` term, and the `if (ev.memoryHardDemote) continue;` skip at `jit-candidates.ts:157` which runs **before any phase/scoring logic** — a candidate with hard-demote never reaches scoring at all).
- **Side effects:** DB read of `event_priority_memory` (implied by "Read model over `event_priority_memory`", §A.6); no writes in this step.

#### Step 7 — Shadow `selectJitCandidates` call (`select-jit.ts`, called `index.ts:725-732`) — runs, logged, dropped
- **Receives:** `input` (enriched events, Step 5), `{accountAgeDays, signalSummary, skipCountsByBucket: {} /* PR1 empty */, followThroughByBucket: {}, goals, nowMs: Date.now()}` (`index.ts:725-732`, quoted verbatim).
- **Does:** detail: §B.0 — runs the full Immediate/Tactical/Strategic/tier-weighted/sovereign scoring model (`CATEGORY_BASE`: A=40,C=32,B=30,D=22(cap 38 via `D_BOOSTED_CAP`),F=18,G=12,E=10,H=5; floor `MIN_IMMEDIATE = 25` on immediate/tactical/tierWeighted axes). Produces `{ranked[], excluded[], tier, crisisEvents[]}`.
- **Emits / hands to next step:** **none that are consumed.** The only use of `result` is a single log line: `` console.log(`[generate-mastery-plan][jit-v2-shadow] tier=${result.tier.tier} ...`) `` (`index.ts:734-737`). Every field of `result` — `ranked`, `excluded`, `tier`, `crisisEvents` — is **DEAD / shadow**: computed but never read by Step 8, Step 9, or any later step. Bug cross-ref: see Section F, Finding N1 (one-line only, per instructions).
- **Side effects:** structured console log only (`[jit-v2-shadow]` tag); no DB writes; no influence on `allocatePlanSlots`.

#### Step 8 — `rankJitCandidates` (LIVE) (`_shared/events/jit-candidates.ts:150-248`, called `index.ts:5913-5954`)
- **Receives:** `preFilteredEvents.map(e => ({event:{id,title,start_time,end_time}, stakesLevel, score, memoryDelta, memoryHardDemote}))` (Step 6's memory outputs folded in per-event) and `nowMsForJit` (`index.ts:5913-5954`).
- **Does:** detail: §B.1-B.3, per-event scoring sub-steps in coded order:
  1. **Hard-demote gate first:** `if (ev.memoryHardDemote) continue;` (`jit-candidates.ts:157`) — candidate skipped entirely before any phase/scoring logic runs.
  2. Per remaining event, per eligible phase: `base = STAKES_BASE[stakesLevel] ?? 5` (board=40, external=35, investor=35, critical=30, high=22, medium=12, low=4, default=5).
  3. `catW = CATEGORY_WEIGHT[categoryId]` (A=20,C=15,D=15,B=10,F=10,E=5,G=5,H=0).
  4. `sevW = SEVERITY_WEIGHT[severity]` (high=15, medium=8, low=3).
  5. `demW = demandWeight(phase, demandProfile)`: `pre → (cog+emo)×2` (max 12); `during → cog×3` (max 9); `post → (ene+cir)×3` (max 18).
  6. `prox = proximityScore(nowMs, winStart, winEnd)`, clamped ±5, fed by `computeRawProximity`: fades in from 30min (+8) → 6h (+6) → 24h (+3) → 0 further out, and **−5** once the window has passed.
  7. `skipPenalty = ev.skipPenalty ?? 0`; `memory = ev.memoryDelta ?? 0` (Step 6's output).
  8. `score = base + catW + sevW + demW + prox − skipPenalty + memory` (`jit-candidates.ts:169-193`).
  9. **Horizon ceiling:** candidates whose window starts more than `MAX_JIT_HORIZON_MS = 24h` out are dropped (`jit-candidates.ts:80,187`).
  10. **Staleness grace:** candidates dropped once window has been over longer than `STALE_PHASE_GRACE_MS` (pre=30min, during=30min, post=2h).
  11. **Meaningful-candidate floor** (`getJitCandidateDropReason`, `jit-candidates.ts:300-344`), predicate tree evaluated in this exact order:
      1. `hasStrongStakes` (board/external/investor/critical/high) → always kept regardless of score.
      2. `hasPositiveMemory` (`components.memory ≥ 10`) → always kept.
      3. Title matches `ADMIN_COMPLIANCE_NOISE_KEYWORDS` (e.g. "r&d tax", "vat", "payroll", "invoice", "audit prep") → dropped, `admin_compliance_noise`.
      4. `categoryId === 'H'` with no explicit stakes → dropped, `personal_category_without_explicit_stakes`.
      5. Structural categories (`A,C,F,G`): kept if `hasMediumStakes` OR `severity==='high'` OR `demand≥8`; else falls through.
      6. Non-structural (`B,D,E`): kept only if ≥2 of {mediumStakes, highSeverity, strongDemand}; else falls through.
      7. Final numeric floor: `score >= MIN_CANDIDATE_SCORE (25)` → kept; else dropped, `below_meaningful_floor`.
  12. Sort: `out.sort((a,b) => b.score - a.score)` — pure score descending, no secondary tiebreaker column (`jit-candidates.ts:236`).
- **Emits / hands to next step:** `jitRankedCandidates: RankedJitCandidate[] = {eventId, title, phase, categoryId, comboKey, severity, leadTimeMin, demandProfile, durationMinutes, windowStartMs, windowEndMs, eligible, minutesUntilWindow, score, components{...}}` → Step 8b (Brief re-sort) → Step 9 (`allocatePlanSlots` `rankedCandidates` input, `index.ts:7060`, `11111`) and Step 10 (per-slot practice window signals reference `components`/`demandProfile`).
- **Side effects:** none beyond whatever logging surrounds the call; no DB writes in this function itself.

#### Step 8b — Brief-anchor re-sort (`index.ts:5959-5986`)
- **Receives:** `jitRankedCandidates` (Step 8), `shared.briefBehaviour` (Step 2, or its local-rebuild fallback).
- **Does:** `briefAnchorEventTitles(shared.briefBehaviour)` extracts titles the Brief already flagged as anchors, then does a **stable sort** of `jitRankedCandidates` so Brief-flagged titles float to the top, without altering relative order of non-flagged items or recomputing scores (§Section 0 data-flow diagram, `index.ts:5959-5986`).
- **Emits / hands to next step:** re-ordered `jitRankedCandidates` → Step 9 (`allocatePlanSlots`'s `top`/`second`/`third` selection is therefore Brief-influenced, not pure-score-only, at the margins).
- **Side effects:** none.

#### Step 9 — `allocatePlanSlots` (`_shared/jit/slot-allocator.ts:125-278`) — full day-shape waterfall
- **Receives:** `{nowMs, rankedCandidates: jitRankedCandidates (Step 8b), hasTravelDay, hasConferenceDay, hasOffsiteDay, hasRestSignals, dayOfWeek, isWeekAhead, isPtoOrHoliday, isFullWorkingWeekend (all Step 4), mrsWindow, preferredPracticeWindows, forceArcCategoryIds}` (per §Section 0 data-flow diagram).
- **Does:** detail: §Section C — the exact `if`-statement order as coded, numbered identically to the existing doc:
  1. **Week-Ahead** (checked first, unconditionally): `if (input.isWeekAhead) return buildSingleStateSlotResult("week_ahead", "week_ahead_planning", ranked.length, preferredPracticeWindows)` (`slot-allocator.ts:139-141`) → **early return; branches 2-9 below never run for this request.**
  2. **Saturday / weekend rest — hardcoded**: `if (input.dayOfWeek === 6 && !input.isFullWorkingWeekend) return buildSingleStateSlotResult("saturday", "saturday_habit_only", ...)` (`slot-allocator.ts:143-145`) → early return if matched. Bug cross-ref: Section F, Bug B (hardcoded `dayOfWeek===6`, ignores `planningDayOfWeek(homeCountry)`) — one line only, not expanded here.
  3. **PTO / holiday**: `if (input.isPtoOrHoliday) return buildSingleStateSlotResult("holiday_pto", "holiday_habit_only", ...)` (`slot-allocator.ts:147-149`) → early return if matched.
  4. **Travel day (full arc)**: `if (input.hasTravelDay && (!top || top.categoryId === "G")) return buildNamedFullArcResult("travel_day", "travel_day_full_arc", ranked, "G")` (`slot-allocator.ts:151-153`) → early return if matched. Note: `isFullWorkingWeekend` only gates branch 2, not this branch.
  5. **Conference day (full arc)**: `if (input.hasConferenceDay && (!top || top.categoryId === "F")) return buildNamedFullArcResult("conference_day", "conference_day_full_arc", ranked, "F")` (`slot-allocator.ts:155-157`) → early return if matched.
  6. **Same-event-fan detection** (not itself a returning branch): `sameEventFan = !!top && !!topEventId && !differentEventCandidate && ranked.length > 1`; `topIsStructural = top.categoryId ∈ {A,C,F,G} or forceArcCategoryIds`; `dominantStructuralEvent = topIsStructural && (!hasSecondCandidate || sameEventFan || !differentEventCandidate)` (`slot-allocator.ts:159-173`).
  7. **Final `dayShape` ternary** (`slot-allocator.ts:174-182`), precedence `rest_day > mixed_day (two conditions) > dominant_structural_event > light_routine > default mixed_day`:
     ```
     dayShape = restSignals ? "rest_day"
       : structuralSignals>=2 || (top.categoryId==="F" && hasSecondCandidate && hasThirdCandidate && differentEventCandidate) ? "mixed_day"
       : dominantStructuralEvent ? "dominant_structural_event"
       : ranked.length<=1 ? "light_routine"
       : "mixed_day"
     ```
     where `restSignals = input.hasRestSignals === true` (Step 3's output) and `structuralSignals` counts truthy `[hasTravelDay, hasConferenceDay, hasOffsiteDay]` (0-3). By this point, branches 4-5's travel/conference "top=G/F" early returns have already fired if applicable — this ternary only reaches travel/conference-as-background-signal cases.
  8. **`light_routine` reachability** confirmed live: fires whenever none of branches 1-7 above short-circuited and `ranked.length <= 1`.
  9. **`light_day_strong_state` does not exist** in the `DayShape` union type at all (`slot-allocator.ts:38-47`) — confirmed absent; any reference to it elsewhere describes non-existent code (Section F, N3).
  10. **Mode derivation** (`slot-allocator.ts:184-188`, immediately after `dayShape`): `mode = dayShape==="rest_day" ? "state" : dayShape==="light_routine" ? "jit+state" : dayShape==="dominant_structural_event" ? "full_arc" : "jit+state"`. Bug cross-ref: Section F, Bug A (`light_routine` always unconditionally `"jit+state"` regardless of actual candidate count) — one line only.
  11. **`rest_day` short-circuit** (`slot-allocator.ts:196-211`): `if (dayShape === "rest_day") return {dayShape, mode, restDay:true, allocationReason:"rest_day_no_priorities", slots: [], debug:{...}}` → **zero slots**, Steps 10-11 (practice selection, copy generation) never run for any slot on a true rest day.
  12. **Per-slot `makeSlot`/`buildSingleStateSlotResult`/`buildNamedFullArcResult`**, slot timing, arc-phase per slot (non-rest-day paths), day-level `mode` already assigned above:
      - `saturday`/`holiday_pto`/`week_ahead` → **1 slot** via `buildSingleStateSlotResult` (`slot-allocator.ts:307-344`); `slotRole` depends on `preferredPracticeWindows` — `evening` preference → `close_of_day`; else `state_anchor`; `allocationReason` suffixed with the preferred window name when present. No JIT fields populated (`jitPhase:null, jitEventTitle:null, jitEventId:null, jitCategoryId:null`).
      - `travel_day`/`conference_day` → **3 slots** (full arc: pre/during-or-state/post) via `buildNamedFullArcResult` (`slot-allocator.ts:346-394`); for travel specifically, `pruneTravelPhases` (`slot-allocator.ts:13-36`) drops the `during` (in-flight) phase for short-haul flights (duration <6h or unknown duration) — only long-haul/explicit `travel_day` keeps it; short-haul degrades slot 2 to a plain state anchor (`slot-allocator.ts:369-373`).
      - `dominant_structural_event` → **3 slots**, phases picked by the dominant event's own `EVENT_PHASE_MAP` entry, never array position (`slot-allocator.ts:213-239`). Category A special-case: gets `pre`, then a fixed **"board protect" state slot** (`makeBoardProtectSlot`, lines 294-305, `allocationReason:"board_protect_state"`), then `post` — never a real "during" JIT slot, because `event-categories.ts:66` defines Category A's protocol as `{pre:"Flow", during:null, post:"Pause"}`.
      - `mixed_day`/`light_routine` (default) → **3 slots** (top/second/third by array position, lines 256-264), may degrade per-slot to a state fallback when a slot has no qualifying candidate (`allocationReason:"state_fallback_no_meaningful_jit"`, `isJit:false`).
  Arc-phase per slot: derived from the anchor event/category's `EVENT_PHASE_MAP` entry (`_shared/events/event-phase-map.ts`, referenced but not fully re-quoted, per §A.10).
- **Emits / hands to next step:** `SlotAllocation = {dayShape, mode, restDay?, slots[] = {index, slotRole, arcLabel, jitPhase, jitEventTitle, jitEventId, jitCategoryId, allocationReason}, debug{...}}` → Step 10 (per-slot practice selection consumes `slots[].slotRole`/`arcLabel`/`jitCategoryId`/`jitPhase`), Step 11 (`composeWhyLine` consumes `arcLabel`, `slotAnchorCategoryId`), Step 12 (final object assembly consumes `dayShape`, `mode`, `slots[]`), Step 13 (`day_kind`/`plan_json.meta.dayShape` persistence).
- **Side effects:** none (pure allocation function); logging only (`debug{}` object returned for observability, not itself a side effect).

#### Step 10 — Practice selection per slot (`_shared/plan/practice-selector.ts`, `selectPracticeForSlot`)
- **Receives:** per slot: `{stateAction, ceoVerb, anchorCategory, anchorPhase}` (from Step 9's slot object), `practicePriorityTag` (Step 2/onboarding), `preferredPracticeWindows` (Step 1/profile), candidate rows from `sanctuary_content`/`sanctuary_content_metadata` (read at `index.ts:5564`/`5572`).
- **Does:** detail: §D.2, filter/score/pick per slot in order:
  1. `deriveSlotIntent()` (line 70) — **first-match waterfall**, checked in this exact order:
     0. **Pre-decision clarity** (checked first so it "cannot be shadowed by `verb==='decide'`"): fires on action containing clarify/clarity/detach/reactive/"decision fatigue"/"pre-decision", OR `anchorCategory==='A' && anchorPhase==='pre'`, OR `verb ∈ {clarify, detach}`, OR `tag ∈ {decision_fatigue, pre_decision_clarity}`, OR `combo==='mindset.pause'`.
     1. **Focus/flow-mastery**: action contains "focus" OR `verb ∈ {sharpen, decide}` OR `tag==='focus_clarity'` OR `anchorCategory==='E'`.
     2. **Recovery/renewal**: action contains recover/restore/settle/decompress OR `verb ∈ {recover, reset, land}` OR `tag==='recovery_resilience'` OR `anchorPhase==='post'`.
     3. **Circadian**: action contains "circadian" OR `anchorCategory==='G'`.
     4. **Activation/presence**: action contains "activate"/"build capacity" OR `verb ∈ {present, lead}` OR `tag==='energy_endurance'`.
     5. **Default — regulation/composure**: unconditional fallback → `meta-recalibration`/`pause`/`somatic.pause`.
  2. `scoreStructuredTags()` (line 390): per-`intentLabel` bespoke point total from `structuredTags` (pillar, masterySubtypes, goalTags, contextTags, cognitiveLoadHelp, energyDirection) — e.g. focus/flow-mastery: `pillar==='flow'` +8, matching subtypes +5, matching goals +7, matching cognitiveLoadHelp +4, direction clarify/stabilize +2, **guardrail penalty −8** if `pillar==='renewal'` and no clarity-family goal present.
  3. `scoreLeaderGoalAlignment()` (line 300): 0/9/14 points for 0/1/2+ matched onboarding leader-goal tags (`prepare|patterns|sustain`).
  4. `practiceWindowPreferenceBoost()` (line 273): +4 if content declares a matching preferred time window AND it's among the user's `preferredPracticeWindows`; **−2** if content declares preferred windows but current one isn't among them; 0 if no declaration.
  5. Window handling / fallbacks: existing doc flags (§D.2) that the remaining `intentLabel` branches beyond pre-decision-clarity and focus/flow-mastery were only partially re-read (file continues past line 500, "Unknowns" #7) — not expanded further here per "copy from doc, don't re-derive" rule.
  6. Highest-scoring content row per slot is selected: `{selected: [practice], usedProtocolFallback}`.
- **Emits / hands to next step:** `selected` practice content object (id, title, tags, protocol metadata), `usedProtocolFallback` flag → Step 11 (copy generation references the selected practice's action/verb for `composeWhyLine`), Step 12 (final `horizonModules[]` embed the selected content), Step 13 (`recommended_practice_ids` persisted array).
- **Side effects:** DB reads of `sanctuary_content`, `sanctuary_content_metadata`, `sanctuary_content_steps` (§A.11); no writes.

#### Step 11 — Copy generation per slot (`composeWhyLine`, `index.ts:8639-8751`; `why-llm.ts`, `generateWhyStatement`)
- **Receives:** `hm` (HorizonModule shape from Steps 9-10), `req`, `shared` (Step 2 context incl. Brief behaviour), `hrvCorrelations`, `ceo` (CEO framework context), `briefClaim` (Step 2), `fusionEventTitle`/`fusion`, `opts` (`timeOfDay`, `windowSignals`).
- **Does:** detail: §D.3, clause build order quoted verbatim:
  1. Deterministic `composeWhyLine` is computed **first, always**, as `fallbackWhyLine` (`index.ts:8869-8881`) — this runs regardless of whether the LLM path is later attempted.
  2. Clause construction, in order: `strat = strategicAnchorClause(...)`, `tac = tacticalClause(...)`, `imm = immediateClause(...)` (`index.ts:8682-8691`).
  3. Each clause independently nulled if it duplicates the Brief: `if (strat && clauseOverlapsBrief(strat, briefClaim)) strat = null;` (same for `tac`, `imm`) (`index.ts:8687-8689`).
  4. Final assembly (`index.ts:8739-8749`): if `eventSpecificWhy` (from `buildModuleEventWhyLine`) exists → it wins outright, `strat`/`tac`/`imm` discarded; else if all three overlapped the brief → `"Following your brief:"`; else append non-null `strat`, then `tac`, then `imm` in that fixed order (any/all may be absent).
  5. Sentence always ends with a fixed closer: `` `${arcLabel}: ${verb} ${forContext}.` ``.
  6. `arcLabel` derivation (`index.ts:8704-8713`): `"Recover"` if `phase==='post'` or `hm.slotKind==='end_of_day'`; else `"During"` if `phase==='during'`; else `"Prepare"` if `phase==='pre'` or `hm.slotKind ∈ {jit, start_of_day}`; else `"Steady"`.
  7. **LLM vs deterministic decision:** after `fallbackWhyLine` is computed, a parallel LLM call (`generateWhyStatement`, `why-llm.ts`) is attempted per slot (Promise.all fan-out per prior doc; not independently re-read this pass, flagged partial-Unknown in §D.3). If LLM output passes `validateWhyLine`, it **overwrites** `fallbackWhyLine`; if it fails validation, the deterministic line is kept.
  8. **Deterministic valence guard** (`index.ts:8895-8926`): even the deterministic fallback is itself re-validated via the same `validateWhyLine` used for the LLM path; `if (!detVerdict.ok && detVerdict.reason ∈ {valence_firing_recovery, valence_depleted_push}) { fallbackWhyLine = composeWhyLine(...) }` — i.e. re-composed a second time dropping the offending clause on valence mismatch.
  9. Per-practice display copy: sourced from the selected content's own metadata (Step 10) plus the composed why-line; Brief's `buildDeterministicBriefFallback` (`compute-outer-readiness`) is **not** imported or reused here — Plan's `composeWhyLine` is a fully separate implementation (§D.3, N5).
- **Emits / hands to next step:** `fallbackWhyLine`/final why-line text per slot, `arcLabel` → Step 12 (`horizonModules[]` field assembly).
- **Side effects:** LLM API call (Gemini, per prior-doc characterization, not independently re-verified — §D.3, Unknowns #4); no DB writes.

#### Step 12 — Final plan object assembly (`generate-mastery-plan/index.ts`, region feeding `planObj`)
- **Receives:** `dayShape`, `mode`, `slots[]` (Step 9); selected practice content per slot (Step 10); why-line/copy per slot (Step 11); `weekAheadDecision` (Step 4); merge inputs from `mergeWithLedger` (below).
- **Does:**
  1. `buildPriorityTitle(...)` → deterministic `HorizonModule.title` per slot (§Section 0 data-flow diagram).
  2. `mergeWithLedger(freshModules, ledgerModules, completedIds, ...)` reads `daily_ritual_completions.plan_ledger` (`index.ts:11417`) and merges freshly-generated modules against the existing ledger so already-completed items retain their completed status (Executive Summary point 5, "Persist... merge it against whatever plan the user already had for the day").
  3. Assembles `planObj` fields in order per §Section 0: `meta.dayShape`/`meta.dayKind` (Step 9's `dayShape`), `horizonModules[]` (Steps 10-11's per-slot output), `weekAheadDecision` (Step 4), `reason`/`message` (set when the plan is in an "awaiting" state), `planState`.
  4. `visiblePriorities` and `horizonMods` are derived/filtered subsets of the assembled modules used specifically for the persisted `priorities`/`horizon_modules` columns (Step 13).
  5. `practiceIds` computed as the de-duplicated union of `visiblePriorities`/`horizonMods`' content IDs (`index.ts:12182-12191`).
  6. Non-rest-day empty-payload guard: `if (!isRestDayPayload && !planIsAwaiting && horizonMods.length === 0)` → logs a structured warning `[mastery-plan-snapshot][non-rest-day-empty-payload]` (`index.ts:12107-12131`) — this is a **logged anomaly, not an early return**; execution continues to persistence regardless.
- **Emits / hands to next step:** `planObj` (full plan JSON), `horizonMods`, `visiblePriorities`, `practiceIds`, `snapshotStatus` (`ready`/`awaiting`/`error`) → Step 13 (persistence) and Step 14 (response payload).
- **Side effects:** DB read of `daily_ritual_completions.plan_ledger` (`index.ts:12217-12224`); structured logging (`[mastery-plan-snapshot][payload-details]`, `index.ts:12227-12238`).

#### Step 13 — Persistence: `mastery_plan_snapshots` writes, merge/overwrite, idempotency/signature (`index.ts:12100-12300`+, `12582-12622` error path)
- **Receives:** `planObj`, `horizonMods`, `visiblePriorities`, `practiceIds`, `planLedger`, `snapshotStatus`, `userId`, `planDate`, `currentPeriod` (mrsWindow) — all from Steps 1-12.
- **Does:**
  1. **`onlyIfMissing` early return:** if `opts.onlyIfMissing`, selects existing row by `(user_id, plan_date, mrs_window)`; if found, logs `[mastery-plan-snapshot][early-return]` reason `only_if_missing_row_exists` and **returns without writing** (`index.ts:12136-12150`).
  2. **Awaiting-never-clobbers-ready guard:** if `snapshotStatus === "awaiting"`, checks for an existing `status:"ready"` row for the same key; if found, logs `[mastery-plan-snapshot][awaiting-preserved-ready]` and **returns without writing** (`index.ts:12157-12174`) — so an in-flight/degraded generation never overwrites a good prior plan.
  3. Computes `horizonIsoValue`: if `weekAheadDecision.active` and `lookaheadDays > 0` → `now + lookaheadDays*86_400_000`; else `now + DAY_OF_HORIZON_MS` (default 24h) (`index.ts:12196-12213`) — Week-Ahead delta noted here (also see H.4).
  4. Reads `daily_ritual_completions.plan_ledger` for merge context (`index.ts:12217-12224`, same lookup feeding Step 12's `mergeWithLedger`).
  5. **Upsert**: `mastery_plan_snapshots.upsert({user_id, plan_date, mrs_window, day_kind, horizon_iso, plan_json: planObj, horizon_modules, priorities, recommended_practice_ids: practiceIds, plan_ledger, brief_snapshot_id: null, input_signature: stateFingerprint, status: snapshotStatus, error_json, generated_at}, {onConflict: "user_id,plan_date,mrs_window"})` (`index.ts:12239-12266`) — natural key confirmed directly this pass (resolves prior doc's Unknown #5). `brief_snapshot_id` is intentionally always `null` (comment: "generate-mastery-plan does not receive a briefId today"). `error_json` is populated only when `status === "awaiting"`.
  6. On upsert error: logs `[mastery-plan-snapshot][upsert-failure]`; on success: logs `[mastery-plan-snapshot][upsert-success]` (`index.ts:12269-12280`+).
  7. **Separate error-path upsert** (`index.ts:12590`, distinct call site from the success path above): writes `user_id, plan_date, mrs_window, status, error_json, generated_at` on the same `onConflict`, with an explicit **overwrite-protection** comment (`index.ts:12577-12588`): never clobber a valid ready snapshot with an error row; if a ready row exists, the UI keeps rendering it and the error is captured in logs/`executive_home_card_runs` instead.
  8. `input_signature: stateFingerprint` is the idempotency/signature field — this is what Step 2's `expectedSignatureHash` handshake and the client's next-request `expectedSignatureHash` are checked against; exact fingerprint-computation logic was not re-derived beyond confirming the field name and its write-time slot in the upsert payload.
- **Emits / hands to next step:** persisted row `{id, status}` → Step 14 (response echoes/derives from this row); `plan_json`, `horizon_modules`, `priorities`, `recommended_practice_ids`, `status`, `generated_at`, `input_signature`, `day_kind`, `horizon_iso` → Step 15 (Plan UI hook, `compute-outer-readiness`, `smart-nudges` all read these columns).
- **Side effects:** DB read (existence checks, ledger read) and DB write (upsert) against `mastery_plan_snapshots`; structured logging throughout.

#### Step 14 — Response to client (`generate-mastery-plan/index.ts`, handler return)
- **Receives:** `planObj` and derived fields from Steps 12-13.
- **Does:** returns the HTTP response per §Section 0's quoted shape — no additional branching beyond the earlier early-return points (Step 1's auth/parse failures, Step 9's dayShape-driven early returns which only affect `slots`/`dayShape` content, not the top-level response envelope).
- **Emits / hands to next step:** `{signatureHash, timeOfDay, horizonModules[], calendarPills[], preEventPlan, coachCard, ledger, observability}` (exact payload shape, §Section 0) → Step 15's client-side consumers (Plan UI via `useMasteryPlanSnapshot`/`get-mastery-plan-snapshot`, not via this direct response body for the snapshot-first read path — see Step 15 note).
- **Side effects:** none beyond the HTTP response itself.

#### Step 15 — Post-run consumers: `compute-outer-readiness` (Brief) + `smart-nudges`
- **Receives (Plan UI / `useMasteryPlanSnapshot`):** per `src/hooks/useMasteryPlanSnapshot.ts:1-45`, the hook does **not** read the direct `generate-mastery-plan` response — it is a **snapshot-first** read via a separate edge function `get-mastery-plan-snapshot`, keyed on `(effectiveUserId, planDate, mrsWindow)`, which performs current-window-first + latest-ready cross-window fallback and stamps `source.strategy`/`source.crossWindowFallback`. Fields exposed to the UI: `id, planJson, horizonModules, priorities, recommendedPracticeIds, planLedger, status, errorJson, generatedAt, inputSignature, planDate, mrsWindow, dayKind, horizonIso, deliveredAt, viewedAt, sourceStrategy, sourceSelectedWindow, sourceCrossWindowFallback` — all sourced from the `mastery_plan_snapshots` row written in Step 13. The hook does not trigger generation itself (comment, lines 5-11).
- **Receives (`compute-outer-readiness`, Brief):** per existing doc §A.14, reads/produces the reciprocal direction — `compute-outer-readiness` is the **producer** of `brief_snapshots.payload_json.behaviour_snapshot`, which Plan itself **reads** at Step 2 (`loadBriefBehaviourSnapshot`) via the `expectedSignatureHash` handshake, not the other way around. `compute-outer-readiness` also imports `buildDeterministicBriefFallback` (`_shared/brief/deterministic-brief.ts:244`), used at `compute-outer-readiness/index.ts:8693` — this is a Brief-internal fallback, confirmed **not** shared with Plan's `composeWhyLine` (§D.3, N5). The 409/412 Brief↔Plan handshake contract itself was not independently re-verified line-by-line this pass (existing doc Unknown #6, carried forward unchanged).
- **Receives (`smart-nudges`):** `loadPlanNudgeSlots(supabase, userId, planDate, mrsWindow)` (`smart-nudges/index.ts:511-560`, newly read this pass): selects `mastery_plan_snapshots.horizon_modules, status, generated_at` for the exact `(user_id, plan_date, mrs_window)` key, ordered by `generated_at desc`, `limit(1)`. **If no row is found for the exact window**, it falls back to a **same-day, any-window** query: `select horizon_modules,status,generated_at,mrs_window ... .eq(user_id).eq(plan_date) .order(generated_at desc).limit(1)` (`smart-nudges/index.ts:538-551`) — i.e. smart-nudges will happily read a *different* window's snapshot for the same day if the exact-window one is missing. Only `horizon_modules` is extracted (`raw = Array.isArray(row.horizon_modules) ? row.horizon_modules : []`) into `slots` — **`dayShape`/`mode`/`plan_json` are not read by this function**, consistent with existing doc's read-vs-re-derive table (§A.15, §A on Downstream-consumer table) showing smart-nudges independently recomputes its own day-of-week/weekend booleans (`ctx.dayOfWeek === 6` in 12+ places) rather than consuming a persisted `dayShape` field. Cross-ref Section F, N6 (one line only).
- **Does / when:** Plan UI reads on every home-screen mount/poll via `useQuery` (`staleTime: 60s`, `queryKey: ['mastery-plan-snapshot', effectiveUserId, planDate, mrsWindow]`) — independent of, and after, any given `generate-mastery-plan` run. `smart-nudges` reads on its own scheduling/dispatch cadence, not synchronously chained to Step 13. `compute-outer-readiness` runs on the Brief's own cadence, upstream in time relative to a given Plan run's Step 2 read (Plan reads Brief's most recent output, not vice versa).
- **Emits:** Plan UI renders `horizonModules`/`priorities`/`status` to the "Today's 3" card; `smart-nudges` uses `horizon_modules` (`slots`) to compose nudge copy/timing; `compute-outer-readiness` output feeds back into the **next** Plan run's Step 2, not the current one.
- **Side effects:** DB reads only in this step (no writes by these three consumers against `mastery_plan_snapshots` itself, beyond `smart-nudges`' own separate dispatch/claim tables per `dispatch-key.ts`, §A.16 — one line, not expanded).

---

### H.2 Handoff Table

| Step N | Field name | Produced at (file:line) | Consumed at Step M (file:line) |
|---|---|---|---|
| 1 | `userId` | `index.ts:11844-11879` | Steps 2,6,9,13 (`index.ts:5091`, `5913`, `12140-12266`) |
| 1 | `body.calendarEvents[]` | `index.ts:11886-11962` (parsed) | Step 3/4/5 (`index.ts:11330-11397`, availability-classifier.ts:261) |
| 1 | `body.expectedSignatureHash` | request body | Step 2 (`index.ts:5106-5110`) |
| 1 | `clientLocalDate`/`req.localDate` | `index.ts:11984-11986` | Step 2 (`index.ts:5091,5364`), Step 13 (`planDate`) |
| 1 | `slotReplacements`/`selectedCalendarEventIds` | `index.ts:11990-12000` | Step 9/12 (slot construction overrides — not exhaustively re-traced this pass) |
| 2 | `today`/`localDateForLookup` | `index.ts:5091,5364` | Steps 3,4,9,13 (`planDate` key) |
| 2 | Brief behaviour snapshot (or local-rebuild fallback) | `index.ts:5106-5134` | Step 11 (`briefClaim`, `index.ts:8687-8689`), Step 8b (`index.ts:5959-5986`) |
| 2 | `practicePriorityTag`, `growthIntention`, goal tags | `index.ts:700-722` | Step 10 (`practice-selector.ts:70` intent, `:300,373` goal scoring) |
| 3 | `isRestDay` → `hasRestSignals` | `availability-classifier.ts:261` → `index.ts:11339-11356` | Step 4 (fold-in), Step 9 (§Section C step 7 ternary, `slot-allocator.ts:174-182`) |
| 3 | `state`, `workEvidence`, `holiday`, `reason` | `availability-classifier.ts:261` | **DEAD** for this pipeline (used by `smart-nudges`, `_shared/ceo-behaviour/pto-holiday` elsewhere, not by `deriveStructuralDayFlags`/`allocatePlanSlots`) |
| 4 | `hasTravelDay`,`hasConferenceDay`,`hasOffsiteDay` | `index.ts:11330-11336` | Step 9 (`slot-allocator.ts:151-157,135`) |
| 4 | `dayOfWeek` | `index.ts:11330-11397` | Step 9 (`slot-allocator.ts:143`, Bug B) |
| 4 | `isWeekAhead` | `week-ahead-mode.ts:129` via `index.ts:11330-11397` | Step 9 (`slot-allocator.ts:139-141`, first check) |
| 4 | `lookaheadDays`/`lookbackDays` | `week-ahead-mode.ts:129` | Step 13 (`index.ts:12198-12210`, `horizonIsoValue`), `list-week-ahead-priorities` (separate orchestration) |
| 4 | `isPtoOrHoliday` | `index.ts:11330-11397` (from `classifyAvailability`) | Step 9 (`slot-allocator.ts:147-149`) |
| 4 | `isFullWorkingWeekend` | `index.ts:11360-11362` | Step 9 (`slot-allocator.ts:143`, negation gate) |
| 5 | per-event `categoryId`,`stakesLevel`,`severity`,`demandProfile` | `enrich-event.ts` (called by both scorers) | Step 6 (memory keys), Step 7 (shadow), Step 8 (live weights) |
| 6 | `memoryDelta` | `event-priority-memory.ts:106` | Step 8 (`jit-candidates.ts:169-193`, `+memory` term) |
| 6 | `memoryHardDemote` | `event-priority-memory.ts:133-136` + `index.ts:5935-5938` | Step 8 (`jit-candidates.ts:157`, skip gate) |
| 7 | `result.ranked`,`result.excluded`,`result.tier`,`result.crisisEvents` | `select-jit.ts` via `index.ts:725-732` | **DEAD / shadow** — only `result.tier.tier` reaches a log line (`index.ts:734-737`); never consumed by Step 8/9 |
| 8 | `jitRankedCandidates` (scored, floored, sorted) | `jit-candidates.ts:150-248` via `index.ts:5913-5954` | Step 8b (re-sort), Step 9 (`index.ts:7060,11111`), Step 10 (window signals) |
| 8b | Brief-anchor-reordered `jitRankedCandidates` | `index.ts:5959-5986` | Step 9 (`allocatePlanSlots` input) |
| 9 | `dayShape` | `slot-allocator.ts:174-182` | Step 10 (slot `anchorCategory`/`anchorPhase`), Step 12 (`planObj.meta.dayShape`), Step 13 (`day_kind` column) |
| 9 | `mode` | `slot-allocator.ts:184-188` | Step 12 (`planObj` field); not read by `smart-nudges` (§A.15) — **effectively dead outside Plan's own response/snapshot** |
| 9 | `slots[]` (`slotRole`,`arcLabel`,`jitPhase`,`jitEventTitle`,`jitEventId`,`jitCategoryId`,`allocationReason`) | `slot-allocator.ts:213-394` | Step 10 (practice selection input), Step 11 (`arcLabel`,`slotAnchorCategoryId`), Step 12 (`horizonModules[]`) |
| 10 | `selected` practice content, `usedProtocolFallback` | `practice-selector.ts` | Step 11 (copy uses selected practice's action/verb), Step 12 (`horizonModules[]`), Step 13 (`recommended_practice_ids`) |
| 11 | `fallbackWhyLine`/final why-line, `arcLabel` closer text | `index.ts:8639-8926`, `why-llm.ts` | Step 12 (`horizonModules[]` copy field) |
| 12 | `planObj`,`horizonMods`,`visiblePriorities`,`practiceIds`,`snapshotStatus` | `index.ts:12100-12238` | Step 13 (upsert payload), Step 14 (response) |
| 13 | `mastery_plan_snapshots` row (`plan_json`,`horizon_modules`,`priorities`,`recommended_practice_ids`,`status`,`generated_at`,`input_signature`,`day_kind`,`horizon_iso`) | `index.ts:12239-12266` | Step 15: Plan UI hook (`useMasteryPlanSnapshot.ts` full field list), `smart-nudges` (`horizon_modules` only, `smart-nudges/index.ts:520-560`); `dayShape`/`mode`/`plan_json` **not** read by `smart-nudges` |
| 13 | `brief_snapshot_id` | `index.ts:12255` | **DEAD** — always written `null`, no consumer reads a populated value (contract not yet surfaced) |
| 13 | `input_signature` (`stateFingerprint`) | `index.ts:12256` | Step 2 of the **next** run (`expectedSignatureHash` handshake), Plan UI (`inputSignature` field) |
| 15 | `brief_snapshots.payload_json.behaviour_snapshot` | `compute-outer-readiness/index.ts` | Step 2 of a **later** Plan run (`loadBriefBehaviourSnapshot`) |

---

### H.3 Three Full-Day Traces

**(a) Regular weekday, 2 strong JIT candidates (e.g. board-prep + client-pitch), non-UK/non-Gulf home country.**
- Step 1: request parses normally, `dayOfWeek = 3` (Wed), `userId` resolved via normal auth.
- Step 2: Brief handshake succeeds; `today` = client-sent local date.
- Step 3: `classifyAvailability` → `WORKDAY` (≥2 timed meetings) → `hasRestSignals = false`.
- Step 4: `hasTravelDay=false, hasConferenceDay=false, hasOffsiteDay=false, dayOfWeek=3, isWeekAhead=false` (evening-planning-day check fails on a Wednesday for any country), `isPtoOrHoliday=false, isFullWorkingWeekend=false`.
- Step 5: board-prep event tagged category A, `stakesLevel='board'`; client-pitch tagged category C or B, `stakesLevel='high'`.
- Step 6: assume no memory rows → `memoryDelta=0`, `memoryHardDemote=false` for both.
- Step 7: shadow scorer runs, logs a `[jit-v2-shadow]` line, discarded.
- Step 8: board-prep example scores per doc §B.4 Example 1: `base=40+catW=20+sevW=15+demW=12+prox=3-0+0 = 90` → kept (`hasStrongStakes`). Client-pitch, assume `high` stakes, category C: `base=22+catW=15+sevW=15+demW≈8+prox=5-0+0 ≈ 65` → also kept. Sorted: board (90) > pitch (65).
- Step 9: Step 1 (Week-Ahead) — no. Step 2 (Saturday) — no (`dayOfWeek≠6`). Step 3 (PTO) — no. Step 4 (travel) — no. Step 5 (conference) — no. Step 6: `top`=board (category A, structural), `differentEventCandidate`=pitch event (different event) → `sameEventFan=false`; `dominantStructuralEvent = topIsStructural(true) && (!hasSecondCandidate(false, since second exists) || sameEventFan(false) || !differentEventCandidate(false))` → all three disjuncts false → **`dominantStructuralEvent=false`**. Step 7 ternary: `restSignals=false`; `structuralSignals=0` and top.categoryId≠F → not mixed via that clause; `dominantStructuralEvent=false`; `ranked.length<=1`? No (2+) → **`dayShape="mixed_day"`**. Mode = `"jit+state"`. 3 slots built top/second/third by array position; third slot likely degrades to a state fallback since only 2 real candidates exist.
- Step 10: slot 1 (board, pre) → pre-decision-clarity intent (category A + phase pre) → practice selected accordingly. Slot 2 (pitch) → focus/flow-mastery intent likely (category C/high stakes) or activation/presence. Slot 3 (no candidate) → default regulation/composure intent.
- Step 11: slot 1 why-line: event-specific clause likely present (board-specific) → wins outright, closer `"Prepare: ... {board title}."` (`arcLabel="Prepare"` since phase=pre). Slot 2: `arcLabel` depends on phase (likely "Prepare" or "Steady"). Slot 3: `arcLabel="Steady"` (no event phase), deterministic clauses only (no event-specific text since no anchor event).
- Step 12: `planObj.meta.dayShape="mixed_day"`, 3 `horizonModules`.
- Step 13: upserted with `status="ready"`, `day_kind="mixed_day"`, `horizon_iso = now+24h` (not Week-Ahead).
- Step 14: response returns the 3 modules.
- Step 15: Plan UI shows 3 modules; `smart-nudges` reads `horizon_modules` for this exact window; independently recomputes its own `dayOfWeek===6` checks elsewhere (irrelevant here since it's a Wednesday).

**(b) Light weekday where zero candidates survive the floor.**
- Steps 1-6 as in (a) but all events are low-stakes/admin (e.g. "R&D Tax Credit Claim Review", routine 1:1s with no stakes).
- Step 7: shadow scorer runs, logged, discarded (as always).
- Step 8: the R&D Tax event is dropped immediately at floor-check #3 (`admin_compliance_noise` title match) regardless of score (§B.2/B.4 Example 3). Other low-stakes events: category H with no explicit stakes → dropped at floor-check #4 (`personal_category_without_explicit_stakes`); any category D events with only 1 of {mediumStakes,highSeverity,strongDemand} true and numeric score <25 → dropped `below_meaningful_floor`. **All candidates dropped** → `jitRankedCandidates = []`.
- Step 9: Step 1 (Week-Ahead) no. Step 2 (Saturday) no. Step 3 (PTO) no. Step 4/5 (travel/conference) no (`hasTravelDay`/`hasConferenceDay` false, or even if a background travel/conference flag were true, `!top` would be true since `ranked=[]`, so branches 4/5 **would** actually fire if `hasTravelDay`/`hasConferenceDay` were true here — but in this scenario both are false, so they don't). Step 6: `top=undefined` → `dominantStructuralEvent=false` (topIsStructural false since `!!top` is false). Step 7 ternary: `restSignals=false`; `structuralSignals=0`; `dominantStructuralEvent=false`; `ranked.length<=1`? Yes (0) → **`dayShape="light_routine"`**. Mode = `"jit+state"` (Bug A: unconditional, even with zero real candidates).
- All 3 slots: `top=null, second=null, third=null` → each degrades to a state fallback via `makeSlot` with `candidate=null` → `isJit=false`, `allocationReason:"state_fallback_no_meaningful_jit"` (per doc §Section E row 2).
- Step 10: default regulation/composure intent for all 3 slots (no `anchorCategory`/`anchorPhase` context from a real event) — degrades to whichever fallback content wins on generic scoring.
- Step 11: no event-specific why-line possible (no anchor event) → deterministic strat/tac/imm clauses only, closer `arcLabel="Steady"` for all 3 (no phase context).
- Step 12: `planObj.meta.dayShape="light_routine"`; non-rest-day-empty-payload guard does **not** fire here because `horizonMods.length===3`, not 0 (all 3 slots still produce state-fallback modules, they're just not JIT-anchored).
- Step 13: persisted `status="ready"`, `day_kind="light_routine"`.
- Step 15: `smart-nudges` reads `horizon_modules` (3 generic state slots) for nudge copy.

**(c) Saturday, UK user (home country not in the Saturday-planning set).**
- Step 1-2 as normal; `dayOfWeek=6`.
- Step 3: `classifyAvailability` — weekend day (`weekendDays=[6]` default applies regardless of home country per N4) and assume no ≥2-meeting work evidence → `REST_DAY` → `hasRestSignals=true`.
- Step 4: `dayOfWeek=6`. `evaluateWeekAheadMode`: `planningDayOfWeek('GB')` (UK, not in `{SA,KW,QA,BH,OM,IL}`) → Sunday-planning, so on a **Saturday** for a UK user, Week-Ahead does **not** activate via this path (would activate Sunday evening instead) → `isWeekAhead=false` (assuming no other Week-Ahead trigger condition independently fires; full waterfall not re-quoted here per "don't re-derive," see §Section D reference). `isPtoOrHoliday=false` (assume not applicable). `isFullWorkingWeekend`: `(dayOfWeek===6) && (calendarLoad∈{high,extreme} || realMeetingCount≥3)` — assume ordinary light Saturday, `calendarLoad` not high/extreme and `<3` meetings → **`isFullWorkingWeekend=false`**.
- Step 9: branch 1 (Week-Ahead) — no (`isWeekAhead=false`). Branch 2 (Saturday): `input.dayOfWeek===6 && !isFullWorkingWeekend` → **true** → `return buildSingleStateSlotResult("saturday","saturday_habit_only", ranked.length, preferredPracticeWindows)`. **This early return means the `rest_day` ternary (branch 7) is never reached at all**, even though `hasRestSignals=true` was computed — per doc §Section E row 3, `saturday` and `rest_day` are structurally different return paths despite overlapping meaning. **Steps 8-8b's ranked candidates are effectively unused** for day-shape purposes here — only `ranked.length` feeds into `buildSingleStateSlotResult`'s debug telemetry, not the slot content itself.
- 1 slot only: `slotRole` = `close_of_day` if `preferredPracticeWindows` includes `evening`, else `state_anchor`; `allocationReason="saturday_habit_only"` (suffixed with preferred-window name if present); no JIT fields populated.
- Step 10: intent derivation for the single state slot → likely recovery/renewal (weekend, no anchor event) or regulation/composure default.
- Step 11: no event-specific why-line (no anchor event); deterministic clauses only; `arcLabel="Steady"` (no phase).
- Step 12: `planObj.meta.dayShape="saturday"`, 1 `horizonModule`.
- Step 13: persisted `status="ready"`, `day_kind="saturday"`, `horizon_iso=now+24h` (Week-Ahead not active).
- Step 15: `smart-nudges` reads `horizon_modules` (1 slot); independently, `smart-nudges` also separately re-derives its own `dayOfWeek===6` weekend checks at its 12+ call sites, which is a **completely separate** recomputation from this Plan run's `dayShape` (per §A.15/N6) — the two systems can in principle disagree about "is today special" without either being aware of the other's answer.

---

### H.4 Week-Ahead Variant — Delta Walkthrough

- **Step 4 (`deriveStructuralDayFlags` / `evaluateWeekAheadMode`)**: normally computes `dayOfWeek`, structural flags, and `isPtoOrHoliday`/`isFullWorkingWeekend` for use by the day-of allocator; under Week-Ahead, it **additionally** evaluates `evaluateWeekAheadMode({dayOfWeek,...})`'s first-match-wins waterfall and, when it returns `active:true`, sets `isWeekAhead=true` and populates `lookaheadDays`/`lookbackDays` — these extra fields have no equivalent in the non-Week-Ahead path.
- **Step 8 (`rankJitCandidates`)**: normally scores/floors/sorts events within a same-day `MAX_JIT_HORIZON_MS=24h` window; the doc's §A.5 notes that **Week-Ahead does not reuse this same invocation** — instead, `list-week-ahead-priorities` (a separate edge function) re-runs `rankJitCandidates` independently over a `[today, +8d)` window and applies its own `applyEventPriorityMemory` pass, writing to `weekly_plan_snapshots` rather than `mastery_plan_snapshots`. So under Week-Ahead, the **day-of** `generate-mastery-plan` invocation's own Step 8 result becomes largely moot for slot content, because Step 9 short-circuits before consuming it in detail (see below).
- **Step 9 (`allocatePlanSlots`)**: normally runs the full 7-branch dayShape waterfall (Saturday/PTO/travel/conference/dominant/mixed/light_routine); under Week-Ahead, branch 1 (`if (input.isWeekAhead) return buildSingleStateSlotResult("week_ahead","week_ahead_planning", ranked.length, preferredPracticeWindows)`, `slot-allocator.ts:139-141`) fires **first, unconditionally**, before any of Saturday/PTO/travel/conference/dominant/mixed/light_routine logic runs — none of branches 2-7 ever execute. Only 1 slot is produced instead of the normal 0/1/3 depending on day-shape.
- **Step 9 (slot fields)**: normally `jitEventTitle`/`jitEventId`/`jitCategoryId`/`jitPhase` are populated for JIT-anchored slots (`mixed_day`/`dominant_structural_event`/etc.); under Week-Ahead, `buildSingleStateSlotResult` **never** populates any JIT field (`jitPhase:null, jitEventTitle:null, jitEventId:null, jitCategoryId:null`, lines 328-332) — the single slot is always a generic state anchor, never event-anchored, regardless of how many candidates `ranked` actually contains.
- **Step 9 (`slotRole`)**: normally `slotRole` is set per-arc-position (`pre`/`during`-or-state/`post`, or `state_anchor` for single-slot day-shapes); under Week-Ahead, `slotRole` specifically depends on `preferredPracticeWindows` — `evening` preference → `close_of_day`; otherwise `state_anchor` — and `allocationReason` is suffixed with the preferred window name when present (`` `${allocationReason}_${preferredWindow}` ``, line 319). This suffixing pattern is unique to the Week-Ahead/Saturday/PTO single-slot branches and does not occur for the 3-slot day-shapes.
- **Step 12 (final assembly)**: normally `planObj` carries no `weekAheadDecision`-derived horizon extension; under Week-Ahead, `planObj.weekAheadDecision` (from Step 4) is read at Step 13 to extend the persisted horizon.
- **Step 13 (persistence, `horizonIsoValue`)**: normally `horizon_iso = now + DAY_OF_HORIZON_MS` (24h default, `index.ts:12208-12210`); under Week-Ahead (`wad.active && lookaheadDays>0`), `horizon_iso = now + lookaheadDays*86_400_000` instead (`index.ts:12203-12206`) — i.e. the persisted horizon window is stretched from "next 24h" to "next N days" per the Week-Ahead decision's `lookaheadDays`.
- **Step 15 (consumers)**: normally Plan UI/`smart-nudges` read the day-of `mastery_plan_snapshots` row for "Today's 3"; Week-Ahead's parallel surface (`list-week-ahead-priorities`) writes to a **different table**, `weekly_plan_snapshots`, which is a separate read path not covered by `useMasteryPlanSnapshot`/`loadPlanNudgeSlots` in this pipeline — i.e. Week-Ahead output and day-of Plan output are two distinct persisted artifacts, not a single merged record.
