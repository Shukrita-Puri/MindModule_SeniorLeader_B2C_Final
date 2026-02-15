

## Catalog-Style Emotional & Cognitive Check-In

Transform the current vertical list of small cards into a premium, catalog-flip style selection experience with large, visually distinct cards that C-Suite leaders swipe or tap through.

---

### Design Concept

Inspired by the Dribbble "Catalog Flip" reference, each of the 5 emotional states becomes a large, full-width card with:
- A unique gradient background per state (no stock images needed)
- The state title prominently displayed
- A subtle one-line descriptor
- The Lucide icon enlarged as a visual anchor
- Stacked/fanned layout where the active card is front-center and adjacent cards peek from behind

### Card Visual Identity (Gradient per State)

| State | Gradient | Mood |
|-------|----------|------|
| Overwhelmed / Stressed | Deep red to warm amber | Tension, heat |
| Low Energy / Drained | Slate blue to cool grey | Depletion, stillness |
| Okay / Steady | Warm neutral to soft sand | Grounded, balanced |
| Scattered / Unfocused | Teal to seafoam | Movement, diffusion |
| Focused / Energized | Rich green to gold | Clarity, power |

### Interaction Model

- **Horizontal swipeable carousel** using CSS scroll-snap on mobile, or click navigation on desktop
- Each card is tall (~280px) and rounded (rounded-2xl) with the luxury glass border treatment
- Active card is fully visible; adjacent cards show ~20px peek from left/right edges
- Tapping a card selects it and triggers the check-in flow
- Dot indicators below show position in the carousel

### Layout Structure

```
[Hero: "Emotional & Cognitive Check-In"]
[Subtitle: "How are you feeling right now?"]

  [ peek ] [=== ACTIVE CARD ===] [ peek ]
           |  Icon (large)      |
           |  "Okay / Steady"   |
           |  "Grounded. Present"|
           
        * * * o *  (dot indicators)
```

---

### Technical Details

**File modified:** `src/pages/DailyCheckIn.tsx`

**Changes:**
1. Replace the vertical `space-y-3` card list with a horizontal scroll-snap container
2. Each card becomes a large `min-w-[85vw] max-w-[340px] h-[280px]` rounded card with a unique `bg-gradient-to-br` per state
3. Add a short evocative subtitle per card (e.g., "Too much, too fast" for Overwhelmed)
4. Enlarge the icon to `w-12 h-12` with a frosted circle backdrop
5. Add dot indicators below the carousel showing the current scroll position
6. Use CSS `scroll-snap-type: x mandatory` and `scroll-snap-align: center` for smooth catalog browsing
7. Cards have depth shadow (`shadow-[0_8px_32px_rgba(0,0,0,0.15)]`), glass border highlight, and 3D transform on hover/press
8. All existing logic (handleOutcomeSelect, TouchOptimized, save to localStorage/DB) remains unchanged
9. The "Don't overthink it" subtitle moves above the carousel

**No new files or dependencies.** Pure CSS scroll-snap with existing Tailwind classes.
