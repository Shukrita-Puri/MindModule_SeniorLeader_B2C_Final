# Generate Mastery Plan — FULL Logic Reference (Code-Level)

**Status:** Read-only enumeration. Companion to `docs/GENERATE_MASTERY_PLAN_SSOT.md`.
This file traces every step, scorer, weight, signal, table, upstream/downstream
module, and CEO-behaviour rule that participates in `generate-mastery-plan`.
Numbers, thresholds, and names are quoted from code (not paraphrased).

**Owner:** Plan / Signal Engine.
**Code anchors:**
- Edge fn: `supabase/functions/generate-mastery-plan/index.ts` (~7,200 LOC)
- Shared: `supabase/functions/_shared/{plan,jit,events,ceo-behaviour,signal-engine,protocols}`
- Client: `src/pages/PlanPage.tsx`, `src/components/home/TodayThreePriorities.tsx`

---

## 0. End-to-end flow (one pass)

```text
 PlanPage / TodayThreePriorities
        │  (POST /generate-mastery-plan, body = PlanRequest)
        ▼
 generate-mastery-plan (Deno edge fn)
   1.  authenticateRequest (Auth0 sub or dev x-dev-user-id)
   2.  Resolve timezone, local_date, time_window
   3.  Load cached Brief snapshot via loadBriefBehaviourSnapshot(...)
         ├─ 409 STALE_SNAPSHOT  (expectedSignatureHash mismatch)
         └─ 412 SNAPSHOT_REQUIRED (no Brief written for window)
   4.  Pull persisted plan ledger from daily_ritual_completions.plan_ledger
   5.  Pull pre-scored calendar from jit_event_context (Bridge)
         └─ fallback: scoreCalendarEventsLegacy(calendar_events)
   6.  Run JIT v2 shadow (selectJitCandidates) — Immediate / Tactical /
         Strategic + Sovereign + MemoryDelta — writes shadow_v2_* cols only
   7.  Hard gates → ranking → topEvent selection (+brief-anchor re-rank)
   8.  Allocate 3 slots (Anchor / Protect-Prepare / Close) via
         allocatePlanSlots + per-event arc / dedupe rules
   9.  Select practice per slot (selectPracticeForSlot → intent + combo)
  10.  Deterministic title (buildPriorityTitle)
  11.  Parallel LLM Why-line writes (generateWhyStatement × 3)
  12.  Ledger merge (sticky-complete / JIT-anchor adaptive / fresh)
  13.  Persist mastery_plan_snapshots upsert
  14.  Return PlanResponse { signatureHash, horizonModules[], ledger, … }
```

---

## 1. Inputs (PlanRequest body + DB reads)

### 1.1 Request body fields (consumed)

`userId`, `timeOfDay` (`morning|afternoon|evening`), `timezoneOffsetMinutes`,
`innerReadinessTier` (`peak|strong|managing|depleted`), `innerReadinessScore`,
`checkInOutcome` (mind/body subscores), `outerReadinessPhrase`,
`practicePriorityTag` (onboarding tag, e.g. `focus_clarity`),
`growthIntention`, `calendarEvents[]`, `selectedCalendarEventIds`,
`slotReplacements` (user swap requests), `coachInsights[]`,
`expectedSignatureHash`, optional inline `behaviourSnapshot`,
`patternInsight`, `mode` (`day-of` | `jit_remaining`).

### 1.2 Database reads (Supabase, service role)

| Table / view | Purpose | Module |
|---|---|---|
| `brief_snapshots` | promptBlockPlan, slotBoosts, taxonomyBlock, anchor titles, signature hash, behaviour_snapshot | `loadBriefBehaviourSnapshot` |
| `jit_event_context` | Pre-scored events (final_score, jit_bucket_primary/secondary, jit_confidence_score, dismissed_horizons) | Bridge in index.ts:1880 |
| `calendar_events` / `primary_calendar_events` | Fallback raw events | `scoreCalendarEventsLegacy` |
| `attendee_relationships` | Cached LLM/user_tag roles per email | `loadJitContextForEvents` |
| `event_priority_memory` | Sovereign tags + memory delta (per event_id and per category/type_key) | `loadPriorityMemoryForUser` + 4a/4b in `load-jit-context.ts` |
| `causality_findings.signal_summary` | Pattern store (`event_to_hrv`, `event_to_rhr`), gated ≥3 check-ins | `patternHit`, `maturity-tier` |
| `daily_ritual_completions` | `plan_ledger` JSONB (sticky completion, JIT anchors) | Ledger merge step |
| `daily_context_snapshot` | HRV bundle, demand, pattern signals, morning baseline | MRS v4 inputs |
| `wearable_data` / `wearable_daily_aggregates` | HRV/RHR/sleep, divergence | window-context builders |
| `profiles` | account_age (created_at), email→userDomain, timezone, practicePriorityTag | many sites |
| `sanctuary_content` + `sanctuary_content_metadata` + `sanctuary_content_steps` | Practice pool (`category`, `sub_type`, `protocol_type`, `meta_skill`, `mastery_category`) | `selectPracticeForSlot` |
| `mastery_plan_snapshots` | Persisted full plan payload (read-first hook) | client `useMasteryPlanSnapshot` |
| `weekly_plan_snapshots` | Week-Ahead soft memory | `list-week-ahead-priorities` |
| `checkin_patterns`, `coach_pattern_observations` | Coach insights into Why-line | Coach Card path |
| `jit_preferences` | per-event-type skip counts | tactical signals input |
| `attendee_resolver_log` | Async resolver queue telemetry | proactive post-sync |

### 1.3 Upstream functions (write what the Plan reads)

| Upstream fn | Writes | Consumed by |
|---|---|---|
| `compute-outer-readiness` (Brief) | `brief_snapshots.payload_json.behaviour_snapshot`, `input_signature`, `prompt_version`, `slotBoosts`, taxonomy block | Brief↔Plan handshake |
| `compute-inner-readiness` | `inner_readiness_scores` rows, MRS components | innerReadinessTier inputs |
| `compute-daily-intelligence` | `daily_context_snapshot` (mrs_window-scoped) | demand / pattern signals |
| `build-daily-context` (shared) | morning/afternoon/evening behaviour snapshots | window-context dispatch |
| `pre-score-jit-events` (cron + post-sync) | `jit_event_context` rows | Bridge primary path |
| `compute-causality-findings` | `causality_findings.signal_summary` | Tactical, maturity tier |
| Apple Calendar / Google sync | `calendar_events.event_metadata.attendeeSignals` | attendee role inputs |

---

## 2. Brief ↔ Plan handshake (`loadBriefBehaviourSnapshot`)

Strict contract — Plan **must not** recompute behaviour rules. Source:
`supabase/functions/_shared/load-brief-behaviour-snapshot.ts`.

1. Query `brief_snapshots` filtered by `user_id`, `local_date`, `time_window`,
   optionally `prompt_version` + `input_signature`. Order by `created_at desc`.
2. Read `payload_json.behaviour_snapshot` → `PersistedBriefBehaviourSnapshot`:
   `{ signatureHash, flagsBrief[], flagsPlan[], slotBoosts[], taxonomyBlock,
   promptBlockBrief, promptBlockPlan }`.
3. Reject when `expectedSignatureHash` ≠ persisted hash (logs warning).
4. `snapshotToWiring(snap, 'plan')` → `{ flags, slotBoosts, promptBlock }`.
5. `briefAnchorEventTitles(snap)` collects every `anchorEvent` named by any
   brief/plan flag — Plan uses these to **re-rank** JIT candidates so any
   event the Brief flagged as high-stakes is guaranteed top consideration.

`behaviour-snapshot.ts` is the single producer (run by Brief):
- Calls `evaluateForScope(coverage, 'brief')` and `evaluateForScope(coverage, 'plan')`.
- Formats taxonomy block (`formatEventTaxonomyBlock(events)`).
- Computes deterministic FNV-1a `signatureHash` over the rule-relevant slice
  of `coverage` (now, wearable, checkIn, scoreToday/Yesterday, eventTitles,
  morningWasCompressed, middayRecoveryDetected, extras).

Error envelopes: `409 STALE_SNAPSHOT`, `412 SNAPSHOT_REQUIRED`.

---

## 3. CEO Behaviour rules — full registry & wiring

Registry: `supabase/functions/_shared/ceo-behaviour/index.ts:166 ALL_RULES`.
Each row is `{ scopes: ('brief'|'plan'|'nudge')[], fn, slotBoost? }`. The
evaluator (`behaviour-evaluator.ts`) sorts hits high→medium→low severity and
derives `SlotBoost[]` for the Plan.

### 3.1 Workweek (`workweek.ts`)

| Rule | Scopes | Notes |
|---|---|---|
| `vetoRisk` | brief, plan, nudge | High → slot1 `regulate` (start_of_day) |
| `secondWind` | brief, plan | |
| `circadianPriority` | brief, plan, nudge | High → slot1 `regulate` |
| `decisionLeakageGuard` | brief, plan, nudge | |
| `decisionLeakageGuardPlan` | plan | 4–24h tail window |
| `personalFrictionInference` | brief | |
| `boardLevelOutcome` | brief, plan, nudge | |
| `sundayReset` | brief, plan, nudge | |
| `notificationIsProduct` | nudge | |

### 3.2 Post-peak (`post-peak.ts`)

`postPeakHangover` — brief, plan. High → slot3 `integrate` (end_of_day).

### 3.3 Conference / Summit (`conference.ts`)

`conferenceDepletion`, `conferenceNightBeforeSummit`,
`conferenceDayWithSpeaking`, `conferenceDayAttend`,
`dropInSpeakingHighStakes`, `conferenceMidSessionReset` (nudge),
`conferenceCarryFatigue`, `postConferenceReentry`. Speaking rules listed
before attend so test ordering suppresses attend-only when speaking fires.

### 3.4 Weekend ladder (`weekend.ts`)

`fullWorkingWeekend` (→ slot1 `align`), `weekendWithMeeting`,
`weekendDeepWorkBlock` (→ midday `prepare`), `sundayEveningWeekAhead`
(→ slot3 `align`), `weekendMorningLightTouch` (brief, nudge).

### 3.5 PTO / Holiday (`pto-holiday.ts`)

`holidayReducedTouch` (brief, nudge), `ptoWithMeetingFallback` (all scopes).

### 3.6 Travel (`travel.ts`) — overrides every other cluster when active

`travelPreFlightMandatory` (→ slot1 `regulate`), `travelLandingOffload`
(→ slot1 `regulate`), `travelLandingPlusHighStakes` (→ midday `prepare`),
`longHaulRecovery` (→ slot3 `regulate`), `postTripReentry`,
`travelDayArrivalFraming`, `travelDayDuringPushOnly` (nudge),
`travelDayReturnRecovery`, `travelInFlightConnection` (nudge).

### 3.7 High-stakes prep (`high-stakes-prep.ts`)

`advancePrep24h` (→ midday `prepare`), `postGovernanceOffload`
(→ start_of_day `integrate`).

### 3.8 Back-to-back (`back-to-back.ts`)

`backToBackLoadOverride` (high → midday `regulate`), `meetingPrepCliff`
(nudge).

### 3.9 Multi-calendar / decision density / interpersonal / batches 3–4

`multiCalendarLoad` (brief, plan); `decisionDensity` (all);
`interpersonalMeetingContext`; `emptySlotProtection` (plan, nudge);
`upwardReporting`; `stackedStakes`; `crisisInjection`;
`contextSwitchingCost`; `preEventSleepTarget` (nudge);
`timeSinceLastRecovery` (nudge); delivery cluster `nudgeDeferOffline`,
`nudgeSuppressDND`, `nudgeStaleSkip`, `nudgeBatchOnReturn` (nudge only).

### 3.10 Part-1 coverage expansion (with declared `slotBoost`)

| Rule | slot | practiceType | severities |
|---|---|---|---|
| `influencePersuasionPrep` | midday | prepare | high, medium |
| `visibilityCommsPrep` | midday | prepare | high, medium |
| `deepWorkProtection` | midday | prepare | medium, low |
| `postGovernanceOffload` | start_of_day | integrate | medium, high |
| `morningBaseline` | start_of_day | align | low |
| `eveningShutdown` | end_of_day | align | low |

### 3.11 Legacy hardcoded boosts (`behaviour-evaluator.deriveSlotBoosts`)

Retained for back-compat:
- `vetoRisk.high` → start_of_day · regulate
- `postPeakHangover.high` → end_of_day · integrate
- `circadianPriority.high` → start_of_day · regulate
- Travel pre/landing/long-haul → start_of_day or end_of_day · regulate
- `advancePrep24h`/`travelLandingPlusHighStakes` → midday · prepare
- `weekendDeepWorkBlock` → midday · prepare
- `fullWorkingWeekend.high` → start_of_day · align
- `sundayEveningWeekAhead` → end_of_day · align
- `backToBackLoadOverride.high` → midday · regulate

Every boost decorated with `protocol` + `mode` via
`PRACTICE_TYPE_TO_COMBO[practiceType]` (SSOT for protocol combos).

### 3.12 How CEO-behaviour wires into the Plan

1. `flagsPlan[]` appended verbatim to the Why-line LLM prompt as
   `=== ACTIVE CEO BEHAVIOURS ===` (after `=== EVENT TAXONOMY ===`). When a
   flag's `anchorEvent` equals the slot's event title, the prompt instructs
   the model to **align** to that anchor without echoing `copyHint`.
2. `slotBoosts[]` → `applySlotBoostsToMapping(slot, boosts)` overrides the
   default `practiceType` for that slot before practice selection.
3. `briefAnchorEventTitles(snap)` re-ranks JIT candidates so flagged events
   surface first in `rankJitCandidates` output.

---

## 4. Event prioritisation — scoring pipelines

Two parallel pipelines coexist by design:

- **Bridge pipeline** (primary): reads pre-scored `jit_event_context`.
- **JIT v2 selector** (`selectJitCandidates`): triangulated re-scoring. Behind
  `JIT_V2` env flag (`shadow` writes `shadow_v2_*` cols; `on` becomes
  user-visible after parity). Also the canonical scorer for
  `list-week-ahead-priorities` via `loadJitContextForEvents`.
- **Legacy fallback** (`scoreCalendarEventsLegacy`): runs only when
  `jit_event_context` returns zero rows. Retained until 14-day 100% Bridge
  coverage telemetry holds.

### 4.1 Hard gates (applied before scoring)

1. Educational + non-organiser → BLOCK.
2. `getActionWindow(minutesUntil)`:
   - `touch2` ≤ 360 (0–6h) · `touch1` ≤ 2880 (6–48h) · `selection_only` > 48h (excluded).
3. Per-touch dismissal: drop if `dismissed_horizons` includes the touch label.
4. **24h MVP horizon ceiling**: `MVP_JIT_HORIZON_MINUTES = 24*60`.
5. **JIT floor**: `JIT_THRESHOLD_UNIFIED = 55`. Legacy also requires
   `dimA ≥ 10` AND `dimB ≥ 8`.

### 4.2 Bridge pipeline boosts (additive on `final_score`)

| Boost | Trigger | Points |
|---|---|---|
| Growth-area alignment | title/event_type contains `coachInsights.growth_area` token | +15 |
| Priority-tag alignment | title/event_type contains `practicePriorityTag` | +10 |
| HRV historical impact | `|avgHRVDeviation%| > 10` for this event type | +10 |

### 4.3 Legacy fallback scorer (`scoreCalendarEventsLegacy`)

| Signal | Points |
|---|---|
| `minutesUntil` ≤ 120 / 240 / 360 / 2880 | +40 / +30 / +20 / +10 |
| `isOrganizer` | +15 |
| `attendeesCount > 5` | +10 |
| Relationship tag = client/boss | +6 (else any tag = +3) |
| Duration > 60 min | +8 |
| Not recurring | +10 |
| Matched `scenarioIdFor()` → `EXECUTIVE_SCENARIOS` | +25 |
| Peak business hours (09–12 or 14–16 local) | +5 |
| Back-to-back gap < 15min after prior | +5 |
| Event type in `skippedTypes` | −15 |
| Plus Growth / PriorityTag / HRV boosts (§4.2) | additive |

### 4.4 JIT v2 triangulated selector (`select-jit.ts`)

Three axes, tier-weighted, plus sovereign + memory layers OUTSIDE the
weighted sum.

#### 4.4.1 Category base (Stakes ladder)

`CATEGORY_BASE`:
- A Governance (board/investor/M&A/earnings) = **40**
- C Visibility (all-hands/media/keynote) = **32**
- B Influence (pitch/negotiation) = **30**
- D People & difficult convos = **22** (cap `D_BOOSTED_CAP = 38` after interpersonal boost)
- F Conferences = **18**
- G Travel = **12**
- E Deep work = **10**
- H Daily rhythm = **5**

#### 4.4.2 IMMEDIATE axis

`immediate = categoryBase + relationship_inferred + stakes + situationalBoost`

- **Stakes hint** (`stakesHint`): +15 governance/regulatory; +10 external/client; +5 leadership/all-hands.
- **Interpersonal stakes boost** (D only): +13 if title matches layoff/restructure/termination/PIP/perf-review/difficult/escalation/conflict — capped at `D_BOOSTED_CAP = 38`.
- **1:1 seniority adjust** (D + attendeesCount=1): boss/board_member +10; investor/client +8; peer 0; report −6; unknown 0.
- **Protect-goal multiplier** (`applyProtectGoalMultiplier`): `categoryBase *= 1.3` if user's onboarding `protect_goals` map matches the event's category (board→A, investor→A/C, client/customer→C, deep_work/focus→F, one_on_ones/reviews/team→D, all_hands/leadership→G).
- **Situational boost** (`interviewBoost`): media +15, candidate +18, hiring +6, ambiguous +8. Gated to `attendeesCount ≥ 2` except title-driven candidate or sovereign-tagged.
- **Interview classification** (`classifyInterview`): media/candidate/hiring/ambiguous/none. Direction-of-evaluation uses organizer domain vs user domain + attendee-domain majority.
- **Speaking re-route** (`maybeReRouteSpeakingToC`): keynote/panel/fireside categorised F → C.
- **Personal-block detector** (`isPersonalBlock`): zero-attendee titles like "Chief AI Thursday connects" zero out the pattern bonus.

#### 4.4.3 TACTICAL axis

`tactical = patternScore + priorityTag − skipPenalty + followThrough`

- **`patternHit`** (`tactical-signals.ts`): READS `causality_findings.signal_summary`. Base 15 (strong) / 8 (emerging); +10 if `|hrvDelta|≥20` or `|rhrDelta|≥15`, +5 if ≥10 / ≥8. **Acute recurring-HR bonus** +8 if `rhrDeltaPct≥15 AND n≥3`. **Cap = 35**.
- **`userPriorityTagBoost`**: `focus` tag → +8 (only).
- **`skipPenaltyFor`**: 1 = −3, 2 = −6, 3+ = −10 (from `jit_preferences`).
- **`followThroughBoost`**: 1/2/3/4+ JIT-done+felt-better → +4 / +7 / +11 / +15.
- Personal blocks zero out `patternScore`.

#### 4.4.4 STRATEGIC axis (gated)

`strategicGate = 1` iff `immediate ≥ MIN_IMMEDIATE (25)`.
`strategic = goalAlignment(bucket, goals) × strategicGate`.
`goalAlignment`: 1/2/3+ hits → +8 / +12 / +15 across normalised user
tags (`composure`, `presence`, `influence`, `difficult_convos`, `focus`,
`recovery`, `resilience`, `decisions`) mapped to event-type families.
Inputs combined: `growthIntentions ∪ practicePriorityTags ∪ coachGrowthAreas`.

#### 4.4.5 Maturity tier weighting (`maturity-tier.ts`)

`tierWeighted = tier.immediate*I + tier.tactical*T + tier.strategic*S*strategicGate`

| Tier | Immediate | Tactical | Strategic | Day floor | Pattern ceiling |
|---|---|---|---|---|---|
| T0 | 0.60 | 0.25 | 0.15 | ≤7d | 0 patterns |
| T1 | 0.50 | 0.35 | 0.15 | ≤14d | ≤2 patterns |
| T2 | 0.35 | 0.50 | 0.15 | ≤30d | ≤5 patterns |
| T3 | 0.30 | 0.55 | 0.15 | >30d | >5 patterns |

`pickTier = min(dayTier, patternTier)`. `countMaturePatterns`: distinct
buckets with `n≥3` AND `confidence∈{strong,emerging}` across
`event_to_hrv ∪ event_to_rhr`.

#### 4.4.6 SOVEREIGN tag layer (OUTSIDE the weighted sum)

`sovereignTagAdjustment`:
- `low` / `skip` → **hardDemote = true** (excluded with reason `user_tag_low`)
- `high` / `critical` / `must-prep` → **+45**
- `medium` / `priority` → **+20**
- Other → 0

Plus **hoisted relationship**: a `user_tag` or `memory_user_tag` source role
contributes its `RELATIONSHIP_WEIGHT` (capped at 25) directly into
`sovereignBonus`. The `effectiveRel` reported in breakdown =
`relationship_inferred + relationship_sovereign`.

`sovereignBonus = sovereignTagAdjustment.bonus + relationship_sovereign`.
`sovereignBypass = sovereignBonus ≥ 25` — bypasses the MIN_IMMEDIATE floor.

#### 4.4.7 MEMORY delta (§11A.6)

`memoryDelta = ctx.memoryDeltaByEventId[eventId].delta` — applied AFTER tier weighting.
- `hardDemote = true` → exclude with reason `memory_hard_demote`.
- `sovereignEscalation === 'low'` → exclude with reason `memory_escalated_low`.

Read by `applyEventPriorityMemory` from `event_priority_memory`:

| signal | decay | Δ |
|---|---|---|
| `priority` | ≤60d | +10 |
| `cancelled_keep_surfacing` | ≤60d | +5 |
| `cancelled_now` | ≤7d | −8 |
| `not_this_week` | ≤14d | −15 |
| `cancelled_as_noise` | ≤60d | −25 |
| `never` | always | −40 + hardDemote |

Net clamped `[-50, +30]`.

#### 4.4.8 Final importance & ranking

`importance = tierWeighted + sovereignBonus + memoryDelta` (rounded to 2dp).
Floor pass = `sovereignBypass OR immediate≥25 OR tactical≥25 OR tierWeighted≥25`.

**Crisis gate** (`isCrisisEvent`): routes urgent/late-arriving events to
Smart Nudge instead of Plan. Triggers: sovereign `crisis`/`urgent` tags;
title regex (`urgent|crisis|emergency|sev-?[012]|p[012]|war-?room|outage|breach|critical`);
short-lead-time (created < 4h before start) on A/B/C/D with ≥2 attendees;
`(re)scheduled|moved up|bumped` with leadMs < 4h.

**Sort key**: `importance desc, tactical desc, strategic desc, minutesUntilStart asc`.
Urgency is NOT added to score — final-sort tiebreaker only.

### 4.5 Relationship resolution (`load-jit-context.ts` + `relationship-weights.ts`)

Source precedence (highest → lowest):
1. `user_tag` (sovereign, confidence=1, no decay)
2. `memory_user_tag` (replayed from `tag_relationship` rows, confidence=1)
3. `llm` (Gemini resolver, 0..1 confidence)
4. `domain_heuristic` (same-domain → peer @0.5, different real domain → external_partner @0.4, generic domain → unknown)

`RELATIONSHIP_TAXONOMY` weights:
- board_member 25 · direct_boss 25 · investor 25 · regulator 24
- acquirer_target 24 · skip_level 22 · journalist_media 22
- customer 20 · client 18 · external_partner 15
- report_direct 10 · peer 8 · vendor 8 · report_junior 5 · unknown 0

Confidence multiplier (for llm/domain_heuristic only): `≥0.75 → 1.0`,
`≥0.5 → 0.6`, else `0.3`; null → 0.3.
`weightedDominantRole` picks the highest scaled-weight signal.

`RELATIONSHIP_TAG_TO_ROLE` (memory replay): boss→direct_boss,
board→board_member, client→client, customer→customer, vendor→vendor,
team→report_direct, junior→report_junior, colleague→peer,
investor→investor, leadership→skip_level.

### 4.6 Top-event selection

1. `rankJitCandidates(events, …)` emits `(event, phase, score)` tuples per
   `EVENT_PHASE_MAP[category]` (pre/during/post).
2. **Brief-anchor re-rank**: stable-sort `briefAnchorEventTitles(snap)` to top.
3. **topEvent** = first candidate with `phase='pre'`, `score ≥ 55`,
   `actionWindow ∈ {touch1, touch2}`.
4. Defensive fallback loop if shared ranker returned nothing.

### 4.7 Per-event arc cap & dedupe

`CATEGORY_MAX_SLOTS`: A=2, D=2, F=3, G=3, others=1. Second arc requires:
- distinct phase (e.g. pre+post)
- ≥12h between arcs
- phase pair valid in `EVENT_PHASE_MAP`

Anchor identity = `eventId` or `normalize(jitEventTitle) + startTimeBucket`.
Extras either replaced by fresh-horizon module OR stripped of JIT metadata
(`isJit:false, jitEventTitle:null, jitPhase:null`). Logged
`[generate-mastery-plan] dedupe …`.

---

## 5. Slot allocation & temporal gating

### 5.1 `allocatePlanSlots` (slot-allocator.ts)

Derives `dayShape` → `mode` → 3 slots:

- **dayShape**: `rest_day` (restSignals) · `mixed_day` (structuralSignals ≥ 2 or F-conference with 3+ candidates) · `dominant_structural_event` (top is A/C/F/G and no second) · `light_routine` (≤1 candidate) · default `mixed_day`.
- **mode**: rest_day→`state` · light_routine→`jit+state` · dominant_structural_event→`full_arc` · else `jit+state`.
- **slotRole**: rest_day→`state_anchor`. dominant_structural_event → idx0=`pre`, 1=`during`, 2=`post`. Else default (`start_of_day`/`dominant_demand`/`recovery`).
- **arcLabel** from phase: pre→Prepare, during→During, post→Recover, none→Steady.

### 5.2 Slot roles (positional, not score-ranked)

| Slot | Role | JIT eligibility | Default (no JIT) |
|---|---|---|---|
| 1 Anchor | Set posture | topEvent `touch2` AND `minutesUntil < 120` | Depleted → regulate+align; else `todModules[0]` |
| 2 Protect/Prepare | Midday adapt | `touch1` (≤24h MVP), 1 practice | Midday Regeneration Trigger (afternoon divergence) |
| 3 Close | Close the loop | `post` phase for topEvent, arc rules permit | Integrate / Tiny Win (18:00–22:59); 00:00–04:59 → "Sleep Prep & Tomorrow Framing"; else forward-framing |

### 5.3 Temporal gating

- `getTimeOfDay`: Morning 05–11, Afternoon 12–17, Evening 18–23, Early Hours 00–04.
- Reflection Corner / Tiny Win only 18:00–22:59 local.
- 00:00–04:59 → server rewrites Slot 3 to "Sleep Prep & Tomorrow Framing".
- Module eligibility per `mem://features/mastery-plan/module-eligibility-standards`.
- Midday Regeneration may rebuild Slot 2 from afternoon-context wearable + check-in.

---

## 6. Practice prioritisation (`selectPracticeForSlot`)

Source: `_shared/plan/practice-selector.ts`.

### 6.1 Slot intent (`deriveSlotIntent`)

Maps `(stateAction, ceoVerb, anchorCategory, anchorPhase, practicePriorityTag)`
to `{ metaSkills[], recalibrateCategories[], combo, intentLabel }`:

1. **focus/flow-mastery** — meta-clarity / presence / `mindset.flow`. Trigger: action contains "focus" OR verb in {sharpen, decide} OR tag `focus_clarity` OR anchorCategory `E`.
2. **recovery/renewal** — meta-renewal+meta-recalibration / pause / `mindset.reenergise`. Trigger: action contains recover/restore/settle/decompress OR verb in {recover, reset, land} OR tag `recovery_resilience` OR `anchorPhase==='post'`.
3. **circadian** — meta-recalibration+meta-renewal / pause / `somatic.reenergise`. Trigger: action "circadian" OR anchorCategory `G`.
4. **activation/presence** — meta-recalibration+meta-clarity / power-up+presence / `somatic.flow`. Trigger: action "activate"/"build capacity" OR verb in {present, lead} OR tag `energy_endurance`.
5. **regulation/composure (default)** — meta-recalibration / pause / `somatic.pause`.

### 6.2 Combo resolution (`buildComboTarget`)

- `mode==='full_arc'`: jitPhase `during`→`somatic.flow`; `post`→`mindset.reenergise`; else intent combo.
- Else: intent combo.

### 6.3 Per-row scoring (`scoreContentAgainstIntent`)

- **meta_skill**: first listed match = +18; subsequent = +10; explicit mismatch (content has tags but none in intent) = **−12**.
- **Recalibrate category**: first match +8; subsequent +4.
- **Combo (protocol_type)**: matches protocol prefix → +4.
- **Recency penalty** (`recencyPenalty`): same-day −30, ≤3d −16, ≤7d −8.
- **state mode + mrsScore**: boost = `max(0, 10 − |mrsScore−50|/5)`.
- **mode bonuses**: `jit+state` +3, `full_arc.during` +4, `full_arc.post` +4.
- **Mastery secondary** (`masterySecondaryBoost`): +6 if secondary contains target practiceType.
- **Common tags** (in `findAlternate`): +2 per shared state tag, +3 per shared meta tag.

Protocol filter: candidates first filtered by `protocol_type === expectedProtocol`
from `PRACTICE_TYPE_TO_COMBO[combo].protocol`. Falls back to full pool when
empty (logged `[practice-selector] protocol fallback`).

`selectPracticeForSlot` returns `{ selected: [head], usedProtocolFallback }`.
Slot 1 may carry up to 3 practices in `full_arc` mode for the topEvent;
Slots 2/3 typically 1.

---

## 7. Title generation (deterministic, no LLM)

`buildPriorityTitle` in `_shared/plan/title-prefixes.ts`:

`{verb} {executive objective} {connector} {article} {eventName}` — cap 10 words.

### 7.1 Verb (`verbForCategoryPhase`)

- pre: A=Lead · B=Present · C=Decide · D=Steady · E=Steady · F=Present · G=Reframe · H=Steady
- during: Hold
- post: A|D=Reset · F|G=Recover · else=Land

### 7.2 Executive objective (`executiveObjectiveFor`)

- `regulation_composure` / `regulation_early` → "composed presence"
- `recovery_resilience` → "focused recovery"
- `energy_endurance` → "sustained energy"
- `focus_clarity` → "strategic clarity"
- `mindset_reframe` → "decisive alignment"
- Phase/category fallbacks otherwise.

### 7.3 Connector + article

pre → "in" · during → "through" · post → "after" · isTomorrow → "tomorrow's" · post w/o tomorrow → "the".

Event name shrunk to ≤4 identifying tokens (`shrinkEventName` keeps first n−1 + tail).

Legacy alternate `buildPlanTitle` uses PREVENT/PREPARE prefix tables and 8-word cap — superseded by `buildPriorityTitle` for Today's 3.

---

## 8. Why-line (LLM — `_shared/plan/why-llm.ts`)

- **Model**: `google/gemini-3-flash-preview` via `https://ai.gateway.lovable.dev/v1/chat/completions`. Temperature 0.
- **Persona**: "Chief of Staff for the Mind".
- **Output**: ≤25 words; no preamble/quotes; references ≥1 non-null signal; names what the priority PREVENTS or PREPARES (one, not both).
- **State band** (`tierToStateBand`): peak→firing · strong→sharp · managing→steady · depleted→depleted. Server-computed off `shared.briefBehaviour`. NEVER re-banded.
- **Arc position** (`arcPositionFromPhase`): pre→prepare · during→during · post→recover · null→standalone.
- **Prompt blocks (verbatim)**:
  - `=== THE EVENT ===` (title, category label, when phrase, preventsBuilds)
  - `=== STATE ===` (band + most relevant signal — never names band)
  - `=== THIS PRACTICE ===` (title, protocol combo, arc position)
  - `=== EVENT TAXONOMY ===` (from snapshot.taxonomyBlock)
  - `=== ACTIVE CEO BEHAVIOURS ===` (from snapshot.promptBlockPlan)
  - Brief echo + repetition-guard for today's other lines.
- **Signal phrases** (`pickRelevantSignalPhrases`): sleep<65, |HRV|≥10, RHR elevated, mind/body≤2, travelDebt, patternSummary.
- **Validator** (`validateWhyLine`): asymmetric grounding (anchor OR state); valence gate (firing→no recovery verbs; depleted→no push verbs); jaccard dedupe gated to same event+arc (>0.85) or same-day (>0.8). Reject reasons: `generic`, `valence_firing_recovery`, `valence_depleted_push`, `jaccard_dup`, `empty`.
- **Three Why-lines** written in parallel via `Promise.all`. Failure → deterministic repair path.
- **Sanitisation**: `stripBriefMarkdown` removes stray `*`/`_` (preserves `**bold**`).

---

## 9. Stateful Plan Ledger

Per `mem://architecture/stateful-plan-evolution`. Source of truth:
`daily_ritual_completions.plan_ledger` JSONB (service-role write only).

On every call:
1. Read earliest same-day row; union `completed_practice_ids` across all session_period rows.
2. Merge fresh-derived slots with ledger:
   - **Sticky completion** — slot with primary practice in union stays verbatim with ✓.
   - **JIT anchor adaptive** — ledger slot whose event is still on calendar keeps `slotIndex`, `jitEventTitle`, `horizon`, `isJit`. Practices, `whyLine`, `timeLabel` refresh from fresh slot.
   - **Otherwise** — recompute fresh.
3. **Unfinished business** — never wholesale replace while any slot incomplete.
4. **Bonus Round** — all 3 complete + new Brief signature → fresh plan,
   `ledger.victoryLine = "3/3 complete. Bonus priorities to keep momentum."`,
   header switches to "Today's 3 · Bonus Round".
5. Server upserts to `mastery_plan_snapshots`.

Returned: `ledger: { source, carriedSlots, anchoredSlots, completedSlots, victoryLine? }`.

---

## 10. Response contract

```ts
{
  signatureHash: string,                  // matches brief_snapshots.input_signature
  timeOfDay: 'morning'|'afternoon'|'evening',
  horizonModules: HorizonModule[],        // 3 priorities
  calendarPills: { label, eventId, priorityScore, timePill }[],   // <=2
  preEventPlan: { topEvent, modules, coachCard, ... } | null,
  coachCard: { ... } | null,
  ledger: { source, carriedSlots, anchoredSlots, completedSlots, victoryLine? },
  observability: { briefAnchorsApplied, dedupeActions, fallbackUsed }
}

type HorizonModule = {
  slotIndex: 1|2|3,
  title: string,
  whyLine: string,
  arcLabel: 'Prepare'|'During'|'Recover'|'Steady',
  timeLabel: string,
  isJit: boolean,
  jitEventTitle: string|null,
  jitPhase: 'pre'|'during'|'post'|null,
  practices: PracticeRef[],
  completed: boolean,
}
```

---

## 11. Downstream consumers

| Surface | File | Reads |
|---|---|---|
| Today's Performance Priorities | `src/components/home/TodayThreePriorities.tsx` | horizonModules, arcLabel, ledger |
| Plan page | `src/pages/PlanPage.tsx` | full response, Week-Ahead branch |
| Snapshot-read-first hook | `src/hooks/useMasteryPlanSnapshot.ts` | `mastery_plan_snapshots` |
| Brief snapshot hook | `src/hooks/useCurrentBriefSnapshot.ts` | `brief_snapshots` |
| MRS snapshot hook | `src/hooks/useMrsSnapshot.ts` | `daily_context_snapshot` |
| Practice player | `src/pages/MicroPracticePlayer.tsx` | practices[] |
| Smart Nudges | `supabase/functions/smart-nudges/index.ts` | slotBoosts + same snapshot |
| Insights · Progress | `src/components/insights/LeadershipPatternsCard.tsx` | snapshot history |
| Week-Ahead | `src/components/home/WeekAheadPriorities.tsx` + `list-week-ahead-priorities` | `weekly_plan_snapshots` |

---

## 12. Week-Ahead Mode (parallel surface)

- Trigger: `evaluateWeekAheadMode` (Sunday / last-PTO / last-holiday / last-long-weekend / `?mode=week-ahead` deep link).
- Saturday is the `week_recovery` driver (Brief only) — Plan stays weekday cadence.
- `list-week-ahead-priorities` orchestrates the unified ranker `rankJitCandidates` over `[today, +8d)`, applies `applyEventPriorityMemory`, returns top 10 with soft per-category cap 4, sorted chronologically. Writes `weekly_plan_snapshots` upsert on `(user_id, week_start_date, source)`.
- Memory writes: `record-event-priority-signal` from `WeekAheadPriorities` card actions (priority / not_this_week / never), `SlotCancelFeedbackModal` (cancelled_keep_surfacing | cancelled_as_noise), `PlanFeedbackModal` thumbs-up/down (priority | cancelled_as_noise on wrong-event copy).
- Nudge: `weekAheadPickerInvite` — Sunday + last-X-day evenings 16–19 local; gated on `prefs.evening_close_enabled`; not on Saturday.

---

## 13. JIT v2 shadow mode

Env flag `JIT_V2` ∈ `shadow|on|off`.
- **shadow**: runs `selectJitCandidates` alongside Bridge, writes
  `jit_event_context.shadow_v2_*` cols for parity comparison. No user-visible change.
- **on**: replaces Bridge as primary ranker.
- Logged with `[generate-mastery-plan][jit-v2-shadow] tier=… ageDays=… patternCount=… ranked=… excluded=… top=…@…`.

---

## 14. Observability — log line catalogue

- `[generate-mastery-plan] Bridge: found N pre-scored events`
- `[generate-mastery-plan] Bridge: BLOCKED educational non-organizer "…"`
- `[generate-mastery-plan] Bridge: EXCLUDED "…" – window=… minutesUntil=… score=…`
- `[generate-mastery-plan] Bridge: skipping "…" – touchN dismissed`
- `[generate-mastery-plan] Bridge: no pre-scored events, falling back to shared ranked-candidate scoring`
- `[generate-mastery-plan] Calendar: N events fetched, M scored, K after suppression. Top event: …`
- `[generate-mastery-plan] topEvent selected from shared ranking: "…" phase=… score=… minutesUntil=…`
- `[generate-mastery-plan] topEvent selected from legacy fallback: "…" score=… minutesUntil=…`
- `[generate-mastery-plan] JIT candidate EXCLUDED: "…" – score=… < threshold=55`
- `[generate-mastery-plan] JIT candidate EXCLUDED: "…" – window=… minutesUntil=… score=…`
- `[generate-mastery-plan] dedupe …`
- `[generate-mastery-plan] JIT reordered for brief anchors=…`
- `[generate-mastery-plan] preEventPlan built: "…" window=… horizon=… with N modules`
- `[generate-mastery-plan] preEventPlan skipped: no modules resolved for "…"`
- `[generate-mastery-plan] Excluding N JIT content IDs from ToD selection: …`
- `[generate-mastery-plan] calendarContext: todayLoad=…`
- `[generate-mastery-plan][mrs-v2] snapshot patternSignals: …`
- `[generate-mastery-plan][jit-v2] late-resolve fired=… resolved=…`
- `[generate-mastery-plan][jit-v2-shadow] gate JIT_V2="…" scored=… filtered=…`
- `[generate-mastery-plan] RECOVERY DAY TRIGGERED: …`
- `[generate-mastery-plan] signal-gate { … }`
- `[generate-mastery-plan] awaiting-signals envelope returned { gatingReason }`
- `[behaviour-wiring] scope=plan flags=N boosts=M rules=…`
- `[practice-selector] protocol fallback { combo, slotRole, mode, jitPhase, jitEventTitle }`
- `[load-brief-behaviour-snapshot] signatureHash mismatch — expected=… got=… Rejecting stale snapshot`
- `[event-priority-memory] load failed …`

---

## 15. Constants quick-reference

- `JIT_THRESHOLD_UNIFIED = 55`
- `MVP_JIT_HORIZON_MINUTES = 24*60 = 1440`
- `MIN_IMMEDIATE = 25`
- `D_BOOSTED_CAP = 38`
- `CATEGORY_MAX_SLOTS = { A:2, D:2, F:3, G:3, *:1 }`
- `getActionWindow`: touch2 ≤360, touch1 ≤2880, else selection_only
- Tier weights table (§4.4.5)
- Memory delta clamp `[-50, +30]`
- Pattern score cap 35; relationship cap 25
- Sovereign: high +45, medium +20, low → demote
- Why-line cap 25 words; title cap 10 words; event tokens ≤4

---

## 16. Out of scope

Onboarding flow, MRS v3/v4 scoring weights, ledger schema reshape, event
taxonomy (`event-categories.ts`, `event-phase-map.ts`), protocol combos
(`protocol-combos.ts`), Connected Data, push notifications, Auth0,
wearable sync, payments. Each owns its own SSOT.
