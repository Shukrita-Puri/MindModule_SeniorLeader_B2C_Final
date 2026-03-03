

## Match Overview Card Style to Minimal Step Cards

The overview (intro) card currently uses opaque frosted glass (`bg-white/80`). You want it to match the transparent border style of the step cards (`bg-white/15 backdrop-blur-md border border-white/40`), keeping all content text intact.

### Changes needed in `src/pages/MicroPracticePlayerCards.tsx`

**1. Card container styling** (line 2078-2082): For Eye of Storm, apply the transparent style to the overview card too — either by checking practice ID or making overview cards follow the same `minimal` pattern.

**2. Text color adaptation**: Since the background becomes transparent over a dark image, all text in the overview card needs to flip from dark (`text-foreground`, `text-muted-foreground`) to light (`text-white`, `text-white/70`). The Source box, Trigger, and When to Use sections need their label and body text colors updated.

### Specific approach
- Add a flag like `isMinimalPractice` (true when practice is `eye-of-storm`)
- When true, the overview card gets the same `bg-white/15 backdrop-blur-md border border-white/40` container
- All text classes inside the overview block become white-based:
  - `text-foreground` → `text-white`
  - `text-muted-foreground` → `text-white/60`
  - `text-foreground/80` → `text-white/80`
  - `text-primary` labels → `text-white/50`
  - Source box `bg-primary/5 border-primary/10` → `bg-white/10 border-white/20`

No content changes — just visual styling to match the step cards.

