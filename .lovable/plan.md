

User wants me to evaluate the current LLM prompt for the body copy (and phrase) and propose a refinement so that:

1. The score (X/100) is never restated in the body
2. There's no hard cap on raw numbers — the LLM picks the few that matter, but the body is **assessment-led, not data-led**
3. Numbers in body appear as qualifiers, not as the subject
4. Body must **triangulate** inner signals (HRV/sleep/RHR/check-in) + outer context (calendar load/pressure/high-stakes events) + the **7 CEO realities** → land on a directional recommendation for how the leader proactively handles the event/time-of-day
5. Pills already carry the numbers and % deltas — body shouldn't duplicate that role

Let me read the current prompt to assess what's actually there.

I'll need to view `compute-outer-readiness/index.ts` system prompt block (the §2.19.x sections we added) and the existing body-copy guidance, plus the brief-logic memory and phrase-validation memory to align with what's already standardized.

## Assessment of current state (to confirm in the plan)

From earlier work in this thread, the prompt already has:
- §2.19.2 PILLAR-VOCABULARY MAP (HRV→Mind, Sleep/RHR→Body, MentalEnergy/Confidence→Resilience)
- §2.19 phrase opacity rule (phrase or first body sentence must name a pillar)

What's missing (based on the screenshot showing "score 31/100" repeated and a data-list sentence):
- No explicit ban on restating the numeric score in body
- No "assessment-over-listing" directive
- No explicit triangulation contract (inner signals × outer context × CEO reality → directional move)
- No guidance that pills own the numbers and body owns the synthesis

## Plan: Body Copy = Triangulated Assessment, Not Data List

### File to change
`supabase/functions/compute-outer-readiness/index.ts` — add §2.19.5 to the system prompt (after the existing §2.19.2 pillar-vocabulary block). ~25 lines, prompt-only, no scoring/contract changes.

### New §2.19.5 — BODY COPY: ASSESSMENT CONTRACT

Five rules, written as directives the LLM can follow:

1. **Never restate the numeric score.** The score (X/100) and tier label are rendered above the body. Do not write "31/100", "score of X", or "low readiness score" in the body. Refer to state via pillar language ("Mind is taxed", "Body is rested") instead.

2. **Pills own the numbers. Body owns the synthesis.** The signal pills (HRV %, RHR %, sleep h, check-in outcome, clarity/confidence) already display the raw values and deltas. The body does not repeat them as a list. If a number appears, it appears as a *qualifier inside an assessment sentence*, not as the subject.
   - Forbidden: "HRV is 20% below baseline, RHR is 18% below, score is 31/100, 4 consecutive depleted days."
   - Allowed: "Cognitive load is high while physiology is recovered — your edge today is using rested hardware to fund a taxed mind."

3. **Triangulate three layers in every body.** Every body must connect:
   - **(a) Inner signal read** — which pillar is the lever (Mind / Body / Resilience), based on the strongest pill
   - **(b) Outer demand** — calendar load, pressure, time-of-day, or named high-stakes event from today's events
   - **(c) Directional move** — one proactive instruction the leader can apply (e.g. "front-load the Board prep before noon", "protect the gap before the 3pm review", "let physiology carry today, defer creative work")
   
   If outer context is missing, replace (b) with a relevant CEO reality (decision velocity, attention as scarce resource, performance under uncertainty, energy as capital, stakeholder presence, recovery debt, judgement under load).

4. **Pick the few numbers that matter — no fixed count.** The LLM decides. Typical body uses 0–2 specific numbers, only when they sharpen the assessment. If a pill's delta is the *reason* for the recommendation, naming it once is fine. If it's already obvious from the pill, skip it.

5. **Tone: directional, not descriptive.** A body copy is a brief from a Chief of Staff, not a data report. It tells the leader *what shape the day takes* and *what move it asks for*, not *what the numbers were*.

### Worked example (to include in the prompt as a reference)

Bad (current behaviour):
> "HRV is 20% below baseline and RHR is 18% below baseline, with a score of 31/100. With 4 consecutive depleted days, hardware recovery is the necessary focus."

Good (target behaviour):
> "Body is recovered but Mind is carrying the strain — and the calendar adds three high-stakes touchpoints before lunch. The day's edge is sequencing: handle the Board prep while attention is fresh, then let easier blocks ride on physiology. One real recovery window before evening is what protects tomorrow."

Notice: no score, no list, one pillar lever named, one calendar reference, one directional move, one CEO reality (recovery debt) implied.

### What stays untouched
- Phrase logic (already opacity-checked in §2.19)
- Pillar-vocabulary map (§2.19.2)
- Lean on / Watch for (deferred — that's a separate thread)
- Scoring, signals, atomic brief contract, validators

### Why this is the right fix
- It moves the body from *reporting* to *advising* — which is what a leader needs in 5 seconds
- It removes duplication with pills (pills = data, body = meaning)
- It enforces triangulation in plain language so the LLM doesn't fall back to listing
- It keeps the LLM's discretion on which numbers to use (no rigid "max 1 number" rule the user explicitly rejected)

### Confirmation
Approve → I add §2.19.5 to the prompt and redeploy `compute-outer-readiness`. No other files change.

