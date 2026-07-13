# Bug 3 — "Evening Close 2" Duplicate Horizon Module

**Status:** Fixed (Stage 1, client-only, one-line change)
**Date:** 2026-07-13
**Scope:** Root-cause analysis, evidence, and rationale for the chosen fix.
**File changed:** `src/components/home/TodayThreePriorities.tsx` (inside `buildFallbackHorizonModules`, ~L328–333)

---

## 1. Original hypothesis

Users reported that the Evening window occasionally displayed two Horizon
Modules with near-identical headers — most visibly:

```
Evening Close
Evening Close 2
```

The prior investigation could not resolve, from the repository alone,
whether the duplication originated on:

- **Server:** `generate-mastery-plan` emitting two Horizon Modules whose
  `timeLabel` collided, with the `" 2"` suffix coming from a server-side
  disambiguator; or
- **Client:** a rendering path fabricating a second slot header from a
  single grouped server payload.

The correct layer for the fix depended on which case applied. The
investigation was therefore split: repository trace first, then a
production snapshot to disambiguate.

---

## 2. Repository evidence

### 2.1 Where Horizon Modules are constructed (server)

`supabase/functions/generate-mastery-plan/index.ts`:

- `buildHorizonModules(...)` at **L5734** is the single server-side
  constructor. Each slot receives its **own** per-slot `timeLabel`:
  - JIT slots: `"Prepare ahead of <Event>"` / `"Recover after <Event>"`
    resolved at L5889–5896.
  - State/filler slots: labels assigned at L6362 (slot 1), L6484 (slot 2),
    L6643 (slot 3), L6924 (filler).
  - Per-slot replacement override at L4209.
  - Cross-slot event dedupe path at L6964, L7297.
- **None** of these server paths append `" 2"`, `" 3"`, or any numeric
  index to `timeLabel`. A repository-wide search confirms no server
  literal `"Evening Close 2"` exists.

### 2.2 Period label vs per-slot label

The server also emits a **period-level day-header** at
`plan_json.timeOfDayPlan.label`, defined at **L4054–4058**:

```ts
const periodLabels: Record<string, string> = {
  morning: 'Morning Practice',
  afternoon: 'Afternoon Reset',
  evening: 'Evening Close',
};
```

This is a single string describing the *window*, not a per-slot label.

### 2.3 Where the `" 2"` suffix actually comes from

A repository-wide search for `${label} ${index + 1}` returns exactly one
match:

`src/components/home/TodayThreePriorities.tsx` **L314–346** —
`buildFallbackHorizonModules(planJson)`. This is a client-side function
that synthesises `HorizonModule[]` when the persisted `horizon_modules`
array is empty. Prior code at L330:

```ts
timeLabel: index === 0 ? label : `${label} ${index + 1}`,
```

`label` is read from `planJson.timeOfDayPlan.label` (L325) — the
**period-level header**. The fallback stamps that period label onto every
synthesised slot and disambiguates the second and third by appending an
index. This is the sole codepath in the repository that can produce
`"Evening Close 2"`.

### 2.4 When the fallback runs

`normalizeSnapshotPlan` (L352–369) selects `horizonModules` in this
precedence:

1. `snapshot.horizon_modules` (top-level column) — preferred.
2. `plan_json.horizonModules` — secondary.
3. `buildFallbackHorizonModules(plan_json)` — last resort.

The fallback fires only when both persisted arrays are empty.

---

## 3. Production snapshot evidence

Query against `public.mastery_plan_snapshots`, last 10 evening rows:

```
 user_id                                 | plan_date  | mrs_window | hm_count | pj_hm_count | pj_prio_count | pj_tod_count
-----------------------------------------+------------+------------+----------+-------------+---------------+--------------
 google-oauth2|115609198677143708541     | 2026-07-13 | evening    |   2      |     2       |     0         |    2
 google-oauth2|111878424918915566691     | 2026-07-13 | evening    |   0      |     0       |     0         |    2
 auth0|69c97b23403fe9d37cd992b8          | 2026-07-13 | evening    |   0      |     0       |     0         |    2
 linkedin|DFUJTWpo4O                     | 2026-07-13 | evening    |   0      |     0       |     0         |    2
 google-oauth2|111878424918915566691     | 2026-07-12 | evening    |   0      |     0       |     0         |    2
 linkedin|DFUJTWpo4O                     | 2026-07-12 | evening    |   0      |     0       |     0         |    2
 google-oauth2|111878424918915566691     | 2026-07-11 | evening    |   0      |     0       |     0         |    2
 auth0|69c97b23403fe9d37cd992b8          | 2026-07-11 | evening    |   0      |     0       |     0         |    2
 linkedin|DFUJTWpo4O                     | 2026-07-11 | evening    |   0      |     0       |     0         |    2
 google-oauth2|113352274928800158207     | 2026-07-10 | evening    |   0      |     0       |     0         |    2
```

Where:
- `hm_count`     = `jsonb_array_length(horizon_modules)`
- `pj_hm_count`  = `jsonb_array_length(plan_json.horizonModules)`
- `pj_tod_count` = `jsonb_array_length(plan_json.timeOfDayPlan.modules)`

Shape of an affected row (rows with `hm_count = 0`):

```
 period_label   | m0                            | m1
----------------+-------------------------------+----------------------------------
 Evening Close  | Presence Through Grounding    | Clarity in Chaos Through The Eye
 Evening Close  | Deep Calm Forest Bathing      | Purpose-Driven Flow Through Ikigai
 Evening Close  | Deep Focus w/ Monastic Reson. | Clarity in Chaos Through The Eye
```

**This is Case B** from the prompt taxonomy: server emits **one**
`timeOfDayPlan.label = "Evening Close"` with **two distinct practices**
underneath. `horizon_modules` is empty, so the client fallback fires and
fabricates two Horizon Modules with `timeLabel = "Evening Close"` and
`timeLabel = "Evening Close 2"`.

The single row with `hm_count = 2` (the 2026-07-13 Google user at the top)
would render server-supplied per-slot labels and would **not** exhibit the
`" 2"` suffix — consistent with the client-only origin.

---

## 4. Why the client fallback generated "Evening Close 2"

Mechanism, line-by-line:

1. Server persists a snapshot where `horizon_modules = []` but
   `plan_json.timeOfDayPlan = { label: "Evening Close", modules: [ … , … ] }`.
2. `normalizeSnapshotPlan` sees both persisted arrays empty and calls
   `buildFallbackHorizonModules(plan_json)`.
3. `buildFallbackHorizonModules` reads `label = "Evening Close"` once, then
   `.map(...)` over `timeOfDayPlan.modules`.
4. On iteration `index = 0` it assigns `timeLabel: label` → `"Evening Close"`.
5. On iteration `index = 1` it assigns `timeLabel: `${label} ${index + 1}`` →
   `"Evening Close 2"`.
6. The two synthesised Horizon Modules render side-by-side in
   `TodayThreePriorities` via `performanceSlotLabel(hm.timeLabel, hm.isJit)`,
   producing the visible duplicate.

The `" 2"` was a **client-side disambiguator**, not a server-side second
Horizon Module. The server's grouping is already correct: one label, two
practices. The client flattened that grouping into two Horizon Modules
and mislabelled the second.

---

## 5. Why the one-line client fix is correct

**Change:** Remove the numeric suffix from `buildFallbackHorizonModules`.
Assign `timeLabel: label` unconditionally.

### 5.1 Alignment with server SSOT

Server contract (mem://features/mastery-plan/today-three-priorities-logic,
mem://features/mastery-plan/per-priority-queue-contract):

- `timeOfDayPlan.label` is a **day-header** — the window's identity.
- Per-slot identity is carried by `HorizonModule.timeLabel` when the
  server produces it, and by `HorizonModule.practice.title` (rendered in
  the card body) plus the numbered slot bubble in the header.

The fix restores the fallback to that contract: the header describes the
window (server-authoritative), the slot bubble (1/2/3) disambiguates
order, and per-practice identity lives in the card body. Nothing is
invented client-side.

### 5.2 Blast radius

- Server-generated Horizon Modules (`hm_count > 0`) are untouched — they
  bypass the fallback path entirely.
- No change to telemetry, ledger merge, priority queues, echo guards
  (Bug 2), MRS override (Bug 1), or any server function.
- Typecheck passes (`bunx tsgo --noEmit`, 0 errors).

### 5.3 Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| Emit per-slot labels on the server when `horizon_modules` is empty | Out of scope for a production duplicate-string defect; requires investigating why the server drops `horizon_modules` on the evening window (larger, separate work). |
| `timeLabel = practice.title` in the fallback | Would echo the practice title already rendered in the card body — trades one visual duplication for another, and would trip the Bug 2 echo guards. |
| Suppress rendering when `horizon_modules` is empty | Would blank the evening plan for the majority of current evening snapshots (3 of 4 latest rows). Regression, not a fix. |
| Client-side de-duplication of Horizon Modules by `practice.contentId` | Defensive duplication; masks a real data-shape mismatch rather than resolving it. Violates the "one source of truth" constraint. |

### 5.4 Rollback

Revert the one-line change in `buildFallbackHorizonModules`. Restores
prior `${label} ${index + 1}` behaviour with no other side effects.

---

## 6. Why empty `horizon_modules` on evening is a separate server improvement

Production data shows that 3 of the 4 latest evening snapshots have
`horizon_modules = []` **and** `plan_json.horizonModules = []`, while
`plan_json.timeOfDayPlan.modules` is populated. Meaning the server:

- Produced practice modules for the window; but
- Did not persist a `horizon_modules` projection.

This is a **separate defect** in `generate-mastery-plan` and does **not**
cause the "Evening Close 2" symptom — it only causes the client fallback
path to fire. Once the fallback stops fabricating a `" 2"` suffix, the
user-visible bug is gone regardless of whether the server also learns to
populate `horizon_modules` on the evening window.

Reasons to keep this out of the current fix:

1. **Different layer.** The visible defect is entirely client-generated
   text. Fixing at the layer that produces the wrong string is the
   minimal correct scope per the Stage 1 prompt.
2. **Different failure mode.** The server-persistence gap manifests as
   *fallback usage frequency*, not as duplicated headers. It is a
   contract question ("must every window persist `horizon_modules`?"),
   not a rendering question.
3. **Different risk profile.** Touching `generate-mastery-plan`'s
   evening branch requires reasoning about `buildHorizonModules` output
   vs `finalHorizonModules` persistence (see `index.ts` L7692–7734), the
   ledger merge, and the enrichment pass. That is Stage 2 work and
   deserves its own root-cause pass with its own snapshot evidence.
4. **Not on the critical user-facing path.** With the client fix in
   place, the fallback renders correctly. There is no user-visible
   pressure to change server persistence semantics in the same PR.

**Recommended follow-up (Stage 2, not this PR):** open a separate
investigation into why `generate-mastery-plan` returns `horizonModules =
[]` for the evening window on 3 of 4 recent snapshots. Decide whether
the server contract should guarantee a populated `horizon_modules`
projection for every persisted window, or whether the client fallback
should remain the intended path for that shape.

---

## 7. Summary

- **Layer:** Client rendering.
- **File:** `src/components/home/TodayThreePriorities.tsx`,
  `buildFallbackHorizonModules`.
- **Change:** One line — drop the `${label} ${index + 1}` numeric suffix.
- **Evidence:** Production snapshots show `horizon_modules = []` with a
  single `timeOfDayPlan.label` and multiple distinct practices, exactly
  matching the input shape the client fallback mishandles.
- **Server plans unaffected.** When the server persists real Horizon
  Modules, its per-slot labels win and the fallback never runs.
- **Empty `horizon_modules` on evening is tracked separately** as a
  Stage 2 server-contract question, not part of this fix.