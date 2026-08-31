# Why-line + slot title quality overhaul (Today's Performance Priorities)

## What's actually happening today (verified in code)

1. **The line you screenshotted is not the LLM.** "Your HRV lifts ~60% before board. Resting HR is elevated. Recover: Sharpen focus…" is the deterministic `composeWhyLine()` in `generate-mastery-plan/index.ts` — a stacked `Strategic. Tactical. Immediate. → Action.` template. It repeats near-verbatim across all three slots and leaks the word "board" onto slots that have no board anchor.
2. **"Resting HR is elevated" is a bug.** The Why-LLM input sets `rhrTrend: restingHR > 0 ? "elevated" : null` — any resting-HR value at all reads as elevated.
3. **The Why-LLM only ever sees immediate signals.** Its input carries HRV deviation, sleep score, that broken RHR flag, self-declared mind/body, and a *single* HRV-vs-event correlation string. It does **not** receive: `causality_findings.signal_summary` (event→HRV, event→RHR, sleep→PRS, consecutive load, `performance_lift`), practice-impact/effectiveness history, check-in pattern aggregator output (day-of-week, streaks), or strategic context (`protection_goals`, `pressure_profile`, archetype). So pattern and strategic evidence structurally cannot appear.
4. **No evidence ranking.** The prompt hands the model a flat "reference whichever are most relevant" list, so it defaults to the loudest raw number.
5. **Titles are prose, not reasons.** `buildPriorityTitle` = verb + objective + connector + event. With no event anchor it degrades to "Land recovery to close the day". Meanwhile the ≤6-word italic sub-line ("Set your focus for the morning", "Build resilience for high-demand days") is the only copy that tells the user what the slot *gives them* — and it comes from a generic fallback branch, not from the slot's evidence.

## What we build

### 1. A tiered evidence bundle (new shared module)

New `supabase/functions/_shared/plan/why-signals.ts` — pure, testable, one entry point `buildWhyEvidence()` returning at most **three** ranked items:

- **Pattern evidence (highest value)** — read `causality_findings.signal_summary`: `event_to_hrv`, `event_to_rhr`, `sleep_to_prs`, `consecutive_load`, and `performance_lift` (`hr_event_lift`, `category_lift`, `sleep_to_peak`, `rhr_recovery_window`). Match against the slot's own A–H anchor only. Include confidence + n; drop anything below `emerging`/n<3.
- **Behavioural evidence** — practice-impact history (what has actually moved this leader's state) plus the check-in pattern aggregator (`_shared/signal-engine/checkin-pattern-aggregator.ts`) for day-of-week and streak qualifiers.
- **Immediate evidence** — HRV vs baseline, sleep, RHR **vs the user's own baseline** (fixes the always-elevated bug), check-in clarity/pressure.
- **Strategic evidence** — `resolveStrategicContext()` (`protection_goals`, `pressure_profile`, `user_archetype`) + declared growth intention.

Selection rule: one strategic *or* pattern item as the "why now", one immediate item as the proof, never more than two facts in a line. Pattern beats immediate when confident; immediate is the fallback proof, never the whole story.

### 1b. Every signal carries a valence (this is the core copy bug)

Today the evidence is dumped as raw facts with no sign attached, so "your HRV lifts ~60% before board" — a *good* thing — gets stitched into a recovery/deficit sentence. Each evidence item will carry an explicit `valence: positive | neutral | risk` decided at derivation, not by the model:

- **Positive** (HRV lifted vs baseline, RHR at/below baseline, sleep strong, recovery streak, a category where `performance_lift` shows this leader performs best): the leader is at or near cognitive peak. The why-line frames the slot as **protecting and extending the peak** — hold the edge into the event, don't spend it early — never as recovery from a deficit. If the practice selected is a recovery protocol while every signal is positive, that mismatch is logged and the slot falls back to a peak-protection practice/frame.
- **Risk** (HRV suppressed, RHR elevated vs baseline, short sleep, consecutive-load tail, clarity/pressure low, an event category with a known negative HRV/RHR signature): frame as preventing mental noise, emotional hijack, stress accumulation, or burnout — the app's actual jobs.
- **Neutral**: frame by the event and what the practice builds.

The valence also feeds the band/valence gate in the validator: a positive-evidence slot rejects deficit language ("recover", "reserves", "running low"), and a risk slot rejects push language, as today — but now driven by the *evidence*, not only the MRS band.


### 2. Rewritten Why-line prompt

- Replace the flat signal dump with an explicit `EVIDENCE (ranked)` block carrying the tier label and confidence of each item.
- New required output shape: **one sentence, ≤22 words, evidence → outcome** — what the slot *gives* the leader, in the register of "Build resilience for high-demand days", not practice mechanics.
- Explicitly ban the current stacked shape (`Fact. Fact. Verb: instruction.`), ban restating the practice name, ban naming raw metrics twice.
- Keep existing persona, band discipline, arc awareness, forbidden vocabulary, pill-consistency rule.

### 3. Deterministic fallback that is genuinely good

New `buildDeterministicWhyLine()` in the same module, driven by the **same** evidence bundle, with one template per evidence tier (pattern / behavioural / immediate / strategic-only / no-evidence). Slot-scoped anchors only — a slot with no event anchor can never mention another slot's event. This replaces the stacked `composeWhyLine` output for plan slots; the old builder stays only as a last-resort for slots with zero evidence.

### 4. Slot titles that carry the reason

- Keep the structure (verb + objective + connector + anchor) but change the **objective vocabulary from prose to outcome**, drawn from the same evidence tier that produced the why-line, so title and why-line agree by construction.
- No-anchor slots stop producing "Land recovery to close the day" and instead use the outcome ladder ("Build resilience for high-demand days", "Set your focus for the morning", "Consolidate what's working") as the crisp title, capped shorter.
- Because the title now carries the benefit, the ≤6-word italic sub-line (`buildActionFrame`) is derived from the same ladder so the two never duplicate each other.

### 5. Verification

- Unit tests for `buildWhyEvidence()` tier selection/ranking and for each deterministic template.
- Existing validator tests extended: reject the stacked shape, reject metric-only lines.
- `[plan-provenance]` extended with `whyTier`, `evidenceIds`, `fallback` per slot, then a live plan run for `shukrita@mindmodule.me` to confirm pattern/strategic evidence actually reaches the copy.

## Out of scope

MRS scoring, Brief copy/prompt, Insights, gating, slot ordering, JIT horizon/dedupe key, DB schema, RLS.
