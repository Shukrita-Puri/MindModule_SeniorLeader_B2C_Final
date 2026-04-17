

## Refined Plan: Pill Capsule Design with State-Driven Colors

### Scope
Only the "Based on your signals" block in `src/components/home/DecisionReadinessBrief.tsx`. No backend, no other UI.

### Pill front (collapsed) — matches reference image

```text
┌──────────────────────────────────┐
│ 🧠  COGNITIVE LOAD          ⌄    │   ← small label (top)
│     CALM / ACUTE                 │   ← bold signal word (analysis)
└──────────────────────────────────┘
```

- **Capsule shape** (fully rounded, horizontal pill)
- **Left**: glowing line icon (Brain / Battery / Shield)
- **Center stack**: small uppercase headline + bold signal phrase below
- **Top-right**: chevron-down (toggles glass box)
- **Color** = state-driven (worst-of of pill's signals):
  - GREEN `#10B981` = Good
  - AMBER `#F59E0B` = Ok
  - RED `#EF4444` = Bad
- Soft glass gradient + glow tint matching state color

### Three pills + signal phrases

| Pill | Headline | Signal phrase examples (analysis word) | Color from |
|---|---|---|---|
| 🧠 **COGNITIVE LOAD** | COGNITIVE LOAD | CALM / ACUTE · HIGH LOAD · STRAINED · STEADY | worst of HRV tier + Sharpness/Clarity |
| 🔋 **PHYSIOLOGICAL** | PHYSIOLOGICAL | READY / RESTED · FADING · DEPLETED | worst of Sleep tier + Energy outcome |
| 🛡 **EMOTIONAL** | EMOTIONAL | FOCUSED / STEADY · REACTIVE · STRAINED | worst of RHR tier + Confidence |

Phrase mapping is deterministic from existing `outerBrief` tier data — no LLM, no backend change.

### Glass Box (expanded) — top/bottom split, no labels

```text
┌──────────────────────────────────────┐
│  PAST WEEK                           │  ← top: WEARABLE (no label)
│  HRV (7-Day Avg): 110ms (+15%↑)      │
│  ─────────────  sparkline ─────────  │
├──────────────────────────────────────┤
│  Sharpness: 8/10                     │  ← bottom: SELF-DECLARED (no label)
│  Clarity: High                       │
└──────────────────────────────────────┘
```

- **Top half** = wearable raw metric + deviation + inline pattern qualifier (reuse existing pattern logic from `mem://features/performance-readiness/inline-pattern-mapping` for ALL three pills)
- **Bottom half** = self-declared score(s) + outcome label + inline pattern qualifier
- No "WEARABLE" / "SELF-DECLARED" headers shown
- Inline patterns appear on **all three pills** (HRV trend / Sleep trend / RHR trend on top; Sharpness streak / Energy streak / Confidence streak on bottom)
- Frosted glass surface, subtle inner border in pill's state color
- One pill expanded at a time (local `useState`)
- Empty wearable on a pill → top half shows "Connect wearable for full reading"

### Layout
- 3 pills in a row, wrapping to stacked on narrow widths
- Capsule height ~56px collapsed; expansion grows inline (no overlay, no layout shift on the rest of the page)
- Chevron rotates 180° when expanded

### Files edited
- `src/components/home/DecisionReadinessBrief.tsx` — replace the chip block (~lines 740-772) with new `<ExecutivePillRow>` + `<ExecutivePill>` + `buildExecutivePills()` helper. All other code untouched.

### Untouched
Score, tier, phrase, body, calendar pills, "How to show up", lean on / watch for, raw numbers, navigation, edge functions, scoring weights.

