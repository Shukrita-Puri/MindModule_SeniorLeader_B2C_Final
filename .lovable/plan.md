## Validation: what's already done vs. still missing

### ✅ Already implemented (no rework needed)

**Shared module `supabase/functions/_shared/executive-state-taxonomy.ts` (621 lines):**
- Layer A noise: `NOISE_KEYWORDS`, `NOISE_PATTERN`, `PERSONAL_BLOCK_PATTERN`, `isNoiseTitle()`
- Layer B canonical categories: `EVENT_TYPES` table + `classifyEvent()`, `classifyEventBucket()`, `classifyEventLabel()`, `classifyByLegacyTable()`, legacy-compatible `EVENT_TYPE_KEYWORDS`
- Layer C stakes: `stakesScore()`, `pillarBaseWeight()`, `survivesAttendeeOrDurationFloor()`
- Selection rule (Section 4): `selectLeadEvent()`, `rankByStakes()`, `scoreEvents()`
- Engines: cognitive fragmentation, visibility accumulation, emotional carryover, travel compression, executive overextension, identity-pressure spike
- Day-kind: `detectDayKindFromEvents()`
- Cross-provider dedupe: `dedupeCalendarEvents()`
- Reframed contexts: `buildMorningContext`, `buildEveningContext`

**Consumers already wired:**
- `smart-nudges` → `isNoiseTitle`, `detectDayKindFromEvents`, `isHighStakesTitle`
- `cause-effect-engine` → `EVENT_TYPE_KEYWORDS`, `classifyByLegacyTable`, `classifyEvent`, `PILLAR_META`, `dedupeCalendarEvents`
- `performance-rhythm-insights`, `generate-coach-summary`, `self-mastery-coach` → `dedupeCalendarEvents`

---

### ❌ Missing — 4 gaps to close

**Gap 1 — `compute-outer-readiness` (root cause of the "Leadership Call before Board Meeting" bug)**
Still uses its own `personalBlockPatterns` regex AND a title-agnostic attendee/duration heuristic to pick `nextHighStakesEvent`. The shared `selectLeadEvent()` is never called. Until this swaps over, Brief + Signal-Pill NEXT UP will keep picking the chronologically first qualifying event regardless of stakes.

**Gap 2 — `generate-jit-events`**
Still maintains its own `NOISE_KEYWORDS` (line 13) and `PRESSURE_KEYWORDS` (line 32). Should consume `isNoiseTitle()` + `classifyEvent()` so JIT bucket selection (`recalibrate / clarity / renewal`) maps deterministically off the canonical category.

**Gap 3 — `generate-mastery-plan`**
Still maintains its own `NOISE_KEYWORDS` (line 1045) plus a 22-row `EXECUTIVE_SCENARIOS` table whose ids should map 1:1 to `EVENT_TYPES.scenarioId`. Should consume `isNoiseTitle()` + use `classifyEvent()` to look up the scenario rather than rescanning titles in two passes.

**Gap 4 — `isNoiseTitle()` ignores `PERSONAL_BLOCK_PATTERN`**
The shared module exports `PERSONAL_BLOCK_PATTERN` but `isNoiseTitle()` only consults `NOISE_KEYWORDS` + `NOISE_PATTERN`. So Section 3 inconsistency #3 ("personal blocks reach Smart-Nudges & JIT") remains open even though the regex is present in the file.

---

## Plan (single follow-up build pass)

### Step 1 — Patch `isNoiseTitle()`
Have it also return `true` when `PERSONAL_BLOCK_PATTERN` matches. One-line change inside the shared module. Restores cross-surface noise parity instantly for both already-wired (`smart-nudges`) and to-be-wired consumers.

### Step 2 — Migrate `compute-outer-readiness`
- Replace inline `personalBlockPatterns` regex with shared `isNoiseTitle()`.
- Replace the `nextHighStakesEvent` selection block (around lines 2470-2490) with a call to `selectLeadEvent(todayEvents)`. Keep the existing `minutesUntil` / `localHHmm` derivation intact — only the *which event wins* logic changes.
- Same swap for `remainingHighStakes[0]` (Signal-Pill NEXT UP).

### Step 3 — Migrate `generate-jit-events`
- Replace inline `NOISE_KEYWORDS` + `isNoise()` with shared helpers.
- Keep `PRESSURE_KEYWORDS` only as a fallback; primary path uses `classifyEvent(title).group` to pick the Dim-B cluster (`pressure | relationship | decision | transition`).

### Step 4 — Migrate `generate-mastery-plan`
- Replace inline `NOISE_KEYWORDS` with `isNoiseTitle()`.
- Replace the two `for (const scenario of EXECUTIVE_SCENARIOS)` keyword scans (lines 1201, 1379) with `classifyEvent(title).scenarioId` lookup. Keeps the existing 22-scenario logic; only the source of the match changes.

### Step 5 — Smoke validation (no UI changes)
- Re-run the Shukrita audit query: confirm Board Meeting (08:00) now outranks Leadership 1:1s and Catchups in `nextHighStakesEvent`.
- Confirm Brief NEXT UP pill on `/` reflects the Board Meeting title for any user with a board event today, regardless of meeting order.
- Tail `compute-outer-readiness` / `generate-mastery-plan` / `generate-jit-events` logs for one cycle to catch any classification regressions.

---

## Out of scope (per the audit)
- No UI changes to the pill, brief card, or insights heatmap.
- No DB schema changes.
- No changes to scoring math inside Mastery-Plan / JIT — only the keyword/bucket sources they consume change.
- No new event categories beyond the existing `EVENT_TYPES` table.
