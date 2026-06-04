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
