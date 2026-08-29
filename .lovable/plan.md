# Post-audit closure — deterministic Brief quality + doc/version hygiene

Two pre-launch code fixes (both in the generic, non-narrative branch of the deterministic brief), then documentation/version bumps that can land after launch. No gating, scoring, schema, MRS/Plan/Insights changes.

## A. Pre-launch (launch-blocking, small and additive)

### A1. Kill `"{event} ahead"` in the generic branch
`_shared/brief/deterministic-brief.ts` (~line 355) still builds `"...with {ref} ahead this {window}..."`. The narrative pack removed this construction; the generic branch never got it. Replace with the natural construction already used in `NARRATIVE_COPY` (e.g. "the flight is the demand this morning").

### A2. Drive the generic branch off the existing window-context modules (no hand-written guards)

The signal-engine already answers "which signals may speak in this window": `_shared/signal-engine/window-context.ts` → `buildMorningContext` / `buildAfternoonContext` / `buildEveningContext`. `compute-outer-readiness/index.ts:8073` already builds it (`briefWindowContext`) and feeds it to the LLM prompt and `input_signature`, but it is **not** passed into `buildDeterministicBriefFallback`. That is the actual gap: the deterministic path re-derives its own signals from flat opts (`opts.sleepScore`, `opts.meetingCount`) instead of reading the same pre-filtered context the LLM reads.

Fix:

- Add an optional `windowContext: WindowContext | null` to `DeterministicBriefFallbackOpts` and pass `briefWindowContext` through at the existing call site. Optional, so every existing caller and test keeps working.
- When present, the generic branch sources its body signal from the window slice rather than flat opts:
  - morning → `sleepQuality` / `sleepHours` / `hrvDeviationPct` / `rhrDeviationPct`, `todayMeetingCount`, `todayFirstHighStakes`, `vetoRisk`
  - afternoon → `meetingsCompleted` / `meetingsRemaining`, `highestRemainingStakes`, `currentHrVsRestingPct`, `decisionLeakageRisk`, `availableGapsRemaining`
  - evening → `todayCompletedCount`, `bodyLoadElevated`, `hrvEveningDeviationPct`, `recoveryNote`, `tomorrowFirstHighStakes`, `mode`
  Because sleep fields only exist on `MorningContext`, the "sleep is morning-only" rule stops being a hand-written guard and becomes a type-level fact — the afternoon/evening branches have no sleep field to reach for.
- Tense follows the same slice: afternoon speaks in remaining terms (`meetingsRemaining`), evening in past terms (`todayCompletedCount`) plus `tomorrowFirstHighStakes`. This removes the un-gated "open working day ahead" at ~:447 without inventing new copy rules.
- Keep the flat-opts path as the fallback when `windowContext` is null (deterministic tests, golden set, any caller without a snapshot), so nothing regresses.


### A3. Extend the contract tests to the generic branch
`behaviour-copy.contract.test.ts` only exercises `NARRATIVE_COPY`. Add the same three invariants against `buildDeterministicBriefFallback` with `leadNarrative: null` across the three windows:
- no `"<event> ahead"`,
- no sleep/overnight language outside morning,
- timing clause emitted at most once.

Deliberately not fixed pre-launch: the `variantSeed` fallback (`${window}|${family}`). Production always passes a full seed, so it is latent. Tighten after launch.

## B. Version bumps — what should and should not move

- **`BRIEF_PROMPT_VERSION` should NOT be bumped for A1/A2.** The constant governs the LLM prompt contract and cache invalidation; these are deterministic-fallback copy fixes. Bumping would invalidate every cached brief on launch day for no benefit. If you want the corrected copy to displace already-cached deterministic rows, the manual-refresh force path already covers it.
- Code-level doc bumps that should happen (documentation only):

| Doc | Action |
|---|---|
| `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md` | bump v6.3 → v7.7; correct `prompt_version`, input_signature and the fallback contract |
| `docs/PERFORMANCE_READINESS_BRIEF_LLM_PROMPT.md` | correct model ladder (Gemini Flash → Claude Haiku), 3-sentence contract, cache key (`input_signature` + `prompt_version`); remove the false "canonical SSOT" claim and point to `compute-outer-readiness/index.ts` |
| `docs/BRIEF_ENGINE_ARCHITECTURE_AUDIT.md` | append v7.7 calendar-load honesty, `two-party-title.ts`, remaining-meetings copy, manual-refresh behaviour |
| `docs/EXECUTIVE_HOME_CARDS_REGENERATED_SSOT.md` + wiring guide + drift report | v6.5/v6.6 → v7.7; note the deterministic fallback is reinstated |
| `docs/EVENT_TAXONOMY_A_H_SSOT.md` | create (Phase 5 deliverable, never written) |

## C. Memories to add (prevents future re-breaking)

- Calendar-load honesty: load vocabulary is factual (light/busy/heavy), "open day" reserved for true-zero working days; A–H classification never changes the count.
- Two-party title inference: title-driven only; attendee count and duration are not evidence of a 1:1.
- Deterministic-fallback contract: fallback must pass `validateBrief()` or the Brief goes to awaiting; window rules apply to the generic branch as well as `NARRATIVE_COPY`.

## Verification

- `deno test supabase/functions/_shared/brief supabase/functions/_shared/personas` green.
- Golden set (174 fixtures) green, plus the new generic-branch invariants.
- Frontend vitest suite unchanged.
- Deploy `compute-outer-readiness` only; no other function consumes the changed copy.
