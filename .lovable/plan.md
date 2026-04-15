

# Five Fixes: Lean On Format, Scroll Anchoring, Tour Visibility, Greeting Text, and Check-In Layout

## 1. Lean On / Watch For — Crisp Signal · Source Format

**Problem**: The "How to show up" section shows humanized prose paragraphs instead of the mandated `signal · Source` format with numbers. The screenshot shows e.g. "Score 71 vs 42 yesterday · Readiness" which is the correct format, but the deterministic fallbacks (evening/Sunday overrides) in `compute-outer-readiness/index.ts` return long prose sentences without the `\n`-separated `signal · Source` structure.

**Recommendation**: Enforce the `signal · Source` format everywhere — including all deterministic fallbacks. Each line should be a crisp data-driven signal with a bracketed source. Numbers should be included when available (scores, HRV, sleep hours, meeting counts).

**Fix**:
- **`supabase/functions/compute-outer-readiness/index.ts`**: Refactor `getEveningLeanOnWatchFor()` and `getSundayEveningLeanOnWatchFor()` to return multi-line `signal · Source` format strings instead of prose. Example: `"Score 71 vs 42 yesterday · Readiness\n2 high-stakes meetings today · Calendar"` instead of long sentences.
- Also audit the main LLM prompt to reinforce: each lean-on/watch-for line MUST be `≤7 words signal · Source` with numbers where available.

## 2. Mobile iOS Page Scroll Anchoring

**Problem**: Pages inherit scroll position from previous pages. The existing `ScrollToTop` in `App.tsx` calls `window.scrollTo({ top: 0 })`, but on iOS native (Capacitor), the scroll target is the `SidebarInset` overflow container, not `window`.

**Fix**:
- **`src/App.tsx`**: Update `ScrollToTop` to also reset scroll on the actual scrollable container (`SidebarInset` uses `overflow-y-auto`). Target `document.querySelector('[data-sidebar-inset]')` or equivalent and set `scrollTop = 0` on route change.
- Add `data-scroll-container` attribute to the `SidebarInset` in `ExecutiveHome.tsx` (and other page wrappers) so the reset targets the correct element.

## 3. Tour Tooltip Visibility on White Backgrounds

**Problem**: The tour tooltip card uses `bg-white/15 backdrop-blur-2xl` with white text — when it overlaps a white feature area, the text becomes invisible.

**Recommendation**: Use an opaque dark background for the tooltip card instead of a transparent glass effect.

**Fix**:
- **`src/components/onboarding/FirstSessionGuide.tsx`**: Change tooltip card class from `bg-white/15 backdrop-blur-2xl border border-white/25` to `bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/15`. This ensures white text is always readable regardless of what's behind it.
- For anchor positioning: the tooltip already has `tooltipPosition` logic (above/below). Ensure the secondary scroll adjustment always positions the feature in the visible area with enough room for the tooltip. No additional anchor changes needed — the existing two-pass system handles this.

## 4. Home Screen Greeting Text — Bolder and More Visible

**Problem**: Greeting text ("Morning, Shuk") is hard to read against the hero video backgrounds. The subtitle (phrase) is even less visible at `text-muted-foreground/70`.

**Fix**:
- **`src/pages/ExecutiveHome.tsx`** (lines 302-308):
  - Greeting `h1`: Change from `text-[28px] font-headline text-foreground` to `text-[32px] font-headline font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]`. White with text shadow ensures readability on all video backgrounds.
  - Subtitle `p`: Change from `text-[15px] text-muted-foreground/70` to `text-[15px] text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]`.

## 5. Daily Check-In Layout — Prevent CTA Overlap

**Problem**: The "already checked in" dynamic banner pushes content down, causing the bottom outcome cards to be covered by the fixed "Confirm" CTA button.

**Fix**:
- **`src/pages/DailyCheckIn.tsx`**: Move the "already checked in" banner from inline flow to a fixed/sticky position at the top (overlaying, not pushing content). Use `fixed top-0 left-0 right-0 z-[210]` with appropriate padding so the outcome cards maintain their position regardless of whether the banner is visible.
- Alternatively, reduce the banner height and add extra bottom padding to the scrollable area to ensure the last card is never behind the CTA. The simpler approach: increase `pb-[112px]` to `pb-[160px]` and make the banner a compact toast-style overlay.

## Files to Change
1. `supabase/functions/compute-outer-readiness/index.ts` — Lean on/Watch for format
2. `src/App.tsx` — Scroll reset for iOS containers
3. `src/pages/ExecutiveHome.tsx` — Greeting text styling + scroll container attribute
4. `src/components/onboarding/FirstSessionGuide.tsx` — Opaque dark tooltip background
5. `src/pages/DailyCheckIn.tsx` — Banner/CTA layout fix

