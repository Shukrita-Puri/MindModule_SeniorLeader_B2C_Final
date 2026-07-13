# Post-Implementation Audit — Bugs 1, 2, 3

**Date:** 2026-07-13
**Scope:** Repository-wide review of the changes shipped for Bug 1 (Brief vs Today MRS mismatch), Bug 2 (Why-line title echo), and Bug 3 (Evening Close 2 duplicate). Read-only — no code modified.

**Reviewed surfaces**
- `src/components/home/DecisionReadinessBrief.tsx` (MRS override, L2158–2180)
- `src/components/home/TodayThreePriorities.tsx`
  - `buildFallbackHorizonModules` (L314–355)
  - Collapsed why-line guard (L2475–2516)
  - Expanded why-line guard (L2576–2635)
- `src/hooks/useMrsSnapshot.ts`
- Helpers introduced / touched: `fallbackRecommendedAction`, `isEcho`, `stripBriefMarkdown`, `currentPeriodLocal`.

---

## 1. Findings by area

### 1.1 `DecisionReadinessBrief` — MRS override (Bug 1)

**State:** Correct against spec. `shouldPreferMrsSnapshot` gates on `isRenderable`, finite `score`, and `mrsWindow === currentPeriodLocal()`. Narrative/pills remain driven by `outerBrief`; only `score` and `tier` are overridden. Telemetry `[decision-readiness-brief] mrs_override` fires.

**Technical debt**
- **Two persisted readiness score writers coexist.** `outerBrief.innerReadinessScore` (Brief snapshot) and `daily_context_snapshot.readiness_score_*` (MRS snapshot) can diverge; the client override masks divergence at the view layer only. This is explicitly acknowledged Stage 2 work but is now load-bearing for correctness — any future regression that stops the override silently reintroduces Bug 1.
- **Tier fallback asymmetry.** `tier = mrsSnapshot.tier ?? tier` keeps the brief's tier when the snapshot tier is null, while `score` is replaced unconditionally. A snapshot with a numeric score but null tier will render an MRS score with a Brief-derived tier band — internally consistent inside the snapshot, but not consistent with the Today gauge if the gauge derives its tier from the score directly.
- **Order-of-declaration coupling.** `score`/`tier` are declared `let` at L2155 and mutated at L2178–2179. Any future refactor that memoises or destructures these earlier will break the override silently. There is no assertion or test around the invariant.

**Risks**
- The override reads `currentPeriodLocal()` at render time; the MRS snapshot's `mrsWindow` is also derived from `currentPeriodLocal()` inside `useMrsSnapshot`. If the local period rolls over between the hook's query and the component's render (rare, e.g. 05:00 / 12:00 / 18:00 boundary), the equality check can flap. No practical user impact but worth noting.

### 1.2 `TodayThreePriorities` — Why-line echo guard (Bug 2)

**State:** Refined guard in place on the expanded path (L2576–2635). `practiceTitle` is checked alongside `moduleTitle` and `timeLabel` on the raw why-line and on both fallbacks (`stepRationale[0]`, `recommendedAction`). Telemetry emits `practiceTitle`.

**Technical debt / redundancy**
- **`moduleTitle` and `practiceTitle` currently alias.** Both resolve to `module?.title` (with `module = hm.practice`). The redundant `!isEcho(raw, practiceTitle)` check is a no-op today; the value is defensibility against a future data-shape change where `hm.practice` and the visible practice diverge (e.g. slot-level vs. module-level titles). This should be documented in-file — right now it looks like dead code and a future cleanup pass would likely delete it.
- **Collapsed vs. expanded drift.** The collapsed guard (L2475–2516) still checks only `moduleTitle` + `timeLabel`. Spec explicitly scoped the refinement to expanded, so this is intentional — but the two blocks are now structurally different copies of the same logic. Any future change to the fallback chain has to be made in two places.
- **Duplicated fallback chain.** The pattern `raw → stepRationale[0] → recommendedAction → fallbackRecommendedAction(hm)` is inlined twice (~40 lines each). Not a bug; a candidate for extraction into a `resolveWhyLine(hm, module, opts)` helper. Extraction was explicitly out of scope.
- **`isEcho` semantics not visible in this audit slice.** The guard relies entirely on `isEcho` being case-insensitive + whitespace-collapsing. Worth a targeted unit test if none exists — the whole fix rests on that predicate.

**Risks**
- The telemetry key `[today-three-priorities] whyline_title_echo` is the only signal telling us how often server-side why-lines echo titles. There is no dashboard/aggregation wired to it. Without an aggregate, the "how big is this problem server-side?" question stays open.

### 1.3 `TodayThreePriorities` — `buildFallbackHorizonModules` (Bug 3)

**State:** One-line fix applied at L339 (`timeLabel: label`, no numeric suffix). Comment at L330–338 explains rationale and links to memory.

**Technical debt / remaining risk**
- **Server persistence gap is now silently absorbed.** Production evidence (BUG_3_ROOT_CAUSE_REPORT §3) showed 3 of 4 latest evening snapshots with `horizon_modules = []`. The fallback now renders those correctly, which removes user-visible pressure to fix `generate-mastery-plan`'s evening persistence. That gap is real Stage 2 work and should not be forgotten.
- **All fallback slots now share an identical `timeLabel`.** Ordering relies entirely on the numbered slot bubble (1/2/3) rendered in the header. If the bubble is ever removed, restyled to be less prominent, or reordered independently, evening slots will look like true duplicates again. There is no test asserting the bubble's presence.
- **`showPulse: index === 0`** still uses `index` — that's fine, but it's a reminder that ordering semantics live in the fallback in more places than just `timeLabel`. Any future "server persists per-slot metadata" work needs to preserve this.
- **`arcLabel` heuristic.** `period === 'evening' && practice.type === 'integrate' ? 'Recover' : 'Steady'` is a client-invented arc label for fallback slots. When server-authored `horizon_modules` are missing, this is the only source of arc — and it can disagree with any server logic that later fills in real arcs.

### 1.4 `useMrsSnapshot`

**State:** Correct and self-contained. Reads via `get-mrs-snapshot` edge function (not direct table read — good, respects Auth0/RLS constraint). Returns `null` when the current-window row is missing; caller falls back to live compute. Never falls back to a different window or day — matches the memory rule.

**Technical debt**
- **`readinessState` narrowing.** Only `'refined' | 'baseline' | 'awaiting'` are accepted; anything else becomes `null`. If the server ever emits a new state, the hook silently drops it and score-selection may pick the wrong branch. Consider logging unknown states.
- **`score` selection precedence.** `readinessState === 'refined' && refined !== null ? refined : (baseline ?? inner)`. `inner` is the ultimate fallback but is not documented in the type surface (`MrsSnapshot` exposes `scoreBaseline`/`scoreRefined` but not "inner"). A consumer inspecting `scoreBaseline`/`scoreRefined` will see two nulls yet `score` will be non-null — surprising.
- **Console noise.** `[useMrsSnapshot] no row` (warn) and `[useMrsSnapshot] row` (info) fire on every render-triggered refetch. Fine for the current diagnostic phase, worth demoting before release.
- **`staleTime: 60_000` with a query key that includes `currentPeriodLocal()`.** Correct behaviour (window change invalidates), but at a window boundary the previous window's cached row can remain until the next refetch. Combined with the `DecisionReadinessBrief` window-equality gate, this is safe — worth noting for anyone who removes the gate.

---

## 2. Cross-cutting observations

### 2.1 No duplicated code paths introduced by the fixes
- Bug 1: single override site.
- Bug 2: two why-line blocks (collapsed / expanded) — pre-existing structure; the refinement is scoped to expanded per spec.
- Bug 3: single fallback constructor; server path (`hm_count > 0`) untouched.

No obsolete fallbacks or dead guards were left behind.

### 2.2 Duplicate slot-grouping logic search
Repository-wide search for slot-grouping constructions turned up only one client-side path that fabricates `HorizonModule[]` from a period label + practice list — `buildFallbackHorizonModules`. `stripCoachFromPlan` (L301) mutates existing modules but does not fabricate them. `normalizeSnapshotPlan` (L361) selects between three already-shaped arrays. No hidden second fallback exists.

### 2.3 Conflicting logic between Bug 1 and Bug 2/3
None. Bug 1 mutates `score`/`tier`; Bug 2/3 touch rendering of `timeLabel` / `whyLine`. The surfaces do not intersect.

### 2.4 Helpers introduced / touched
- `fallbackRecommendedAction(hm)` — pre-existing, used unchanged as the tail of Bug 2's fallback chain.
- `isEcho(a, b)` — pre-existing predicate, load-bearing for Bug 2. Not covered by a dedicated test in the reviewed slice.
- `stripBriefMarkdown` — imported unchanged, used to render final why-line text.
- `currentPeriodLocal` / `localISODate` — shared between `useMrsSnapshot` and `DecisionReadinessBrief`; single source (`@/utils/persistentBriefCache`). Good.

No brand-new helpers were introduced by these fixes.

---

## 3. Follow-up recommendations (no code changes now)

Ordered by risk-reduction value:

1. **Stage 2 server work — consolidate readiness score writers.** As long as `outerBrief.innerReadinessScore` and `daily_context_snapshot.readiness_score_*` are independent writes, Bug 1 can recur through any code path that renders the brief score without the MRS override. Target: a single canonical writer (server) with brief/plan/home reading from it.
2. **Stage 2 server work — populate `horizon_modules` for the evening window.** Production snapshots show the fallback path is the norm for evening, not the exception. Either guarantee the projection is populated in `generate-mastery-plan`, or explicitly mark the fallback as the intended evening render path in the SSOT memory.
3. **Server-side why-line validator.** The client echo guard is a safety net. The real fix is `generate-mastery-plan` never emitting a why-line that echoes `module.title` / `practice.title` / period label. Add a validator that rejects echo why-lines at generation time and logs the same telemetry.
4. **Extract `resolveWhyLine(...)` helper.** Consolidates the two ~40-line inline blocks. Prevents collapsed/expanded drift and gives Bug 2 a single unit-test surface.
5. **Unit tests for `isEcho`.** All three fixes route through it (Bug 2 explicitly, Bug 3 implicitly via the fallback labelling not being echoed). Cover: case-insensitive, whitespace-collapsing, punctuation, empty inputs.
6. **Telemetry aggregation.** Wire `[today-three-priorities] whyline_title_echo`, `[decision-readiness-brief] mrs_override`, and `[useMrsSnapshot] no row` into whatever aggregate the team uses. Without counts, we cannot judge whether the underlying server defects are shrinking.
7. **Demote `useMrsSnapshot` console noise** once the Bug 1 rollout is verified.
8. **Comment the `moduleTitle` / `practiceTitle` alias** in the expanded guard so the "why are we checking the same value twice?" question is answered in-file.
9. **Assertion or test around the MRS override invariant** in `DecisionReadinessBrief` — a simple test that `score` and `tier` are `let`-assigned and mutable after `useMrsSnapshot` resolves.
10. **Tier-fallback symmetry review** in `DecisionReadinessBrief`: decide whether replacing `score` should also force `tier` (derived from the score) rather than keeping the Brief's tier when the snapshot tier is null.

---

## 4. Summary

The three fixes are minimal, scoped, and internally consistent. No duplicate code paths, no conflicting logic, no obsolete fallbacks. The main outstanding risks are architectural rather than defects in the shipped code:

- Bug 1 is masked at the view layer; the score-writer divergence remains.
- Bug 2 is guarded at the display; server can still emit echo why-lines.
- Bug 3 is fixed at the rendering layer; the server's empty `horizon_modules` on evening is untouched.

All three are appropriate Stage 2 server tasks. None block current release.
