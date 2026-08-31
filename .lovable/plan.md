# Why-line + slot title quality overhaul (Today's Performance Priorities)

## What's actually happening today (verified in code)

1. **The line you screenshotted is not the LLM.** "Your HRV lifts ~60% before board. Resting HR is elevated. Recover: Sharpen focus…" is the deterministic `composeWhyLine()` in `generate-mastery-plan/index.ts` — a stacked `Strategic. Tactical. Immediate. → Action.` template. It repeats near-verbatim across all three slots and leaks "board" onto slots with no board anchor.
2. **"Resting HR is elevated" is a bug.** The Why-LLM input sets `rhrTrend: restingHR > 0 ? "elevated" : null` — any resting-HR reading at all reads as elevated.
3. **The Why-LLM only ever sees immediate signals.** It receives HRV deviation, sleep score, that broken RHR flag, self-declared mind/body, and one HRV-vs-event correlation string. It never receives `causality_findings.signal_summary` (event→HRV, event→RHR, sleep→PRS, consecutive load, `performance_lift`), practice-impact history, check-in pattern aggregator output, or onboarding v8 / CoS-profile strategic context. Pattern and strategic evidence structurally cannot appear.
4. **No evidence ranking and no valence.** The prompt hands a flat fact list, so the model reaches for the loudest number and can stitch a *positive* signal into a deficit sentence.
5. **Two competing "why" lines per card.** The stacked why-line AND the italic action frame ("Build resilience for high-demand days") both try to say why. The italic line is the better copy — and it comes from a generic fallback branch, not from the slot's evidence.

## Copy contract: title vs why (the spec both paths compile against)

Two lines, two jobs, zero overlap. This contract is written once in `_shared/plan/copy-contract.ts` and consumed by the deterministic builder, the LLM prompt, and the validator, so all three enforce the same thing.

**TITLE — what this slot is and how it helps.**
- Shape: `{role verb} {executive outcome} {connector} {anchor}` — anchor is the event name, or the day-part on a light day.
- Role verb comes from the winning evidence valence: **Protect** (positive — hold the edge), **Prevent** (risk — stop the drain), **Prepare** (leader-flagged high-stakes event ahead), **Build** (no event; capacity for what's coming).
- ≤8 words. Outcome must be an executive state, not a practice mechanic: composure, decision quality, presence, focus, recovery, resilience.
- Never contains a metric, a number, a percentage, a practice name, or the word "practice".

**WHY — the evidence that earns the slot.**
- One sentence, ≤15 words, states the *signal*, not an instruction.
- Exactly one clause. No `Fact. Fact. Verb: instruction.` stacking. No colon-instruction tail.
- Never repeats the title's verb or outcome, never names the practice, never tells the user what to do — the title already did.
- Prefers pattern evidence with its count ("three times in a row") over a single raw reading.

**Worked examples**

| Situation | Title | Why |
| --- | --- | --- |
| Board tomorrow, HR elevated before last 3 boards | Prevent composure drain before Board Meeting | Elevated heart rate before your last three board meetings. |
| Board tomorrow, HRV up 60%, RHR at baseline | Protect your edge into the Board Meeting | Recovery is running well above your baseline going in. |
| Leader flagged investor calls as draining (v8), no pattern yet | Prepare presence for the Investor Call | You flagged investor calls as your biggest drain. |
| Back-to-back afternoon, clarity low at check-in | Prevent decision drift across the afternoon | Six meetings back-to-back with clarity already reading low. |
| Light day, short sleep | Protect recovery | Sleep ran short and nothing heavy is on the calendar. |
| Light day, all signals fine, morning | Set your focus for the morning | Open morning — the one block you control today. |
| New user, no wearable, no patterns | Build resilience for high-demand days | Early days — this is the base your harder weeks run on. |

**The italic action-frame sub-line is removed** from the card; its vocabulary is promoted into the title ladder so nothing repeats.


## What we build

### 1. A tiered evidence bundle (new shared module)

New `supabase/functions/_shared/plan/why-signals.ts` — pure and testable, one entry point `buildWhyEvidence()` returning ranked items, each with `tier`, `valence`, `confidence`, `n`, and a short rendered phrase.

- **Pattern evidence** — read the cause-effect outputs: `causality_findings.signal_summary` written by the `cause-effect-engine` (`event_to_hrv`, `event_to_rhr`, `sleep_to_prs`, `consecutive_load`, `performance_lift` → `hr_event_lift`, `category_lift`, `sleep_to_peak`, `rhr_recovery_window`), matched to the slot's own A–H anchor. Drop anything below `emerging` / n<3.
- **Behavioural evidence** — practice-impact history (what has actually moved this leader) and the check-in pattern aggregator (`_shared/signal-engine/checkin-pattern-aggregator.ts`) for day-of-week and streak qualifiers.
- **Immediate evidence** — HRV vs baseline, sleep, **RHR vs the user's own baseline** (fixes the always-elevated bug), elevated-HR proxy, context-switching / back-to-back load from the day shape, check-in clarity and pressure.
- **Strategic evidence** — onboarding **v8**: CoS profile (archetype, depletion pattern, communication profile), declared growth goals, and the events the leader themselves flagged as important / stressful / draining (stakes, load and burden chips), plus `protection_goals` / `pressure_profile` on the profile. Designed as an extensible source: coach conversations, evening-reflection notes, mindset-reframe notes and Week Ahead picks plug into the same slot later.

Selection: at most **two** facts per line — one "why now" (pattern > behavioural > strategic) plus one immediate proof. **Cold-start rule:** when there is no pattern or behavioural evidence yet (new user), the line is built from **strategic (v8) + immediate**, and if even that is thin, from the app's role against the high-stakes anchor — never a fabricated pattern.

### 1b. Every signal carries a valence, mapped to the app's role

The app exists to keep the leader at cognitive peak by **protecting, preventing and preparing/building — proactively**. Each evidence item is assigned `valence` at derivation, not by the model:

- **Positive** (HRV lifted vs baseline, RHR at/below baseline, strong sleep, recovery streak, a category where `performance_lift` shows this leader performs best): the leader is at or near peak. Role = **Protect** — hold and extend the edge into the event; never deficit or recovery framing. A 60% HRV lift before a board day is a *reason the leader is ready*, and if the selected practice is a recovery protocol while all signals are positive, the mismatch is logged and the slot falls back to a peak-protection frame.
- **Risk** (HRV suppressed, RHR elevated vs baseline, **elevated heart rate**, short sleep, consecutive-load tail, **context switching / back-to-back density**, clarity or pressure reading poorly, an event category with a known negative HRV/HR signature): role = **Prevent** — composure drain, mental noise, emotional hijack, stress accumulation, burnout.
- **Strategic** (leader-declared stress/drain events, goals): role = **Prepare / Build** — even with no adverse signal today, a leader-flagged draining event earns a prepare slot.
- **Neutral**: frame by the event and what the practice protects, prevents or builds for.

The validator's valence gate becomes evidence-driven as well as band-driven: a positive-evidence slot rejects deficit language; a risk slot rejects push language.

### 2. Rewritten Why-line prompt

- Replace the flat signal dump with an `EVIDENCE (ranked)` block carrying tier, valence, confidence and n per item, plus the app-role verb for the slot.
- Required output: **one sentence stating the evidence** — crisp, specific, ≤~15 words. No stacked facts, no instruction clause, no restating the practice or the title.
- Keep persona, band discipline, arc awareness, forbidden vocabulary and the pill-consistency rule.

### 3. Deterministic fallback — reuse what exists, don't reinvent

There **is** already a deterministic why path: `composeWhyLine()` plus `buildEventAwareWhyLine()` / `buildModuleEventWhyLine()` and the `strategicAnchorClause` / `tacticalClause` / `immediateClause` builders. The problem is its shape (three stacked clauses + an instruction), not its existence. We keep the plumbing and call sites and replace the composition: one clause, chosen from the highest-ranked evidence item, one template per tier and valence (pattern / behavioural / immediate / strategic-only / cold-start role-only), slot-scoped anchors only so no slot can name another slot's event. Same bundle as the LLM, so LLM and fallback can never disagree on the facts.

### 4. Slot titles that carry the reason

- Structure stays verb + objective + connector + anchor, but the verb comes from the **app role** (Protect / Prevent / Prepare / Build) implied by the winning evidence valence, and the objective becomes the executive outcome — `Prevent composure drain before Board Meeting`.
- No-anchor / light days use the outcome ladder as the title itself: `Protect recovery`, `Build recovery from the morning`, `Set your focus for the morning` — replacing prose like "Land recovery to close the day".
- The italic action-frame sub-line is dropped from the card since the title now carries it.

### 5. Verification

- Unit tests for `buildWhyEvidence()` (tier ranking, valence assignment, cold-start path, positive-signal handling) and for each deterministic template.
- Validator tests extended: reject stacked shape, metric-only lines, and deficit language on positive evidence.
- `[plan-provenance]` extended with `whyTier`, `valence`, `evidenceIds`, `fallback`, then a live plan run for `shukrita@mindmodule.me` to confirm pattern and strategic evidence actually reach the copy.

## Out of scope

MRS scoring, Brief copy/prompt, Insights, gating, slot ordering, JIT horizon/dedupe key, DB schema, RLS.
