
# Unify event taxonomy: one A–H, three layered modules

## The real problem

You now have **three independent A–H pillar definitions** in three files. They will drift.

| File | A–H definition | What else lives there |
|---|---|---|
| `executive-state-taxonomy.ts` | `FRAMEWORK_PILLARS` (id, name, focus, **pre/during/post protocol**) | `EVENT_TYPES` (30 granular subtypes), `classifyEvent`, scoring, dedupe, engines, morning/evening context |
| `events/event-categories.ts` | `EVENT_CATEGORIES` (id, name, triggers, `selfRegulationFocus`) | `classifyEvent` (different, title-keyword only) |
| `events/event-phase-map.ts` | `EVENT_PHASE_MAP` (id → Pre/During/Post `EventPhase`) | `protocolsForEvent`, `phaseForEvent` |

Two `classifyEvent` functions. Two pillar-name lists with different copy. Two protocol contracts (one in `FRAMEWORK_PILLARS.protocol`, one in `EVENT_PHASE_MAP`). The new `events/*` folder is thinner and *less* accurate (8 generic triggers vs 30 keyword-rich subtypes), so 11 downstream callers still depend on `executive-state-taxonomy.ts`. Nothing has actually been replaced — it's been duplicated.

## CTO recommendation

Promote `events/` to the single source. Split `executive-state-taxonomy.ts` along its real seams (taxonomy / classifier / engines), fold its `FRAMEWORK_PILLARS` into `event-categories.ts`, and lift its `EVENT_TYPES` (the genuinely valuable part) into a new `event-subtypes.ts`. Delete `executive-state-taxonomy.ts` behind a re-export shim.

### Target layout

```text
supabase/functions/_shared/
├── protocols/
│   └── protocol-combos.ts          §2 — unchanged
└── events/
    ├── event-categories.ts         §3 — SINGLE A–H definition
    │                                 (merges FRAMEWORK_PILLARS:
    │                                  id, name, focus, protocol contract,
    │                                  triggers, selfRegulationFocus)
    ├── event-phase-map.ts          §4 — rich Pre/During/Post detail
    │                                 (timing, goal, preventsBuilds, severityHint)
    ├── event-subtypes.ts           NEW — 30 granular EVENT_TYPES from
    │                                 executive-state-taxonomy, each tagged
    │                                 with categoryId from event-categories
    │                                 (keywords, demandProfile, jitLeadTime,
    │                                  interventionType, scenarioId map)
    ├── event-classifier.ts         classifyEvent (canonical, subtype-aware),
    │                                 scoreEvents, selectLeadEvent,
    │                                 rankByStakes, dedupeCalendarEvents,
    │                                 detectDayKindFromEvents
    └── state-engines.ts            detectCognitiveFragmentation,
                                       detectVisibilityAccumulation,
                                       detectEmotionalCarryover,
                                       buildMorningContext,
                                       buildEveningContext,
                                       consolidateAdjacentHighStakes
```

Then: `executive-state-taxonomy.ts` becomes a one-line re-export shim for one release, then is deleted.

### Why this is the right cut

- **One A–H, one place.** `event-categories.ts` becomes the *only* file defining pillar id, name, focus, and pre/during/post protocol contract. `event-phase-map.ts` adds the rich coaching detail (timing window, goal, prevents/builds). Both reference the same enum.
- **Subtypes survive.** `EVENT_TYPES` is the highest-value asset in `executive-state-taxonomy.ts` — it powers JIT lead times, mastery scenarios, demand-dimension scoring, intervention type per subtype, and the dedupe layer. It moves intact into `event-subtypes.ts` and each row simply gains `categoryId: EventCategoryId` referencing `event-categories.ts`.
- **Engines are not taxonomy.** Morning/Evening context, fragmentation/carryover detection, and high-stakes consolidation are *runtime derivations over signals*. They move to `state-engines.ts` so the taxonomy files stay pure data.
- **Classifier is its own seam.** A single `classifyEvent` lives in `event-classifier.ts`, subtype-aware (returns `{ subtype: EventType, category: EventCategoryId }`) so older callers that expected the subtype object keep working and newer callers can ask only for the category.
- **Names: user-friendly wins.** Adopt the executive-state pillar names ("High-Stakes Governance, Influence & Persuasion, Visibility & Communication, People & Difficult Conversations, Deep Work & Strategy, Conferences & External Events, Travel, Daily Rhythm & Baseline") — they read better than the new `event-categories.ts` SCREAMING_CASE strings and are already what `causality_findings.signal_summary` bucket labels expect (don't break Insights).
- **Future features keep one import path.** Brief, Nudges, Plan, JIT, Insights cause-effect, Coach summary — all six already import `executive-state-taxonomy.ts`. They re-point to `events/*` once, then any new feature does the same. Feature-specific timing overlays still go inside the feature folder per the existing `mem/architecture/ceo-behaviour-shared-module-ownership.md` rule.

### Concretely what merges

**`event-categories.ts` (rewritten)** owns one canonical `EventCategory`:
```ts
interface EventCategory {
  id: 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H';
  name: string;                  // user-friendly, matches Insights buckets
  selfRegulationFocus: string;   // from §3
  protocol: {                    // from FRAMEWORK_PILLARS.protocol
    pre: 'Pause'|'Flow'|'Reenergise'|null;
    during: 'Pause'|'Flow'|'Reenergise'|null;
    post: 'Pause'|'Flow'|'Reenergise'|null;
    duringNotificationOnly?: boolean;
  };
}
```
Triggers move OUT (subtype keywords are richer and replace them).

**`event-phase-map.ts` (kept)** unchanged structurally but its `combo` field is now validated against `event-categories.protocol` at module load to fail fast on drift.

**`event-subtypes.ts` (new)** is the verbatim `EVENT_TYPES` array plus `EVENT_TYPE_TO_SCENARIO_ID`, each row carrying `categoryId` (= old `frameworkPillar`). `primaryPillar` / `secondaryPillar` (1–5 priority states) stay because the engines consume them.

### Migration steps (low risk, mechanical, behaviour-preserving)

1. **Create `events/event-subtypes.ts`** — copy `EVENT_TYPES`, `EVENT_TYPE_TO_SCENARIO_ID`, `scenarioIdFor`, `EventType`, demand/pillar types from `executive-state-taxonomy.ts`. Rename `frameworkPillar` → `categoryId` (alias both for one release).
2. **Rewrite `events/event-categories.ts`** — merge `FRAMEWORK_PILLARS` content (name, focus, protocol) with current `selfRegulationFocus`. Drop the standalone trigger list (subtype keywords supersede it). Export `EVENT_CATEGORIES`, `EventCategoryId`.
3. **Create `events/event-classifier.ts`** — move `classifyEvent`, `isHighStakesTitle`, `highStakesScore`, `scoreEvents`, `selectLeadEvent`, `rankByStakes`, `dedupeCalendarEvents`, `detectDayKindFromEvents`, `isNoiseTitle`, `survivesAttendeeOrDurationFloor`, `stakesScore`. Single `classifyEvent` returns `{ subtype, categoryId }`.
4. **Create `events/state-engines.ts`** — move all `detect*` functions, `evaluateAllEngines`, `buildMorningContext`, `buildEveningContext`, `consolidateAdjacentHighStakes`, related types.
5. **Add validation tests** — module-load assert that every `EVENT_TYPES.categoryId` ∈ `EVENT_CATEGORIES`, every `EVENT_PHASE_MAP` combo matches `EVENT_CATEGORIES[id].protocol`, and `event-categories.test.ts` is updated to the merged shape.
6. **Re-point 11 consumers** in one PR — pure import-path change, no logic:
    - `brief-signal-coverage.ts`, `ceo-behaviour/{back-to-back,calendar-dedupe,interpersonal,pto-holiday,weekend}.ts`
    - `cause-effect-engine`, `compute-outer-readiness`, `generate-coach-summary`, `generate-jit-events`, `generate-mastery-plan`, `performance-rhythm-insights`, `self-mastery-coach`, `smart-nudges`
    - `src/utils/momentDetectionEngine.ts`
7. **Shim** — leave `executive-state-taxonomy.ts` as `export * from './events/event-classifier'; export * from './events/event-subtypes'; ...` for one release.
8. **Update `mem/architecture/ceo-behaviour-shared-module-ownership.md`** with the new layering and the rule: *one A–H, one classifier, subtype rows reference category id by enum, never by string*.
9. **Delete `executive-state-taxonomy.ts`** in the following release.

### What I explicitly will NOT do

- ❌ Keep two A–H pillar definitions "for compatibility". That *is* the bug.
- ❌ Adopt the thinner `event-categories.ts` names (`HIGH-STAKES GOVERNANCE` etc.) — they break Insights bucket labels and are less user-friendly.
- ❌ Collapse subtypes into categories. Losing 30 keyword-rich rows kills JIT precision, mastery scenario routing, and demand-dimension scoring.
- ❌ Move engines (`buildMorningContext` etc.) into `event-categories.ts`. They are runtime derivations, not taxonomy.
- ❌ Inline category data into each feature ("each feature has its own mapping"). Features should *consume* the shared category + phase map; only feature-specific timing/copy overlays belong in feature folders.

### Risk

Low. All moves are file relocations; no behaviour changes. The two consolidations (FRAMEWORK_PILLARS → EVENT_CATEGORIES, EVENT_TYPES → event-subtypes) are mechanical with module-load validators catching any drift at boot. Test coverage already exists for `event-categories`, `event-phase-map`, and `ceo-behaviour/*` — extend with one cross-validation test asserting the three layers agree.

### Open questions before I implement

1. **Pillar names** — confirm we adopt executive-state-taxonomy's user-friendly names (and bump `causality_findings.signal_summary` bucket strings stays as-is)?
2. **Shim duration** — one release of `executive-state-taxonomy.ts` re-exports, or hard-cut now (11 imports, all in your codebase, mechanical to update in a single PR)?
3. **`primaryPillar` 1–5 priority-state codes** — keep on subtypes (engines use them) or fold into category metadata? I'd keep on subtypes; the 1–5 model is a different axis from A–H and removing it would force engine rewrites.
