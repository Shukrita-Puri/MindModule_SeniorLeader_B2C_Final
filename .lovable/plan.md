# Align the three executive cards with the assessment on iOS

## Scope

Presentation-only change for the native iOS app, limited to exactly two positional values: the greeting height and the white-card starting height. No other UI styling or placement will change. No card content or behaviour, swipe behaviour, logic, data, scoring, Edge Function, database, Brief, Plan, MRS, web, or Android behaviour will change.

## Current difference confirmed

- The Performance Readiness Assessment places its shared background image and greeting below the iOS safe-area inset.
- The MRS, Brief, and Plan swipe screen uses the same image and greeting components, but its surrounding layout does not apply that inset.
- The assessment card also starts 8px lower than the executive cards.

## Implementation

1. On native iOS only, apply the assessment's top safe-area placement to the shared MRS / Brief / Plan screen so “Standing by, Shukrita” sits at the same height.
2. On native iOS only, move the MRS, Brief, and Plan card row down by the matching 8px so all three white cards begin at the same height as the Performance Readiness Assessment card.
3. Keep one shared offset around the three-card swipe area, ensuring MRS, Brief, and Plan cannot drift apart.
4. Leave the assessment screen unchanged as the reference layout.

## Explicitly untouched

- Every other UI property, including card size, spacing within cards, typography, colours, imagery, navigation, controls, and animation.
- All frontend functionality and business logic.
- All backend code, Edge Functions, database schema, database data, and queries.

## Validation

- Compare the assessment and all three executive cards at the same iPhone viewport.
- Confirm the greeting baseline and white-card top edge align across all four screens.
- Swipe through MRS, Brief, and Plan to confirm identical placement and unchanged interactions.
- Confirm the desktop/web layout remains unchanged.
