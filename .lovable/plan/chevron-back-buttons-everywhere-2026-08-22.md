# Chevron back buttons everywhere

Make every back button in the app use the chevron icon (like the Insights sub-pages already do). Icon swap only — same button, same size, same colour, same hover, same navigation behaviour.

## What changes

Replace the `ArrowLeft` icon with `ChevronLeft` in these back-button spots:

Shared components (covers most sub-pages at once)
- Back button used on Recalibrate sub-pages (`ClearBackButton`)
- Unified top bar back button (used across many sub-pages)
- Floating back navigation (used by the Profile sub-pages layout: Privacy, Terms, Manage Connections, Subscription, etc.)
- Simulation top navigation (keeps its white/foreground colour switch)

Pages with their own back button
- Practice and soundscape players (`MicroPracticePlayerCards`, `GuidedPracticePlayer`, `SoundscapePlayer`)
- Onboarding: context/connections stage and payment stage
- Onboarding first-session guide ("Back" step control)
- Nudge Settings, Nudge Simulator
- OAuth done screen
- Admin layout back link

## What is not touched

- Main pages' menu/side-panel buttons — untouched.
- Carousel previous/next arrows and keyboard `ArrowLeft` handlers — not back buttons, untouched.
- Any already-chevron screens (Insights detail) — untouched.
- No changes to colours, sizes, spacing, hover states, routing, or logic.

## Technical notes

Each edit is a two-line change per file: swap the `ArrowLeft` import for `ChevronLeft` and swap the JSX tag, keeping all existing props (`size`, `className`, colour classes) exactly as they are. Verified afterwards with a typecheck and build.

