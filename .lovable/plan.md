
# Central Context Refactor — Daily + Morning / Afternoon / Evening

## Answers to your questions

**Q1. Which file builds the central context today?**
Only `supabase/functions/_shared/signal-engine/build-daily-context.ts`. Its `composeDailyContext(userId, localDate)` is the single producer that fetches all raw signals and upserts the `daily_context_snapshot` row. The other three (`cognitive-fragmentation.ts`, its `_test.ts`, `context-builder.ts`) are pure helpers consumed *by* the producer.

**Q2. Can these replace the proposed new `_shared/behaviour-snapshot.ts`?**
Reuse, don't replace. `composeDailyContext` produces signals but does not run `evaluateForScope` for `brief` vs `plan`, does not emit `flags_brief / flags_plan / slot_boosts / taxonomy_block / signature_hash`, and does not format the A–H taxonomy block. Behaviour snapshot becomes a **thin layer on top of** the central context, not a parallel producer.

**Q3. Split into morning / afternoon / evening?**
Yes. The attached spec maps cleanly to the existing `getTimeOfDay()` windows and the standardized-time-windows Core memory (05–12 / 12–18 / 18–05). Intraday HR only matters in the afternoon; JIT gear-shift only matters in the evening — they do not belong in a flat day-wide snapshot.

---

## Target architecture (one producer, two layers, three windows)

```text
                     composeDailyContext(user, localDate)
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
        daily_context_snapshot         windowed context (in-memory)
        (signals + patterns +                     │
         demand + strategic)            ┌────────┼─────────┐
                  │                     ▼        ▼         ▼
                  │              morning-ctx  afternoon  evening
                  │                     │        │         │
                  └────────────┬────────┴────────┴─────────┘
                               ▼
                    buildBehaviourSnapshot()
            (evaluateForScope × {brief, plan} + taxonomy block)
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
          Brief             Nudges              Plan
```

Everything that touches the LLM (Brief, Nudges, Plan) reads from the same `(daily_context_snapshot, window_context, behaviour_snapshot)` triple. Future signal changes land in `_shared/signal-engine/*` only.

---

## File plan

### Keep / extend (no duplication)
- `signal-engine/build-daily-context.ts` — stays as the **only** producer of `daily_context_snapshot`. Already covers HRV bundle, 3-day load, DOW history, demand, pattern signals, strategic context.
- `signal-engine/context-builder.ts` — keep as predicates (`hasMeaningfulDemand`, `isAppleSleepSource`, `coldStartLabel`).
- `signal-engine/cognitive-fragmentation.ts` — keep as pure scorer; consumed by afternoon + evening contexts.
- `signal-engine/day-kind-detector.ts` — already provides `getTimeOfDay`, `getDayContext`, `isLateEvening`. Stays the time-window source of truth.

### New (three window files)
Each is a pure function over `{dailyContext, events, wearable, jit, checkins}`. None re-queries — `composeDailyContext` already fetched everything; window files just **slice and derive**.

- `signal-engine/morning-context.ts` — exports `buildMorningContext()`. Fields per your spec: `yesterday_load_score`, `yesterday_had_high_stakes`, `yesterday_had_conflict`, `sleep_hours`, `sleep_quality`, `hrv_overnight`, `rhr_this_morning`, `today_meeting_count`, `today_classified_events`, `today_first_high_stakes`, `veto_risk`, `day_kind`, `conference_day_number`.
- `signal-engine/afternoon-context.ts` — exports `buildAfternoonContext()`. Fields: `meetings_completed`, `highest_completed_category`, `meetings_remaining`, `highest_remaining_stakes`, `back_to_back_remaining`, `current_hr_vs_resting` (only place intraday HR is read), `decision_leakage_risk`, `jit_events_remaining`, `plan_priority_status`.
- `signal-engine/evening-context.ts` — exports `buildEveningContext()`. Fields: `today_completed_load`, `body_load_elevated`, `hrv_evening_reading`, `priorities_completed`, `jit_remaining_evening`, `was_travel_day`, `was_conference_day`, `tomorrow_first_high_stakes`, `tomorrow_meeting_count`, `recovery_note`, `charge_residue_evening`. Implements the §3.1 evening JIT gear-shift rule (`mode = 'jit_remaining'` when `jit_remaining_evening = true`).

### New (behaviour layer, single file)
- `_shared/behaviour-snapshot.ts` — `buildBehaviourSnapshot(dailyContext, windowContext)`. Calls `evaluateForScope` once for `scope="brief"` and once for `scope="plan"` against an identical `RuleContext` built from the central context. Returns `{flags_brief, flags_plan, slot_boosts, taxonomy_block, signature_hash}`. Does **not** refetch and does **not** duplicate signal logic.

### Types
- `signal-engine/types.ts` — add `MorningContext`, `AfternoonContext`, `EveningContext`, `WindowContext = MorningContext | AfternoonContext | EveningContext`, and `BehaviourSnapshot`.

### Consumer wiring (3 small edits, no logic moved)
- `compute-outer-readiness/index.ts` — call `composeDailyContext` → `build{Morning|Afternoon|Evening}Context` (based on `getTimeOfDay`) → `buildBehaviourSnapshot`. Pass the triple into the existing brief prompt builder.
- `generate-mastery-plan/index.ts` — same triple; read `slot_boosts` from `behaviour_snapshot` instead of recomputing.
- `smart-nudges/index.ts` — same triple.

### Out of scope (do not touch)
LLM prompts, MRS v3 scoring, Signal Pill renderers, cold-start gate, wearable contracts, the 16 CEO rule bodies, A–H taxonomy data, RLS, migrations. This is a **structural refactor** of where context is built, not a semantic change.

---

## Brief ↔ Plan coherence (now a free outcome)

Because Brief and Plan now read the **same** `behaviour_snapshot` row built from the **same** `daily_context_snapshot` and **same** window context, the previous drift (Brief naming an event the Plan ignored) is eliminated structurally. The `validateBriefPlanCoherence` validator from the prior plan becomes a guard rail, not a fix.

---

## Migration order
1. Add three window-context files + types (pure functions, no DB writes).
2. Add `behaviour-snapshot.ts` consuming them.
3. Wire `compute-outer-readiness` (Brief) first; verify parity vs current output via `brief_snapshots.input_signature`.
4. Wire `smart-nudges`, then `generate-mastery-plan`.
5. Update docs: `PERFORMANCE_READINESS_BRIEF_LOGIC.md`, `PROACTIVE_MASTERY_PLAN_LOGIC.md`, `SMART_NUDGES_ARCHITECTURE.md`. Update memories `architecture/signal-engine/build-daily-context-orchestrator` and add new `architecture/signal-engine/window-context-split`.

No new tables. No schema changes. No prompt edits.
