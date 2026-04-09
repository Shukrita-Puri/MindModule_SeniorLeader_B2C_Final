

# Redesign `/onboarding/results` — Premium Executive Report

## Layout (top to bottom)

```text
┌─────────────────────────────────┐
│  YOUR PERFORMANCE BASELINE      │  ← section header
│                                 │
│  You are The Adaptive Navigator │  ← archetype title (bold)
│  You read the field and adjust  │  ← first sentence of description
│  in real time.                  │     only, normal weight, legible
│                                 │
│  ┌───────────────────────────┐  │
│  │  Recalibration    ████░ 68│  │  ← 3 horizontal gradient bars
│  │  Clarity          ███░░ 57│  │     no overarching 62/100 number
│  │  Renewal          ███░░ 54│  │
│  │  [i] What do these mean?  │  │
│  └───────────────────────────┘  │
│                                 │
│  "Your pattern reveals..."      │  ← AI insight, collapsible
│  [Read full analysis ▾]         │
│                                 │
│  ┌───────────────────────────┐  │
│  │ YOUR STRENGTHS            │  │  ← derived from highest dimension
│  │  Self-Regulation,         │  │     meta-skills
│  │  Resilience, Confidence   │  │
│  │                           │  │
│  │ DEVELOPMENT AREA          │  │  ← derived from lowest dimension
│  │  Adaptive Capacity,       │  │     meta-skills
│  │  Influence, Presence      │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ YOUR DEVELOPMENT PATH     │  │
│  │                           │  │
│  │ Goal Focus                │  │  ← from practice_priority_tag
│  │ Composure under pressure  │  │     (feeds Coach + Brief)
│  │                           │  │
│  │ Practice Focus            │  │  ← mapped from tag
│  │ Mindset Reframes          │  │     (e.g. mindset_reframe →
│  │                           │  │      "Mindset Reframes")
│  └───────────────────────────┘  │
│                                 │
│  [ Activate My System → ]       │  ← CTA (signals commitment,
│                                 │     not "payment" or "setup")
└─────────────────────────────────┘
```

## Specific Changes in `Stage8Results.tsx`

### 1. Remove triangle chart entirely
Replace with 3 horizontal progress bars (gradient fill, rounded, proportional width). Score asymmetry becomes immediately obvious.

### 2. Remove 62/100 overarching number
No circular arc or baseline number. Only the 3 dimension scores are shown.

### 3. Fix subtitle legibility
- Change from `italic text-saffron text-[13px] font-subheadline` to `text-[14px] text-foreground/70 font-body`
- Show only the first sentence of the archetype description (e.g. "You read the field and adjust in real time.") — remove the second sentence ("Strategic flexibility is your strength.") from the subtitle since strengths now appear in a dedicated section below.

### 4. Collapsible AI insight
Show first ~120 characters with "Read full analysis" toggle. Keeps the accurate AI content accessible without text overload.

### 5. Add Strengths & Development Area section
Derive from dimension scores:
- **Strengths**: meta-skills from the highest-scoring dimension (using existing `DIMENSION_META_SKILLS` map)
- **Development Area**: meta-skills from the lowest-scoring dimension

### 6. Add Development Path section with two rows
- **Goal Focus**: Display label from `PRACTICE_PRIORITY_LABELS[practice_priority_tag]` — e.g. "Composure under pressure"
- **Practice Focus**: New mapping from tag to practice modality:
  - `regulation_composure` → "Somatic Protocols"
  - `regulation_early` → "Early Signal Training"  
  - `recovery_resilience` → "Recovery Protocols"
  - `energy_endurance` → "Energy Management"
  - `focus_clarity` → "Cognitive Sharpening"
  - `mindset_reframe` → "Mindset Reframes"

### 7. Remove Value Proposition block
Delete the entire "Perform at your highest level..." border-left block (lines 353-369).

### 8. CTA button text
"Unlock My Practice" → **"Activate My System"** — signals commitment and personalisation without mentioning payment or being generic.

### 9. Language cleanup
- "Your Leadership Pattern" → "YOUR PERFORMANCE BASELINE"
- "Your Self-Mastery Map" → removed
- Loading text: "Mapping your self-mastery profile" → "Calibrating your performance profile"

### 10. Premium visual treatment
- Horizontal bars use a saffron-to-transparent gradient with subtle glow
- Glass card styling consistent with rest of app (`bg-white/65 backdrop-blur-[30px]`)
- Strengths/Development Area uses clean two-column or stacked layout with pill-style meta-skill tags

## What Does NOT Change
- Edge function scoring logic, AI prompt, archetype assignment — all untouched
- Data persistence flow — identical
- `DIMENSION_META_SKILLS` map — reused as-is for strengths/development derivation

## Files Modified

| File | Change |
|------|--------|
| `src/pages/onboarding/stages/Stage8Results.tsx` | Full render rewrite: dimension bars, collapsible insight, strengths/development area, development path with goal + practice focus, remove triangle + value prop, update CTA and labels |

