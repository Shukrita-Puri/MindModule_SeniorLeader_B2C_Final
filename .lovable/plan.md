## Stage 1: Three frontend-only guards + diagnostic doc

Scope: view-layer defensive guards only. No server code, no DB, no scoring changes. Each change is additive and console-only for telemetry.

### 1. Bug 1 — Prefer MRS snapshot for Brief numeric score/tier

File: `src/components/home/DecisionReadinessBrief.tsx`

- Add `import { useMrsSnapshot } from '@/hooks/useMrsSnapshot'`.
- At the site where `score` / `tier` are computed (currently `const` around L2154–2155, gated by `hasCurrentPeriodSignal`), convert to `let` and override with `mrsSnapshot.score` / `mrsSnapshot.tier` when:
  - `mrsSnapshot.isRenderable === true`
  - `typeof mrsSnapshot.score === 'number'`
  - `mrsSnapshot.mrsWindow === currentPeriodLocal()` (already imported/used elsewhere; import if needed)
- On override, emit `console.info('[decision-readiness-brief] mrs_override', { userId, briefScore, mrsScore, window })` wrapped in try/catch.
- Narrative, pills, and all other consumers of `outerBrief` untouched.

Contract: `useMrsSnapshot` already returns `{ score, tier, mrsWindow, isRenderable, ... }` with the exact semantics needed (see `src/hooks/useMrsSnapshot.ts`) — no shape work required.

### 2. Bug 2 — Suppress title-echo in "Why this matters"

File: `src/components/home/TodayThreePriorities.tsx`

- Add module-scope helper `isEcho(why, title)` — trimmed, case-insensitive exact match, try/catch safe.
- Collapsed block (currently L2453–2460 rendering `stripBriefMarkdown(hm.whyLine)`): replace with an IIFE that:
  1. Uses `hm.whyLine` if it is NOT an echo of `module.title` or `hm.timeLabel`.
  2. Else logs `console.info('[today-three-priorities] whyline_title_echo', { userId, moduleTitle, whyLine })`, then falls back to first non-echo of: `hm.stepRationale[0]` → `hm.recommendedAction` → `fallbackRecommendedAction(hm)`.
- Expanded block (currently L2522–2528): same IIFE, but echo-check against `practice.title`, `module.title`, `hm.timeLabel`; fallback order: `hm.stepRationale[pIdx]` → `hm.recommendedAction` → `fallbackRecommendedAction(hm)`.
- No changes to layout, headings, or the "Why this matters" label.

### 3. Bug 3 — Diagnostic doc only (no runtime change)

File: `.github/BUG_FIX_PROMPT.md` (new)

- Contains the staged plan, the evening slot grouping diagnostic SQL against `mastery_plan_snapshots` (parameterised on `user_id`, `plan_date`, `mrs_window`), and the interpretation rule:
  - Two modules titled "Evening Close" / "Evening Close 2" → server-side duplication.
  - Single module with `practices.length === 2` → client-side flattening.

### Verification (local)

- `bun run build` clean.
- Bug 1: on a page where Today gauge and Brief numeric disagreed, Brief now matches gauge; console shows `[decision-readiness-brief] mrs_override`.
- Bug 2: on a slot whose `whyLine === title`, UI shows fallback sentence; console shows `[today-three-priorities] whyline_title_echo`.
- Narrative, pills, tier copy, and pill ordering all visually identical to before.

### Out of scope (Stage 2+)

- Any change to `compute-outer-readiness`, `generate-mastery-plan`, or shared server modules.
- Consolidating readiness score writers (Brief vs MRS snapshot) to a single source.
- Server-side why-line repair.
- Evening slot grouping fix — held until diagnostic result comes back.

### Notes on user's prompt

- The user's paste includes git/branch/PR steps and a `.github/BUG_FIX_PROMPT.md` doc. In this environment I don't run git/PR commands (git state is managed by the platform) — I'll make the file edits directly on the current branch. If you want three separate PRs, say so and I'll stage the changes accordingly.
- All three changes are strictly frontend and null/echo-safe.