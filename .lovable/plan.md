

## Refine Results Page: Lighter Meta-Skills, Accent Left-Border on Value Prop

### 1. Simplify Meta-Skills Display Inside the Chart Card

Remove the heavy dimension breakdown (lines 208-225) that repeats dimension names and scores. Replace with a single lightweight row of all 8 meta-skill pills grouped under each dimension label -- no scores, no bold headers, just a compact visual hint of what sits beneath each axis.

Structure below the chart SVG (inside the same card):

```text
Recalibration: [Self-Regulation] [Resilience] [Confidence]
Clarity:       [Thinking Clarity] [Emotional Intelligence]
Renewal:       [Adaptive Capacity] [Influence] [Presence]
```

Each row is a single inline line: dimension name in small muted text, followed by pill tags. No score numbers (the triangle already shows them). No border-top separator. Compact vertical spacing.

### 2. Restyle Value Proposition Box

Change the value prop section (lines 242-258) from the current `bg-muted/30 rounded-xl border border-border` to:
- **No background fill** (transparent / `bg-transparent`)
- **Taupe left border only**: `border-l-4` with a warm taupe colour (`border-[#8B7D6B]`)
- Remove `rounded-xl` (just a clean left-accent block)
- Keep padding on the left (`pl-5`) for breathing room

### 3. Files Changed

Only `src/pages/onboarding/stages/Stage8Results.tsx`.

### Technical Details

**Replace lines 208-225** (heavy breakdown) with a lighter version:

```typescript
<div className="space-y-2 pt-3">
  {radarPoints.map((point) => (
    <div key={point.key} className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground font-medium min-w-[90px]">{point.label}</span>
      {DIMENSION_META_SKILLS[point.key].map((skill) => (
        <span key={skill} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/8 text-muted-foreground">
          {skill}
        </span>
      ))}
    </div>
  ))}
</div>
```

**Replace lines 243-244** (value prop container) with:

```typescript
<div className="bg-transparent border-l-4 border-[#8B7D6B] pl-5 py-2 space-y-3">
```

Remove `rounded-xl` and the full border. The taupe left accent visually separates this block without a heavy card treatment.

