# Mastery Plan Context Statements – Full Logic Documentation

## 1. Purpose

The Mastery Plan produces two types of context statements:
1. **Plan Brief** – 2-sentence overview explaining why the Time-of-Day sequence was chosen
2. **JIT Context Description** – Per-event explanation for Just-in-Time pre-event plans

All logic lives in `supabase/functions/generate-mastery-plan/index.ts`.

---

## 2. Upstream Data Sources (Inputs)

The client sends **only `timezoneOffset`**. All other signals are fetched server-side.

### 2.1 Server-Fetched Signals (via `buildSharedContext()`)

All data fetching is consolidated into a single `buildSharedContext()` function that executes parallel queries and returns a `SharedContext` object. The client sends **only `timezoneOffset`**.

| # | Signal | Table/Source | Used In |
|---|--------|-------------|---------|
| 1 | Inner Readiness Tier | `daily_checkins` (energy_balance → tier mapping) | Plan Brief, Module Reasoning |
| 2 | Inner Readiness Score | `daily_checkins.energy_balance` | Plan Brief (displayed as X/100) |
| 3 | Check-in Outcome | `daily_checkins.outcome` | Plan Brief (state word mapping) |
| 4 | Clarity Level | `daily_checkins.clarity_level` | Forwarded to Outer Readiness |
| 5 | Confidence Level | `daily_checkins.confidence_level` | Forwarded to Outer Readiness |
| 6 | Calendar Events (48h) | `calendar_events` (gated by `calendar_connections.is_active`) | JIT scoring, calendar context |
| 7 | Calendar Load | Computed from upcoming events (4h window) | Plan Brief, Duration Ceiling, Module Reasoning |
| 8 | Calendar Pressure | Computed from upcoming events (weighted scoring) | Coach card inclusion |
| 9 | Calendar Gaps | Computed: gap durations between consecutive future events | Urgency framing in Plan Brief |
| 10 | Wearable Data | `wearable_data` (latest within 24h) | Plan Brief (sleep/HRV fragments), Module Reasoning |
| 11 | HRV Deviation | Computed: `(current_hrv - 30day_avg) / 30day_avg × 100` | Plan Brief, JIT Context |
| 12 | Outer Readiness Brief | Server-to-server call to `compute-outer-readiness` | Plan Brief (context forwarding), Theme → Module mapping |
| 13 | Favorites | `user_favorites` | Content scoring (+30 boost) |
| 14 | Completed Today | `daily_ritual_completions.completed_practice_ids` | Content exclusion (-10), state fingerprint |
| 15 | Coach Insights | `user_coach_insights` (active, confidence ≥ 0.6) | Plan Brief (coach fragment), Content scoring (+25) |
| 16 | Effective Content | `content_relevance_feedback` (star_rating ≥ 4) | Content scoring (+20) |
| 17 | Archetype | `profiles.archetype` | Content scoring (onboarding tag matching) |
| 18 | Practice Priority Tag | `profiles.practice_priority_tag` | Content scoring (focus tag boost) |
| 19 | Pressure Context Tag | `profiles.pressure_context_tag` | Content scoring (pressure tag boost) |
| 20 | Pending Commitments | `coach_accountability_tracker` (status = 'pending') | Content scoring (+15), JIT context enrichment |
| 21 | Pattern Insight | Computed: 3+ consecutive days at same low outcome | Coach card prompt, JIT context |
| 22 | JIT Pre-scored Events | `jit_event_context` (bridge to new pipeline) | JIT plan (replaces legacy scoring when available) |
| 23 | HRV × Calendar Correlations | Computed: 30-day `calendar_events` × `wearable_data` join | JIT scoring boost (+12 to +25), JIT context |
| 24 | Skip Preferences | `jit_preferences` (skipped/dismissed, last 30 days) | JIT event suppression |
| 25 | Inner Readiness Trend | Computed: last 5 check-ins energy_balance direction | SharedContext (improving/declining/stable) |
| 26 | Practice Impact | Computed: `practice_sessions` × `daily_checkins` energy shift | SharedContext cause-effect correlation |
| 27 | State Carryover | Computed: evening→morning tier patterns from `daily_checkins` | SharedContext cause-effect correlation |
| 28 | Coach Breakthroughs | `coach_breakthrough_moments` (impact_score ≥ 3) | Outer Readiness compass context enrichment |

---

## 3. Time-of-Day Plan Brief (`generatePlanBrief`)

### 3.1 Structure

Every Plan Brief has two sentences:
- **Sentence 1 (State)**: "Your decision readiness is [tier] ([score]/100)[wearable fragment][calendar fragment]."
- **Sentence 2 (Purpose)**: Why this sequence was chosen, derived from Outer Readiness context + tier + signals.

Optional: Coach fragment appended if a relevant coach insight exists (< 80 chars).

### 3.2 Input Signals

| Signal | Role in Brief |
|--------|--------------|
| `innerReadinessTier` | Mapped to human word: depleted→"low", managing→"steady", strong→"above baseline", peak→"at peak" |
| `innerReadinessScore` | Displayed as "(X/100)" |
| `checkInOutcome` | Mapped to state word: thriving→"energised", drained→"drained", scattered→"scattered", etc. |
| `wearableContext` | Generates wearable fragment (see below) |
| `calendarContext` | Meeting counts for "[with X meetings ahead]" / "[with X meetings still ahead]" |
| `outerReadinessContext` | First 2 sentences used as purpose rationale |
| `calendarLoad` | Determines purpose framing (extreme/heavy triggers composure language) |
| `coachInsights` | Optional coach fragment: "Your coach has noted: [insight]." |

### 3.3 Wearable Fragments

| Condition | Fragment |
|-----------|---------|
| Poor sleep + low HRV | ", and your sleep and HRV are both below baseline" |
| Poor sleep only | ", and your sleep score is below baseline" |
| Low HRV only | ", and your HRV is below baseline" |
| Good HRV + good sleep | " with recovered HRV and solid sleep" |
| Good HRV only | " with recovered HRV" |
| Otherwise | "" (empty) |

Thresholds: poorSleep = sleepScore < 70; lowHRV = hrvDeviation < -10%; goodHRV = hrvDeviation > +5%; goodSleep = sleepScore ≥ 80.

### 3.4 Morning Brief Logic

1. If Outer Readiness context available:
   - State: "Your decision readiness is [tier] ([score]/100)[wearable][with X meetings ahead]."
   - Purpose: First 2 sentences of outerReadinessContext + tier-specific framing:
     - Depleted/poor sleep: "These practices compensate for what rest didn't fully restore."
     - Heavy/extreme calendar: "These practices build the composure to sustain you through a dense day."
     - Default: "These practices set your mental edge for what lies ahead."
2. Fallback (no Outer Readiness):
   - Poor sleep: "after below-baseline sleep[and low HRV]."
   - Calendar: "with X meetings ahead."
   - Default: generic readiness statement.

### 3.5 Afternoon Brief Logic

1. If Outer Readiness context available:
   - State: "[tier] ([score]/100)[wearable][with X meetings still ahead]."
   - Purpose: outerReadinessContext + "This sequence restores your edge for the stretch that remains."
2. Fallback: "This sequence resets your energy for the stretch that remains."

### 3.6 Evening Brief Logic

1. If Outer Readiness context available:
   - State: "[tier] ([score]/100)[wearable]."
   - Purpose varies by tier:
     - Depleted: "...release what you carried and protect tomorrow's capacity."
     - Managing: "...close cleanly so you arrive restored tomorrow."
     - Strong/Peak: "...consolidates your edge and sets up tomorrow."
2. Fallback with calendar: "after X meetings[wearable]."
3. Fallback without: "You checked in as [state] this evening – readiness at [score]/100."

---

## 4. Module Reasoning (`getContextualReasoning`)

Per-card reasoning strings explain **why this practice, right now, for you**.

### 4.1 Input Signals

| Signal | Role |
|--------|------|
| `moduleType` | regulate / align / prepare / integrate |
| `focus` | composure / release / grounding / focus / confidence / restore |
| `innerReadinessTier` | Drives depleted vs. strong language |
| `checkInOutcome` | Identifies drained/struggling states |
| `calendarLoad` | "dense calendar" qualifier |
| `timeOfDay` | Evening-specific release framing |
| `wearable` | Sleep and HRV signal overrides |
| `outerReadinessPhrase` | (Available but not currently used in reasoning) |

### 4.2 Priority Hierarchy per Focus

**Signal priority: Wearable > Check-in/Readiness > Calendar > Generic**

| Focus | Wearable Signal | Readiness Signal | Calendar Signal | Generic |
|-------|----------------|-----------------|----------------|---------|
| composure | "Your HRV is below baseline – settles your nervous system" | "Your check-in flagged tension" | "A dense calendar demands composure" | "Anchors your composure so you show up grounded" |
| release | "Your sleep was disrupted – discharge residual tension" (evening) | "Your readiness is low – discharge accumulated stress" | "After a heavy day, discharge accumulated stress" | "Release the day's weight" |
| grounding | "Your HRV and check-in both flag low reserves" | "When energy is low, grounding reconnects" | — | "Anchors your attention" |
| focus | "Your sleep was below baseline – compensates by sharpening focus" | "When depleted, targeted focus prevents spreading thin" | "With a dense calendar, narrows attention" | "Cuts through noise to priority" |
| confidence | — | "Your readiness is high – channels into confident presence" | "Dense day – channels into confident presence" | "Anchors self-assurance" |
| restore | "Your sleep score and check-in both flag low reserves" | "Your energy reserves are low – designed to replenish" | — | "Top up your reserves" |

---

## 5. JIT Context Description

### 5.1 Two Pipelines

JIT context is built by one of two pipelines:

1. **New Pipeline (Bridge)**: Uses pre-scored events from `jit_event_context` table
2. **Legacy Pipeline**: Scores events inline when no pre-scored data exists

### 5.2 New Pipeline: `buildEnrichedContextDescription`

**5-Signal Cascade:**

| # | Signal | Source | Example Output |
|---|--------|--------|----------------|
| 1 | Bucket Classification | `jit_event_context.jit_bucket_primary` | "High inner-state demand detected – regulate before this" (recalibrate) / "Decision or relationship stakes ahead" (clarity) / "Transition moment – sustain energy and identity" (renewal) |
| 2 | Coach Memory | `jit_event_context.has_coach_context` + sub-fields | "you've discussed this concern with your coach" / "your coach has flagged this pattern" / "a coach-recommended tool applies here" / "this connects to themes from your coaching" |
| 3 | HRV/Readiness State | `jit_dimension_scores.readiness_multiplier` | "your readiness is X% below baseline today" |
| 4 | Urgency | Computed from `minutesUntil` | "starting very soon – prepare now" / "in X minutes" / "in X hours" / "in X days" |
| 5 | Historical HRV Correlation | `getHRVEventCorrelations()` (30-day analysis) | "HRV typically shifts +18% during board meeting events" |

**Confidence-Framed Closing:**

| Confidence Score | Closing Style |
|-----------------|--------------|
| ≥ 70 (high) | "[signals]. Prepare with targeted practice." |
| 40–69 (medium) | "Before your [Event Title] – [signals]." |
| 20–39 (low) | "Worth preparing for this? [signals]." |
| < 20 | "[signals]. Prepare with targeted practice." (default) |

### 5.3 Legacy Pipeline: Inline Context Description

Built only if `dimA + dimB >= 22` (confidence gate):

| Signal | Source | Example |
|--------|--------|---------|
| Scenario match | `EXECUTIVE_SCENARIOS` keyword matching | "Upcoming pre board meeting detected" |
| Large meeting | `event.attendeesCount > 5` | "Large meeting with 8 attendees" |
| Urgency | `minutesUntil` | "in 2 hours" |
| Non-recurring high-visibility | `!isRecurring && attendees > 3` | "non-recurring high-visibility event" |
| HRV correlation | `getHRVEventCorrelations()` | "Your HRV typically elevates 18% during board events" |

### 5.4 Context Enrichment (Post-Pipeline)

After initial context is built, the mastery plan enriches it further:

| Condition | Override Behavior |
|-----------|------------------|
| Pending coach commitment matches event + pattern noted | "You discussed this with your coach and a pattern has been noted" |
| Pending coach commitment matches event | "You discussed this with your coach" |
| Pattern matches scenario | "Your coach has noted a pattern here" |
| HRV correlation > 10% + no coach signals + empty context | "Your HRV typically shifts X% during [type] events" |

---

## 6. JIT Event Scoring

### 6.1 Two-Touch Action Windows

| Window | Time Range | Mode | Content |
|--------|-----------|------|---------|
| `touch_1` | 24–48h before event | Think prep | Coach primary CTA + framework + optional focus (5–8 min) |
| `silent` | 6–24h | Gap | Nothing surfaces |
| `touch_2` | 0–6h before event | Body prep | Somatic primary + focus + coach secondary (3–5 min) |
| `selection_only` | > 48h | Scored only | Not surfaced to user |

### 6.2 Scoring (Legacy Path)

| Factor | Points |
|--------|--------|
| ≤ 2h away | +40 |
| ≤ 4h | +30 |
| ≤ 6h | +20 |
| 24–48h | +10 |
| Organizer | +15 |
| Attendees > 5 | +10 |
| Duration > 60min | +8 |
| Non-recurring | +10 |
| Scenario keyword match | +25 |
| Prime time slot | +5 |
| Back-to-back (< 15min gap) | +5 |
| Previously skipped type | -15 |
| HRV correlation > 20% | +25 |
| HRV correlation > 15% | +20 |
| HRV correlation > 10% | +12 |
| HRV negative correlation | -5 |

### 6.3 Gate Requirements

All three must pass:
- Composite score ≥ 55
- Dimension A (interpersonal) ≥ 10
- Dimension B (inner state/context) ≥ 8

### 6.4 Filters

- **Noise filter**: Transport, errands, auto-pay, placeholders, tentative events
- **Educational filter**: "How to", "masterclass", "workshop" → blocked if user is NOT organizer
- **Skip suppression**: Event types skipped 3+ times in last 30 days → excluded entirely
- **Per-touch dismissal**: Each touch (touch_1, touch_2) tracked independently for dismissals

---

## 7. HRV × Calendar Correlation Engine

### 7.1 Data

- 30 days of `calendar_events` joined with `wearable_data` by date
- Events grouped by canonical type (board, investor, client, strategy, etc.)

### 7.2 Canonical Type Extraction

Title keywords mapped to 20+ types: board, investor, fundraising, all-hands, media-interview, hiring-interview, pitch, client, strategy, leadership, speaking, ma, launch, layoff, negotiation, crisis, quarterly-review, performance-review, standup, retrospective, planning, finance, competitive, other.

### 7.3 Correlation Thresholds

- Minimum 2 events of same type required
- HRV deviation averaged across matching dates
- Score boost: +12 (>10%), +20 (>15%), +25 (>20%)
- Context message generated with canonical label and percentage

---

## 8. Module Reasoning per JIT Touch

### Touch 1 (24–48h)

| Module | Reasoning |
|--------|----------|
| Coach (prepare) | "Discuss your [scenario] approach with your coach" |
| Align (framework) | "Mental framework to sharpen your approach for [Event]" |
| Regulate (optional) | "Optional focus practice for deeper [scenario] preparation" |

### Touch 2 (0–6h)

| Module | Reasoning |
|--------|----------|
| Regulate (somatic) | "Settle your body before [Event]" |
| Align (grounding) | "Get focused and grounded before [Event]" |
| Coach (secondary) | "Quick check-in if you need it" |

---

## 9. Duration Ceiling

| Calendar Load | Max Duration | Max Modules |
|---------------|-------------|-------------|
| low | 15 min | 4 |
| medium | 10 min | 3 |
| high | 5 min | 2 |
| none/default | 10 min | 3 |

---

## 10. Data Flow Summary

```
Client sends: { timezoneOffset }
    │
    ▼
generate-mastery-plan (server-side)
    │
    ├── Fetches: daily_checkins, wearable_data, calendar_events,
    │            user_favorites, daily_ritual_completions, profiles,
    │            content_relevance_feedback, user_coach_insights,
    │            coach_accountability_tracker, jit_event_context,
    │            jit_preferences, sanctuary_content + metadata
    │
    ├── Calls: compute-outer-readiness (server-to-server)
    │          ├── Returns: phrase, context, leanOn, watchFor, driver
    │          └── These feed: theme→module mapping, plan brief, content selection
    │
    ├── Computes: HRV × Calendar correlations (30-day history)
    │
    ├── Builds: Time-of-Day Plan
    │   ├── Theme phrase → getModulesFromTheme() → module specs
    │   ├── Calendar context → applyCalendarOverrides() → adjusted specs
    │   ├── generatePlanBrief() → contextual 2-sentence brief
    │   ├── Content selection (scored + deterministic shuffle)
    │   └── getContextualReasoning() → per-card "why" strings
    │
    └── Builds: JIT Pre-Event Plan (if qualifying event found)
        ├── Bridge: jit_event_context → buildEnrichedContextDescription()
        ├── Fallback: legacy scoring → inline context
        ├── Context enrichment (coach commitments, patterns, HRV)
        └── Two-touch module composition (touch_1 vs touch_2)
```
