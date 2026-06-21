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

## Calendar canonical merge ownership (added 21 Jun)

Single upstream merge — `_shared/rules/calendar-merge.ts → mergeCalendarEvents`
— builds the canonical event set. Every CEO-behaviour consumer reads merged
output; none refetch raw provider rows.

| Consumer | Reads merged set? | Call site |
|---|---|---|
| `generate-mastery-plan` (Plan composition + lookback) | yes | index.ts:1519, 2583 |
| `compute-outer-readiness` (Brief signal pills, Next Up, tomorrow events, similar events) | yes | index.ts:2515, 2769, 2851, 2876, 3014, 3083, 3132, 3164 |
| `list-week-ahead-priorities` | yes | index.ts:182 |
| `smart-nudges` (direct import from calendar-merge.ts, bypassing re-export for boot stability) | yes | index.ts:307 |
| `generate-jit-events` | yes | grep-confirmed import |
| `_shared/signal-engine/build-daily-context.ts` | yes | lines 295, 324, 372 |
| `_shared/signal-engine/db-queries.ts` | yes | line 178 |
| `_shared/ceo-behaviour/calendar-dedupe.ts → dedupeForLoad` | operates on a simpler `LoadEvent` shape for back-to-back hour aggregation; not a duplicate identity-key dedupe | self-contained |

Brief does **not** independently fetch raw calendar rows for pill generation;
every read in `compute-outer-readiness/index.ts` goes through
`mergeCalendarEvents` before classification or stake assessment.

### Canonical merge contract (current)

`MergedCalendarEvent` exposes `canonicalEventId`, `mergedEventId`,
`identityKey`, `mergedFromCount`, `sourceCalendars[]`, `providerEventIds`,
`rawEventIds[]`, unioned `attendees`, organizer-preferred `location` /
`description` / `conferenceUrl`, resolved `status` + `statusUpdatedAt`,
`isBusyBlock`, `isSoftHold`, `isSuppressedMirror`. Cancelled/declined
statuses suppress at the public boundary. Title-less Busy blocks overlapping
a titled event are suppressed; standalone Busy is kept as a soft-hold.

### Observability

`logMergeStats(surface, rawCount, merged, { userId })` is exported from
`calendar-merge.ts`. Wired at the primary entry points:
- `plan.upcoming-48h` (`generate-mastery-plan`)
- `brief.upcoming-24h` (`compute-outer-readiness`)
- `week-ahead` (`list-week-ahead-priorities`)

Log line is emitted only when something interesting happened (collapse,
multi-source mix, soft-hold, or multi-source merge):
```
[calendar-merge] surface=… user=… raw=… merged=… collapsed=… sources=[…] multiSourceMerges=… softHolds=…
```

### Known follow-ups (intentionally deferred)

1. `event_priority_memory.event_id` and HRV correlation keys still attach
   to provider `event_id` rather than `canonicalEventId`. Migration would
   need a back-compat lookup join; left as a scoped follow-up so this pass
   does not destabilise Plan/Brief.
2. Conflict/overlap resolver (`resolveOverlaps`) — current Plan ranker
   already performs overlap-aware ranking via the JIT selector; a dedicated
   shared resolver remains a candidate refactor but is not required for
   the load/density acceptance criteria, which read `multiCalendarLoad` and
   `backToBackHoursAggregated` from already-merged inputs.

### Part 3 verification snapshot (21 Jun 2026)

- `cron.job`: `smart-nudges` (*/10), `sync-calendar-scheduled` (*/30),
  `refresh-calendar-tokens` (*/10), `register-calendar-watch-daily` (3am),
  `oura-sync-hourly` (:07), `calendar-events-cleanup-nightly` (4am),
  `cleanup-device-tokens-daily` (3:17am), `process-orphaned-sessions` (*/10).
  No duplicate Oura cron.
- `calendar_events`: 426 rows, 0 duplicates on (user_id, provider, external_id).
- `calendar_connections`: 9 Google, 1 Microsoft. `oura_connections`: 1.
- `smart-nudges`: booting and evaluating (`Starting evaluation run v7`).
- Microsoft webhook subscription not yet supported in `register-calendar-watch`
  — documented v1 limitation; Outlook remains cron-driven via
  `sync-calendar-scheduled`.

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
