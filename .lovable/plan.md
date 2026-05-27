## Front Page CTA Layout Refinement

### Goal
Convert the "Log In" text link into a proper button, place it side-by-side with the primary CTA, rename the primary CTA from "Let's Go" to "Sign up", and ensure both fit comfortably on mobile iOS viewports. No logic or behavior changes.

### Changes
1. **Layout** — Change the CTA container from `flex flex-col items-center gap-5` to `flex flex-row items-center justify-center gap-3 w-full mt-8 px-4` so both buttons sit on one line.
2. **"Sign up" button (formerly "Let's Go")** — Retain `variant="critical"`, `size="lg"`, `onClick={handleGetStarted}`, and all hover/shadow/transition behavior. Reduce width from `w-full max-w-sm` to `flex-1 max-w-[46%] h-12 px-3`. Text changes from "Let's Go" to "Sign up".
3. **"Log In" button** — Convert the existing plain `<button>` text link into a `<Button>` component with `variant="outline"` styled with white border/text for the dark hero background. Keep `onClick={handleSignIn}` exactly as-is. Size identically to "Sign up": `flex-1 max-w-[46%] h-12 px-3`.
4. **Mobile safety** — With the outer container's existing `px-5` padding, two `max-w-[46%]` buttons plus a `gap-3` will fit well within the ~335 px usable width on the smallest iPhone SE viewport.

### Technical Details
- File: `src/pages/Front.tsx` (CTA section, ~line 228)
- No logic, event handling, routing, or color scheme changes. Only component swap, text label change, and Tailwind class adjustments.
- Outer safe-area and `px-5` padding remain untouched.