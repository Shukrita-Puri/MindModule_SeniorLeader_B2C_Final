---
name: ceo-behaviour-shared-module-ownership
description: Layered ownership of the CEO event taxonomy + behaviour rules. Single A–H source, one classifier, no duplication.
type: architecture
---

# Shared module ownership (events + protocols + behaviour)

```
supabase/functions/_shared/
├── protocols/protocol-combos.ts      §2 — 6 protocol combos. Pure data.
├── events/event-categories.ts        §3 — SINGLE A–H pillar source
│                                       (id, name, selfRegulationFocus,
│                                        pre/during/post protocol contract).
│                                       Exports FRAMEWORK_PILLARS alias.
├── events/event-subtypes.ts          30 granular EVENT_TYPES rows
│                                       (keywords, demand profile, JIT lead
│                                        time, scenarioId map). Each row
│                                        carries categoryId ∈ A–H.
├── events/event-phase-map.ts         §4 — per-category Pre/During/Post
│                                       (timing, combo, goal, prevents/builds).
├── events/event-classifier.ts        classifyEvent (canonical, subtype-aware),
│                                       scoring, dedupe, day-kind detection.
├── events/state-engines.ts           detectCognitiveFragmentation et al,
│                                       buildMorningContext / buildEveningContext,
│                                       consolidateAdjacentHighStakes.
└── ceo-behaviour/*.ts                §5 — opinions over signals. Import from
                                         events/ + protocols/. Never define
                                         taxonomy. Never duplicate classifier.
```

`executive-state-taxonomy.ts` is a transitional re-export shim. New code MUST
import from `events/*` directly. Scheduled for deletion next release.

## Hard rules

- **One A–H.** Only `events/event-categories.ts` may define pillar id, name,
  focus, or protocol contract. Adding a parallel A–H list anywhere = PR reject.
- **One classifier.** `classifyEvent` lives only in `events/event-classifier.ts`.
  All callers (including `event-phase-map.ts`) consume it from there.
- **Subtypes reference categories by enum** (`categoryId: EventCategoryId`),
  never by string literal.
- **Engines ≠ taxonomy.** Runtime derivations (`detect*`, `buildMorningContext`,
  etc.) live in `state-engines.ts`. Do not move them into taxonomy files.
- **Cross-layer drift is caught at boot** by `events/cross-layer.test.ts`.
- **§3 inventory is canonical.** `EVENT_CATEGORIES[id].triggers` holds the
  verbatim §3 events list per pillar. Subtype `bucket` strings in
  `events/event-subtypes.ts` must equal the parent category's `name` —
  enforced by `cross-layer.test.ts`. Features rendering trigger lists MUST
  read from `EVENT_CATEGORIES[id].triggers`; never inline.

## Future-feature pattern

Features needing specialised timing/copy (e.g. a sparring-partner feature
wanting 7-day-ahead prep) create a per-feature overlay inside the feature
folder rather than duplicating `EVENT_PHASE_MAP`. Pattern: `mergePhaseMap(base, overlay)`.
Shared taxonomy stays in `events/`; feature-specific copy stays with the feature.

## Validation tests

- `events/event-categories.test.ts` — all 8 pillars present, alias mirrors.
- `events/event-phase-map.test.ts` — combo + goal + preventsBuilds present.
- `events/cross-layer.test.ts` — subtype.categoryId ∈ EVENT_CATEGORIES,
  phase-map ids ∈ EVENT_CATEGORIES, all combos resolve.
- `protocols/protocol-combos.test.ts` — 6 combos + legacy mapping round-trip.
