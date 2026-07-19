
## Audit findings — Plan Arcs across A–H

### 1. Where arcs are declared today

**Category-level phase capability** — `supabase/functions/_shared/events/event-phase-map.ts` (`EVENT_PHASE_MAP`):

| Cat | Name | Phases declared today | Spec target |
|-----|------|-----------------------|-------------|
| A | High-Stakes Governance | pre, post | pre, post |
| B | Influence & Persuasion | pre, post | pre, post |
| C | Visibility & Communication | pre, post | pre, post |
| D | People / Difficult Conversations | pre, post | pre, post |
| E | Deep Work & Strategy | pre, during, post | **conditional per subtype** |
| F | Conferences & External Events | pre, during, post (during = notif-only) | pre, during, post |
| G | Travel | pre, during, post | **conditional per subtype + duration** |
| H | Daily Rhythm & Baseline | during only | **null (excluded)** |

**Subtype taxonomy** — `event-subtypes.ts` already carries `classificationOnly:true` on:
- `str.learning`, `str.community` (E — no arc per spec)
- `conf.networking` (F — no arc per spec)
- `trv.accommodation`, `trv.travel_day` (G — accommodation: no arc; travel_day: full arc)
- All `rhy.*` (H — no Plan presence per spec)

**Travel arc** — `enrich-event.ts::computeTravelArc()` correctly returns `'pre-post' | 'pre-during-post' | 'pre-only'` from `trv.flight` duration (≥360m = long-haul).

**Allocator** — `slot-allocator.ts` now calls `pruneTravelPhases()` (WS4 landed) to drop the during-slot for short-haul G. ✅

### 2. Gaps versus the spec's `getArcForEvent()` contract

Three concrete gaps between shipped code and the spec:

1. **`classificationOnly` is not enforced by the JIT ranker.** Only `state-engines.ts:254` honours the flag. `rankJitCandidates()` (`jit-candidates.ts:146`) calls `enrichEvent()` and then iterates `enriched.phases` — which is built from the **category-level** `EVENT_PHASE_MAP`. Result: `str.learning`, `str.community`, `conf.networking`, `trv.accommodation`, and every `rhy.*` (H) event can still generate JIT candidates and be picked into Plan slots. This directly contradicts the spec's:
   - `E.learning → null`
   - `E.community → null`
   - `H.social → excluded from Plan`
   - `G.accommodation → null`
2. **H currently declares a `during` phase.** `EVENT_PHASE_MAP.H.during` is populated, so a matched H event (e.g. a gym block that isn't `classificationOnly`) would still land a slot. Spec says H returns `null` end-to-end.
3. **Long-haul from a real 12-h flight without a keyword.** `enrichEvent().travelArc` correctly reads `durationMinutes` — but `RankedJitCandidate` doesn't carry the duration, so `pruneTravelPhases()` calls `enrichEvent({ title })` alone. A `trv.flight` titled "Flight LHR→SIN" without the words *long-haul/red-eye/overnight* falls back to `'pre-post'` even when the calendar says 12 hours. The spec's 12-h Singapore example would emit only pre/post.

### 3. Downstream / frontend / DB readers

- **DB write path** — `record-event-priority-signal` now persists `event_subcategory` on `event_priority_memory` (WS3). No frontend/DB reader of `travelArc` or the arc list itself: arcs are re-derived on read via `enrichEvent()` inside the plan generator. No schema change needed for WS4.
- **Frontend** — no component reads `travelArc` or `jitPhase` directly except `MasteryPlan`/`Plan` rendering the allocator's slot output. Fixes stay backend-only.
- **Insights / Nudges** — consume `subcategory` (already wired via WS3), unaffected by arc pruning.

## Plan — complete WS4 spec compliance

Four surgical edits, all in `_shared/events` and `_shared/jit`. No new files. No DB migration. No frontend change.

### Change 1 — enforce `classificationOnly` at the JIT ranker (fixes gaps 1)
`supabase/functions/_shared/events/jit-candidates.ts` at line 158, alongside the existing `if (!enriched.categoryId) continue;`:

```ts
if (enriched.subtype?.classificationOnly) continue;
```

This single line drops `str.learning`, `str.community`, `conf.networking`, `trv.accommodation`, `trv.travel_day` (already handled specially by the travel_day dayShape branch), and every `rhy.*` from Plan slot eligibility. Matches the spec's `return null` behaviour for E.learning, E.community, G.accommodation, H.*.

### Change 2 — H has no arc (fixes gap 2)
`event-phase-map.ts`: remove the `during` entry from `EVENT_PHASE_MAP.H` so the map is `{}`. `CATEGORY_MAX_SLOTS.H` stays at 1 (rest-day handling continues to work via `hasRestSignals`, not per-event slots). No caller iterates a required `during` on H.

### Change 3 — plumb calendar duration into travel-arc pruning (fixes gap 3)
Two small edits so a real 12-h flight is treated as long-haul even when the title is bland:

- `jit-candidates.ts::RankedJitCandidate`: add optional `durationMinutes: number | null` and populate it in the ranker (`(endMs - startMs) / 60000`).
- `slot-allocator.ts::pruneTravelPhases`: accept an optional `durationMin` and pass it through to a new `enrichEvent({ title, start_time, end_time })`-shaped call — or, simpler, call the existing `computeTravelArc` logic directly. Both prune sites (`dominantEventPhases` and `buildNamedFullArcResult`) forward the top candidate's `durationMinutes`.

### Change 4 — regression tests
Extend `_shared/jit/slot-allocator.test.ts` with:
- 12-h flight with a plain "Flight LHR→SIN" title + `durationMinutes: 720` → keeps `during`.
- 2-h flight with `durationMinutes: 120` → drops `during` (already covered, add duration variant).

Extend `_shared/events/jit-candidates.test.ts` (or add a small file if none exists) with:
- `str.learning` event → 0 candidates.
- `str.community` event → 0 candidates.
- `rhy.social` event → 0 candidates.
- `trv.accommodation` event → 0 candidates.
- `str.deep_work` event → pre + post candidates (no during).

### Verification & rollout
1. `deno test --allow-all --no-check _shared/jit/slot-allocator.test.ts _shared/events/**/*.test.ts` → all green.
2. Redeploy `generate-mastery-plan` (only consumer of the shared modules that renders Plan slots). `record-event-priority-signal`, `smart-nudges`, `build-executive-home-cards` transitively use `enrichEvent` but their behaviour is unchanged.
3. No DB migration, no frontend edit, no config change.

### Post-change arc matrix (matches spec)

| Category / Subtype | Arc emitted |
|--------------------|-------------|
| A.* | pre, post |
| B.* | pre, post |
| C.* | pre, post |
| D.* | pre, post |
| E.deep_work | pre, post |
| E.learning | none |
| E.community | none |
| E.routine sync | none (no matching subtype → not classified) |
| F.* (conference/offsite) | pre, during, post (during = notif-only) |
| F.networking | none |
| G.flight ≥ 6h (or long_haul/travel_day) | pre, during, post |
| G.flight < 6h | pre, post |
| G.accommodation | none |
| H.* | none |
