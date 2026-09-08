# Add three new mindset protocols to Recalibrate (one per pillar)

A first, careful slice: one new mindset micro-practice added to Pause, Flow (presence) and Recharge (power-up), using the existing micro-practice template end to end. Once you're happy with these three, the remaining 27 follow the same route.

## Which three

| Pillar | Practice | Why this one first |
|---|---|---|
| Pause | Prepare for a High-Stakes Conversation (`difficult-conversation-prep`) | 4 steps, clearest fit for Pause's "composure under pressure" promise |
| Flow | Deep Work Initiation (`deep-work-initiation`) | Everyday use, matches Flow's "enter deep focus" promise |
| Recharge | Rapid Recharge Midday (`rapid-recharge-midday`) | True recharge; the identity/courage items lean activation and can come later |

## Challenges to the source file (worth deciding now)

1. `performance-state-activation` has its pillar written as "micro-practice" instead of `power-up`. It will be skipped until corrected — not part of this first three.
2. Several titles are instruction-style ("The Exit Ramp From Overthinking"). For these three I'll keep the given titles, only trimming to the app's plain naming: "Prepare for a High-Stakes Conversation", "Deep Work Initiation", "Rapid Midday Recharge".
3. The uploaded tags use a slightly different shape than the app's tagging (`masterySubtypes` and `cognitiveLoadHelp` are missing, context tags are stored as one long sentence split on commas). I'll map them cleanly into the app's tag structure rather than importing as-is.

## What gets built

1. **Catalogue entry** for each of the three in the shared practice catalogue, using the existing mindset micro-practice shape: title, pillar, duration, difficulty, creator/origin, story hook, essence, cue, why-this-works, used-by, and the step-by-step instructions with their timings and wisdom notes.
2. **Step cards** so each opens in the existing card-deck player (the same reading experience as Detachment Through The Observer), registered in the card-deck list.
3. **Database rows** in the three content tables (`sanctuary_content`, `sanctuary_content_metadata`, `sanctuary_content_steps`) so backend selection, the Plan and JIT can see them, with values matching the catalogue exactly — one canonical name per practice.
4. **Artwork**: one new illustration per practice, generated in the existing Recalibrate engraving style and held to each pillar's palette — Pause steel blue, Flow deep teal, Recharge warm charcoal/ochre — stored alongside the existing pillar images.
5. **Surfacing**: they appear in the Mindset Protocols list on their pillar page automatically; they become plan-eligible because they now have a frontend home.

## Safety — additive only

- Purely additive: three new entries follow the exact pattern already used for the existing mindset protocols. No existing practice, title, tag, image, list order, button, route or player behaviour is edited.
- Only additions to the catalogue array, the card-deck id list, the server surfaced-id list, and three new image files.
- No change to scoring, JIT, Brief, Plan, recommendation, or navigation logic.
- Database work is inserts only — no updates or deletes to existing rows.
- Existing tests (catalogue/deck/surfacing consistency, plan contracts) plus a build/typecheck run before hand-off, and the three Recalibrate lists checked visually to confirm everything already there is unchanged.

## Technical notes

- Frontend: `src/data/practicesAndSoundscapes.ts` (catalogue), `src/pages/MicroPracticePlayerCards.tsx` + `src/data/cardDeckIds.ts` (deck), `supabase/functions/_shared/content/surfaced-content.ts` (server allowlist parity), assets under `src/assets/recalibrate/<pillar>/`.
- Data: one migration inserting three content rows plus metadata and step rows, ids matching the catalogue ids; `is_active = true`.
- Structured tags mapped to the app's `StructuredTags` shape (`pillar` values pause / flow / renewal), with context tags split into discrete tokens.

## Out of scope

Somatic protocols, the other 27 mindset protocols, audio, and any change to existing practices, pages, navigation or scoring.

