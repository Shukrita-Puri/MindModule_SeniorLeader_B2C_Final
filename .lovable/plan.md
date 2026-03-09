

## Plan: Mastery Plan Carousel Redesign + Mind Map Overlap Fix

### Two Issues

**Issue 1: JIT Mastery Plan Design**
Currently the JIT (Just-in-Time) section renders as a flat list of practice modules inside a single card. It should instead use the same carousel card design as the time-of-day plan. Additionally:
- Calendar event pill buttons are shown above ALL mastery plans — they should only appear next to the relevant plan
- JIT cards need: event thumbnail tiles, time pill ("In 20 hrs"), event type tag pill ("High Stake Event"), and a context-rich subtitle explaining WHY the event was chosen (e.g., "Your HRV was elevated during previous Board meetings")

**Issue 2: Mind Map Text Overlap**
The `InnerWorldBubbles` component uses fixed layout slots for 8 nodes. When labels are long or nodes are close, text overlaps. The current positioning has no collision detection.

---

### Changes

#### 1. `src/components/home/JitCarousel.tsx` — Full redesign

**Current**: Single card with list-style modules (text rows with type/title/duration).

**New design**:
- Show event-specific pills (time pill + event type tag) directly on the JIT card header — not in the parent `DailyRitual` component
- Replace the flat module list with a horizontal carousel of cards (same pattern as time-of-day plan in `DailyRitual.tsx` lines 570-641)
- Each module gets a carousel card with: thumbnail, type label (REGULATE/ALIGN/PREPARE), protocol type, title, duration, favorite heart
- Add a context subtitle with AI-generated "why this event" reasoning from `preEventPlan.contextDescription` — this field already exists and comes from the backend; we'll ensure it's rendered prominently
- Keep Start Pack button and Snooze below the carousel

#### 2. `src/components/home/DailyRitual.tsx` — Remove calendar pills from above all plans

**Current** (lines 507-527): `calendarPills` rendered above all plans as toggle buttons.

**Change**: Remove the calendar pills section entirely from DailyRitual. The JIT section is already a separate component (`JitCarousel`) rendered independently below. Calendar context pills were acting as a toggle between time-of-day and pre-event views — this toggle pattern is being removed. The time-of-day plan always shows its carousel; JIT shows separately below with its own context.

Also remove the `activeView` state and pre-event branching logic (lines 480-482, 562-568, 655-661) since JIT is fully handled by `JitCarousel`. This simplifies DailyRitual to only render time-of-day content.

#### 3. `src/components/insights/InnerWorldBubbles.tsx` — Fix text overlap

**Current**: Fixed layout slots with minor jitter. No collision detection. Long theme names overlap.

**Changes**:
- Add collision detection after initial placement: iterate node+label bounding boxes and nudge overlapping labels vertically
- Truncate long theme names (max ~20 chars with ellipsis) in the SVG text
- Increase vertical spacing between layout slots
- Add slight dynamic adjustments: if a label would overlap another, shift it down or up by the label height
- Increase `svgHeight` from 380 to ~480 to give more vertical room for 8 nodes

---

### Technical Details

**JitCarousel carousel pattern** — reuse exact same Embla carousel setup from DailyRitual (CarouselApi state, slide tracking, drag detection, pagination dots, glassmorphic card style).

**DailyRitual simplification** — remove `activeView` state, `calendarPills` rendering, and pre-event module branching. The `onPreEventPlanReady` callback stays since `ExecutiveHome` passes the plan down to `JitCarousel`.

**Collision detection algorithm** for InnerWorldBubbles:
- After computing node positions, calculate each label's bounding box (x, y, width estimate from char count × avg char width, height from fontSize)
- Sort by y position, then for each pair check vertical overlap
- If overlapping, nudge the lower label down by the overlap amount + padding
- This is O(n²) but n≤8 so negligible

