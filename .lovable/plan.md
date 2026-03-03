

## Audit and Redesign Step Cards — Eye of Storm Pilot

### Time Audit: Eye of Storm (4 steps, claimed 2 min)

| Step | Current Duration | Assessment |
|------|---------|------------|
| 1. Name what you see | 30 sec | Accurate — listing 3-5 facts takes ~30s |
| 2. Separate urgent from important | 45 sec | Slightly generous — C-suite leaders do this instinctively. Could be 30 sec |
| 3. Choose the one critical action | 30 sec | Accurate — single decision |
| 4. State the first move | 15 sec | Accurate — one sentence |
| **Total** | **2 min** | **Reasonable. No change needed.** |

### Design Proposal: Minimal Action Cards

**Problem**: Current step cards are dense — opaque white glass card with step badge, title, duration, long instruction paragraph, examples list, guidance text, reframing patterns, insight box with source/quote, closing wisdom. That's 5-7 content sections per card. Too much cognitive load for time-strapped executives on mobile.

**Reference**: The uploaded Alveos screenshot shows a near-transparent card with just a border, a single action word ("Hold"), and a count. Ultra-minimal. The second screenshot shows a bordered frame with one action and one short affirmation.

**Proposed new step card layout**:

```text
┌─────────────────────────────┐
│                             │
│     ① · 30 sec              │  ← Step number + duration, subtle
│                             │
│     NAME WHAT                │  ← Title as large action verb
│     YOU SEE                  │     uppercase, bold
│                             │
│     List the facts.          │  ← Core instruction: 1-2 sentences
│     No interpretation,       │     MAX. Stripped to essence.
│     no drama. Just what's    │
│     in front of you.         │
│                             │
└─────────────────────────────┘
   (background image visible through card)
```

**Key design changes (step cards only, not overview/science)**:
- **Card style**: `bg-white/15 backdrop-blur-md border border-white/40` — mostly transparent with visible border, background shows through
- **Remove from step cards**: examples list, guidance paragraph, insight/research box, closing wisdom, reframing patterns, question callout
- **Keep**: step number, duration, title (larger, uppercase), core instruction (shortened to 1-2 sentences)
- **Instruction text**: trimmed versions — only the "what to do" action, no explanations of why

**What stays unchanged**:
- Overview card (first card) — keeps current frosted glass + full info
- Science card (last card) — keeps current design
- Background visuals — untouched
- All navigation, progress dots, complete button — untouched

### Content Trimming: Eye of Storm Steps

| Step | Current Instruction (verbose) | New Instruction (action-only) |
|------|------|------|
| 1 | "List the facts without interpretation. Not 'Everything's falling apart' but: 'Three deadlines. One angry email. Two people need answers.'" + guidance + insight | "List the facts. No story, no drama. Just what's actually in front of you." |
| 2 | "For each item, ask: Does this demand immediate action? (Urgent) Does this create long-term value? (Important)" + guidance + insight | "Sort each item: Must act now? Or matters long-term? Do the overlap first." |
| 3 | "Of what remains (urgent AND important), ask: 'Which one action unblocks everything else?'" + guidance + insight | "Which one action unblocks everything else? That's your move." |
| 4 | "Complete this sentence: 'The one thing I do next is [specific action].'" + guidance + insight | "Say it: 'The one thing I do next is ___.' Make it physical. Make it now." |

### Implementation Scope

**File**: `src/pages/MicroPracticePlayerCards.tsx`

1. **Update Eye of Storm card data** (lines 1303-1362): Replace verbose instruction/guidance/insight fields with trimmed action-only text. Add a `minimal: true` flag or use practice ID check.

2. **Add alternate step card rendering** (lines 2151-2281): When practice is `eye-of-storm`, render the minimal transparent border card layout instead of the current dense frosted glass layout.

This is a **pilot on one practice only**. If it works, the template can be applied to all card-based practices.

