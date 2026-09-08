# iOS: card alignment + "Choose your Subscription" title

## What I found

1. **Subscription title — real gap on iOS.** The web payment page (`Stage6Payment`) already shows "Choose your Subscription" in black, at the same size and placement as "Mental Performance Insights". But inside the iOS app the same route renders a different screen, `ApplePaywall`, whose heading is still the orange "MIND MODULE EXECUTIVE EDITION" (line 267-269). That is exactly what the screenshot shows. The title was never changed on the Apple screen.

2. **Card alignment — the code exists but is switched off unless the app detects itself as native iOS.** `ExecutiveHome` applies the safe-area top placement and the extra 8px only when `isIosApp` is true. The assessment screen (`DailyCheckIn`) applies both unconditionally. So the two screens can only match if that runtime check passes at exactly the right moment; a mismatch leaves the executive cards higher. Everything else (hero, greeting, -170px overlap) is already identical between the two screens.

## Changes

### 1. Apple subscription screen title
In `src/components/subscription/ApplePaywall.tsx`, replace the heading text "MIND MODULE EXECUTIVE EDITION" with "Choose your Subscription", rendered in black (`text-foreground`) with the same classes used on the web page and on the Insights title:

`font-headline font-medium leading-tight tracking-tight text-[26px] md:text-[42px]`

Placement stays where the current title sits. This screen is what every signed-up user sees on iOS when they open Subscription from Profile — trial, monthly Pro, annual Pro or lapsed — so the one change covers all of them. Nothing else on the paywall changes: plans, prices, trial copy, buttons, restore, links, purchase behaviour all untouched.

### 2. Executive card alignment
In `src/pages/ExecutiveHome.tsx`, make the two positional values unconditional so they mirror the assessment screen exactly, instead of depending on the native-platform check:

- Hero/greeting wrapper: always `pt-[env(safe-area-inset-top,0px)]`.
- Card row wrapper: always the matching `pt-2`.

On web and Android the safe-area inset is `0px`, so those layouts render exactly as they do today; `pt-2` is the same 8px the assessment already uses, applied once around the shared MRS/Brief/Plan swipe area so the three cards cannot drift apart.

## Why the build still looked old
These are web-layer changes bundled into the app. After this is merged, the iOS app must be rebuilt from the latest code (pull, install, build, `npx cap sync`, then run/archive in Xcode) before the screens change on device.

## Explicitly untouched
Card content and behaviour, swipe behaviour, typography elsewhere, colours, imagery, navigation, animation, the assessment screen, all business logic, Edge Functions, database, Brief/Plan/MRS logic, pricing and purchase flows.

## Validation
- Confirm the greeting baseline and white card top edge match across the assessment and all three executive cards at an iPhone viewport.
- Swipe MRS → Brief → Plan and confirm identical placement and unchanged interaction.
- Confirm web/desktop layout is pixel-identical to today.
- Confirm the iOS subscription screen reached from Profile shows the black "Choose your Subscription" title with prices unchanged.
