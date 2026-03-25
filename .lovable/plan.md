

# Plan: Two-Touch Action Model + Legacy Gate Alignment + Cleanup

## What changes

Three targeted fixes inside `generate-mastery-plan/index.ts` and one fix in `generate-jit-events/index.ts`. No UI changes. No DB migrations.

---

## Step 1: Define shared constants and two-touch window logic

**File: `generate-mastery-plan/index.ts`**

Add a single `JIT_THRESHOLD_UNIFIED = 55` constant near the top. Remove the dynamic `const JIT_THRESHOLD = filteredEvents[0]?.jitDimensionScores ? 55 : 50` at line 1821.

Add a helper function:
```typescript
function getActionWindow(minutesUntil: number): 'touch1' | 'touch2' | 'silent' | 'selection_only' {
  if (minutesUntil <= 360) return 'touch2';           // 0-6h: body prep
  if (minutesUntil <= 1440) return 'silent';           // 6-24h: gap
  if (minutesUntil <= 2880) return 'touch1';           // 24-48h: coach + think
  return 'selection_only';                              // >48h: scored but not surfaced
}
```

---

## Step 2: Two-touch plan composition (Gap A fix)

**File: `generate-mastery-plan/index.ts`** — lines 1817-1936 (pre-event plan building)

After selecting `topEvent`, check its action window. If `silent` or `selection_only`, skip — set `preEventPlan = null`. If the first event is silent, try the next candidate in `filteredEvents` that falls in `touch1` or `touch2`.

For events in a valid window, switch plan composition:

**Touch 1 (24-48h)** — coach CTA primary, one mental framework, optional focus practice:
- Primary module: coach card (prepare type)
- Secondary: one `align` module (framework/reframe content)
- Optional: one `focus` practice if time allows
- Store horizon as `'tactical'`

**Touch 2 (0-6h)** — somatic-first, short:
- Primary module: `regulate` (somatic/breathing, intensity gentle, duration short/micro)
- Secondary: one `focus` or grounding exercise
- Coach card as secondary CTA only
- Store horizon as `'immediate'`

This replaces the current horizon-agnostic module building at lines 1827-1891.

---

## Step 3: Upgrade legacy fallback to new gate (Gap B fix)

**File: `generate-mastery-plan/index.ts`** — `scoreCalendarEventsLegacy()` (lines 1099-1204)

Three changes:

1. Replace `minutesUntil <= 2880` window with the two-touch action window check — skip events in `silent` or `selection_only` windows.

2. Add dimension A and B floor checks after scoring:
   - Compute `dimA` from attendees + pressure keywords (same logic as `generate-jit-events`)
   - Compute `dimB` from cluster keyword matching
   - After score is calculated: `if (score < 55 || dimA < 10 || dimB < 8) continue;`

3. Replace the old flat scoring with the four-dimension model (or at minimum, apply the floor checks as a safety guard on the existing flat score).

The pragmatic approach: keep the flat scoring for content selection but add dimension floor guards to prevent solo/no-inner-state events from passing. This is safer than a full rewrite of the legacy path.

---

## Step 4: Threshold constant alignment (Gap C fix)

**File: `generate-mastery-plan/index.ts`**

Line 1821: Replace the dynamic threshold with `JIT_THRESHOLD_UNIFIED` (always 55). Both bridge path and legacy path use the same constant. One definition, one place.

---

## Step 5: Update `generate-jit-events` horizon model

**File: `generate-jit-events/index.ts`**

Update `determineUrgencyHorizon()` (line 261-265) to match the two-touch model:
```typescript
function determineUrgencyHorizon(minutesUntil: number): 'immediate' | 'tactical' | null {
  if (minutesUntil <= 360) return 'immediate';        // Touch 2: 0-6h
  if (minutesUntil >= 1440 && minutesUntil <= 2880) return 'tactical';  // Touch 1: 24-48h
  return null;  // Silent gap (6-24h) or selection-only (>48h)
}
```

Events with `null` horizon are still scored and stored in `jit_event_context` (for future surfacing when they enter a window) but are marked `shown_in_jit: false`.

Remove all references to `'strategic'` as a horizon value. Update deduplication and `jit_horizons_surfaced` accordingly.

---

## Step 6: Cleanup dead code

Across both files:
- Remove any `score >= 50` references — all paths use 55
- Remove comments referencing "3-tier horizon" or "Immediate / Tactical / Strategic as three plan types"
- Remove `'strategic'` from the horizon type union
- Extract shared noise filter keywords into a comment block referencing `generate-jit-events` as the source of truth (the copy in `generate-mastery-plan` is already used — consolidate the constant name)
- Remove the dynamic `JIT_THRESHOLD` conditional at line 1821

---

## Files changed

| File | Change |
|------|--------|
| `generate-mastery-plan/index.ts` | Unified threshold constant. Two-touch action window helper. Horizon-aware plan composition. Legacy fallback with A/B floor guards and action window filtering. Dead code cleanup. |
| `generate-jit-events/index.ts` | Two-value horizon model (immediate/tactical/null). Remove `strategic`. Events in silent gap stored but not surfaced. |

No DB migrations. No UI changes. No other files touched.

## Post-implementation audit checklist

- Event 3h away → Touch 2 (somatic-first, 3-5 min, coach secondary)
- Event 36h away → Touch 1 (coach primary, one framework, 5-8 min)
- Event 10h away → nothing surfaced (silent gap)
- Event 5 days away → nothing surfaced (selection-only)
- Same event at both Touch 1 and Touch 2 → both appear in `jit_horizons_surfaced`
- Dismiss Touch 1 → Touch 2 still fires
- Legacy fallback → ≥55 gate with A≥10, B≥8 floors
- One `JIT_THRESHOLD` definition in codebase
- No plan composition path ignores `minutesUntil`
- No references to `strategic` horizon or `score >= 50`

