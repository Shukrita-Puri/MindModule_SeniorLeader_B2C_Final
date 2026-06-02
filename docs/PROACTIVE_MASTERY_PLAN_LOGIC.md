# Proactive Mastery Plan – Technical Documentation

## 1. Purpose & Philosophy

The Proactive Mastery Plan is a **prescription, not a menu**. It answers one question for C-suite leaders:

> "What should I do right now, and why does it matter for me today?"

Every plan is a short, sequenced set of practices (2–4 modules, typically 8–18 minutes) generated server-side from 11 real-time signals. The plan is time-bound, state-aware, and contextually justified – every card explains *why this practice, right now, for you*.

### Core Principles

1. **Prescription over browsing** – Users follow a sequence, not browse a library.
2. **Context-first reasoning** – Every module's reasoning string connects the user's current state (check-in, readiness, calendar) to the practice's purpose.
3. **Plan Brief as directive** – The brief above the cards is 1–2 sentences that frame the entire plan: why these practices were chosen and what they accomplish.
4. **Time-of-Day (ToD) + Just-in-Time (JIT)** – Two complementary pipelines. ToD is proactive (morning/afternoon/evening rhythm). JIT is reactive (specific calendar event approaching).

---

## 2. Signal Architecture (11 Inputs)

All signals are derived **server-side** using the service role key. The client sends only `timezoneOffset`.

| # | Signal | Source | Role |
|---|--------|--------|------|
| 1 | Inner Readiness Tier | `compute-inner-readiness` | depleted/managing/strong/peak – drives module intensity and reasoning |
| 2 | Inner Readiness Score | `compute-inner-readiness` | 0–100 numeric – fine-grained intensity tuning |
| 3 | Check-in Outcome | `daily_checkins` table | thriving/steady/struggling/drained – personalises reasoning language |
| 4 | Outer Readiness Phrase | `compute-outer-readiness` | Theme phrase driving module selection via `getModulesFromTheme()` |
| 5 | Outer Readiness Driver | `compute-outer-readiness` | Theme driver context |
| 6 | Calendar Load | `compute-outer-readiness` | extreme/heavy/moderate/light – adjusts duration ceiling and module focus |
| 7 | Calendar Pressure | `compute-outer-readiness` | Pressure context tag |
| 8 | Calendar Events | `calendar_events` table | Raw events for scenario detection and meeting count |
| 9 | Favorites | `user_favorites` table | Boosted in content scoring (+3 points) |
| 10 | Completed Today | `daily_ritual_completions` | Excluded from selection to avoid repetition |
| 11 | Coach Insights | `coach_pattern_observations` | Pattern-aware content matching |
| 12 | Wearable Sleep Score | `wearable_data.sleep_score` | When < 70: woven into plan brief and reasoning strings |
| 13 | Wearable HRV | `wearable_data.hrv` | Deviation from 30-day baseline; when < -10%: prioritised in briefs |
| 14 | Wearable Resting HR | `wearable_data.resting_heart_rate` | Available for future reasoning enrichment |

Additional derived signals: `archetype`, `practicePriorityTag`, `pressureContextTag`, `effectiveContent`, `patternInsight`, `wearableContext`.

---

## 3. Plan Brief

The Plan Brief replaces the old `calendarMessage` (which was a density label like "Deep Recovery (8 meetings, 6 hrs)"). It now produces a 1–2 sentence contextual statement.

### Function: `generatePlanBrief(ctx, timeOfDay, innerReadinessTier, checkInOutcome, calendarLoad)`

### Logic by Time × State

| Time | Condition | Example Output |
|------|-----------|----------------|
| Evening | Heavy calendar | "You checked in as drained after 8 meetings. This sequence is designed to release what you carried today and protect tomorrow's capacity." |
| Evening | Light/no calendar | "This evening sequence helps you close the day with intention and prepare your mind for tomorrow." |
| Morning | Heavy calendar | "Your readiness is steady but 6 meetings lie ahead. These practices build the composure and focus to sustain you through a dense day." |
| Morning | Light calendar | "You're at peak readiness with a light day ahead. These practices channel that clarity into deliberate intention." |
| Afternoon | Meetings remaining | "Your readiness is above baseline with 2 meetings still ahead. This sequence sharpens your edge for the stretch that remains." |

### UI Rendering

- Displayed in a `bg-muted/20 rounded-lg px-3 py-2` container below the period label
- `text-[13px] font-medium leading-relaxed` – visible on mobile
- `min-h-[20px]` prevents collapse on small viewports

---

## 4. Module Reasoning (Per-Card Contextual Justification)

### Function: `getContextualReasoning(moduleType, focus, innerReadinessTier, checkInOutcome, calendarLoad, timeOfDay)`

Every reasoning string answers: **"Why this practice, right now, for you?"**

### Examples by Focus × State

| Focus | State | Reasoning |
|-------|-------|-----------|
| composure | depleted | "Your check-in flagged tension – this settles your nervous system before what's ahead" |
| composure | dense calendar | "A dense calendar demands composure – this practice steadies you for high-stakes moments" |
| release | evening + heavy | "After a heavy day, this helps discharge accumulated stress so it doesn't carry into tomorrow" |
| focus | dense calendar | "With a dense calendar, this narrows your attention to what genuinely matters next" |
| confidence | strong/peak | "Your readiness is high – this practice channels that into visible, confident presence" |
| restore | depleted | "Your energy reserves are low – this practice is designed to replenish, not just relax" |

### UI Rendering

- `text-[12px] font-medium` (upgraded from `text-[11px] italic`)
- `line-clamp-3` safety net (upgraded from `line-clamp-2`)
- Reasoning is the most important text on the card – it justifies the prescription

---

## 5. Theme-to-Module Mapping

The Outer Readiness phrase (e.g., "Protect your composure today") drives initial module selection via `getModulesFromTheme()`. Keywords in the phrase map to module configurations:

| Keyword | Module Config |
|---------|---------------|
| composure, calm, steady | Regulate (composure) + Align (grounding) |
| focus, clarity, sharp | Regulate (grounding) + Align (focus) |
| confidence, presence | Regulate (composure) + Align (confidence) |
| release, let go, recover | Regulate (release) + Align (grounding) |
| restore, replenish | Regulate (restore) + Align (grounding) |

Calendar density overrides then adjust intensity, duration, and focus based on actual meeting load via `applyCalendarOverrides()`.

---

## 6. Content Selection Scoring

Content is scored against module specs using weighted criteria:

| Factor | Weight | Description |
|--------|--------|-------------|
| Category match | +5 | Content category matches module type |
| Tag match | +3 | Content tags match focus area |
| Favorite | +3 | User has favourited this content |
| Intensity match | +2 | Content intensity matches spec |
| Duration fit | +2 | Content duration fits spec window |
| Previously effective | +2 | Content in user's effective content list |
| Already completed today | -10 | Excluded from selection |
| Used in JIT plan | -10 | Excluded to avoid repetition |

Selection uses deterministic shuffling (daily hash) to provide variety across days.

---

## 7. Duration Ceiling Rules

| Calendar Load | Max Duration | Max Modules |
|---------------|-------------|-------------|
| extreme | 12 min | 3 |
| heavy | 15 min | 3 |
| moderate | 18 min | 4 |
| light | 20 min | 4 |
| none | 20 min | 4 |

---

## 8. Coach Card Inclusion Logic

Coach cards are added as `prepare` (morning/afternoon) or `integrate` (evening) modules when:

1. User has favourited coach content, OR
2. A high-priority event is within 4 hours, OR
3. Pattern insight has 3+ observations, OR
4. Inner readiness is depleted with score < 35

Evening always includes an integrate coach card for "Tiny Win & Reflection".

---

## 9. JIT Pipeline

The Just-in-Time (JIT) plan is event-driven and operates alongside the ToD plan:

1. Calendar events are scanned for scenario keywords (board, investor, pitch, etc.)
2. Events within the time horizon (configurable, typically 4–24 hours) trigger JIT plans
3. JIT modules have event-specific reasoning (e.g., "Settle your body before [Event Title]")
4. JIT content IDs are excluded from ToD selection to avoid duplication
5. JIT plans surface in the `JitCarousel` component, separate from the ToD carousel

### JIT Context Description (5-Signal Cascade)

Built from: Bucket (interpersonal/decision/transition) → Coach Memory → HRV Deviation → Urgency → Historical Correlation.

---

## 10. Executive Scenarios

Predefined high-stakes scenarios with custom module configurations:

| Scenario | Trigger Keywords | Key Modules |
|----------|-----------------|-------------|
| Pre-Board Meeting | board, board of directors | Regulate (composure) + Align (confidence) + Prepare |
| Pre-Investor Meeting | investor, vc, funding, pitch | Regulate (composure) + Align (confidence) + Prepare |
| Pre-Client Meeting | client, customer, proposal | Regulate (composure) + Align (focus) |
| Crisis Response | crisis, urgent, emergency | Regulate (composure) + Align (grounding) |
| M&A / Due Diligence | m&a, merger, acquisition | Regulate (focus) + Align (confidence) |

---

## 11. Connection to Outer Readiness Brief

The Outer Readiness Brief provides the *theme phrase* that seeds the entire plan. The relationship:

```
Outer Readiness Brief (theme phrase)
  → getModulesFromTheme() (module selection)
    → applyCalendarOverrides() (density adjustments)
      → generatePlanBrief() (contextual framing)
        → getContextualReasoning() (per-card justification)
```

The Plan Brief references the same readiness tier and calendar density that the Outer Readiness Brief used, ensuring narrative consistency between "what your day looks like" and "what you should do about it".

---

## 12. Wearable Signal Integration

### Data Source

The edge function fetches the latest row from `wearable_data` where `summary_date` is within 24 hours. Fields used:

| Field | Type | Purpose |
|-------|------|---------|
| `sleep_score` | integer | When < 70: flagged in plan brief and reasoning |
| `hrv` | numeric | Compared to 30-day rolling average; deviation < -10% is notable |
| `resting_heart_rate` | integer | Available for future enrichment |
| `sleep_quality` | text | Available for future enrichment |

### HRV Deviation Calculation

```
baseline = average(last 30 rows of hrv for this user, min 5 rows)
deviation_pct = ((current_hrv - baseline) / baseline) * 100
```

### Thresholds for Inclusion

| Signal | Threshold | Effect |
|--------|-----------|--------|
| Sleep score < 70 | Poor sleep | Woven into plan brief and per-card reasoning |
| HRV deviation < -10% | Low HRV | Woven into plan brief and per-card reasoning |
| HRV deviation > +5% | Recovered HRV | Mentioned positively in plan brief |
| Sleep score >= 80 | Good sleep | Mentioned positively in plan brief |

### Priority Hierarchy

When multiple signals are available, the reasoning prioritises:
1. **Wearable** (objective physiological data)
2. **Check-in** (subjective self-report)
3. **Calendar** (contextual load)
4. **Generic** (fallback when no signals available)

When wearable data is unremarkable (within normal range) or absent, the system falls back to check-in/calendar reasoning with no regression.

### Example Briefs with Wearable Data

| Scenario | Brief |
|----------|-------|
| Depleted + poor sleep + heavy calendar | "You checked in as drained after 8 meetings and your sleep score is below baseline. This sequence is designed to release what you carried today and protect tomorrow's capacity." |
| Managing + low HRV + heavy calendar | "Your readiness is steady and your HRV is below baseline but 6 meetings lie ahead. These practices build the composure and focus to sustain you through a dense day." |
| Strong + recovered HRV + light calendar | "You're above baseline with recovered HRV with a light day ahead. These practices channel that clarity into deliberate intention." |

### Example Reasoning with Wearable Data

| Focus | Wearable Signal | Reasoning |
|-------|----------------|-----------|
| composure | Low HRV | "Your HRV is below baseline – this settles your nervous system before what's ahead" |
| release | Poor sleep (evening) | "Your sleep was disrupted last night – this practice helps discharge residual tension before rest" |
| restore | Poor sleep + depleted | "Your sleep score and check-in both flag low reserves – this practice replenishes at the deepest level" |
| focus | Poor sleep | "Your sleep was below baseline – this practice compensates by sharpening cognitive focus" |

---

## 13. Typography Standard

All AI-generated text in the Mastery Plan (plan briefs, reasoning strings, context descriptions) uses the en-dash (–) and never the em-dash (—), per the project-wide typography standard.

## 14. v5.1 — Strategic-Aware Slot Model (no UI changes)

The Plan now runs a **server-only slot model** layered on top of existing horizon logic.

**Internal slot purposes** (never shown as labels):
- `start_of_day` — prep for today's stress patterns + strategic goal.
- `jit` — pre-event regulation; capped at a 24h MVP ceiling (`MVP_JIT_HORIZON_MINUTES = 1440`).
- `end_of_day` — strategic decompression, sleep, accountability.
- `state-management` — fallback when no qualifying JIT exists in 24h.

**Morning ↔ JIT fusion**: when `slotKind === 'start_of_day'` and a board-level event sits ≤4h ahead, the same slot's Why weaves both day-prep and event-prep — no extra slot.

**Why-this-matters composition** (deterministic, no LLM):
`{strategicAnchor}. {tacticalPattern}. {immediateSignal}. → {actionVerb} {forContext}.`
- Strategic: coach growth_area, practicePriorityTag, plus CEO-Reality reframes.
- Tactical: post-peak hangover, patternInsight streak, hrvCorrelations, declining trend.
- Immediate: wearable signals, low clarity/confidence, dense calendar.

**Anti-duplication with the Brief**: `buildBriefClaimSet()` extracts numbers, named events, and lexicon clusters from the cached brief. Any clause that overlaps is dropped; if every clause overlaps, the Why opens with "Following your brief: …" and goes straight to the action verb. The Plan never restates the Brief.

**CEO-Reality awareness** (deterministic on calendar + wearable + check-in):
| Tag | Detection |
|---|---|
| `public_holiday` | calendar matches `/(public holiday\|bank holiday)/i` |
| `personal_pto` | calendar matches `/(ooo\|out of office\|vacation\|annual leave\|pto)/i` |
| `circadian_travel` | calendar matches `/(flight\|airport\|red-eye\|long haul)/i` in 48h |
| `board_outcome` | calendar matches `/(board\|investor\|vc\|earnings\|town hall\|all-hands\|keynote)/i` in 24h |
| `veto_risk` | wearable HRV<-10% or sleep<65 AND self-decl clarity/confidence ≥4 |
| `decision_leakage` | (HRV<-15 or self-decl depleted/managing) AND drain event in 24h |
| `post_peak_hangover` | yesterday score ≥75 AND ≥10pt drop today |
| `personal_friction` | Sun pm / Mon am declining self-decl, no wearable degradation |

All of these are **inline qualifiers inside Why-text** — never new UI badges.

**Step-card context line** is now a 2–4-word sequence rationale derived from ordered `practiceTypes` (e.g. `regulate→align` = "Ground first." / "Then sharpen."). Same UI slot, crisper content.

**Strategic event-scoring boosts** (additive to existing scores):
- +15 if event matches `coach_pattern_observations.growth_area`.
- +10 if event matches `practicePriorityTag`.
- +10 if event has historical HRV impact >10%.

**UI contract — explicitly unchanged**: no slot-name chips, no brief-reference top line, no new holiday/PTO/jet-lag badges. The visible deltas are confined to (a) the Why-this-matters body and (b) the step card context line.

---

## 15. v5.2 — Stateful Plan, Per-Priority Queues, JIT v2 (shipped)

The v5.1 slot model is extended by four behaviors that are live in production but were not yet documented above. None of them change the visible chrome.

### 15.1 Stateful plan evolution (ledger)

The day's plan is a persistent ledger keyed by `(user_id, ritual_date)`, stored in `daily_ritual_completions.plan_ledger` (JSONB, service-role write only via trigger guard). Every `generate-mastery-plan` call:

1. Reads the earliest same-day ledger row.
2. Unions `completed_practice_ids` across **all** of today's `session_period` rows.
3. Merges fresh-derived horizon slots with the ledger:
   - **Sticky completion** — a slot whose primary practice is in the union stays verbatim with ✓ in its `slotIndex`.
   - **JIT anchor (adaptive)** — a slot bound to a calendar event that is still on today's calendar keeps `slotIndex`, `jitEventTitle`, `horizon`, `isJit`; practices, `whyLine`, and `timeLabel` refresh from the matching fresh slot (same WHAT, different HOW).
   - **Otherwise** — recompute from fresh.
4. **Unfinished-business rule** — as long as any ledger slot is incomplete, the new plan evolves the ledger; it never replaces it wholesale.
5. **Bonus Round** — when all 3 ledger slots are complete and a later brief regenerates, hand off to a brand-new plan and emit `ledger.victoryLine` ("3/3 complete. Bonus priorities to keep momentum."). Header label becomes "Today's 3 · Bonus Round".

Observability: response includes `ledger: { source, carriedSlots, anchoredSlots, completedSlots, victoryLine? }`.

Client (`TodayThreePriorities`): `checkCompletion` and cache-hydration use `getTodayCompletedUnion()` so morning ✓ persists into the afternoon view.

### 15.2 Per-priority queue contract

Each of the 3 priorities owns its own queue. The micro-practice player tracker is scoped to a single slot — completing practice 2 of slot 1 does not advance slot 2. Feedback (relevance/effectiveness) is recorded against the originating slot only, so scoring boosts (+2 "previously effective") accumulate per priority rather than globally.

### 15.3 JIT Selection v2 (triangulated tiers)

JIT candidate selection is now a triangulated selector across three tiers, applied within the 24h MVP horizon:

| Tier | Source signal | Weight behavior |
|---|---|---|
| Immediate | Real-time wearable + check-in deltas | Dominant in cold-start / sparse-pattern users |
| Tactical | `causality_findings` patterns (≥3 observations, personal noise excluded) | Weight grows as the pattern store matures |
| Strategic | Coach `growth_area`, `practicePriorityTag`, executive scenario keywords | Constant additive boost (+10 to +15) |

Tier weights **shift Immediate → Tactical** as the user accumulates validated patterns. Patterns are read from `causality_findings.signal_summary` (the unified pattern store) — they are never recomputed inline. Personal-noise findings (single-event, low confidence) are excluded from the selector even if present.

### 15.4 Window context split + behavior snapshot

`build-daily-context-orchestrator` produces `daily_context_snapshot` as the single source of truth. The plan no longer builds its own window context: it consumes the morning / afternoon / evening pure builders from the shared **behaviour-snapshot** layer that also feeds the Brief and Smart Nudges. This guarantees the Plan's `slotKind` reasoning and the Brief's tier label never diverge for the same window.

### 15.5 Unified pattern store

All proactive-pattern reads (Tactical JIT tier, post-peak hangover detection, HRV-correlation reasoning, coach insight surfacing) go through `causality_findings.signal_summary`. Edge functions must not query `coach_pattern_observations` directly for pattern matching — that table is for raw observations only.

### 15.6 Inline mindset reflection capture

Mindset-protocol step cards in the player render an optional auto-saved textarea. Drafts are stored in `useReflectionDraft` and flushed to `daily_ritual_completions.reflection_notes` on practice completion. The reflection text is then available to the next day's plan as a strategic-anchor input when the user references it.

---

## 16. Documentation status

- Sections 1–13 reflect the original v3.0–v4.0 system.
- Section 14 covers v5.1 (slot model, CEO-Reality, anti-duplication).
- Section 15 covers v5.2 (ledger, per-priority queues, JIT v2, window split, unified pattern store).
- The companion file `.lovable/proactive-mastery-plan-documentation.md` (v3.0) is retained for its edge-function inventory, DB-table reference, and historical audit; it is **not** updated for v5.x feature work — this file is canonical for current behavior.
