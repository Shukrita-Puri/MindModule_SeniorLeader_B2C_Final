# Generate Mastery Plan — Single Source of Truth

**Document version:** v1.0
**Last updated:** 2026-06-04
**Owner:** Plan / Signal Engine
**Supersedes:** `docs/PROACTIVE_MASTERY_PLAN_LOGIC.md`, `docs/MASTERY_PLAN_CONTEXT_LOGIC.md`, `.lovable/proactive-mastery-plan-documentation.md` (retained for history only — this file is canonical).
**Companion plan:** `.lovable/plan.md` (Brief + Plan refactor scope; this doc reflects the post-refactor state).

> When this document and any older Plan doc disagree, **this document wins**. Update this file in the same PR that changes Plan behaviour.

---

## 0. What "the Plan" is

`generate-mastery-plan` is the edge function that builds **Today's 3 Performance Priorities** for the Executive Home. Each priority is a single, time-anchored coaching action with:

- a **title** (deterministic, CEO-behaviour-first verb + executive objective + event anchor),
- a **why-this-matters line** (LLM-written, ≤25 words, grounded in the same signals the Brief used),
- an **arc badge** (`Prepare` / `During` / `Recover` / `Steady`),
- one or more **practices** (modules) the user can complete inline.

The Plan is **deterministic at the core** (selection, slot allocation, dedupe, ledger merge). LLM usage is bounded: it writes the per-priority Why line and contextual coach copy only — **never** the priority itself, the practice, or the ordering.

---

## 1. Shared-module wiring (Brief ↔ Plan parity)

The Plan does **not** rebuild context. It reads the same `behaviour snapshot` the Brief reasoned over, keyed by `(user_id, local_date, time_window)`.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  _shared/signal-engine/build-daily-context.ts   (single producer)        │
│  → daily_context_snapshot { HRV bundle, 3-day load, DOW history,         │
│                             demand, pattern signals, strategic context } │
└────────────────────────────┬─────────────────────────────────────────────┘
                             │
        ┌────────────────────┴─────────────────────┐
        ▼                                          ▼
  window-context.ts (dispatch)              behaviour-snapshot.ts
   ├─ morning-context.ts                    evaluateForScope(brief)
   ├─ afternoon-context.ts                  evaluateForScope(plan)
   └─ evening-context.ts                    → {flagsBrief, flagsPlan,
                                              slotBoosts, promptBlockBrief,
                                              promptBlockPlan, taxonomyBlock,
                                              signatureHash}
        │                                          │
        ▼                                          ▼
  compute-outer-readiness  ── writes brief_snapshots (input_signature = signatureHash)
        │
        ▼
  generate-mastery-plan  ── reads loadBriefBehaviourSnapshot(expectedSignatureHash)
                            falls back to buildBehaviourSnapshot(...) only if missing
                            mismatch → 409 STALE_SNAPSHOT (client refetches Brief)
```

**Hard rules:**

1. Plan **must** import `snapshotToWiring` from `_shared/load-brief-behaviour-snapshot.ts` and apply `slotBoosts` via `applySlotBoostsToMapping(...)`. It must **not** call `evaluateForScope` directly.
2. The same `signatureHash` is stamped on the plan response and on every emitted slot's `briefAnchor` metadata.
3. `briefAnchorEventTitles(snapshot)` is consulted to re-rank JIT candidates so any event the Brief named as high-stakes is guaranteed to surface in the Plan.
4. `EVENT_TAXONOMY` and `ACTIVE CEO BEHAVIOURS` blocks from the snapshot are forwarded verbatim into the LLM Why-line prompt (see §6).

### Window contexts (Morning / Afternoon / Evening)

- **Morning (05:00–11:59 local)** — overnight HRV + RHR + sleep, yesterday's load, today's calendar, recovery note. **No intraday HR.**
- **Afternoon (12:00–17:59)** — adds intraday HR average + latest HRV; surfaces midday divergence flags; may downgrade or rebuild a slot.
- **Evening (18:00–04:59)** — afternoon HR avg + latest HRV + tomorrow's pressure; toggles `mode = 'jit_remaining'` when an unfinished JIT prep still has runway (suppresses Close framing, directs user toward completing JIT first).

All three are **pure** functions over pre-fetched inputs. They are dispatched by `window-context.ts` based on local hour. Plan consumes the window context indirectly via the behaviour snapshot, never by calling these modules a second time.

---

## 2. Input signals (everything the Plan reads)

| Source | Field(s) | Used for |
|---|---|---|
| `PlanRequest` body | `userId`, `timeOfDay`, `innerReadinessTier`, `innerReadinessScore`, `checkInOutcome`, `outerReadinessPhrase`, `practicePriorityTag`, `growthIntention`, `calendarEvents[]`, `selectedCalendarEventIds`, `slotReplacements`, `coachInsights[]`, `expectedSignatureHash`, optional inline `behaviourSnapshot` | Top-level inputs |
| `brief_snapshots` | `input_signature`, `promptBlockPlan`, `slotBoosts`, `taxonomyBlock`, `briefAnchorEventTitles` | Brief↔Plan parity |
| `jit_event_context` | pre-scored events from the **new pipeline** (see §3) | Primary JIT scoring path |
| `causality_findings.signal_summary` | gated patterns (≥3 check-ins) | Why line + plan boosts |
| `daily_ritual_completions.plan_ledger` | sticky completion + JIT anchors | Stateful evolution (§7) |
| Content library (`master_practices`, etc.) | practices with tags, duration_band, foundational flag | Module selection |
| Wearable (`wearable_daily_aggregates`) | HRV / RHR / sleep / divergence | Window context inputs |
| `attendee_relationships` | resolved role per email | **JIT v2 only** (shadow mode) — see §3.4 |

---

## 3. Scoring pipeline — **New pipeline (Bridge)** and what is dead

The Plan has **one** scoring entry point: `getPreScoredEvents(...)`. It prefers the new pipeline and falls back only when the new pipeline has nothing to offer.

### 3.1 New pipeline (the Bridge)

```text
jit_event_context (written upstream by the JIT pipeline)
  │   shown_in_jit = true, updated_at within last 12h, event_start ≥ now,
  │   order by final_score desc, limit 5
  ▼
getPreScoredEvents()
  │  per row:
  │   • Educational + non-organiser? → hard BLOCK (no override)
  │   • Compute getActionWindow(minutesUntil):
  │       touch1 (6–48h) | touch2 (0–6h) | selection_only (>48h)  → exclude selection_only
  │   • Per-touch dismissal: drop if dismissed_horizons.includes(touchLabel)
  │   • Build enriched context via buildEnrichedContextDescription()
  │     using jit_bucket_primary/secondary, coach memory, HRV correlation,
  │     jit_confidence_score → jitConfidenceBand
  │   • Map scenario via scenarioIdFor() → EXECUTIVE_SCENARIOS
  ▼
ScoredEvent[] (already carrying jitBucketPrimary / jitDimensionScores / jitConfidenceBand)
  │
  ├─ v5.1 24h MVP horizon ceiling   filter (minutesUntil ≤ MVP_JIT_HORIZON_MINUTES)
  ├─ Strategic boost                 (+15 growth_area, +10 priorityTag, +10 |HRV dev|>10)
  ├─ rankJitCandidates()             (event, phase) ranking against §3/§4
  └─ Brief-anchor re-rank            stable-sort anchored titles to the top
```

### 3.2 Legacy fallback (still present, intentionally last-resort)

`scoreCalendarEventsShared()` → `scoreCalendarEventsLegacy()` runs **only** when no rows exist in `jit_event_context`. It uses `attendees_count`, `is_organizer`, `is_recurring`, `event_metadata` and the older `computeLegacyDimA / DimB` helpers (`inferRelationshipTag`, etc.). It is logged with `Bridge: no pre-scored events, falling back to shared ranked-candidate scoring` so we can monitor how often it actually runs.

**Status:** the legacy scorer **has not been deleted**. It remains as a defensive fallback while we confirm 100 % coverage of `jit_event_context` writes upstream. Attendee/organiser references in `index.ts` (≈ lines 1278, 1293, 1727, 1860, 2253–2285, 4719) belong to this fallback **and** to the JIT v2 shadow runner (§3.4). They are **not** part of the New Pipeline.

**Sunset plan:** once `jit_event_context` coverage telemetry stays at 100 % for 14 days, delete `scoreCalendarEventsLegacy`, `computeLegacyDimA/B`, `inferRelationshipTag`, and the post-event attendee enrichment block; then drop `attendees_count` / `is_organizer` from the `ScoredEvent` type. The Bridge wrapper survives — only the fallback body is removed.

### 3.3 Top-event selection (post-scoring)

`rankJitCandidates` produces `(event, phase, score)` tuples. The first candidate whose `phase === 'pre'` and `score ≥ JIT_THRESHOLD_UNIFIED` becomes `topEvent`, **provided** its action window is `touch1` or `touch2`. If none qualifies, a defensive loop over `filteredEvents` does the same selection on the legacy ordering.

### 3.4 JIT v2 shadow runner

Behind `JIT_V2` env (`shadow` / `on` / `off`). Runs `selectJitCandidates()` from `_shared/jit/select-jit.ts` using:

- `account age` (maturity tier),
- `causality_findings.signal_summary` (canonical pattern store),
- resolved attendee roles from `attendee_relationships` (boss / client / junior / vendor / unknown),
- `relationship-weights.ts` and `tactical-signals.ts`.

It **only** writes `shadow_v2_*` columns onto `jit_event_context` for parity comparison; it never changes user-visible output until PR 2.

---

## 4. Arc allocation and duplicate-event dedupe

Each scored event can occupy at most **one** visible plan slot **unless** its category in `EVENT_PHASE_MAP` declares multiple phases AND the second slot's phase is distinct AND ≥12h separates the two arcs.

- Anchor identity = `eventId` when present, else `normalize(jitEventTitle) + startTimeBucket`.
- `CATEGORY_MAX_SLOTS` is the upper bound (A=2, F=2, G=2, rest=1).
- Each surviving second-arc slot carries an `arcLabel ∈ {Prepare, During, Recover, Steady}` that the UI renders as a muted chip beside the priority number.
- Any extra occurrence is either replaced by an unused module from the fresh-horizon pool, or stripped of JIT metadata (`isJit:false`, `jitEventTitle:null`, `jitPhase:null`) so the practice survives but the duplicate anchor disappears.
- Every dedupe action is logged with `[generate-mastery-plan] dedupe …` for observability.

---

## 5. Slot model and temporal gating

- **3 horizon slots** per response (Today's 3). Slot 1 = morning anchor or pre-event JIT; Slot 2 = midday adaptive; Slot 3 = integrate / Tiny Win.
- **Time bucket** (`getTimeOfDay`): Morning 05–11, Afternoon 12–17, Evening 18–23, Early Hours 00–04.
- **Reflection Corner / Tiny Win** is restricted to **18:00–22:59 local**. Between **00:00–04:59** the server rewrites the practice to **"Sleep Prep & Tomorrow Framing"**; outside both windows, integrate falls back to a forward-looking framing practice. See `mem/features/mastery-plan/temporal-gating.md`.
- Slot 2 may rebuild in the afternoon when wearable + check-in signals show divergence — this is the Midday Regeneration Trigger.
- Module eligibility: per `mem/features/mastery-plan/module-eligibility-standards.md` (e.g. Sleep Prep never in morning).

---

## 6. Title + Why-line generation

### 6.1 Title (deterministic, no LLM)

`buildPriorityTitle(...)` in `_shared/plan/title-prefixes.ts`:

```
{verb} {executive objective} {connector} {event name}
```

- **Verb** comes from `verbForCategoryPhase(category, phase)`:
  - `pre`: A=Lead, B=Present, C=Decide, D=Steady, E=Steady, F=Present, G=Reframe, H=Steady
  - `during`: Hold
  - `post`: A|D=Reset, F|G=Recover, else Land
- **Executive objective** comes from `executiveObjectiveFor(practicePriorityTag, category, phase)`:
  - `regulation_composure` / `regulation_early` → "composed presence"
  - `recovery_resilience` → "focused recovery"
  - `energy_endurance` → "sustained energy"
  - `focus_clarity` → "strategic clarity"
  - `mindset_reframe` → "decisive alignment"
  - else phase/category default
- **Connector**: `pre` → "in", `during` → "through", `post` → "after".
- **Event name** shrunk to ≤4 identifying tokens via `shrinkEventName`.
- **Hard cap**: 10 words.

Examples:
- *"Lead strategic clarity in tomorrow's Board Meeting"* (A · pre · regulation_composure)
- *"Reset after the Board Meeting"* (A · post)
- *"Steady presence in the Shukrita/Tom feedback"* (D · pre · focus_clarity)
- *"Steady sustained focus for the day ahead"* (no event anchor)

### 6.2 Why line (LLM — Gemini Flash via Lovable AI Gateway)

`generateWhyStatement()` in `_shared/plan/why-llm.ts`. Three Why lines are written in parallel (`Promise.all`).

**Model:** `google/gemini-3-flash-preview`. Temperature 0.

**Prompt contract (exact):**

- Persona: *"You are the Chief of Staff for a CEO."*
- Output: a single statement, **≤25 words**, no preamble, no quotes.
- Must be **specific to this event** (never generic).
- Must reference **at least one** of the non-null signals listed in the prompt.
- Must name what this priority **PREVENTS** or **PREPARES** — pick the dominant one, never both.
- Tone: Chief of Staff briefing a CEO. **Forbidden:** "important", "remember to", "make sure", "today is a great day", any wellness-style softener, any clinical/score language.
- Signals passed (skipped if null): HRV Δ%, sleep score, RHR trend, travel debt, stress load, burnout risk, mind state, body state, pattern summary, growth intention.
- Shared advisory appended verbatim from the Brief snapshot: `=== EVENT TAXONOMY ===` first, then `=== ACTIVE CEO BEHAVIOURS ===`. When an active behaviour names this exact event, the prompt explicitly instructs the model to **align** to the anchor without echoing the `copyHint`.

### 6.3 Tone & manner (applies to all Plan copy)

- Confident, directive, performance language. No softeners ("try to", "consider", "maybe").
- Permitted confident directives: "go", "pace it", "save it".
- Never echo the readiness score or tier.
- Markdown emitted by the LLM is passed through `stripBriefMarkdown(...)` from `_shared/text/sanitise.ts` to remove stray `*` / `_` while preserving valid `**bold**`.

---

## 7. Stateful Plan Ledger (sticky completion + JIT evolution)

Per `mem://architecture/stateful-plan-evolution`. The Plan is a persistent ledger keyed by `(user_id, ritual_date)` stored in `daily_ritual_completions.plan_ledger` (JSONB, service-role write only).

On every `generate-mastery-plan` call:

1. Read the earliest same-day ledger row.
2. Union `completed_practice_ids` across all today's session_period rows.
3. Merge fresh-derived horizon slots with the ledger:
   - **Sticky completion** — slot whose primary practice is in the union stays verbatim with ✓.
   - **JIT anchor (adaptive)** — slot bound to an event still on today's calendar keeps `slotIndex`, `jitEventTitle`, `horizon`, `isJit`. Practices, `whyLine`, `timeLabel` refresh from the matching fresh slot (same WHAT, different HOW).
   - **Otherwise** — recompute from fresh.
4. **Unfinished-business rule** — as long as any ledger slot is incomplete, evolve the ledger; never replace wholesale.
5. **Bonus Round** — when all 3 ledger slots are completed and a new brief is later generated, hand off to a brand-new plan and emit `ledger.victoryLine = "3/3 complete. Bonus priorities to keep momentum."`. Header switches to "Today's 3 · Bonus Round".

Observability: `ledger: { source, carriedSlots, anchoredSlots, completedSlots, victoryLine? }` is returned in the plan response and logged server-side.

---

## 8. Response contract (what the client receives)

```ts
{
  signatureHash: string,         // matches brief_snapshots.input_signature
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  horizonModules: HorizonModule[], // 3 priorities
  calendarPills: { label, eventId, priorityScore, timePill }[], // <= 2
  preEventPlan: { topEvent, modules, coachCard, ... } | null,
  coachCard: { ... } | null,
  ledger: { source, carriedSlots, anchoredSlots, completedSlots, victoryLine? },
  observability: { briefAnchorsApplied, dedupeActions, fallbackUsed }
}

type HorizonModule = {
  slotIndex: 1 | 2 | 3,
  title: string,                 // from buildPriorityTitle
  whyLine: string,               // from generateWhyStatement (LLM)
  arcLabel: 'Prepare' | 'During' | 'Recover' | 'Steady',
  timeLabel: string,             // Morning / Afternoon / Evening / Early Hours
  isJit: boolean,
  jitEventTitle: string | null,
  jitPhase: 'pre' | 'during' | 'post' | null,
  practices: PracticeRef[],
  completed: boolean,
}
```

---

## 9. Downstream clients

| Surface | File(s) | Reads |
|---|---|---|
| Executive Home — Today's Performance Priorities | `src/components/home/TodayThreePriorities.tsx`, `src/pages/ExecutiveHome.tsx` | `horizonModules`, `arcLabel`, ledger flags |
| Plan Page | `src/pages/PlanPage.tsx` | full plan response |
| Practice Player (inline completion) | `src/pages/MicroPracticePlayer.tsx` | `practices[]` per slot |
| Sidebar nav | `src/components/navigation/LeftSidebar.tsx` | "Today's Performance Priorities" label |
| Insights · Progress | `src/components/insights/LeadershipPatternsCard.tsx` | snapshot history |
| Smart Nudges | `supabase/functions/smart-nudges/...` | `slotBoosts` + same snapshot — no re-evaluation |

Client caching: the plan response is invalidated when either `behaviourSnapshot.signatureHash` or `wearableStatus.sourceRowDate` changes.

---

## 10. Error envelopes

| Code | Meaning | Client action |
|---|---|---|
| `409 STALE_SNAPSHOT` | Inline `behaviourSnapshot.signatureHash` does not match the most-recent `brief_snapshots.input_signature` | Refetch Brief, retry Plan |
| `412 SNAPSHOT_REQUIRED` | Neither inline snapshot nor a persisted Brief snapshot exists for `(user, local_date, window)` | Request Brief generation first |
| `500` | Internal failure | Surface fallback empty state; do not silently use legacy path |

No "best effort" merging. No silent stale path.

---

## 11. Observability checklist

The function logs one line per major decision. Search prefixes in edge function logs:

- `[generate-mastery-plan] Bridge: ...` — new pipeline lookup result
- `[generate-mastery-plan] Calendar: ...` — scored/filtered counts + top event
- `[generate-mastery-plan] topEvent selected from ...` — shared ranking vs legacy fallback
- `[generate-mastery-plan] dedupe ...` — duplicate-event resolution
- `[generate-mastery-plan] JIT reordered for brief anchors=...` — Brief-anchor re-rank
- `[generate-mastery-plan][jit-v2-shadow] ...` — JIT v2 parity
- `[behaviour-wiring] scope=plan flags=N boosts=M rules=...` — snapshot consumption

---

## 12. Acceptance checks

- `bunx vitest run supabase/functions/_shared/plan` (priority-title + sanitise) — all green.
- `bunx vitest run supabase/functions/_shared/signal-engine` — all green.
- Manual call with two events sharing an `eventId` returns ≤1 visible slot unless the category allows multi-phase fanout AND ≥12h separates the arcs.
- Manual call with a forced signature mismatch returns `409 STALE_SNAPSHOT`.
- Plan response carries the same `signatureHash` as the most recent Brief for that `(user, local_date, window)`.
- Logs show `Bridge: found N pre-scored events` on the happy path; `falling back to shared ranked-candidate scoring` is the rare exception.

---

## 13. Out of scope (do not modify under "Plan" work)

Onboarding flow, MRS v3 scoring, ledger schema reshape, event taxonomy, protocol combos, signal-pill UI, Connected Data page, MrsPage, frontend caching primitives, push notifications, Auth0, wearable sync, payments. Changes to any of these need their own SSOT doc.

---

## 14. Change log

| Date | Version | Change |
|---|---|---|
| 2026-06-04 | v1.0 | Initial consolidation. Supersedes `PROACTIVE_MASTERY_PLAN_LOGIC.md`, `MASTERY_PLAN_CONTEXT_LOGIC.md`, `proactive-mastery-plan-documentation.md`. Documents the Bridge pipeline, JIT v2 shadow, deterministic title generator, LLM Why-line contract, arc dedupe, temporal gating, ledger evolution, and Brief↔Plan signature handshake. Notes that `scoreCalendarEventsLegacy` and attendee/organiser fallback code are intentionally retained as a defensive fallback pending 14-day 100 % `jit_event_context` coverage. |
| 2026-06-07 | v1.1 | Added §15 (event prioritisation scoring) and §16 (Priority 1 / 2 / 3 slot roles — Anchor, Protect-Prepare, Close). Plan-feature only. |

---

## 15. Event prioritisation — full scoring contract

This is the complete, current scoring contract the Plan uses to decide **which calendar event (if any) anchors a slot**, **what JIT phase it takes**, and **what survives dedupe**. Source of truth: `supabase/functions/generate-mastery-plan/index.ts` + `_shared/events/jit-candidates.ts`. Constants are quoted from code, not paraphrased.

### 15.1 Hard gates (applied before any scoring)

An event is dropped at the door — not scored, not surfaced — if any of these are true:

1. **Educational + non-organiser.** `isEducationalTitle(title) && !isOrganizer` → blocked. No override path.
2. **Outside the action window.** `getActionWindow(minutesUntil)` returns one of:
   - `touch2` — `minutesUntil ≤ 360` (0–6 h: body-prep window)
   - `touch1` — `minutesUntil ≤ 2880` (6–48 h: coach + think-prep window)
   - `selection_only` — `> 48 h` → **excluded from the visible Plan** (still scored upstream for JIT context, never surfaced as a slot anchor).
3. **Per-touch dismissal.** If the user dismissed this event at this horizon (`dismissed_horizons` includes the touch label), it is dropped for that touch only.
4. **24 h MVP horizon ceiling.** `filteredEvents = filteredEvents.filter(e => minutesUntil ≤ MVP_JIT_HORIZON_MINUTES)` where `MVP_JIT_HORIZON_MINUTES = 24 * 60`. Anything ≥24 h ahead cannot anchor a Today slot, even if `touch1` accepts it.
5. **JIT threshold floor.** `score < JIT_THRESHOLD_UNIFIED` (= **55**) → cannot become `topEvent` and cannot be promoted to a JIT slot. In the legacy fallback the same threshold applies, plus `dimA ≥ 10` and `dimB ≥ 8` floors.

If everything is gated out, the Plan emits **no JIT anchor** and slots fall back to state-anchored framing (§16).

### 15.2 Primary score (Bridge pipeline — `jit_event_context`)

The pre-scored row from `jit_event_context` already carries `final_score`, `jit_bucket_primary/secondary`, `jit_dimension_scores`, and `jit_confidence_score → jitConfidenceBand`. The Plan **does not recompute** these; it reads them and applies three boosts on top before ranking:

| Boost | Trigger | Points |
|---|---|---|
| Growth-area alignment | Event title or `event_type` contains a token from `coachInsights.growth_area` | **+15** |
| Priority-tag alignment | Title or `event_type` contains the user's `practicePriorityTag` (e.g. `focus_clarity`) | **+10** |
| HRV historical impact | `|avgHRVDeviation%| > 10` for this event type across recent history | **+10** |

Boosts are additive on `final_score`. They can lift a marginal event over `JIT_THRESHOLD_UNIFIED = 55`, but they **cannot bypass** the §15.1 hard gates.

### 15.3 Legacy fallback score (only when `jit_event_context` has no rows)

`scoreCalendarEventsLegacy()` (≈ index.ts:1760–1880). Same gates as §15.1; score built additively:

| Signal | Points |
|---|---|
| `minutesUntil ≤ 120` | +40 |
| `minutesUntil ≤ 240` | +30 |
| `minutesUntil ≤ 360` | +20 |
| `minutesUntil ≤ 2880` | +10 |
| `isOrganizer` | +15 |
| `attendeesCount > 5` | +10 |
| Relationship tag = `client` or `boss` | +6 (else any tag = +3) |
| Duration > 60 min | +8 |
| Not recurring (`!isRecurring`) | +10 |
| Matched scenario via `scenarioIdFor()` → `EXECUTIVE_SCENARIOS` | **+25** |
| Peak business hours (09–12 or 14–16 local) | +5 |
| Back-to-back gap < 15 min after prior event | +5 |
| Event type appears in `skippedTypes` (user has dismissed this class repeatedly) | **−15** |

Same growth-area / priority-tag / HRV boosts from §15.2 are then applied on top.

### 15.4 Ranking and top-event selection

`rankJitCandidates(events, …)` (from `_shared/events/jit-candidates.ts`) emits an ordered list of `(event, phase, score)` tuples — one event may produce multiple phases (`pre`, `during`, `post`) per `EVENT_PHASE_MAP[category]`.

Selection rules — applied in order:

1. **Brief-anchor re-rank.** Titles in `briefAnchorEventTitles(snapshot)` are stable-sorted to the top of the ranked list — anything the Brief named as high-stakes is guaranteed first look.
2. **Top JIT event.** First candidate with `phase === 'pre'`, `score ≥ JIT_THRESHOLD_UNIFIED`, and `actionWindow ∈ {touch1, touch2}` becomes `topEvent`. This event drives Slot 1 (or Slot 2 in `touch2`).
3. **Secondary anchor (Slot 3 only).** A `post`-phase candidate for the same `topEvent` is eligible to anchor Slot 3 (Close). Different events may anchor different slots — see §15.5.
4. **Per-event arc cap.** `CATEGORY_MAX_SLOTS` caps how many slots a single event can occupy: `A=2, D=2, F=3, G=3`, all others `=1`. A second arc additionally requires:
   - a **distinct phase** from the first arc (e.g. `pre` + `post`, never `pre` + `pre`),
   - **≥12 h** between the two arcs' start times,
   - the phase pair must be valid in `EVENT_PHASE_MAP` for that category.
5. **Anchor identity for dedupe.** `eventId` when present, else `normalize(jitEventTitle) + startTimeBucket`. Any extra occurrence is either replaced by a fresh-horizon module or stripped of JIT metadata so the practice survives but the duplicate anchor disappears.

### 15.5 What the score does NOT do

- It does not pick the **practice** inside the slot (that is `selectPracticesByCombo` + `practice-selector.ts` — see §6 / `mem://features/mastery-plan/practice-selection-binding`).
- It does not write the **title** (`buildPriorityTitle`, §6.1).
- It does not write the **why-line** (LLM, §6.2).
- It does not override the **temporal gates** (§5) — a high-scoring event late in the evening cannot resurrect a morning-only practice type.

---

## 16. Priority 1 / 2 / 3 slot roles (Anchor → Protect/Prepare → Close)

Today's 3 are positional. Their **role** is fixed by `slotIndex`; their **content** is selected by the rules above. The slot a JIT event lands in is a function of its action window (§15.1), not of operator choice.

| Slot | `slotIndex` | Role | When JIT can take this slot | Default (no qualifying JIT) |
|---|---|---|---|---|
| **Priority 1 — Anchor** | 1 | Set the day's posture. Either pre-event JIT for an imminent high-stakes event, or a state-anchored regulation/activation move that sets baseline before the calendar opens. | `topEvent` is `touch2` (0–6 h) AND `jitMinutesUntil < 120` (≤2 h to start). Carries `isJit=true`, `jitPhase='pre'`, `arcLabel='Prepare'`. May include up to **3 practices** chosen via `selectPracticesByCombo` against the §4 combo for the event's phase. | Tier-driven. Depleted → `regulate` + `align` pair. Otherwise → top-ranked `todModules[0]` (one practice). State label from `composeStateLabel(0)` (`"{verb} for {anchor}"`). |
| **Priority 2 — Protect / Prepare** | 2 | Protect the mid-day. Either pre-event JIT for an event coming up later today, or the Midday Regeneration slot that adapts to afternoon divergence (HRV / intraday HR / check-in vs morning baseline). | `topEvent` is `touch1` (6–48 h, but ≤24 h by MVP ceiling) AND has not already taken Slot 1. Carries `isJit=true`, `jitPhase='pre'`, `arcLabel='Prepare'`. Typically **1 practice** (`align` or `prepare`-typed) drawn from the JIT modules bound to the event's combo. | State-anchored adaptive practice. In the afternoon window this is the **Midday Regeneration Trigger** (§5) — Slot 2 may rebuild from afternoon-context wearable + check-in, overriding the morning-only selection. Outside divergence, falls through to the next-best `todModules` entry the §15.4 dedupe pass left intact. |
| **Priority 3 — Close** | 3 | Close the loop. Either post-event recovery for `topEvent` (Recover/Land/Reset arc) or the integrate / Tiny Win practice that consolidates the day. | `topEvent` carries a valid `post` phase for its category AND the per-event arc rules in §15.4 allow a second slot (distinct phase + ≥12 h). Carries `isJit=true`, `jitPhase='post'`, `arcLabel ∈ {'Recover','During'}` per `verbForCategoryPhase`. | **Temporal gating applies** (§5). Integrate / Tiny Win renders **only** 18:00–22:59 local. 00:00–04:59 → server rewrites to **"Sleep Prep & Tomorrow Framing"** with a forward-looking framing prompt. Outside both windows → forward-looking framing module (no Reflection Corner capture). `arcLabel='Steady'`. |

### 16.1 Cross-slot invariants

- **One event per slot, max one slot per event** — unless §15.4 multi-arc rules permit (e.g. A/D = up to 2 phases; F/G = up to 3 phases).
- **Slot order is positional, not score-ranked.** Slot 2 never carries a higher-scoring JIT than Slot 1; if a `touch2` event qualifies, it bumps to Slot 1 by construction.
- **Sticky completion overrides reshuffling.** Per the ledger (§7), a completed slot stays verbatim with ✓ — fresh JIT scoring cannot displace it. Only incomplete slots are recomputed.
- **JIT anchor adaptiveness.** A ledger slot already anchored to an event still on today's calendar keeps `slotIndex`, `jitEventTitle`, and `horizon`; only practice / why-line / time-label refresh. Same WHAT, different HOW.
- **Bonus Round.** When all 3 slots are completed and a new brief is generated, the ledger hands off to a brand-new plan with header "Today's 3 · Bonus Round" — Slot 1/2/3 roles still apply.

### 16.2 Slot → arc label mapping

`arcLabel` is what the UI renders as a muted chip beside the priority number. Derived deterministically from `(category, phase)`:

| Phase | arcLabel | Verb family (`verbForCategoryPhase`) |
|---|---|---|
| `pre` | **Prepare** | Lead / Present / Decide / Steady / Reframe |
| `during` | **During** | Hold |
| `post` | **Recover** | A,D → Reset · F,G → Recover · else → Land |
| no event anchor | **Steady** | Steady (the system) |

Slot 3 in the integrate / Tiny Win path renders `arcLabel='Steady'` because it has no event anchor by definition.

### 16.3 Failure / empty-calendar behaviour

- No qualifying JIT in any window → all three slots are state-anchored. Titles fall back to time-of-day neutral phrasing (`"this morning"`, `"this afternoon"`, `"this evening"`, `"the day ahead"` on weekends) — never "today's load" (see `composeStateLabel` v5.2 gating, `mem://features/mastery-plan/slot-model-v5`).
- `topEvent` exists but only in `selection_only` (>48 h) → no JIT slot is rendered; the event may still appear in `calendarPills` for awareness.
- All three slots completed mid-day → ledger holds; no recomputation until a new Brief signature is produced.

---

## 17. Week-Ahead Mode (Weekend / Post-Break Planning)

On **Sundays**, on the **last day of a PTO block**, on the **last day of a public-holiday block**, and on the **last day of a long weekend**, the Plan surface flips from day-of self-regulation to **upcoming-week prioritisation**. The principle: not every day is a self-regulation day. On these days the user is already regulated — the value is signal-vs-noise prioritisation of what's coming.

**Saturday is intentionally NOT a Week-Ahead day.** Saturday remains a self-regulation / recovery day across Brief, Plan, and Nudges — the Brief swaps to a backward-looking `week_recovery` driver (§17.2a), the Plan stays on the weekday cadence, and the `weekAheadPickerInvite` nudge never fires.

### 17.1 Trigger predicate

`supabase/functions/_shared/plan/week-ahead-mode.ts → evaluateWeekAheadMode(input)`

First-match-wins ladder:

1. `manualOverride` (deep link `?mode=week-ahead`, or nudge tap) → `reason: 'manual_override'`.
2. `travelDay` → inactive (travel context owns these days).
3. `fullWorkingWeekend` (existing `weekend.ts` rule: ≥3 meetings or ≥4 h back-to-back or weekend work block) → inactive (run weekday cadence).
4. `ptoTodayAllDay && !ptoTomorrowAllDay` → `last_day_pto`.
5. `holidayAllDayEventToday && tomorrowIsWorkday` → `last_day_holiday`.
6. `consecutiveOffDaysBefore ≥ 2 && tomorrowIsWorkday` → `last_day_long_weekend`.
7. `dayOfWeek == 0` → `sunday`.

Both Brief and Plan call the same helper so they cannot disagree. Saturday is handled by a sibling predicate `isSaturdayRecoveryDay(input)` (true on `dayOfWeek === 6` when not a travel day or full working weekend) which the Brief reads directly to select the `week_recovery` driver — Plan never reads it.

### 17.2 Brief: `week_recap` driver (Sunday / last-PTO / last-holiday)

When `weekAheadMode.active === true`, `compute-outer-readiness` stamps `brief_snapshots.driver = 'week_recap'` and (follow-up) swaps the prompt anchor block from the day-anchor frame to a **week-recap** frame (last 7 days of load, recovery, sleep mean, HRV vs 30-day baseline, completed-priorities count). Why-line constraints: must reference the week just gone, never name a tomorrow event.

The override also honours the `x-week-ahead-override: 1` header (deep link `?mode=week-ahead`) so any forced manual entry produces a `week_recap`-stamped row.

No change to MRS scoring, signal-pills shape, or atomic-brief contract — only the prompt block and the `driver` value.

### 17.2a Brief: `week_recovery` driver (Saturday)

When `isSaturdayRecoveryDay(input) === true`, `compute-outer-readiness` stamps `brief_snapshots.driver = 'week_recovery'`. The anchor block (follow-up) frames the week gone by **for recovery purposes** — same week-gone-by metrics as `week_recap` plus a `weekendEvents[]` snippet listing any Sat–Sun events of medium+ stakes so the why-line can account for them.

Why-line guardrails: must reference recovery or the week behind; **may** name a weekend meeting when present; must not name a Mon–Fri future event.

### 17.3 Plan: `list-week-ahead-priorities`

Edge function: `supabase/functions/list-week-ahead-priorities/index.ts`. Thin orchestrator over existing modules — no new taxonomy.

Pipeline:

1. Pull `calendar_events` in `[localStartOfToday, +8d local)`, dedupe via `collapseDuplicateEvents` (multi-provider safe).
2. Drop noise (`isNoiseTitle`) and educational-not-organiser (`isEducationalTitle && !isOrganizer`).
3. Classify with `classifyEvent` / `coarseEventType` from `_shared/events/event-classifier.ts`.
4. **Score** = `stakesLevel × 12` + organiser boost (+5) + ≥5 attendees (+4) + **memory delta** (§17.5).
5. Drop hard-demoted candidates (`never`-flagged categories).
6. Sort by score desc; apply **per-day cap = 3** and **per-category cap = 3** for variety; truncate to **top 10**.
7. Re-sort the selected slice chronologically for UI rendering.

Floor: `score < 10` is dropped. Response: `{ weekAheadMode, priorities[], generatedAt }`.

### 17.4 Memory schema

Table `public.event_priority_memory` (migration `20260607*`):

| column          | type        | notes                                                         |
|-----------------|-------------|---------------------------------------------------------------|
| user_id         | text        | Auth0 sub                                                     |
| event_category  | text        | coarse token from `coarseEventType`                           |
| event_type_key  | text        | bucket from `normalizeEventTypeKey` (1on1, board, deep_work…) |
| signal          | text        | `priority` / `not_this_week` / `never` / `cancelled_as_noise` / `cancelled_keep_surfacing` |
| source          | text        | `week_ahead_picker` / `priority_tag` / `cancel_feedback`      |
| event_id        | text        | nullable — original calendar event when known                 |
| occurred_at     | timestamptz | default `now()`                                               |
| meta            | jsonb       | free-form telemetry                                           |

Indexes: `(user_id, event_category, event_type_key, occurred_at DESC)` and `(user_id, signal, occurred_at DESC)`.

RLS: deny-by-default. Authenticated users may **read** only their own rows (for surfacing prior signals in UI). All writes go through service-role edge functions — clients cannot poison the memory.

Write path: `supabase/functions/record-event-priority-signal/index.ts`. Inputs: `{ eventId, eventTitle?, signal, source }`. The function re-derives `category` + `type_key` from the live `calendar_events.title` (or the title hint if the event is no longer in DB) so the client cannot inject arbitrary buckets.

### 17.5 Read-side scoring integration

`supabase/functions/_shared/plan/event-priority-memory.ts → applyEventPriorityMemory(index, { eventCategory, eventTypeKey })`:

| signal                       | decay window | delta per row |
|------------------------------|--------------|---------------|
| `priority`                   | ≤60 d        | **+10**       |
| `cancelled_keep_surfacing`   | ≤60 d        | **+5**        |
| `not_this_week`              | ≤14 d        | **−15**       |
| `cancelled_as_noise`         | ≤60 d        | **−25**       |
| `never`                      | always       | **−40 + hardDemote = true** (caller drops candidate) |

Net delta clamped to `[-50, +30]`. Reasons surface in `scoreReasons[]` (e.g. `"prior priority ×2"`, `"deprioritised this week"`) so the user sees why an event sits where it does.

`generate-mastery-plan` is intended to call the same helper inside `rankJitCandidates` so weekday Plan also benefits from the learning loop — implementation tracked as a follow-up (gated behind feature flag `WEEK_AHEAD_MEMORY_BOOST`).

### 17.6 UI contract

- Component: `src/components/home/WeekAheadPriorities.tsx`.
- Container: `src/pages/PlanPage.tsx` branches at the top via `useWeekAheadMode()`. No new route — the same `/plan` surface flips contents on weekends and `?mode=week-ahead`.
- Per-card actions: **Priority** (star) / **Not this week** (×) / **Never this type** (ban). Optimistic + reversible on insert failure.
- Grouped by local day with a chronological order; copy is reason-aware ("Set the shape of next week…", "Re-engaging — pick the events that matter…").
- Empty state is celebratory: "No significant events on your calendar for the week ahead. Enjoy the open space."

### 17.7 Nudge / pop-up trigger (planned)

New nudge rule `weekAheadPickerInvite`:

- Saturday 09:00–11:00 local, OR Sunday 16:00–19:00 local, OR the evening of any detected last-PTO / last-holiday day.
- Suppressed if `fullWorkingWeekend` is true or the user already opened the picker today.
- Deep link: `/plan?mode=week-ahead` → PlanPage detects the query param via `useWeekAheadMode`, forces `manualOverride`, and the edge function honours `x-week-ahead-override: 1` for borderline server-side decisions.

### 17.8 Suppression matrix

| State                                 | Behaviour                              |
|---------------------------------------|----------------------------------------|
| Travel day                            | Suppressed — travel context owns       |
| Full working weekend                  | Suppressed — run weekday cadence       |
| Weekday, no override                  | Suppressed — normal Plan               |
| Sat / Sun, no working-weekend         | Active                                 |
| PTO last day (today off, tomorrow on) | Active                                 |
| Holiday last day, tomorrow workday    | Active                                 |
| Manual `?mode=week-ahead`             | Active                                 |

### 17.9 Auth & Dev-mode parity

Both edge functions use `_shared/auth.ts → authenticateRequest` with the same dev bypass pattern as `list-replacement-calendar-events`: outside production, an `x-dev-user-id` header substitutes for a missing JWT. The web client supplies it from `DEV_USER.id` when `DEV_MODE` is true. Auth users hit the same code path with a real Auth0 JWT. There is no client-side fork.

### 17.10 Rollback

- Plan surface: revert `src/pages/PlanPage.tsx` and delete `WeekAheadPriorities.tsx` + `useWeekAheadMode.ts` → page returns to the previous behaviour on every day.
- Edge functions: delete `list-week-ahead-priorities/` and `record-event-priority-signal/`. Migration is additive (new table only) and safe to leave in place on revert.
