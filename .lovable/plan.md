
## Availability SSOT — final validation + discoverability breadcrumbs

Scope confirmed: keep `_shared/availability/` at the top level (no physical move). Add breadcrumbs from `ceo-behaviour/` to the SSOT, then run the full end-to-end validation and record the result.

---

### Step 1 — Discoverability breadcrumbs (Option B)

**a. `supabase/functions/_shared/ceo-behaviour/index.ts`**
Prepend a short header comment above the existing barrel doc:

```ts
/**
 * External primitives this cluster depends on:
 *  - Availability SSOT: ../availability/availability-classifier.ts
 *      (classifyAvailability, classifyDay, PTO_TITLE_RX,
 *       PERSONAL_HOLIDAY_TITLE_RX, isApplicableHoliday, RegionToken)
 *  - Event taxonomy:    ../events/event-categories.ts
 *  - Protocol combos:   ../protocols/protocol-combos.ts
 *
 * Behaviour rules CONSUME availability decisions; they never re-derive
 * PTO / holiday / weekend / rest-day state locally. Anything that needs
 * to answer "is today off?" must call classifyDay().
 */
```

No code change — comment only. Preserves the existing barrel exports and rule scoping table verbatim.

**b. `supabase/functions/_shared/ceo-behaviour/README.md` (new)**
One-screen file:
- Purpose of the cluster (opinions over signals).
- Hard rule: taxonomy and availability live outside this folder.
- External-dependency table with file paths.
- Link to `mem/architecture/availability-ssot.md` and `mem/architecture/ceo-behaviour-shared-module-ownership.md`.

No behaviour rule code is touched.

---

### Step 2 — End-to-end validation

Run and capture output for each:

1. **Vitest guard** — `npm test -- availabilitySsotShimImports`
   Expect: green; both `it()` cases pass (no deprecated imports; all 7 classifier-only symbols exported from the SSOT).

2. **Full Vitest suite** — `npm test`
   Expect: green. This is the CI merge gate.

3. **Deno availability tests** (each file individually so a red file is unambiguous):
   - `deno test supabase/functions/_shared/availability/availability-classifier.test.ts`
   - `deno test supabase/functions/_shared/availability/availability-classifier-consolidation.test.ts`
   - `deno test supabase/functions/_shared/availability/availability-cross-surface.test.ts`

4. **Grep sweep** (belt + braces on top of the Vitest guard):
   - `rg "from .*availability/holiday-applicability" .` → only the shim itself.
   - `rg "PTO_TITLE_RX|PERSONAL_HOLIDAY_TITLE_RX" .` → only the SSOT, the shim, and files that import from the SSOT.
   - `rg "isApplicableHoliday|parseHolidayRegionFromTitle|isFyiHolidayCalendar|matchesUserCountry" .` → same expectation.

5. **Consumer wiring check** (read-only view of the four call sites):
   - Brief — `supabase/functions/_shared/brief-context.ts`, `brief-signal-coverage.ts`.
   - Plan — `supabase/functions/generate-mastery-plan/index.ts` (confirm `deriveStructuralDayFlags` / `_isPtoOrHoliday` go through `classifyDay`).
   - Nudges — `supabase/functions/smart-nudges/index.ts` (confirm PTO/holiday/weekend suppression uses the SSOT).
   - ceo-behaviour — `pto-holiday.ts` (`ptoActive()` reading the optional `availability` field).
   For each, confirm: no local `events.length === 0` or `calendarLoad === 'low'` off-day inference, no bespoke title regex, no bespoke region parsing.

6. **Known follow-ups still tagged** — re-read `mem/architecture/availability-ssot.md` to confirm C1 (`build-executive-home-cards/day-type.ts`) and C2 (`event-classifier.ts`) are still listed with severity and are not silently regressed.

---

### Step 3 — Record the validation result

Append a dated "Validation" subsection to `mem/architecture/availability-ssot.md` with:
- Date.
- Exact commands run.
- Pass/fail per stage.
- Grep hit counts for the three sweeps.
- Note that discoverability breadcrumbs were added in ceo-behaviour (Option B), physical location unchanged.

---

### Deliverables

- Edited: `supabase/functions/_shared/ceo-behaviour/index.ts` (comment only).
- New: `supabase/functions/_shared/ceo-behaviour/README.md`.
- Edited: `mem/architecture/availability-ssot.md` (validation subsection).
- Validation report inline in the chat reply.

### Out of scope (unchanged)

- Physical move of availability under ceo-behaviour (rejected — availability is upstream of ceo-behaviour and consumed by Brief/Plan/Nudges).
- Fixing C1 (`build-executive-home-cards/day-type.ts`) — scheduled fast-follow PR.
- Fixing C2 (`event-classifier.ts`) — scheduled follow-up.
- Deleting the two shim files — after one green release with zero warn hits.
