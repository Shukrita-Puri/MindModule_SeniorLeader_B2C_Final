# Signal Pill Divergence + Weekend Beat (c)

## Part 1 — Why the same HR reads green in one pill and red in another (audit, no change proposed yet)

Verified against this morning's data for the account in the screenshot:
HRV 20.5, RHR 69, HR 85–95, sleep score / duration / efficiency all null.

**Physical Reserves → "Body Steady" (green)**
Inputs it actually reads (`_shared/signal-pills/derive-pills.ts`):
- RHR absolute or RHR deviation → 69 is normal → green
- Heart rate **only via `hrDeviation`** — and there is no HR baseline for this
  user, so `hrDeviation` is null and the HR branch is skipped entirely. It then
  falls back to a *second* RHR-deviation read → green again.
- 3-day RHR trend, sustained-deficit flag → nothing pushing worse than green

Net: the pill never sees the 95bpm number at all. It is effectively an
RHR-only pill today.

**Resilience Capacity → "Reserve Spent" (red)**
- Primary anchor is sleep efficiency → null, so Fallback B fires
- Fallback B prefers `hrDeviation`; that is null, so it uses **absolute HR**:
  `>90 red, >80 amber, else green` → 95 → **red**
- Any-worst-wins means that single red sets the pill, regardless of the amber
  check-in overlays around it

**So the divergence is structural, not a bug in either pill on its own:**

| | Physical Reserves | Resilience Capacity |
|---|---|---|
| Reads absolute HR? | No — deviation only | Yes — absolute fallback |
| HR thresholds | dev >10 amber / >20 red | dev >10/>20 **or** abs >80/>90 |
| Behaviour when no HR baseline | HR silently dropped | HR becomes the whole pill |

Two further points worth naming:
1. `heart_rate` here is a spot/ambient reading, not resting. Judging it on an
   80/90 absolute scale is close to a resting-HR scale, so a normal active
   reading reads as "spent".
2. The user has **zero sleep rows for 10+ days** — no sleep score, duration or
   efficiency ever persisted. So Resilience is permanently on its fallback and
   Decision Readiness is running on HRV alone.

Options if you want this fixed later (not implemented in this pass):
- A: give the HR fallback a personal baseline (trailing 14-day mean of
  `heart_rate`) so it compares like-for-like instead of using 80/90 absolutes.
- B: raise the absolute-HR thresholds for the fallback (e.g. >100 amber /
  >110 red) to reflect that this is not a resting measure.
- C: make the two pills symmetric — either both read absolute HR or neither.
- D: investigate why no sleep data reaches `wearable_data` at all, which is
  the actual root cause of both pills being on fallbacks.

## Part 2 — Weekend awareness missing from beat (c)

The brief **does** know it is the weekend: the read line and the closing beat
both took their weekend branches ("no work calendar — the physiological read is
the anchor for the weekend", "let this window close so the week starts clean").

The gap is in `buildDirective()` in
`supabase/functions/_shared/brief/deterministic-brief.ts`. Only two of its
branches check `opts.isWeekend`. The branch that fired for this brief —
physical green + cognitive not green — returns a fixed workday string:

> "Route the presence and stakeholder conversations through the physical
> runway; defer anything needing full processing"

which is exactly what `WEEKEND_DIRECTIVE` forbids on the LLM path.

### Change

Restructure `buildDirective` so the weekend / non-workday check happens
**first**, before any pillar branch, and returns a recovery-shaped directive
selected by signal quality:

- **Signals mixed or poor** (any pill amber/red, or band stretched/depleted) →
  recovery-first, e.g. "Let today actually recover — the read says the system
  is still paying down, not building."
- **Signals green** → light-touch proactive prep, e.g. "Reserves are there —
  spend a little of it setting up the week rather than reacting to it."
- **Signals unread** → neutral, e.g. "No current read to work from — take the
  day at the pace it asks for."

Rules held:
- No meetings, calls, deliverables, team or "the room" language on a weekend.
- No practice, duration or protocol prescription — the Brief stays at direction
  level. The Plan still runs on off days (a morning or evening slot, per the
  user's onboarding preference) so habit-building continues; the Brief just
  points at recovery or light week-prep without claiming the whole day.
- Beat (d) closing logic is already weekend-correct and is left untouched.

Non-workday shapes (holiday / PTO / personal travel) already collapse into
`isWeekend` at the top of `buildDeterministicBriefFallback`, so they inherit
the same fix.

### Technical notes
- Single file: `supabase/functions/_shared/brief/deterministic-brief.ts`.
- Add tests covering: weekend + amber/red pills → recovery language; weekend +
  green pills → week-prep language; weekend never emits meeting/call/stakeholder
  vocabulary from any branch; weekday branches unchanged.
- Bump `BRIEF_PROMPT_VERSION` in `_shared/brief-prompt-version.ts` so cached
  weekend briefs carrying the workday directive are invalidated.
- Redeploy `compute-outer-readiness`.
- No pill logic, MRS, Plan or frontend changes in this pass.
