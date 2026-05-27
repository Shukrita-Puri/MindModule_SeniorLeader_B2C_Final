## Front Page Layout & Button Visibility Refinement

### Goal
Take cues from Granola's landing: anchor brand at top, give the tagline its own breathing room, and push the CTAs toward the bottom. Make "Log In" clearly recognizable as a button (currently it reads as invisible against the dark hero photo). Keep both buttons side-by-side.

### Senior-designer rationale on the Log In button
A ghost/outline button on a busy photographic background fails the "is this tappable?" test — `border-white/30` disappears against bright sky areas. Best practice on dark hero imagery is a **two-tier hierarchy with clear contrast on both**:
- **Primary (Sign up):** solid saffron — keeps current critical accent, drives the main action.
- **Secondary (Log In):** solid frosted-glass pill (white with ~85–95% opacity, dark text, soft shadow, subtle backdrop blur). This is what Granola, Linear, Notion, and most iOS apps do — both buttons are solid and legible, hierarchy comes from color, not from one being a faint outline.

Both buttons get equal weight in size/shape; meaning is conveyed by fill color.

### Layout changes (mobile-first, iPhone-safe)
Switch the content layer from `justify-center` to a 3-zone vertical layout using `justify-between`-style spacing so each block owns its space — like Granola:

```text
┌───────────────────────────┐
│  [safe-top + 8–12vh]      │
│        Logo (circle)      │   ← Brand cluster, raised
│        MIND MODULE        │
│     Executive Edition     │
│                           │
│        (sky gap)          │
│                           │
│   Designed for Leaders    │   ← Tagline, own zone, mid-upper
│   to Stay Mentally Ahead  │
│                           │
│        (large gap)        │
│                           │
│  [ Log In ] [ Sign up  ]  │   ← CTAs, lower third
│      Privacy badge        │
│  [safe-bottom inset]      │
└───────────────────────────┘
```

Concretely in `src/pages/Front.tsx`:
1. Outer content layer: `justify-between` instead of `justify-center`; add `pt-[max(env(safe-area-inset-top),2rem)]` and `pb-[max(env(safe-area-inset-bottom),1.5rem)]`.
2. **Brand cluster** (logo + MIND MODULE + Executive Edition): wrap in its own block at the top; keep current sizes; reduce internal `space-y` slightly so it reads as one unit fully inside the upper sky region.
3. **Tagline** ("Designed for Leaders to Stay Mentally Ahead"): move into its own middle block with generous `mt`/`mb`, no longer attached to the brand cluster.
4. **CTA + trust badge**: keep together in the bottom block.

### Button styling changes
In the same CTA row (no logic/handler changes):
- **Log In** — replace `variant="outline"` styling with a solid frosted pill:
  `bg-white/90 text-foreground hover:bg-white backdrop-blur-md border border-white/60 shadow-[0_4px_16px_rgba(0,0,0,0.15)]`, same `h-12 rounded-2xl flex-1 max-w-[46%]`.
- **Sign up** — unchanged (`variant="critical"`, saffron, same size).
- Both keep `onClick`, routing, and all existing behavior untouched.

### Technical notes
- Single file: `src/pages/Front.tsx`.
- Pure Tailwind class adjustments + restructuring of the three content blocks; no handler, routing, auth, or color-token changes.
- Verified on 390×844 (current preview) and accounts for iPhone SE (~375×667) via `flex-1 max-w-[46%]` + `gap-3` + `px-5`.
- No changes to logo asset, copy strings (besides what's already in place), or `FrontLoading`.
