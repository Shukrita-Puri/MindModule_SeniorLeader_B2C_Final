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
