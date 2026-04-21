

## Pt B redesign: adopt "Hardware Veto + Three Modes" as the Signal Pill v6.2 architecture

Yes — this direction is a material upgrade to Pt B of the prior plan, not just a patch. It replaces the median-of-tiers composition with a model that handles missing data, contradiction, and hardware reality honestly. Below is what changes vs. what we keep, the unified spec, and the implementation footprint.

### What this replaces in the prior Pt B

| Prior Pt B fix | Replaced by |
|---|---|
| Promote `drained` to `severity: 'strong'` to force amber via median | **Outcome Veto** rule: `drained` → min AMBER, `overwhelmed` → RED (Resilience pillar only) |
| Sharpness qualifier rename (use sharpness-specific trend) | Kept — feeds the Cognitive bottom line |
| Physiology "BODY OK · sleep unread" when sleep null | Replaced by **Mode-aware physiology**: requires ≥2 hardware signals to assert "BODY READY"; otherwise downgrades label and tier ceiling |
| `composePillar` median-of-tiers | Replaced by `finalTier = max(hardwareFloor, weightedAverage)` |

What stays from the prior Pt B: telemetry columns on `brief_snapshots`, validator loosening, prompt §2.19.6 data-honesty addition, ccModifier pattern preference, snapshot invalidation.

### Final pill spec (v6.2)

**Architecture: Hardware Veto + Confidence-aware composition**

```text
finalTier = MAX(
  hardwareFloor,        // strong-red wearable signals lock the floor
  outcomeFloor,         // drained/overwhelmed force resilience floor
  weightedAverage(...)  // per-pillar weights below
)
confidence = signalCount / expectedSignalCount  // drives qualifier, not tier
```

**COGNITIVE — "Decision Power"**

| Input | Weight | Veto rule |
|---|---|---|
| HRV deviation | 0.5 | dev ≤ -20% → pillar locked RED ("MASKED LOAD" if self-reports green) |
| Sharpness (1–5) | 0.3 | ≤2 → min AMBER |
| Clarity (1–5) | 0.2 | ≤2 → min AMBER |

State words: 🟢 CLEAR · 🟠 TAXED · 🔴 DEGRADED
Qualifier triggers: HRV trend declining → "declining trend"; HRV red + sharpness green → "MASKED LOAD"

**PHYSIOLOGY — "Operational Drive"** (pure hardware, zero self-report)

| Input | Weight | Veto rule |
|---|---|---|
| Sleep (score + duration) | 0.5 | duration <5h → RED; <6.5h or score <70 → min AMBER |
| RHR deviation | 0.25 | dev > +20% → RED; > +10% → AMBER |
| HR-elevated proxy | 0.25 | dev > +25% → RED; > +15% → AMBER |

State words (with completeness gate):
- 🟢 BODY READY — requires sleep ≥70/≥6.5h AND RHR within +5% AND HR not elevated
- 🟢 BODY STABLE — RHR good only, sleep missing
- 🟠 LOAD BUILDING — partial signals, one amber
- 🔴 SYSTEM STRAIN — any veto fired
- ⚪ UNKNOWN — zero hardware signals (Mode 3)

Cap: sleep missing → ceiling = AMBER, never green-confident.

**RESILIENCE — "Strategic Composure"**

| Input | Weight | Veto rule |
|---|---|---|
| Mental Energy outcome | 0.5 | overwhelmed → RED; drained → min AMBER |
| HRV deviation (strict band) | 0.3 | dev ≤ -25% → min AMBER |
| Confidence (1–5) | 0.2 | modifier only — high confidence + drained → "felt ahead of system" qualifier |

State words: 🟢 HOLDING · 🟠 UNDER LOAD · 🔴 COMPROMISED

### Three operational modes

**Mode 1 — Wearable + Check-in (full system)**
All weights active. Contradiction detection on: if wearable=RED and self-report=GREEN → "MASKED LOAD" qualifier surfaces in pill bottom line AND flag is passed to the LLM brief as a `divergence` field for body copy.

**Mode 2 — Wearable only (no check-in today)**
- Cognitive: HRV-only, weight renormalized to 1.0
- Physiology: unchanged
- Resilience: HRV strict thresholds + HR trend; ceiling = AMBER (no truth layer)
- Universal qualifier: "Hardware-only read"

**Mode 3 — Check-in only (no wearable)**
- Cognitive: sharpness + clarity, weights renormalized
- Physiology: UNKNOWN (grey pill, "No body data") — never guess from mood
- Resilience: outcome-driven with confidence modifier
- Universal qualifier: "Subjective read; no hardware data"

### Telemetry & cache (unchanged from Pt B)

- Add `llm_fallback_reason TEXT`, `llm_attempts JSONB`, `validator_rejections JSONB`, `pillar_mode TEXT` ('full'|'wearable'|'checkin') to `brief_snapshots`
- Persist mode + per-pillar floor/weighted/final tiers in `payload_json.pillarDebug`
- Invalidate today's snapshot on deploy

### Implementation footprint

**`src/components/home/DecisionReadinessBrief.tsx`** — replace `composePillar`, `cognitiveContribs`, `physiologyContribs`, `resilienceContribs`:
- New `computePillar(inputs, weights, vetos, mode)` returning `{ tier, stateWord, qualifier, confidence, debug }`
- New `detectMode(outerBrief)` → 'full' | 'wearable' | 'checkin'
- State-word maps per pillar × tier × mode
- "BODY READY" vs "BODY STABLE" vs "PHYSIOLOGY OK" branching by signal completeness
- Divergence flag bubbled up through `outerBrief.divergence` for the LLM body

**`supabase/functions/compute-outer-readiness/index.ts`**:
- Add `divergence: { cognitiveMasked: boolean, resilienceFeltAhead: boolean }` to outerBrief response
- Validator loosening (remove `leanOn_repeats_body`, soften lexicon)
- Prompt §2.19.6 — Data-Honesty Ledger now references the divergence flag explicitly: "When `divergence.cognitiveMasked` is true, body MUST name the gap"
- ccModifier prefers PATTERN source over "Full Alignment" stock pair
- Telemetry persistence

**DB migration** — add 4 columns to `brief_snapshots`, clear today's row.

### Verification

1. HRV 18.1 (-25% dev), Sharpness 4, Clarity 4, drained, Confidence 4 →
   - Cognitive: HRV veto → 🔴 DEGRADED · "MASKED LOAD"
   - Physiology (sleep null, RHR -16%): 🟢 BODY STABLE · "sleep not captured"
   - Resilience: drained veto → 🟠 UNDER LOAD · "felt ahead of system"
2. Mode-3 user (no wearable): Physiology pill renders ⚪ UNKNOWN, not fake-green
3. Snapshot row shows `pillar_mode`, `pillarDebug`, `divergence` populated
4. LLM body cites divergence honestly when flag fires
5. Lean On / Watch For pattern-sourced, not "Full Alignment" stock

### Out of scope

- No four-role contract changes
- No edge-function topology changes beyond outerBrief response shape
- No client routing or layout changes

