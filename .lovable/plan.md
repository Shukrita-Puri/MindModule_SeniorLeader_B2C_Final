## Release-Blocking Fix — Plan Gating + Empty State + Signal Rendering Safety

Two visible bugs, both release-blocking. Existing intelligence (Change 1–6, B4 resolver, MRS v3 check-in-only scoring, why-line, brief snapshot) stays untouched. This plan only adds gates, hardens fallback paths, and tightens rendering safety.

---

### What I confirmed by reading the code

- An `awaitingSignals` contract already exists across `compute-outer-readiness`, `useOuterReadiness`, `DecisionReadinessBrief`, and `TodayThreePriorities`. The Plan already early-returns an empty state when it sees `awaitingSignals`.
- `src/utils/safeDisplayValue.ts` already exports `formatDisplayValue` + `isUnsafeObjectText`.
- `PillTooltip.tsx` already maps both `hrvHighDemandCooccurrence7d` (camelCase) and `hrv_low_high_demand_cooccurrence_7d` (snake) to `cooccurrence()`, and routes unknown objects through `formatDisplayValue` with an `isUnsafeObjectText` guard.
- The existing awaiting copy is **"Sync your wearable or complete a quick check-in to sharpen the picture."** — the spec wants **"and then"** instead of **"or"**, plus the constant must be reused everywhere.
- `generate-mastery-plan` does not currently echo the awaiting state as a top-level `planState` discriminator — the frontend infers it. Adding an explicit `planState: "awaiting_signals"` envelope makes leakage impossible.

---

### Root causes (working hypotheses; confirmed during implementation)

1. **Plan leak.** When `outerReadinessData?.awaitingSignals` is briefly `false` (or undefined during the first render race) AND the backend returns a non-empty `horizonModules`, the Plan renders default/state-based cards built by `buildHorizonModules` even though MRS/Brief are still empty. Today the gate lives on the frontend only; the backend can still emit horizon modules.
2. **`[object Object]` in tooltip.** A contributor key arrives that is **not** in `CONTRIBUTORS` (so it falls into the `else` branch) AND is an object. Although `formatDisplayValue` is invoked, an earlier code path or a stale build may render `String(raw)` for typeof 'object' before reaching the safe formatter. We'll close every escape hatch and add a final safety net on the rendered value.

---

### Implementation

#### 1. Shared empty-state constant
- Add `src/constants/awaitingSignals.ts`:
  ```ts
  export const READINESS_AWAITING_MESSAGE =
    "Sync your wearable and then complete a quick check-in to sharpen the picture.";
  ```
- Import and use it in **every** awaiting render path:
  - `src/components/home/DecisionReadinessBrief.tsx` (replace the existing literal at line 2028)
  - `src/components/home/TodayThreePriorities.tsx` (the `if (awaitingSignals)` block around line 1206)
  - `src/components/home/mrs/MrsPage.tsx` awaiting branch
  - any other surface (`HistoricalBriefOverlay` if it renders an awaiting fallback)

#### 2. Backend gating — generate-mastery-plan envelope
Add a single early gate at the top of `supabase/functions/generate-mastery-plan/index.ts` that runs **before** `buildHorizonModules`:

- Pull `daily_context_snapshot.readiness_state` and the latest brief snapshot for `(user, local_date, time_window)`.
- If readiness is missing/awaiting AND there is no valid check-in-only MRS, short-circuit and return:
  ```ts
  {
    planState: "awaiting_signals",
    awaitingSignals: true,
    reason: "missing_readiness_context",
    message: READINESS_AWAITING_MESSAGE,
    horizonModules: []
  }
  ```
- **Exception preserved (Section E):** if a complete Mind check-in exists AND MRS is numeric AND brief is valid, the gate falls through and normal scoring runs. No change to scoring weights, slot allocator, practice selector, why-line, or B4 resolver.
- Mirror the message string from a shared `_shared/copy/awaiting.ts` so it cannot drift from the frontend constant.

#### 3. Frontend gating — Plan card never renders fake content
In `src/components/home/TodayThreePriorities.tsx`:
- Treat `planData?.planState === "awaiting_signals"` as authoritative (in addition to `planData?.awaitingSignals === true`).
- When awaiting: clear cached `horizonModules` for the period so a stale cache cannot leak fake cards on the next mount.
- Tighten the awaiting trigger so it fires when **any** of these is true: `outerReadinessData?.awaitingSignals`, `outerReadinessData?.score == null` AND not check-in-only, brief `awaitingSignals`, `daily_context_snapshot.readiness_state === "awaiting"`, or `planData?.planState === "awaiting_signals"`.
- Hide Start button, practice cards, and the legacy “Steady the system…” strings entirely while awaiting.

In `DecisionReadinessBrief.tsx` and `MrsPage.tsx`:
- Show `READINESS_AWAITING_MESSAGE` for the same conditions, using identical wording.

#### 4. Guard old fallback content
Grep audit — no changes to scoring, but guard rendering of these strings to the awaiting state:
- "Steady the system ahead of the day ahead"
- "Presence Through Grounding"
- Any `horizonModules` derived from `buildHorizonModules` when `planState === "awaiting_signals"` is impossible because the backend gate (#2) returns `[]`. The grep is still done to confirm no client-side default constructs these.

#### 5. Tooltip / signal rendering — close every `[object Object]` escape
- Strengthen `formatDisplayValue` to **always** stringify-test the result via `isUnsafeObjectText` before returning (defence in depth).
- In `PillTooltip.tsx`:
  - Remove the `typeof raw === 'string'` direct passthrough — route every value through `formatDisplayValue` so an upstream string `"[object Object]"` is filtered.
  - In the JSX render, wrap `row.value` in a final `isUnsafeObjectText` guard.
- Add a tiny `safeText(value)` helper used by any generic key/value renderer touching backend payloads:
  - `DecisionReadinessBrief.tsx` Lean On / Watch Out renderers
  - `HistoricalBriefOverlay.tsx` signal rows
- Add a top-level dev-only assertion (`if (import.meta.env.DEV) console.warn(...)`) when `isUnsafeObjectText(value)` triggers, to catch regressions in CI/local.

#### 6. Tests
Add `src/utils/safeDisplayValue.test.ts`:
- `formatDisplayValue({ status: "stable", delta: { value: 2 } })` → returns `"stable"`, never contains `[object Object]`.
- Object with no display-safe fields → returns `""` (caller hides row).
- Array of objects → readable text, no `[object Object]`.
- `isUnsafeObjectText("[object Object]")`, `"[object Promise]"`, `"undefined"`, `"null"` all → true.

Add `src/components/home/__tests__/TodayThreePriorities.gating.test.tsx`:
- Renders awaiting message when `planState === "awaiting_signals"`.
- Does not render any `horizonModules` content while awaiting.

Run `npm exec tsc -- --noEmit` (the harness handles the build).

---

### Files changed (target list)

**Backend**
- `supabase/functions/generate-mastery-plan/index.ts` — add awaiting-signals envelope at top, no scoring changes
- `supabase/functions/_shared/copy/awaiting.ts` — new, shared message constant

**Frontend**
- `src/constants/awaitingSignals.ts` — new shared constant
- `src/utils/safeDisplayValue.ts` — defence-in-depth hardening
- `src/components/home/PillTooltip.tsx` — route every value through safe formatter
- `src/components/home/TodayThreePriorities.tsx` — recognise `planState`, broaden awaiting trigger, clear cache while awaiting
- `src/components/home/DecisionReadinessBrief.tsx` — use shared constant, safe-text on signal rows
- `src/components/home/mrs/MrsPage.tsx` — use shared constant
- `src/components/home/HistoricalBriefOverlay.tsx` — safe-text on signal rows (audit pass)

**Tests**
- `src/utils/safeDisplayValue.test.ts` — new
- `src/components/home/__tests__/TodayThreePriorities.gating.test.tsx` — new

---

### Explicit non-changes

- Change 1 scoring / ranking / hard gates / JIT floor — untouched
- Change 2 tags / memory / cancellation / relationship taxonomy — untouched
- Change 3 slot allocator (mode, slotRole, arcLabel, jitPhase, dayShape, allocationReason) — untouched
- Change 4 practice selector (protocol combo, dedupe, recency, findAlternate) — untouched
- Change 5 why-line generator and prompt — untouched
- Change 6 old-logic guards — kept; the new backend gate is additive
- B4 resolver — untouched
- MRS v3 check-in-only fallback — untouched
- Brief snapshot column writes — untouched
- Frontend design tokens, layouts, typography — untouched

---

### Acceptance (verified manually after implementation)

- No-data user: MRS, Brief, Plan all show the exact shared message; no Start button; no practice cards; no “Steady the system…”.
- Check-in-only user (no wearable): MRS shows numeric score; Brief renders; Plan renders normally — wearable-missing alone never blocks Plan.
- Full-data user: normal flow unchanged.
- `grep -r "[object Object]"` against the rendered DOM returns nothing across Home, signal pills, tooltips, Brief, Plan, historical brief, Lean On / Watch Out.
- `npm exec tsc -- --noEmit` passes.

I'll deliver a final report covering all 21 items in section N once the implementation lands.
