# Batch 1 of the remaining 27: three more mindset protocols

Same route as the two that landed correctly (Prepare for a High-Stakes Conversation, Deep Work Initiation). Purely additive.

## Audit of this batch

| Pillar | Practice | Truly mindset? | Correct pillar? |
|---|---|---|---|
| Pause | The Exit Ramp From Overthinking (`rumination-exit-protocol`) | Yes — four written cognitive steps (brain-dump, Bezos two-way-door test, control/no-control split, one next action). No body work. | Yes — quiets a loop, downshift |
| Presence | Own the Room Before You Enter It (`pre-board-mastery-frame`) | Yes — evidence recall, mental rehearsal, anchor, entry. One breath cue only, so it stays a mindset protocol, not somatic. | Yes — pre-meeting presence |
| Power Up | Step Into Your Best Self Before You Feel Ready (`identity-shift-prime`) | Yes — identity naming and declaration. Step 2 is posture, but the practice is an identity reframe, not nervous-system work. | Yes — upshift before a high-performance moment |

All three keep the writing box (each has at least one "write / name it" step), unlike The Executive Power Nap which we moved to a somatic tool.

## Naming challenges

- "The Exit Ramp From Overthinking" is instruction-flavoured. Proposed plain name: **Exit the Overthinking Loop**.
- "Own the Room Before You Enter It" and "Step Into Your Best Self Before You Feel Ready" are long for a list card. Proposed: **Own the Room Before You Enter** and **Step Into Your Best Self**.
- If you prefer the source titles verbatim, say so and they ship unchanged.

## What gets built

1. Catalogue entries in the shared practice catalogue with title, pillar, duration, difficulty, creator/origin, story hook, essence, cue, why-this-works, used-by, and the four steps with timings and wisdom notes.
2. Four-card decks in the existing card-deck player, registered in the deck id list.
3. Reflection capture enabled for all three (client allowlist + server mindset mirror kept in sync).
4. Surfacing allowlists (client and server) so they appear on their pillar page and become plan-eligible.
5. One new illustration each in the existing Recalibrate engraving style, held to the pillar palette — Pause steel blue, Presence deep teal, Power Up warm charcoal/ochre.
6. Database rows in the three content tables, values matching the catalogue exactly, tags mapped from the uploaded CSVs into the app's structured-tag shape.

## Safety

Additive only. No existing practice, title, tag, image, list order, button, route or player behaviour is touched. No change to scoring, JIT, Brief, Plan or navigation. Database work is inserts only. Full test suite plus typecheck before hand-off, and the three Recalibrate lists checked visually.

## Technical notes

`src/data/practicesAndSoundscapes.ts`, `src/data/cardDeckIds.ts`, `src/data/reflectionCaptureIds.ts`, `src/data/microExerciseThumbnails.ts`, `src/pages/MicroPracticePlayerCards.tsx`, `supabase/functions/_shared/content/surfaced-content.ts` (SURFACED + MINDSET lists), assets under `src/assets/recalibrate/<pillar>/`, one insert-only migration.

## After this batch

Remaining 24 follow in batches of three, each with the same audit first. Note `performance-state-activation` now carries the correct `power-up` category in the v2 upload, so it is back in scope for a later batch.
