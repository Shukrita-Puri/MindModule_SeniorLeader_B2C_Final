# CEO Behaviour → Brief Copy: Audit + Closing Plan

## What I checked

All 25 files in `_shared/ceo-behaviour/` plus the registry, `behaviour-evaluator.ts`, `behaviour-wiring.ts`, `behaviour-snapshot.ts`, `brief-signal-coverage.ts`, `brief/copy-vocabulary.ts`, `brief/deterministic-brief.ts`, and the Brief call sites in `compute-outer-readiness/index.ts`.

The architecture is sound and does not need reinventing. There are three real defects and one modularity gap.

## Audit findings

### 1. Three behaviours are structurally dead — the data they need never arrives (confirmed)

`buildRuleContext` in `brief-signal-coverage.ts` (line ~966) builds `upcomingEvents` as only `{ title, minutesUntil, stakesLevel, isEmotionalDrain }`. It drops `categoryId`, `attendeeCount`, `durationMinutes` and `isInterpersonal` — all of which are declared on the RuleContext event type in `brief-context.ts` (lines 384–390) and all of which the rules read.

Consequences, verified by reading each rule body:

- `contextSwitchingCost` requires 3+ distinct `categoryId` values in the next 4h. `categoryId` is always undefined, so the distinct set is always empty. **The rule can never fire today, on any surface.** This is exactly the behaviour you asked about (product → finance → hiring switching).
- `interpersonalMeetingContext` filters on `categoryId === "D"` or `isInterpersonal`. Neither is ever set, so it never fires.
- `decisionDensity` still fires (the title regex works), but its committee boost (+0.3 for 6+ attendees), compressed boost (+0.2 for sub-30-minute blocks) and the entire Layer-2 attendee multiplier are permanently neutral, so severity is systematically under-called. `signals.decisionDensityScore` is never populated anywhere either, so the precomputed path is also dead.

There is also a field-name mismatch: `SignalCoverageInput.events[].attendeesCount` versus the rule-side `attendeeCount`.

### 2. Deterministic fallback covers 6 of ~50 rules, and only one of the four beats

`deterministic-brief.ts` receives flags reduced to `{ rule, severity }` — the `copyHint`, `stake`, `evidence` and `anchorEvent` are discarded at the call site (`compute-outer-readiness` line ~9299). It then hand-switches on six rule names (`decisionDensity`, `contextSwitchingCost`, `backToBackLoadOverride`, `stackedStakes`, `vetoRisk`, `decisionLeakageGuard`) inside `buildEvidence` only. So when the LLM fails:

- 40+ behaviours (conference cluster, influence/persuasion, visibility-comms, deep work, post-governance offload, upward reporting, interpersonal, weekend ladder, PTO, morning/evening baseline) produce no behaviour-aware copy at all.
- Even the six covered rules only shape beat (a), the read. The directive, the why-this-matters and the close ignore the behaviour entirely. Travel is the single exception — it was wired end-to-end last week.

### 3. The LLM path is healthy, but unranked

`promptBlockBrief` passes every flag with its full `copyHint`, severity, anchor and evidence into the user prompt, and `copy-vocabulary.ts` already tells the model that an active CEO behaviour flag takes priority for the Phrase. That part works. The weakness is that on a heavy day 6–8 flags arrive with equal billing and no "lead with this one" instruction, so the model picks arbitrarily and the Brief loses its chief-of-staff point of view.

### 4. Persona modularity gap (for the middle-management / student packs later)

Detection logic and CEO-specific prose are fused: every `copyHint` string lives inside the rule body, and the thresholds (4h window, 3-category rule, decision keyword bank) are inline constants. Swapping persona today would mean editing 25 rule files.

## Recommended changes (no structural rewrite)

### A. Feed the rules the event data they already declare

In `buildRuleContext`, enrich each event through the existing canonical `enrichEvent` / `classifyEvent` resolver and forward `categoryId`, `attendeeCount` (mapping `attendeesCount`), `durationMinutes` and `isInterpersonal` onto `upcomingEvents`. One call site, no new classifier — this honours the "one A–H resolver" rule. This alone switches on `contextSwitchingCost` and `interpersonalMeetingContext` and restores decisionDensity's real severity curve.

### B. Rank flags before they reach the prompt and the fallback

Add a `behaviourPriority(rule)` ordering in `behaviour-evaluator.ts` (travel > crisis/veto > stacked stakes > context switching > decision density > interpersonal > load > baseline), applied within a severity band. Then:

- `formatPromptBlock` marks the top flag as `LEAD` so the LLM has one anchor.
- The deterministic path uses the same ordering instead of its own ad-hoc `topCeoFlag` sort.

### C. Turn the deterministic switch into a persona copy pack

The four-beat contract is unchanged and is the shape the pack must fill. Canonical source: `BODY_FOUR_BEAT_CONTRACT` in `copy-vocabulary.ts`, mirrored by `buildEvidence` / `buildRead` / `buildDirective` / `closeFor` in `deterministic-brief.ts`:

```text
(a) EVIDENCE                    — 2 signals from different buckets
(b) THE READ                    — the judgment those signals add up to
(c) THE WORK DIRECTIVE          — the cognitive posture for today's real demand
(d) SELF-REGULATION DIRECTIVE   — the 3-8 word closing clause
```

Replace the hardcoded switch in `deterministic-brief.ts` with a lookup into a new `_shared/personas/ceo/behaviour-copy.ts`, keyed on those exact beats:

```text
BEHAVIOUR_COPY[rule] = {
  evidence:  (c) => string,   // beat (a) — EVIDENCE
  read:      (c) => string,   // beat (b) — THE READ
  directive: (c) => string,   // beat (c) — THE WORK DIRECTIVE
  close:     (c) => string,   // beat (d) — SELF-REGULATION DIRECTIVE
}
```

Each of the four existing builders consults the pack for the leading flag before falling through to its current logic — so today the behaviour only shapes beat (a), and after this it shapes all four, exactly as the travel branch already does. The weekend / non-workday rule (zero work language in beats c and d) and the "beats (b) and (c) must not say the same thing" test stay enforced as they are today.

Populate the pack for every brief-scoped rule in `ALL_RULES`, deriving the prose from each rule's existing `copyHint` (several already spell out their beats — `contextSwitchingCost` names beats a–d verbatim in its hint) so there is a single review pass and nothing is invented. Rules with no entry fall through to today's generic copy, so there is no regression risk. The same pack is what the Plan can later read for its "Why this matters" line.

### D. Modularity seam for future personas

Keep rule bodies persona-neutral by moving only the copy into `_shared/personas/<persona>/behaviour-copy.ts` and the tunable numbers into `_shared/personas/<persona>/thresholds.ts`, selected by one `resolvePersona(user)` call defaulting to `ceo`. No behaviour change today; a middle-management pack later becomes two new files instead of 25 edits.

### E. Tests and docs

- Unit tests: context-switch fires on a product → finance → people 4h sequence; interpersonal fires on a category-D 1:1; decisionDensity severity rises with attendee count; and a contract test asserting every brief-scoped rule has a deterministic copy entry, so new rules cannot ship copy-less.
- Update `docs/CEO_BEHAVIOUR_RULE_MAP.md` (move the three rules out of the stub table) and the shared-module ownership memory.

## Scope boundary

Not touching: the A–H taxonomy, the LLM system-prompt structure, the four-beat contract, last week's travel copy, calendar merge, or the Plan composer. `BRIEF_PROMPT_VERSION` bumps only because the prompt block gains the `LEAD` marker; the frontend mirror in `src/constants/briefPromptVersion.ts` is bumped in the same change.

## Sequencing

1. A (data wiring) plus tests — unblocks the behaviours you asked about.
2. B (ranking) plus the prompt-version bump.
3. C and D (copy pack and persona seam) — the largest copy-review surface.
4. E (docs and memory).

Steps 1–2 are low-risk and shippable before launch on their own; step 3 is additive with a safe fallback if the copy review runs long.