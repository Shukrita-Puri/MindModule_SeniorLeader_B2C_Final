# Unified Knowledge Spine & Tiered Memory Architecture

## Executive Summary
This document establishes the canonical **Knowledge Spine** (universal domain ontology) and **Memory Structure** (tiered state hierarchy) for the Mind Module Executive Mental Performance Platform. It defines the exact operational loop for each core feature—specifying when each feature **Reads**, **Analyses**, **Interprets**, **Recommends**, **Writes**, and when it **Just Reads and Writes** (bypassing heavy inference)—and details the synchronization contracts that ensure all systems operate coherently.

---

# Part 1: The One Knowledge Spine

The Knowledge Spine is the immutable conceptual taxonomy shared across all ingestion pipelines, scoring algorithms, edge functions, and client experiences. No feature or subagent may create isolated vocabularies or duplicate classification engines.

```
═════════════════════════════════════════════════════════════════════════════════
                         THE UNIFIED KNOWLEDGE SPINE
═════════════════════════════════════════════════════════════════════════════════

  LAYER 1: DEMAND & EVENT TAXONOMY
  ├─ 8 Framework Pillars (A–H): Board, External, Strategy, Team, Ops, Public, Deals, Crisis
  ├─ 30 Granular Event Subtypes (Demand Profiles: Cognitive, Emotional, Sympathetic, Endurance)
  └─ CEO-Reality Archetypes (PTO, Flight/Circadian, Board Outcome, Veto Risk, Decision Leakage)
                                     │
  LAYER 2: PHYSIOLOGICAL BIOMARKERS & CIRCADIAN TEMPORALITY
  ├─ Autonomic Tone: HRV 14d/30d Baselines, Sustained Deficit Severity, Peak Intra-Event HR
  ├─ Sleep Architecture: Efficiency %, Deep/REM Recovery, Sleep Debt Carryover
  └─ Temporal Windows: Morning Priming (06:00–10:00), Midday Execution, Evening Closure (18:00–22:59)
                                     │
  LAYER 3: INTERVENTION & PROTOCOL TAXONOMY
  ├─ 2 Core Modalities: Mindset (Cognitive Detachment) & Somatic (Vagal/Autonomic Reset)
  ├─ 3 Functional Modes: Pause (De-escalation), Flow (Priming), Reenergise (Restoration)
  ├─ 6 Primitive Protocol Combos: mindset.pause, mindset.flow, mindset.reenergise,
  │                                somatic.pause, somatic.flow, somatic.reenergise
  ├─ 3 Arc Phases: Pre (Prepare), During (Hold), Post (Reset / Recover / Land)
  └─ 5 Executive Objectives: Composure, Resilience, Endurance, Strategic Clarity, Decisive Alignment
                                     │
  LAYER 4: CAUSALITY & PATTERN TAXONOMY
  ├─ Negative Drain Correlates: Event → HRV drop, Event → RHR spike, Density → Sleep deficit
  └─ Positive Lift Correlates (v4): HR Event Lift, Category Lift A–H, Sleep-to-Peak, Streak-to-Peak
                                     │
  LAYER 5: CHIEF-OF-STAFF VOICE & LEXICON CONTRACT
  ├─ Meaning-First Communication: Translate numbers into consequence; metrics never lead
  ├─ Banned Mechanical Jargon: "decision posture", "capacity", "reserves", "baseline"
  └─ Qualified Mental CTAs: Banned passive verbs; mandatory in-app mental-prep action destination
═════════════════════════════════════════════════════════════════════════════════
```

### 1.1 Layer 1: Demand & Event Taxonomy (Pillars A–H & Subtypes)
- **Source of Truth**: `_shared/events/event-categories.ts` and `_shared/events/event-subtypes.ts`.
- **The 8 Pillars**:
  - `A`: **Board & Governance** (Emotional regulation + cognitive sharpness; preventing emotional hijack).
  - `B`: **High-Stakes External / Media** (Composed stage presence, narrative clarity under interrogation).
  - `C`: **Strategic Thinking & Decision Making** (Uncluttered working memory, bias detachment).
  - `D`: **High-Stakes People & Team Dynamics** (Vocal resonance, psychological safety, empathy control).
  - `E`: **Operational & Execution Cadence** (Endurance, rapid task switching, cognitive pacing).
  - `F`: **Public / Large Group Engagements** (Sympathetic activation containment, high-energy projection).
  - `G`: **Negotiations, Deals & Disputes** (Parasympathetic grounding during high-friction conflict).
  - `H`: **Crisis, Risk & Incident Response** (Acute nervous system regulation, stabilizing panic).
- **Subtypes**: 30 granular events with defined `demandProfile`, `leadTimeMinutes`, and `scenarioId`.
- **CEO-Reality Conditions**: Deterministic detectors for `public_holiday`, `personal_pto`, `circadian_travel`, `board_outcome`, `veto_risk`, `decision_leakage`, `post_peak_hangover`, and `personal_friction`.

### 1.2 Layer 2: Physiological Biomarkers & Circadian Temporality
- **Autonomic Tone**: Trailing 30-day date-bounded baseline window (not row counts). HRV deviation percentage against personal 14-day median. Graded sustained deficit severity (last 3 HRV samples in 5-day window vs 14d baseline: $\le -15\%$ = Red, $\le -7\%$ = Amber, else Green).
- **Intra-Event Strain**: Peak heart rate logged during exact event timestamps `[event.start, event.end]` via `wearable_data.hr_samples` (HRV is a morning baseline, HR is event-window resolution).
- **Circadian Temporal Windows**:
  - `Morning Window (06:00–10:00)`: Priming, cognitive alignment, proactive agenda framing.
  - `Execution Window (10:00–18:00)`: State regulation, JIT pre-event readiness, load consolidation.
  - `Reflection Window (18:00–22:59)`: Micro-win extraction, evening check-in, cognitive offloading.
  - `Restoration Window (23:00–06:00)`: Autonomic recovery, sleep preparation, complete notification lock.

### 1.3 Layer 3: Self-Regulation Protocols & Practice Taxonomy
- **Source of Truth**: `_shared/protocols/protocol-combos.ts` and `_shared/events/event-phase-map.ts`.
- **The 6 Pure Combos**:
  - `mindset.pause`: Reactive thinking, identity threat $\rightarrow$ Detachment before high-consequence choice.
  - `mindset.flow`: Pre-execution focus, narrative priming $\rightarrow$ Aligned attention, single-thread focus.
  - `mindset.reenergise`: Post-event integration $\rightarrow$ Closure, lesson capture, identity consolidation.
  - `somatic.pause`: Sympathetic dominance, elevated HR $\rightarrow$ Parasympathetic re-entry, HRV stabilization.
  - `somatic.flow`: Pre-stage activation, breath cadence $\rightarrow$ High-coherence state matching demand.
  - `somatic.reenergise`: Depletion, post-travel drift $\rightarrow$ Hardware recovery, sleep priming, vagal reset.
- **Arc Phases**: `Pre` (Lead/Present/Decide/Steady), `During` (Hold), `Post` (Reset/Recover/Land).

### 1.4 Layer 4: Causality & Pattern Taxonomy
- **Source of Truth**: `_shared/events/event-classifier.ts` and `causality_findings.signal_summary`.
- **Drain Correlates**: Statistical correlation between specific event types and subsequent morning HRV drops or elevated resting heart rate.
- **v4 Performance Lift**: Positive-side correlations:
  - `hr_event_lift`: Peak HR vs resting baseline + same-day PRS lift per subtype.
  - `category_lift`: Rollup to Pillars A–H.
  - `sleep_to_peak`: High-sleep nights ($\ge P70$) $\rightarrow$ Next-day PRS delta.
  - `recovery_streak_to_peak`: Mean consecutive low-RHR days preceding peak PRS.

### 1.5 Layer 5: Chief-of-Staff Voice & Lexicon Contract
- **Voice Principle**: Trusted human Chief of Staff. Direct, strategic, concise.
- **Banned Words**: Forbidden mechanical terms (`decision posture`, `reserves`, `baseline`, `capacity`, `performance state`, `mental sharpness`).
- **Forbidden Passive Phrases**: `your plan is ready`, `your brief is ready`, `see your readiness`, `tap to prep`.
- **Mandatory Mind-Prep CTA Verbs**: `log in to prep your mind`, `check in to recalibrate`, `check in to set tomorrow`, `check in to close the day`, `open your insights`.

---

# Part 2: The One Memory Structure

The platform organizes state into four strictly segregated tiers with defined lifetimes, storage backends, and mutation invariants.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        TIER 0: WORKING MEMORY (Ephemeral Context)                      │
│  Lifetime: Per-invocation / Request lifecycle (0–15s)                                  │
│  Backend: Edge Function RAM / Fast execution context                                   │
│  Payloads: MergedCalendarEvent[], Computed Deltas, Raw Token Cache, cardsAwaiting flag │
└─────────────────────────────────────────┬──────────────────────────────────────────────┘
                                          ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      TIER 1: INTRADAY OPERATIONAL MEMORY (Tactical)                    │
│  Lifetime: 24 Hours / Current Local Day Date-stamped                                   │
│  Backend: PostgreSQL (brief_snapshots, daily_ritual_completions, daily_check_ins)      │
│  Payloads: Delivered Brief narrative, Plan Ledger (3 Slots), APNS Collapse IDs, Flags │
└─────────────────────────────────────────┬──────────────────────────────────────────────┘
                                          ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      TIER 2: EPISODIC PATTERN MEMORY (Empirical 7–30d)                 │
│  Lifetime: Rolling 7 to 30 Days                                                        │
│  Backend: PostgreSQL (causality_findings, wearable_data date-bounded views)            │
│  Payloads: signal_summary JSONB, Sustained Deficit Severity, Baseline HRV/RHR Medians  │
└─────────────────────────────────────────┬──────────────────────────────────────────────┘
                                          ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      TIER 3: SEMANTIC PROFILE MEMORY (Long-Term/Identity)              │
│  Lifetime: Permanent / User Account Lifetime                                           │
│  Backend: PostgreSQL (user_profiles, coach_preferences, notification_log audit)        │
│  Payloads: Coach Growth Areas, practicePriorityTag, Baseline Trajectories, Audit Trail │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Tier Specifications

| Tier | Storage Target | Key Schema / Tables | Mutation Rules | Cache & Invalidation |
|---|---|---|---|---|
| **Tier 0: Working Memory** | Runtime Deno/Node RAM | `MergedCalendarEvent`, in-memory signal pill tree, `DayContext` | Read-only per request; rebuilt from canonical DB sources on each run. | Zero persistence. Garbage collected upon edge function return. |
| **Tier 1: Intraday Memory** | Supabase Postgres (Daily rows) | `brief_snapshots`, `daily_ritual_completions`, `daily_check_ins`, `notification_log` | Stamped with `local_date`. Plan ledger updates statefully (completed slots are preserved). | Hydrates only when `cardsAwaiting === false`. Stale caches bypassed on window transitions. |
| **Tier 2: Episodic Memory** | Supabase Postgres (Aggregations) | `causality_findings` (keyed by `user_id, pattern_kind, computed_for_date`), 30-day wearable views | Updated strictly via daily compute (`cause-effect-engine`). Read-only for Edge Functions. | 24-hour cache on `signal_summary`. Baseline windows bounded by `NOW() - INTERVAL '30 days'` (never `limit(30)`). |
| **Tier 3: Semantic Memory** | Supabase Postgres (Core profile) | `profiles`, `coach_preferences`, `notification_preferences`, historical `plan_snapshots` | Updated only via onboarding, explicit settings, or coach interactions. Append-only for logs. | Long-lived client cache (React Query: `staleTime = Infinity`, invalidated on profile mutation). |

---

# Part 3: Feature Steps and Loops

Each feature executes through an explicit loop cycle: **When to Read**, **When to Just Read & Write (Bypass)**, **When to Analyse**, **When to Interpret**, **When to Recommend**, and **When to Write**.

---

## 3.1 Feature 1: Executive Home & MRS Scoring Engine
- **Primary Function**: Synthesize raw physiological and calendar inputs into the Morning Readiness Score (MRS) and manage the system-wide awaiting gate.
- **Trigger**: Morning app open, background wearable sync hook, or manual pull-to-refresh.
- **Step 1 (Read)**:
  - Read `wearable_data` for past 30 days (date-bounded).
  - Read `calendar_events` for today and yesterday.
  - Read `daily_check_ins` for subjective shift.
- **Step 2 (Just Read & Write - Bypass Branch)**:
  - *Condition*: If wearable disconnected OR calendar disconnected (`not_connected`), OR no score-bearing physiological signal exists.
  - *Action*: Write `innerReadinessState = 'awaiting'`, write reason-aware awaiting copy (e.g., "Connect your wearable and calendar..."), emit `cardsAwaiting = true`. **Do NOT compute scores. Do NOT call LLM. Return immediately.**
- **Step 3 (Analyse)**:
  - Compute 30-day baseline median HRV and RHR.
  - Calculate today's HRV deviation (%) and Sleep Efficiency (%).
  - Compute Demand Pillar: today's classified calendar density (weight 20) + yesterday's carryover (weight 10). If connected with 0 events, award `ZERO_DEMAND_CREDIT = 0.6` (score 60).
  - Compute Sustained Deficit Severity (last 3 HRV samples in 5 days vs 14d baseline).
- **Step 4 (Interpret)**:
  - Check Dual-Pillar Requirement: Both physiological AND demand must be present.
  - Intra-pillar weight redistribution: unearned physio stays in physio; unearned demand stays in demand.
  - Apply subjective check-in shift: clamp influence to at most 1 step (e.g., Amber $\rightarrow$ Green, never skipping tiers).
- **Step 5 (Recommend)**:
  - Map final numerical score (0–100) to Executive State Tier: Peak (85–100), Primed (70–84), Managing (50–69), Depleted (<50).
  - Assign signal pill statuses (Green/Amber/Red) for Autonomic Balance, Sleep Recovery, and Sustained Capacity.
- **Step 6 (Write)**:
  - Persist computed MRS row and signal pill state to working cache and DB daily record.

---

## 3.2 Feature 2: Morning Executive Brief & Daily Narrative
- **Primary Function**: Deliver a concise, meaning-first strategic narrative for the CEO's day.
- **Trigger**: App launch between 05:00 and 12:00, or following MRS score formation.
- **Step 1 (Read)**:
  - Read Tier 1 MRS score and signal pills from Feature 1.
  - Read Tier 0 canonical merged calendar (`mergeCalendarEvents`).
  - Read Tier 2 `causality_findings.signal_summary`.
- **Step 2 (Just Read & Write - Bypass Branch)**:
  - *Condition*: If `cardsAwaiting === true` or existing delivered snapshot for `local_date` is already active and fresh (<60 min) with unchanged calendar hash.
  - *Action*: Read and return cached `brief_snapshots` directly. If awaiting, suppress body, phrase, and Lean On/Watch For; write delivery log as suppressed.
- **Step 3 (Analyse)**:
  - Identify the day's peak stress anchor (highest demand event from A–H classification).
  - Cross-reference anchor with `signal_summary` for historical negative drain or performance lift.
- **Step 4 (Interpret)**:
  - Frame the executive operational stance: Match physiological readiness to calendar consequence.
  - Detect CEO Realities (e.g. `veto_risk` if HRV < -10% with high self-reported confidence; `board_outcome` if governance meeting in next 24h).
- **Step 5 (Recommend)**:
  - Generate 1 Lead Phrase, 2-sentence Strategic Body, 1 "Lean On" anchor, and 1 "Watch For" risk guard.
  - Strip mechanical jargon and ensure metric claims are contextualized within business consequence.
- **Step 6 (Write)**:
  - Persist snapshot into `brief_snapshots` with extracted claim set (numbers, event titles, lexicon clusters) for Plan anti-duplication.

---

## 3.3 Feature 3: Mastery Plan & Priority Slot Composer
- **Primary Function**: Construct today's 3 performance priorities mapped to the CEO's schedule and state.
- **Trigger**: Brief generation, calendar change event, or user completion of a practice slot.
- **Step 1 (Read)**:
  - Read Tier 1 `brief_snapshots` for today (specifically extracting `buildBriefClaimSet()`).
  - Read Tier 1 `daily_ritual_completions.plan_ledger` (to protect already completed slots).
  - Read Tier 3 coach `growth_area` and onboarding `practicePriorityTag`.
  - Read Tier 0 merged calendar events.
- **Step 2 (Just Read & Write - Bypass Branch)**:
  - *Condition*: If `cardsAwaiting === true`, or if user enters outside operational hours without calendar changes.
  - *Action*: Return empty/awaiting plan state. Do not schedule new slots. If user completed a slot, update `plan_ledger[slotId].status = 'completed'` and immediately return without regenerating unaffected slots.
- **Step 3 (Analyse)**:
  - Filter events to 24-hour ceiling (`minutesUntil <= 1440`).
  - Score strategic importance: +15 if matches coach growth area, +10 if matches practice tag, +10 if historical HRV drain >10%.
  - Check temporal window: if between 18:00 and 22:59, enable reflection practice; outside this, swap to `Sleep Prep & Tomorrow Framing`.
- **Step 4 (Interpret)**:
  - Slot Allocation Model:
    - Slot 1: `start_of_day` (or morning JIT fusion if Board event $\le 4\text{h}$ ahead).
    - Slot 2: `jit` pre-event anchor (or `state-management` if no qualifying high-stakes event).
    - Slot 3: `end_of_day` recovery & integration.
  - Enforce per-event arc cadence: Maximum 1 arc per event, unless Category A/D/F/G allows 2 arcs with start-times $\ge 12\text{h}$ apart and distinct phases.
- **Step 5 (Recommend)**:
  - Map event subtype and phase to the 6 Protocol Combos (e.g. Pre-Board $\rightarrow$ `mindset.pause` + `somatic.pause`).
  - Compose deterministic 4-part Why-Line: `{strategicAnchor}. {tacticalPattern}. {immediateSignal}. → {actionVerb} {forContext}.`
  - Run hard anti-duplication: Drop any clause mentioning numbers or phrases already present in Brief claim set; if full collision occurs, bridge with: *"Following your brief: [Action]"*.
- **Step 6 (Write)**:
  - Persist active 3 slots into `daily_ritual_completions.plan_ledger` preserving completion state.

---

## 3.4 Feature 4: Smart Nudges & Real-Time JIT Interventions
- **Primary Function**: Deliver timely, meaning-forward notifications acting as a proactive Chief of Staff.
- **Trigger**: Cron runner (`*/10` minutes) evaluating active user window.
- **Step 1 (Read)**:
  - Read user's current local time, active device tokens, and low power mode status.
  - Read Tier 1 `daily_ritual_completions.plan_ledger` (checking for already completed actions).
  - Read Tier 0 merged calendar for next 3-hour window.
  - Read Tier 2 `causality_findings.signal_summary`.
- **Step 2 (Just Read & Write - Bypass Branch)**:
  - *Condition*:
    - Active device tokens stale > 60 min $\rightarrow$ Suppress (`suppression_reason = 'offline'`).
    - 3-slot daily ceiling reached (`nudge_one`, `nudge_two`, `nudge_three` already sent).
    - User is inside a PTO day $\rightarrow$ Suppress afternoon and JIT nudges.
    - Matching priority in `plan_ledger` is already marked `completed`.
    - Back-to-back guard: Largest gap between events in next 3 hours is < 30 min $\rightarrow$ Suppress (`suppression_reason = 'back_to_back'`).
  - *Action*: Write suppression reason into `notification_log`. Return immediately without generating APNS payload.
- **Step 3 (Analyse)**:
  - Evaluate candidates across 3 comparator steps:
    1. Slot Priority: Morning > Evening > Afternoon.
    2. Anchor Priority: JIT (calendar event) outranks STATE (wearable/recovery).
    3. Signal Strength: Pattern-cited JIT (3) > Plain JIT (2) $\approx$ Wearable state (2) > Generic state (1).
- **Step 4 (Interpret)**:
  - Translate data point into meaning: Lead with consequence, not raw metrics (HRV deviation never opens body).
  - Enforce word and character limits: $\le 22$ words, $\le 140$ characters.
  - Ensure named context token exists (e.g. specific meeting title, exact clock time, or logged check-in word).
- **Step 5 (Recommend)**:
  - Select qualified CTA verb ending: e.g. `log in to prep your mind`, `check in to recalibrate`.
  - Set APNS collapse ID (`${family}-${localDate}`) and TTL (e.g. 45 min for pre-flight, 15 min for pre-meeting).
- **Step 6 (Write)**:
  - Dispatch via APNS.
  - Write record to `notification_log` with metadata: `delivery_state = 'accepted'`, `cta_bucket`, `architecture = 'cos-mind-v8-meaning-forward'`.

---

## 3.5 Feature 5: Daily Check-In, Mindset Reflection & Feedback Engine
- **Primary Function**: Capture subjective executive state, refine physiological readiness, and close the intraday loop.
- **Trigger**: User opens Check-in modal (Morning 07:00–11:00 or Evening 18:00–22:59) or taps check-in nudge.
- **Step 1 (Read)**:
  - Read today's physiological signal pill state.
  - Read active `plan_ledger` items and completed practices.
- **Step 2 (Just Read & Write - Bypass Branch)**:
  - *Condition*: Rapid subsequent check-in submission within 15 minutes with identical slider positions.
  - *Action*: Update `daily_check_ins.updated_at` timestamp. Skip downstream score recalculations.
- **Step 3 (Analyse)**:
  - Evaluate subjective metrics: Emotion, Regulation, and Pressure (1 Overloaded $\rightarrow$ 5 Spacious).
  - Calculate check-in composite: Mean of $\ge 2$ dimensions.
- **Step 4 (Interpret)**:
  - Calculate physiological overlay effect:
    - Composite $\ge 4.0 \rightarrow +1$ tier step lift (Red $\rightarrow$ Amber, Amber $\rightarrow$ Green; never above Green).
    - Composite $\le 2.0 \rightarrow -1$ tier step reduction.
    - Composite between $2.1$ and $3.9 \rightarrow$ 0 shift.
- **Step 5 (Recommend)**:
  - If evening check-in: Recommend micro-win extraction ("Tiny Win and Reflection") and prime tomorrow's mindset.
- **Step 6 (Write)**:
  - Write row to `daily_check_ins`.
  - Stamp `contributedByCheckIn = true` on Resilience Capacity pill.
  - Update badge count (`aps.badge`) to reflect resolved pending check-in.

---

## 3.6 Feature 6: Causality Pattern Store & "When You Perform Best" Engine
- **Primary Function**: Compute empirical correlations between event types, calendar densities, and physiological recovery/performance.
- **Trigger**: Nightly scheduled cron (`02:00` local).
- **Step 1 (Read)**:
  - Read trailing 30 to 90 days of `calendar_events` and `wearable_data.hr_samples`.
  - Read `daily_ritual_completions` and `daily_check_ins`.
- **Step 2 (Just Read & Write - Bypass Branch)**:
  - *Condition*: Fewer than 7 days of wearable data, or 0 classified calendar events in the trailing window.
  - *Action*: Write empty `causality_findings` row with `confidence = 'insufficient_data'`. Return without running regressions.
- **Step 3 (Analyse)**:
  - Run event classification via canonical `classifyEvent()` into Pillars A–H.
  - Extract intra-event HR peaks within `[event.start, event.end]`.
  - Compute `hr_event_lift`: Peak HR vs baseline RHR per event subtype.
  - Compute `sleep_to_peak`: Nights where Sleep $\ge P70$ vs next-day Performance Readiness Score.
  - Compute `recovery_streak_to_peak`: Consecutive low-RHR days prior to top-quartile performance days.
- **Step 4 (Interpret)**:
  - Filter findings by statistical confidence:
    - $n \ge 5$, delta $\ge 15\% \rightarrow$ `strong`.
    - $n \ge 3$, delta $\ge 8\% \rightarrow$ `emerging`.
    - Otherwise $\rightarrow$ Suppress.
- **Step 5 (Recommend)**:
  - Format insights into executive cause-effect statements ("When high-stakes negotiations are preceded by 2 days of low RHR, peak performance lift is +22%").
- **Step 6 (Write)**:
  - Pre-project and persist payload into `causality_findings.signal_summary` JSONB under `(user_id, 'cause_effect_v2', computed_for_date)` for $O(1)$ edge-function consumption.

---

# Part 4: Ensuring They Work Together (Cross-Loop Synchronization)

The entire architecture functions as an integrated, self-reinforcing cybernetic system. The following synchronization contracts prevent data drift, conflicting advice, and communication fatigue.

### 4.1 The Shared Executive Gate (`cardsAwaiting`)
All Executive Home surfaces adhere to one unified readiness contract:
```typescript
const cardsAwaiting =
  innerReadinessState === 'awaiting' ||
  innerReadinessScore == null ||
  awaitingSignals === true ||
  briefMode === 'cold-start';
```
- When `cardsAwaiting === true`:
  - MRS renders awaiting copy (reason-aware, no score).
  - Brief suppresses generated body/phrase/pills.
  - Plan suppresses live generation, cache, and snapshots.
  - Signal pills display neutral unread state, never colored evidence.
  - Smart Nudges fall back strictly to connection assistance nudges; all JIT protocol nudges are silenced.

### 4.2 Cross-Feature Conflict Resolution & Anti-Duplication

| Competing Surfaces | Conflict / Collision Risk | Resolution Engine & SSOT Rule |
|---|---|---|
| **Brief vs. Plan** | Plan duplicates metrics, event names, or vocabulary already delivered in the morning Brief. | **Claim Extraction & Filtering**: Plan calls `buildBriefClaimSet(briefSnapshot)` to extract all numbers, event names, and lexicon clusters. Any matching Why-line clause is discarded. If complete overlap occurs, Plan adopts bridge syntax (*"Following your brief: ..."*). |
| **Plan vs. Smart Nudges** | Nudge prompts CEO to prepare for an event they already completed in their morning Plan. | **Plan Ledger Completion Check**: `smart-nudges` checks `daily_ritual_completions.plan_ledger`. If matching priority status is `'completed'`, pre-event JIT nudge is completely suppressed. |
| **Calendar Load vs. Nudges** | CEO is bombarded with notifications while in back-to-back high-stakes meetings. | **Back-to-Back Guard**: If the gap between events over the next 3 hours is $<30\text{ min}$, suppress with `back_to_back`. If $30\text{--}60\text{ min}$, downgrade to 60-second reminder without app open. |
| **Check-in vs. Wearable MRS** | CEO feels great, but wearable indicates deep autonomic fatigue (or vice-versa). | **1-Step Clamp Rule**: Physiological data has primary authority. Subjective check-in can shift the composite tier by at most $\pm 1$ level and can never exceed Green. |
| **Oura vs. Apple Watch Sync** | Multi-source wearable overlap creates duplicate HR samples and conflicting baselines. | **Canonical Wearable Deduplication**: Single source priority per metric family. HRV/Sleep uses priority source; date-bounded 30-day window deduplicates on timestamp. |

### 4.3 Data Drift Prevention & Vocabulary Synchronization
1. **Single Source of Truth Imports**: Every Edge Function (`compute-outer-readiness`, `generate-mastery-plan`, `smart-nudges`, `cause-effect-engine`) imports from `_shared/events/event-categories.ts`, `event-subtypes.ts`, and `protocols/protocol-combos.ts`. No local category mappings or duplicate classifier rules are permitted.
2. **Date-Bounded Windows**: Baselines are strictly date-bounded (`trailing 30 days`), never `limit(30)`. This guarantees consistent baseline calculation across users with sparse sync patterns.
3. **Pre-Projected Flattened Payloads**: Complex regressions are computed offline and flattened into `causality_findings.signal_summary` JSONB. Edge functions perform $O(1)$ lookups without executing multi-table joins.
4. **Honest Delivery Receipts**: Client-side Notification Service Extension logs actual delivery and tap timestamps back to `notification_log.delivery_state`, closing the loop between scheduling and user engagement.
