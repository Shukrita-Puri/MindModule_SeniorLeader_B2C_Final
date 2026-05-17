
# Recommendation: Split into 3 layered modules (not 2)

Senior-engineer take: yes, split — but two files isn't quite the right cut. The doc actually contains **three distinct concepts at three different rates of change**, and conflating any pair will hurt you later. Keep CEO behaviour logic where it already lives.

## The three concerns hiding in one file today

| Doc section | Concept | Rate of change | Owner |
|---|---|---|---|
| §2 | Protocol vocabulary (mindset/somatic × pause/flow/reenergise) | Almost never — clinical primitive | Coaching |
| §3 | Event categories A–H + triggers + Self-Regulation Focus | Rare — taxonomy | Coaching + Eng |
| §4 | Phase map (per category: Pre/During/Post × timing × goal × prevents/builds) | Frequent — coaching tunes prescriptions per event | Coaching |
| §5 | CEO Behaviour rules (detect & respond) | Frequent — engineering | Engineering (`ceo-behaviour/*.ts`) |
| §6 | What Framework Prevents/Builds (system-level rationale) | Rare — narrative | Docs (md, not ts) |

Today §2 + §3 + (partial) §4 are all in `event-protocol-taxonomy.ts`, and §4's `Goal` / `Prevents/Builds` columns are **lost** — only `timing` and `combo` survive.

## Proposed structure

```text
supabase/functions/_shared/
├── protocols/
│   └── protocol-combos.ts          §2 only — 6 ProtocolCombo primitives
├── events/
│   ├── event-categories.ts         §3 — A–H + triggers + selfRegulationFocus + classifyEvent()
│   └── event-phase-map.ts          §4 — per-category Pre/During/Post w/ timing, comboKey, goal, preventsBuilds[]
├── ceo-behaviour/
│   └── *.ts                        §5 — unchanged. Rules import from events/ + protocols/
└── docs/
    └── framework-prevents-builds.md §6 — narrative, not code
```

### Why three files, not two

- **Protocols (§2) deserve their own file** because non-event features will use them too (e.g. circadian nudges, free-form recovery suggestions). Coupling them to event taxonomy makes future non-event features import event code for no reason.
- **Phase map (§4) must be separate from categories (§3)** because §4 is where coaching iterates most (timing windows, goals, prevents/builds copy). Keeping §3 thin and stable lets the classifier remain trustworthy while §4 churns.
- **Behaviour rules (§5) stay in `ceo-behaviour/`** — they are *opinions over signals*, not taxonomy. They read from §3/§4 but should never be defined alongside them. Putting phase prescriptions into a behaviour-rule file would re-create the overlap problem you flagged.

## What each new file owns

### `protocols/protocol-combos.ts`  (§2)
- `Protocol`, `ProtocolMode`, `ComboKey`, `ProtocolCombo` types
- `PROTOCOL_COMBOS` constant (the 6 combos with whenToUse + outcome)
- `PRACTICE_TYPE_TO_COMBO` + `comboFor()` (legacy bridge)
- Zero knowledge of events or rules

### `events/event-categories.ts`  (§3)
- `EventCategoryId`, `EventCategory` types
- `EVENT_CATEGORIES` (id, name, triggers, **selfRegulationFocus** — full doc copy, not truncated)
- `classifyEvent(title, stakesLevel?)`
- No phase data here

### `events/event-phase-map.ts`  (§4 — the file you correctly intuited should exist)
- New `EventPhase` shape that captures **everything** the doc currently drops:
  ```ts
  interface EventPhase {
    timing: string;           // "T-60 to T-15min"
    combo: ComboKey;          // → PROTOCOL_COMBOS
    goal: string;             // §4 "Goal" column
    preventsBuilds: string[]; // §4 "Prevents / Builds" — array so we can render bullet lists
    severityHint?: "low"|"medium"|"high";
  }
  ```
- `EVENT_PHASE_MAP: Record<EventCategoryId, { pre?, during?, post?: EventPhase }>`
- `protocolsForEvent(title, phase)` lives here (it joins §3 + §4)
- Open per-category so coaching can edit one category without touching others

### `ceo-behaviour/*.ts`  (§5 — no change)
- Rules continue to import from `events/` and `protocols/` as needed
- We do **not** push phase prescriptions into `conference.ts`/`travel.ts` etc. Behaviour files decide *when/whether* to nudge; phase map decides *what protocol* the nudge prescribes. Different jobs.

### `docs/ceo-framework-prevents-builds.md`  (§6)
- System-level narrative ("prevents burnout, decision leakage…") stays as docs, not code. No runtime consumer needs it.

## Future-feature angle (your question about each feature having its own mapping)

Two patterns will emerge — be ready for both:

1. **Feature reads the shared phase map** (most common). E.g. smart-nudges, brief, plan all ask "what's the Pre protocol for a Board event?" → one source of truth in `event-phase-map.ts`.
2. **Feature needs its own overlay** (specialised, e.g. a future Sparring-Partner feature wants pre-event prep 7 days out). Create `features/sparring-partner/phase-overlay.ts` that *extends* `EVENT_PHASE_MAP` rather than duplicating it. Pattern: `mergePhaseMap(base, overlay)`. This avoids the failure mode you described where conference Pre logic gets re-implemented per feature.

Rule of thumb: **shared taxonomy in `events/`, feature-specific timing/copy overlays inside the feature folder.**

## Migration plan (low risk, mechanical)

1. Create the three new files; copy current contents across with no behaviour change.
2. Enrich `event-phase-map.ts` with the missing `goal` + `preventsBuilds` data from doc §4 (one PR, coaching-reviewable).
3. Update imports — only two consumers today: `ceo-behaviour/*` and `event-protocol-taxonomy.test.ts`.
4. Re-point the test file (rename to `events/event-categories.test.ts` + new `event-phase-map.test.ts`).
5. Delete `event-protocol-taxonomy.ts` (or leave a one-line re-export shim for one release if you want a soft deprecation).
6. Update `mem/architecture/ceo-behaviour-shared-module-ownership.md` to document the new layering.

No DB, no edge-function deploy, no API surface change. All test-covered.

## What I'd explicitly NOT do

- ❌ Merge §4 into `ceo-behaviour/*.ts`. Behaviour rules already have a single job (decide when to fire); phase prescriptions are a different concern with a different review cadence and a different owner.
- ❌ Two-file split (taxonomy + protocols). Loses the §3/§4 separation that makes §4 safely editable.
- ❌ Embed §6 in a `.ts` file. It's never read at runtime; making it code invites drift.

## Open questions for you before I implement

1. Keep a shim re-export at the old path for one release, or hard-cut?
2. `preventsBuilds` — array of strings (renderable bullets) or single string (verbatim doc copy)? I'd recommend array.
3. Should `event-phase-map.ts` also carry a `severityHint` per phase so behaviour rules can default severity from the phase rather than re-deriving it?
