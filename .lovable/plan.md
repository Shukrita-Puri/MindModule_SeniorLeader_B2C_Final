
## Status of the three wirings you asked about

Verified against `supabase/functions/generate-mastery-plan/index.ts` (current imports: `executive-state-taxonomy.ts` shim + `behaviour-wiring.ts`):

| Ask | Status today |
|---|---|
| 1 — Priority selection tied to CEO Behaviours and Pre/During/Post events | **Partial.** `evaluateForScope` + `applySlotBoostsToMapping` apply CEO-behaviour boosts to module mapping. The §4 per-category Pre/During/Post contract (`EVENT_PHASE_MAP`, `phaseForEvent`) is **not** consulted. So a Long-haul flight does not currently fan out into Pre-flight slot + In-flight slot + Landing slot; a multi-day Conference does not flow Pre-during-during-post across slots; Deep-Work has no Pre + During pairing. |
| 2 — Logic covers all CEO event types | **Partial.** `classifyEvent` (subtype-aware) is reachable via `scenarioIdFor`, but `EVENT_TYPES` rows (the 30 subtypes with `leadTimeMin`, `demandProfile`, `categoryId`) are not read by the slot resolver. Travel sub-phases (`pre_flight`, `in_flight`, `landing_same_day`, `landing_next_day`, `tz_shift`, `multi_city`) and Conference `multi-day` are not differentiated. |
| 3 — JIT scoring/calculation impact | **Not wired.** `rankedJitCandidates` ranks on simple proximity + stakes hints. It does not read `leadTimeMin` from the subtype, does not weight by `demandProfile.cognitive/emotional/physical`, does not bias by `categoryId` protocol stakes from §3, and does not honour the Pre/During/Post window from `event-phase-map.ts`. |

## What this plan changes

A single wiring pass through `generate-mastery-plan/index.ts` so the shared §2/§3/§4 modules become the canonical decision substrate. No taxonomy is redefined — only consumed.

### 1) Imports

Add to `generate-mastery-plan/index.ts`:

```ts
import { EVENT_CATEGORIES, FRAMEWORK_PILLARS } from '../_shared/events/event-categories.ts';
import { EVENT_TYPES, EVENT_TYPE_TO_SCENARIO_ID } from '../_shared/events/event-subtypes.ts';
import { EVENT_PHASE_MAP, phaseForEvent, protocolsForEvent, type Phase } from '../_shared/events/event-phase-map.ts';
import { classifyEvent } from '../_shared/events/event-classifier.ts';
import { PROTOCOL_COMBOS } from '../_shared/protocols/protocol-combos.ts';
```

### 2) Event enrichment (single pass, upstream of JIT + slot resolution)

For every event entering the horizon, build an `EnrichedEvent`:

```text
EnrichedEvent {
  raw,
  subtype:    classifyEvent(title),          // → { categoryId, label, leadTimeMin, demandProfile, ... }
  category:   EVENT_CATEGORIES[subtype.categoryId],
  phases:     { pre?, during?, post? } from EVENT_PHASE_MAP[categoryId],
  windows:    materialised absolute timestamps for each available phase
              (pre: start - phase.timing offset; during: span; post: end + offset),
  protocols:  { pre?: ComboKey, during?: ComboKey, post?: ComboKey }
}
```

Travel multi-phase subtypes (`pre_flight`, `landing_same_day`, etc.) keep their subtype-specific window so a Long-haul flight expands to up to three candidate slot anchors (pre-flight T-2h, in-flight, landing).

### 3) JIT candidate generation + scoring (the part you asked about)

`rankedJitCandidates` becomes one entry **per (event, phase)** instead of one per event. Score:

```text
score =
    base(stakesLevel)                              // existing
  + categoryWeight(category.id)                    // A/D higher, H lower
  + phaseSeverityWeight(phase.severityHint)        // high/med/low from §4
  + demandProfileWeight(subtype.demandProfile)     // cognitive+emotional bias for Pre, physical for Post
  + windowProximityWeight(now, phaseWindow,        // peak when inside lead-time band
                          subtype.leadTimeMin)
  - skipPenalty(get_event_type_skip_count(...))    // existing JIT preference penalty
```

`leadTimeMin` from `event-subtypes.ts` is the canonical horizon for "Pre" eligibility. `EVENT_PHASE_MAP[cat][phase].timing` defines the firing window. A candidate is eligible only inside its phase window.

The protocol combo for the candidate (`phaseForEvent(...).resolvedCombo`) becomes the practice-selection hint passed into module mapping (no more inferring `Pause/Flow/Reenergise` heuristically).

### 4) Slot resolver — Pre/During/Post layering

`resolveSlot` is extended so Contract A (Pure JIT) carries phase + protocol:

- Label patterns:
  - `pre` → `Prepare ahead of <Event>`
  - `during` → `Stay regulated through <Event>` (notification-only category F uses this only as a nudge anchor)
  - `post` → `Recover after <Event>` / `Reset after <Event>`
- `replacementEventIds` now carries `(eventId, phase)` so the same calendar event can legitimately occupy two slots (e.g. Slot 1 Pre-flight, Slot 3 Landing) without dedupe stripping the second.
- Conference (F) multi-day: each day's `pre` + `post` is a distinct candidate; `during` is emitted as a nudge anchor, never as a slot.
- Deep Work (E): `pre` (`mindset.flow`) + `during` (`mindset.flow`) collapse into a single slot anchored to the block start to avoid double-booking.

Contracts B/C/D/E (non-JIT) keep their current `composeStateLabel` path but now consult `category.selfRegulationFocus` to pick the state action verb (e.g. category D fatigue → `Settle the system`, category G travel → `Re-anchor circadian rhythm`).

### 5) Practice / module selection tied to protocol combos

Where module mapping currently picks `regulate/align/prepare/integrate`, the resolved `ComboKey` (`somatic.flow`, `mindset.pause`, …) from §2 becomes the primary filter; `applySlotBoostsToMapping` continues to apply CEO-behaviour boosts on top.

This kills duplicated `Pause/Flow/Reenergise` heuristics inside `generate-mastery-plan` — protocol-combos.ts is the single source.

### 6) MVP scope guard (unchanged)

Non-JIT contracts remain Self-Regulation framing only. No content prep. The `FORBIDDEN_LITERALS` guard stays.

### 7) Tests / validation

Add Deno tests covering:

- Long-haul flight (>4h, offline) tomorrow at 14:00 → Slot 1 today `Prepare ahead of long-haul flight`, Slot 3 tomorrow `Re-anchor circadian rhythm after landing`.
- Multi-day Conference Mon–Wed (speaking Tue) → Mon Slot 3 `Prepare ahead of tomorrow's keynote`, Tue Slot 1 `Prepare ahead of keynote`, Tue Slot 3 `Recover after keynote`.
- Deep Work 09:00–12:00 → single Slot 1 `Prepare ahead of deep work block` using `mindset.flow`.
- Board meeting 16:00 + depleted HRV → Slot 1 `Restore HRV ahead of today's board meeting` (B), Slot 2 `Prepare ahead of Board meeting` (A pre at T-60), Slot 3 `Reset after board meeting` (A post).
- No `Midday reset` / `Prepare for the day` / `Prevent the afternoon dip` ever reaches the UI.

### 8) Future LLM layer (noted, not built)

Once §3/§4 are wired, the "Why this matters" body copy and per-practice context strings become a thin LLM call seeded with: `category.selfRegulationFocus`, `phase.goal`, `phase.preventsBuilds`, `subtype.demandProfile`, `protocolCombo`. The deterministic taxonomy stays the source of truth; the LLM only narrates.

## Files

- `supabase/functions/generate-mastery-plan/index.ts` — imports, enrichment pass, JIT scoring rewrite, `resolveSlot` phase-aware extension, module mapping via `ComboKey`.
- `supabase/functions/generate-mastery-plan/*_test.ts` — new Deno tests above.
- `.lovable/plan.md` — replace current contract-only plan with this expanded wiring plan (kept side-by-side; Contracts A–E remain valid, now extended with phase semantics).

No changes to `src/components/home/TodayThreePriorities.tsx` (it stays a pass-through). No changes to the shared modules under `_shared/events/`, `_shared/protocols/`, `_shared/ceo-behaviour/` — they are already the source of truth.

---

## Implementation status (this pass)

**Shipped**
- `generate-mastery-plan/index.ts` now imports `EVENT_CATEGORIES`, `EVENT_PHASE_MAP`, `phaseForEvent`, `classifyEvent`, `PROTOCOL_COMBOS` from the shared §3/§4 modules.
- New `resolveJitPhaseLabel(title, startMs, endMs, nowMs)` helper resolves the slot label by Pre / During / Post window:
  - `pre` → `Prepare ahead of <Event>`
  - `during` → `Stay regulated through <Event>` (auto-downgraded to `pre` framing for category F per `protocol.duringNotificationOnly`)
  - `post` → `Recover after <Event>` (high-stakes A/D → `Reset after <Event>`)
- All three JIT slot emissions (Slot 1 touch1, Slot 2 touch2, Slot 2 long-lead) now use this helper instead of hardcoded `Prepare ahead of`.
- `composeStateLabel` state-action verb now consults `classifyEvent(anchor).categoryId`: depleted + C/F → `Reset stage chemistry`, managing + E → `Prime for focus`; existing G (travel) path preserved.
- Deno test `_shared/events/jit-phase-label.test.ts` locks the §3/§4 contract (board → A pre+post, keynote → F with `duringNotificationOnly`, deep work → E, long-haul → G).

**Deferred (next pass, scoped separately)**
- Module mapping by `ComboKey` (replacing the `regulate/align/prepare/integrate` heuristic with the resolved combo from `phaseForEvent`).
- LLM-narrated "Why this matters" body — depends on the two items above.

**Phase B shipped**
- `_shared/events/jit-candidates.ts` — `rankJitCandidates(events, nowMs)` emits one ranked candidate per `(event, phase)` with the §3 scoring formula (stakes base + categoryWeight + phaseSeverityWeight + demandProfileWeight + windowProximityWeight − skipPenalty), materialised firing windows and `eligible` flag.
- `generate-mastery-plan/index.ts` now calls `rankJitCandidates` on `filteredEvents` after the 24h MVP ceiling, logs the top-3, and exposes the top-8 on `meta.jitRankedCandidates` for downstream consumers / Phase C slot fan-out.
- Top-1 slot selection is intentionally unchanged — the legacy window+threshold loop still picks `topEvent`, so user-visible behaviour is identical to today.
- Tests in `_shared/events/jit-candidates.test.ts` cover board (A: pre+during+post), keynote (F: pre+post), long-haul flight (G: during-only), deep work (E: pre-only), cross-category ranking (A > E), in-window eligibility, and skipPenalty arithmetic.
