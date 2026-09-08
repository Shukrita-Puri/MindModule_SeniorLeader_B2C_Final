# Batch 1 of the remaining 27: nine mindset protocols (3 per pillar)

Same route as the two that landed correctly (Prepare for a High-Stakes Conversation, Deep Work Initiation). Purely additive.

## Audit — all nine

### Pause
| Practice | Truly mindset? | Right pillar? |
|---|---|---|
| The Exit Ramp From Overthinking (`rumination-exit-protocol`) | Yes — brain-dump, Bezos two-way-door test, control/no-control split, one next action. All written, no body work. | Yes — quiets a loop |
| Turn This Failure Into a Forward Move (`failure-reframe-pivot`) | Yes — facts, outcome-vs-identity, extract the data, choose the meaning. Classic reframe. | Yes |
| Navigate Org Politics Without Getting Pulled In (`political-navigation-clarity`) | Yes — map players, find the real constraint, common ground, first move. Written strategy work. | Yes — steadying before acting |

### Presence
| Practice | Truly mindset? | Right pillar? |
|---|---|---|
| Own the Room Before You Enter It (`pre-board-mastery-frame`) | Yes — evidence recall, rehearsal, anchor, entry. One breath cue only, so still mindset, not somatic. | Yes |
| Give Full Presence in a Conversation That Matters (`stakeholder-listening-presence`) | Yes — three attention-setting steps. Shortest of the batch at 3 steps / 2 min. | Yes |
| Reconnect to Why This Actually Matters (`vision-reconnect-protocol`) | Yes — origin, the dent, future press release, one action today. | Yes |

### Power Up
| Practice | Truly mindset? | Right pillar? |
|---|---|---|
| Step Into Your Best Self Before You Feel Ready (`identity-shift-prime`) | Yes — identity naming and declaration. Step 2 is posture, but the practice is an identity reframe, not nervous-system work. | Yes |
| Reignite Your Competitive Edge (`competitive-hunger-awaken`) | Yes — name the competition, your reason, feel the fire, channel it. | Yes — upshift |
| Break Through the Ceiling on What's Possible (`possibility-mindset-open`) | Yes — ceiling, 10x question, proof case, expanded move. | Yes |

All nine keep the writing box — every one has at least one written step — unlike The Executive Power Nap, which we correctly moved to a somatic tool.

## Naming challenges

Source titles are instruction-flavoured or long for a list card. Proposed plain names:

- Exit the Overthinking Loop
- Turn Failure Into a Forward Move
- Navigate Politics Without Being Pulled In
- Own the Room Before You Enter
- Full Presence in a Conversation That Matters
- Reconnect to Why This Matters
- Step Into Your Best Self
- Reignite Your Competitive Edge
- Break Through Your Ceiling

Say the word and they ship with the source titles verbatim instead.

## What gets built (per practice)

1. Catalogue entry: title, pillar, duration, difficulty, creator/origin, story hook, essence, cue, why-this-works, used-by, and the steps with timings and wisdom notes.
2. A card deck in the existing player, registered in the deck id list.
3. Reflection capture enabled (client allowlist + server mindset mirror kept in sync).
4. Surfacing allowlists (client and server) so it appears on its pillar page and becomes plan-eligible.
5. One illustration in the existing Recalibrate engraving style, held to the pillar palette — Pause steel blue, Presence deep teal, Power Up warm charcoal/ochre.
6. Database rows in the three content tables, values matching the catalogue exactly, tags mapped from the uploaded CSVs into the app's structured-tag shape.

## Safety

Additive only. No existing practice, title, tag, image, list order, button, route or player behaviour is touched. No change to scoring, JIT, Brief, Plan or navigation. Database work is inserts only. Full test suite plus typecheck before hand-off, and the three Recalibrate lists checked visually.

## Technical notes

`src/data/practicesAndSoundscapes.ts`, `src/data/cardDeckIds.ts`, `src/data/reflectionCaptureIds.ts`, `src/data/microExerciseThumbnails.ts`, `src/pages/MicroPracticePlayerCards.tsx`, `supabase/functions/_shared/content/surfaced-content.ts` (SURFACED + MINDSET lists), assets under `src/assets/recalibrate/<pillar>/`, one insert-only migration.

## After this batch

18 remain, in further batches of nine or three as you prefer, each audited the same way first. Note `performance-state-activation` now carries the correct `power-up` category in the v2 upload, so it is back in scope for a later batch.
