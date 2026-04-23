

## Plan — Mobile-native tooltip + accurate pillar glossary copy + cognitive wearable evaluation

### 1. Tooltip presentation — match app-wide native pattern

Replace the `Popover` used in the three expanded signal pills with a centred frosted-glass modal that matches every other tooltip in the app (`MetricInfoModal` pattern: dimmed backdrop + `backdrop-blur-sm`, centred card, tap-outside-to-close).

- New tiny component `PillarGlossaryModal` (or extend `MetricInfoModal` with a `secondary` prop) so the existing Popover call site in `DecisionReadinessBrief.tsx` (lines 1216–1250) becomes a centred portal modal instead of an anchored popover.
- Keeps the **taupe `Info` icon** at top-right of the expanded pill (current position), unchanged.
- Backdrop: `fixed inset-0 bg-black/55 backdrop-blur-md` — darker than the inline tooltip, identical to the modal used elsewhere.
- Card: centred, `bg-card/95 backdrop-blur-xl border border-border rounded-2xl p-5 max-w-sm`, soft shadow.
- Two stacked text blocks (short definition, then clinical definition with HRV/RHR/Sleep wearable terms preserved on Physical Reserves), `Got it` close button.
- Tap-outside or `Got it` closes. iOS-safe (uses `createPortal` to `document.body`, same as `MetricInfoModal`).

### 2. Glossary copy — accurate per-pillar inputs

Rewrite the `glossary` map in `DecisionReadinessBrief.tsx` (lines 1148–1167) so it mirrors what the engine actually does:

**Decision Readiness (cognitive)**
- **Short:** *Mental sharpness & clarity — how crisp your thinking is right now. Higher = sharper decisions; lower = foggier judgement.*
- **Clinical:** *Blends your self-rated sharpness, clarity and check-in outcome (Focused / Scattered) with HRV from your wearable. HRV (Heart-Rate Variability) acts as a hardware veto — when autonomic recovery is suppressed (≤ −20% vs your baseline), it caps the pillar regardless of how sharp you feel, because the nervous system is the substrate of clear thinking.*

**Physical Reserves (physiological)** — keep current copy verbatim (HRV + RHR + Sleep score clinical block is already accurate).

**Resilience Capacity (emotional)**
- **Short:** *Your capacity to absorb pressure — confidence, mental energy and physiological steadiness combined. Higher = composed under load; lower = depleted or stretched thin.*
- **Clinical:** *Blends your self-rated **confidence** and **mental energy** (Calm / Steady / Energised / Anxious / Frustrated / Overwhelmed / Drained) with HRV as a stress-tolerance read. Low HRV alongside high confidence often signals running on grit.*

Word substitution rule: every user-facing reference to "mood" in this component (and any sibling resilience copy) → **"mental energy."** I'll grep the file once and replace the single offending instance to keep the vocabulary consistent.

### 3. Decision Readiness — evaluate a more immediate cognitive wearable signal

**Evaluation only — no behaviour change yet.** Mapping the candidate signals against availability in `wearable_data` and immediacy for *cognitive* readiness:

| Signal | Available today | Immediacy for cognition | Fit for Decision Readiness |
|---|---|---|---|
| HRV (current) | yes (`hrv`) | overnight read, refreshed each morning | already in pillar as hardware veto |
| Sleep score / duration / deep sleep | yes (`sleep_score`, `total_sleep_minutes`, `deep_sleep_minutes`) | strongest single predictor of next-day cognitive performance; refreshed each morning | **best candidate to add as secondary cognitive input** — sleep < 6h or score < 70 reliably reduces working-memory and decision quality independent of HRV |
| Resting HR deviation | yes (`resting_heart_rate`) | tracks systemic load, less specific to cognition | weak fit |
| Live HR / HR-elevated proxy | yes (`heart_rate`, `hr_elevated`) | sympathetic dominance — narrows attention but is more arousal than cognition | better suited to Resilience |
| Active calories / steps | yes | activity load, not cognition | not a fit |

**Recommendation (for approval before implementing):** keep HRV as the cognitive hardware veto, and **add a secondary cognitive contribution from sleep** in the cognitive pillar — gated to only fire on the same morning's sleep block. Thresholds:
- sleep duration < 5 h **or** sleep score < 60 → red mild contribution to Decision Readiness
- sleep duration 5–6 h **or** sleep score 60–69 → amber
- otherwise neutral (does not lift the pillar)

Sleep already drives Physical Reserves, so the same column is read twice but with different roles: in Physiology it's about recovery reserves; in Cognition it's about next-day mental bandwidth. The clinical glossary line above will name this dual use explicitly so it doesn't feel like double-counting.

If approved, the engine change is contained:
- Add `sleepCognitiveContrib()` next to `hrvCognitiveContrib()` in `buildExecutivePills`.
- Insert it into `cogContribs` with a 0.2 weight, drop sharpness from 0.3 → 0.25, drop clarity from 0.2 → 0.15 (HRV stays at 0.5, hardware veto unchanged).
- Add the new line to `cogTop` (wearable side of the box) so the user sees `Sleep: 5h 40m · 12% below your baseline` whenever it materially contributes.
- Update the glossary clinical text accordingly.

If you'd rather **not** double-count sleep, alternative is to skip this addition — HRV already provides a strong wearable read for cognition via the hardware veto. **Decision needed before I touch the engine.**

### Files touched

- `src/components/home/DecisionReadinessBrief.tsx` — tooltip swapped to centred modal, glossary copy rewritten, "mood" → "mental energy", optional `sleepCognitiveContrib` if sleep addition is approved.
- `src/components/home/PillarGlossaryModal.tsx` *(new — small portal modal mirroring `MetricInfoModal` styling)* **or** extend `MetricInfoModal` with a `triggerless` mode and reuse it.
- `mem://ui/performance-readiness/signal-pill-system` — note the centred-modal tooltip pattern and the corrected pillar input list (HRV is included in Decision Readiness; Resilience uses Mental Energy not mood).

### Open question for you

Confirm one of:
- **A.** Add sleep as a secondary cognitive input (recommended — strongest immediate cognitive wearable signal we already have).
- **B.** Leave Decision Readiness wearable input as HRV-only and just fix the glossary copy to reflect that HRV *is* used.

Everything else (tooltip modal swap, copy fixes, "mood" → "mental energy") proceeds either way.

