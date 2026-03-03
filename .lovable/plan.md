

## Redesign /coach Page + Rename to "Inner Mastery Coach"

Three core changes based on your screenshots and feedback:

### 1. Rename: "Self Mastery Coach" → "Inner Mastery Coach"

Update all user-facing references across the app. The edge function name (`self-mastery-coach`) stays as-is since it's an internal API endpoint.

**Files to update:**
- `src/components/coach/CoachSplitView.tsx` — alt text, title, header bar
- `src/pages/SelfMasteryCoach.tsx` — header center content, contextual greeting
- `src/components/navigation/CoachAccessButton.tsx` — tooltip
- `src/components/navigation/LeftSidebar.tsx` — sidebar title
- `src/components/navigation/FloatingNavigation.tsx` — tooltip
- `src/components/simulation/TopNavigation.tsx` — tooltip
- `src/components/home/DailyRitual.tsx` — protocol type labels
- `src/utils/performancePlanEngine.ts` — protocol type strings
- `src/utils/planReconstruction.ts` — protocol type strings

### 2. Empty State Redesign — Circle Avatar Layout

**Current:** Full-screen background image with text overlay, "Self Mastery Coach" title at top + "Hello, Name" in center = says coach name twice.

**New design:**
- Clean dark/gradient background (no full-bleed photo)
- Title: "Inner Mastery Coach" with tagline below
- Circular coach avatar (using existing `coachVisual`) centered below tagline — similar to the Allin reference
- "Hello, {firstName}" below the avatar
- Prompt suggestions remain as transparent text buttons
- Input bar stays at bottom with glass style

This removes the duplicate coach name issue and gives a cleaner, more intentional feel.

### 3. Active Chat Redesign — Transparent Bubbles Over Background

**Current:** Plain white background with standard chat bubbles on `bg-background`.

**New design inspired by Allin screenshot:**
- Keep the coach background image as a subtle full-bleed backdrop (dimmed) behind the conversation
- Message bubbles use transparent glass style: `bg-white/15 backdrop-blur-md border border-white/30`
- User messages right-aligned, coach messages left-aligned with avatar
- All text becomes white-based for readability over the dark background
- Top bar simplified — just back arrow + "Inner Mastery Coach" + "New Chat" with glass styling
- Input bar uses existing glass variant
- Typing indicator also gets glass treatment

### 4. Copy Review

Updated tagline and intro text to better align with the coach's defined role (inner state, decision quality, regulation — not productivity):

- Tagline: "Inner Awareness. Presence. Growth." → Keep as-is, it's accurate
- Intro: "I'm your self-mastery coach. Share what's on your mind, and let's explore it together." → Update to "I'm your inner mastery coach. Share what's on your mind, and let's explore it together."

### Technical Approach

All changes are in `CoachSplitView.tsx` for the visual redesign, plus string replacements across ~9 files for the rename. No data model or backend changes needed.

**Active chat layout (CoachSplitView lines 291-343):**
- Add full-bleed background image with dark overlay (same as empty state but more dimmed)
- Replace `bg-background` container with relative positioned container + background
- Update message bubble classes from opaque to glass
- Top bar gets glass treatment
- InputBar already has `glass` prop — just pass `true`

