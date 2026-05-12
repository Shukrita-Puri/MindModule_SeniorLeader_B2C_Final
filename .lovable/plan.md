
# Executive State Operating System — Unified Event & Categorization Architecture

This plan replaces the prior "audit-only" version. It hardens the calendar-event taxonomy across **Smart Nudges, Brief, Signal Pills (Next Up), Mastery Plan, JIT, and Insights Cause-Effect** by re-grounding it on **executive nervous-system demand** (not wellness categories). Output is one shared module that every surface reads from. **No app changes happen yet** — this is the spec for the next build pass, which can be approved once you've reviewed it.

---

## Section A — Why we're restructuring (the shift)

We are building an **Executive State Operating System**, not a wellness app. Every event must carry:
1. **Pillar** (which executive demand it places on the nervous system)
2. **Event Type** (canonical taxonomy)
3. **Demand Profile** (cognitive / emotional / visibility / political / relational / energetic / circadian / identity)
4. **Risk Profile** (what depletes / what spikes)
5. **Timing Mode** (Pre · During · Post — not all events get all three)
6. **Regulation Objective** (Prepare · Prevent · Protect · Recover)
7. **Intervention Type** (Pause · Flow · Reenergise — Reset Studio mapping)
8. **Carry-Forward** (what this event leaves behind for the next demand)

"Lead with leadership demand, not the meeting label."

---

## Section B — The 5 Executive Pillars

| # | Pillar | Priority State | Core Risks |
|---|---|---|---|
| 1 | **Strategic Cognition** | Flow + Clarity | decision leakage, cognitive overload, narrowed thinking, fatigue-driven simplification |
| 2 | **Executive Presence & Influence** | Activated Calm | adrenaline overshoot, emotional hijack, performance anxiety, vocal/cognitive fatigue |
| 3 | **Emotional Load & Leadership Labor** | Regulated Presence | emotional leakage, compassion fatigue, suppression debt, irritability carry-over |
| 4 | **Operational Pressure & Execution** | Controlled Output | attentional fragmentation, NS overload, stress accumulation, reactive lock |
| 5 | **Recovery & Reintegration** | Downregulation + Reset | post-adrenaline crash, emotional residue, sleep disruption, cognitive fatigue debt |

Every event maps to **one primary pillar** and may carry a secondary (e.g. Layoff → P3 primary, P2 secondary).

---

## Section C — Master Event Taxonomy (8 groups)

Single source of truth replacing the 5 divergent keyword lists. **Networking & Community removed** for CEO persona. **School & Family** gated behind future persona flag.

| Group | Canonical Event Types | Primary Pillar |
|---|---|---|
| **A. Governance & Board** | board meeting, board committee, board prep, governance review, earnings review | 1 / 2 |
| **B. Investor & Financial Pressure** | investor meeting, fundraising, earnings call, analyst interview, capital raise, budget review, forecast review | 1 / 2 |
| **C. Strategic & Cognitive Load** | strategy planning, vision setting, deep work block, competitive review, M&A planning, org redesign, product strategy, quarterly planning | 1 |
| **D. Executive Influence & Visibility** | keynote, conference speaking, panel, media interview, podcast, sales presentation, customer keynote, town hall, all-hands | 2 |
| **E. Leadership & People** | leadership sync, executive 1:1, coaching, team review, performance review, difficult conversation, escalation, conflict repair, layoff / restructure, hiring committee | 3 |
| **F. Operational Pressure** | QBR, launch week, crisis response, incident escalation, heavy meeting day, multi-region coordination, back-to-back day | 4 |
| **G. Travel & Circadian Disruption** | long-haul flight, red-eye, cross-timezone trip, conference travel, same-day turnaround, airport / transit compression | 4 / 5 |
| **H. Personal / Boundary / Recovery** | PTO, weekend, recovery day, post-travel day, post-crisis day | 5 |

Each type keyed by stable id (`gov.board_meeting`, `inv.earnings_call`, `trv.long_haul`) so HRV correlation, Cause-Effect heatmap, Mastery-Plan scenarios, Smart-Nudges pattern store all share the **same id**.

---

## Section D — Demand Model (second classification layer)

Each event carries a profile scored 0–3 across 8 dimensions:
`cognitive · emotional · visibility · political · relational · energetic · circadian · identity`

Examples:
- Board meeting → `{cog:3, emo:1, vis:3, pol:3, rel:1, ene:2, cir:0, id:3}`
- Keynote → `{cog:1, emo:1, vis:3, pol:1, rel:0, ene:3, cir:0, id:3}`
- Layoff announcement → `{cog:1, emo:3, vis:2, pol:2, rel:3, ene:2, cir:0, id:2}`
- Long-haul + same-day meeting → `{cog:2, emo:1, vis:0, pol:0, rel:0, ene:3, cir:3, id:0}`

Drives Brief copy (which risk to name), Cause-Effect heatmap dimensions, Smart-Nudges suppression/amplification.

---

## Section E — Pre / During / Post Matrix

| Event Class | Pre | During | Post |
|---|---|---|---|
| Board / Investor / Performance Review / Strategy session | ✅ | — | ✅ (decompression) |
| Long-haul flight / Conference / Offsite / QBR marathon / Crisis room / Launch day | ✅ | ✅ glanceable, ≤30s, optional | ✅ |
| Layoff / Difficult conversation / Escalation | ✅ | — | ✅ (emotional offload, mandatory) |
| Heavy meeting day (5+ in 6h) | ✅ (lightweight) | ✅ (passive) | ✅ |
| Recovery day / PTO / Weekend | — | — | low-intensity awareness only |

**During contract:** passive, glanceable, optional, ≤30s, never "do a session now". Examples: hydration, eye reset, breathing cadence, posture release.
**Post:** mandatory for Pillar 3 events and high-energetic Pillar 2 events. Goals = emotional offload · NS downshift · cognitive clearing · identity decompression · transition support · sleep protection.

---

## Section F — Regulation Objectives

| Objective | Meaning |
|---|---|
| **PREPARE** | optimize upcoming demand |
| **PREVENT** | stop overload before escalation |
| **PROTECT** | maintain state during load |
| **RECOVER** | restore baseline + prep next demand |

Maps to Reset Studio's **Pause · Flow · Reenergise**.

---

## Section G — Logic Engines (additions to §2.11–§2.17)

| Engine | Trigger | Behaviour |
|---|---|---|
| **§2.18 Cognitive Fragmentation** | 5+ meetings in 6h OR <15min gaps | low-friction mode, passive regulation, lightweight nudges |
| **§2.19 Visibility Load Accumulation** | 2+ visibility events within 48h | prioritize sleep / vocal recovery / NS downshift |
| **§2.20 Emotional Carryover** | Pillar 3 event followed by another leadership/social event within 2h | insert decompression bridge |
| **§2.21 Travel Compression** | Flight + same-day high-stakes event | override standard readiness; circadian + hydration + cognitive pacing |
| **§2.22 Executive Overextension** | 3+ consecutive high-stakes days | shift from optimization → preservation mode |
| **§2.23 Identity Pressure Spike** | External visibility + investor/board exposure + poor recovery | reduce performance framing; anchor to steadiness/clarity/presence |

---

## Section H — Noise Filter (kept, but pruned)

**Stays as noise** (no executive intervention needed):
- station, bus, taxi, uber, cab, car service (transport sub-tasks within a travel day — the parent travel day is the intervention point)
- delivery, pick up, dry cleaning, groceries, pharmacy, haircut, mot, oil change, dentist, optician
- reminder, auto-pay, subscription, booking confirmation, ticket, reservation
- placeholder, tentative, hold, blocked, do not book, dnb, no meetings, buffer
- lunch, break, commute (personal block class)
- regex `[\d{6,}]` (calendar tooling artifact)
- "the power of / how to / masterclass / workshop / webinar / course" (unless user is organizer)

**Removed from noise** (now first-class events):
- `flight, airport, boarding, departure, arrival, layover, transit, train` → Group G (Travel arc)
- `out of office, ooo, annual leave, holiday, vacation, pto, away, day off` → Group H (PTO mode)

**Removed from event taxonomy**: Networking & Community (no CEO self-regulation need); School & Family (persona-flagged).

---

## Section I — Selection rule (fixes Leadership-vs-Board NEXT UP bug)

Brief NEXT UP pill, Smart-Nudges anchor, Mastery-Plan lead-event picker share:

```text
candidates = events_today
            .filter(!isNoise)
            .filter(survivesAttendeeOrDurationFloor)

stakesScore(event) = pillarBaseWeight(event.pillar)
                   + demandSum(event.demandProfile) * 5
                   + (engineFlagged(event) ? 20 : 0)

if MAX(stakesScore) >= STAKES_THRESHOLD:
   lead = candidate with MAX(stakesScore); ties → earliest start_time
else:
   lead = earliest start_time
```

Pillar base weights: P1=60 · P2=70 · P3=65 · P4=40 · P5=0 (state, not stake).

A Board (P1 + heavy demand + §2.19 if visibility-stacked) outranks a Leadership 1:1 even if the 1:1 starts earlier — fixes the reported bug.

---

## Section J — Morning vs Evening reframing (NOT wellness)

### MORNING = PREPARE (the day ahead)

Not "wind up". Morning brief / plan / nudge all answer the same four questions about the **day ahead**:
- What is the load ahead (calendar pressure, density, high-stakes events)?
- Where is pressure likely to land (which Pillar dominates today)?
- What must remain protected (cognition, presence, emotional containment)?
- Where is leakage risk (carry-over from yesterday + state today)?

**Inputs (always layered, in this order):**
1. **Current state** — wearable (HRV, RHR, sleep) + check-in (mood, body, energy) → baseline readiness.
2. **Calendar load** — today's events classified by Pillar + Demand Profile + engine flags (§2.18–§2.23).
3. **Carry-forward** — yesterday's residue (Post that didn't close, sleep debt, P3 emotional tail).

**Outputs:**
- leadership readiness (state × load tier)
- regulation strategy (which Objective dominates: PREPARE / PROTECT)
- meeting preparation (Pre-event prompts for the lead event)
- pacing recommendations (gaps, decompression bridges per §2.20)
- friction awareness (where the day is most likely to leak)

Morning is **always forward-looking**: state → load → strategy for the next 12 hours.

### EVENING = RECOVER + REINTEGRATE (NOT "wind down")

Evening references **what just happened today** (load, pressure, lead events, what was carried) AND **prepares for tomorrow** (Sunday → Monday week-prep; weekday → next-day setup).

Four questions:
- What is the leader still carrying (cognitive · emotional · identity)?
- What needs to be mentally closed (open loops, unresolved P3)?
- What should not come into tomorrow (residue, rumination, identity over-fixation)?
- What is forming tomorrow that benefits from intent set tonight?

**Drives:** grounding · pause · decompression · somatic discharge · emotional processing · sleep protection.

**Inputs:** today's classified events (which Pillar dominated, engine flags fired, post-events that need closure) + tomorrow's calendar load preview.

**Sunday evening special case:** Monday week-prep framing — "Monday has X events including {lead event}, here's what to set tonight."

### Weekend / PTO mode

Low-intensity awareness · nervous-system maintenance · identity separation from work · one-touch check-in · optional reflection · Sunday re-entry preparation. Habit continuity preserved **without** performance optimization framing. No "do this practice now"; only "land where you are."

---

## Section K — Insights "Cause & Effect" alignment (HR × Calendar)

The Performance Causality card already runs a **Stress Load** tab driven by per-event-window peak HR delta from `wearable_data.hr_samples`. The new taxonomy plugs in directly:

- **Heatmap rows** = canonical Event-Type ids from Section C (same vocabulary used in Brief / Plan / Nudges).
- **Per-event peak-HR delta** grouped by Pillar (5 swim-lanes): "P2 Visibility events spike HR +18bpm; P3 Emotional events spike HR +12bpm with longer recovery tail."
- **Demand-profile dimensions** (cognitive / emotional / visibility / energetic / circadian) feed the Burnout Risk tab as the source instead of today's hardcoded `load · rhr · hrv · sleep`.
- **HRV × Calendar correlation engine** (already 30-day, ~24 canonical types) re-keyed onto the same canonical ids — no double-bookkeeping.
- **HR × Calendar correlation engine** (new, mirrors HRV engine) added so Stress Load on the card is HR-grounded, not just self-reported. Joins `wearable_data.hr_samples` to `calendar_events` per canonical EventType id, computes per-bucket peak HR delta vs personal baseline + post-event recovery time, and surfaces both into the Cause-Effect card.

Net result: the same Board-meeting bucket that triggered a brief, a nudge and a JIT plan is the cell the user clicks in Insights to see "Board days correlate with HR +22bpm peak and HRV −12% next morning."

---

## Section L — Where this lands in code (single shared module)

One new file: `supabase/functions/_shared/executive-state-taxonomy.ts`

Exports:
- `Pillar` enum + `PILLAR_META` (name, priorityState, risks, baseWeight)
- `EventType` (id, label, group, primaryPillar, secondaryPillar?, demandProfile, timingMatrix, regulationObjective, interventionType)
- `EVENT_TYPE_KEYWORDS` (one map; today's 5 lists merge into this)
- `NOISE_KEYWORDS` + `NOISE_PATTERN` (pruned per Section H)
- `classifyEvent(title, attendees, durationMin, isRecurring) → EventType | null`
- `stakesScore(event, engineContext) → number`
- `selectLeadEvent(events) → EventType | null`
- `buildMorningContext(state, todayEvents, yesterdayCarry) → MorningContext`
- `buildEveningContext(todayEvents, tomorrowEvents, openLoops) → EveningContext`
- Logic-engine evaluators §2.18–§2.23 as pure functions over `DayContext`

Consumers (replace inline lists with imports):
- `smart-nudges/index.ts` — `NOISE_KEYWORDS`, `HIGH_STAKES_KEYWORDS`, `NUDGE_EVENT_TYPE_KEYWORDS`, `classifyEventForPattern`, day-kind detector; Nudge 1 reads `buildMorningContext`, Nudge 3 reads `buildEveningContext`.
- `compute-outer-readiness/index.ts` — `personalBlockPatterns`, `visibilityRegex`, high-stakes selection (replace attendee-only heuristic with `stakesScore`); brief renderer split into Morning vs Evening templates per Section J.
- `generate-mastery-plan/index.ts` — `EXECUTIVE_SCENARIOS` becomes derived (`EventType` × Pillar × Demand → Mastery-Plan modules).
- `generate-jit-events/index.ts` — `NOISE_KEYWORDS`, `PRESSURE_KEYWORDS`, `CLUSTER_KEYWORDS`, `executiveScenarios` (Dim-A/B clusters become Demand-profile lookups).
- `cause-effect-engine/index.ts` — `EVENT_TYPE_KEYWORDS` + Pillar swim-lane projection + new HR × Calendar correlation pass.
- (read-side) HRV × Calendar correlation re-keyed to `EventType.id`.

---

## Section M — What this plan does NOT do

- No code is written in this plan-mode pass. Approve and we land Section L as one shared module + 6 wired-up consumers.
- No UI/visual changes to the pill, brief, or insights heatmap — only the data those surfaces read from.
- Scoring math inside Mastery Plan / JIT unchanged; only the keyword/bucket sources they consume change.
- No DB schema changes. Canonical ids live in code and travel with each release.

Approve and I'll land Section L as the next build pass.
