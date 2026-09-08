# Batch 2: nine more mindset protocols (3 per pillar)

Same additive route as the nine that just landed. Audited first.

## Audit — all nine are genuinely mindset, and sit in the right pillar

### Pause
| Practice | Truly mindset? | Right pillar? |
|---|---|---|
| Stop Over-Committing and Reset Your Boundaries (`people-pleasing-boundary-reset`) | Yes — name the pattern, values check, craft the honest "no", sit with the discomfort. Written throughout. | Yes — steadies before agreeing |
| Break Decision Paralysis and Commit (`decision-paralysis-unlock`) | Yes — one-way/two-way door, best available option, record the decision. | Yes |
| Dissolve the Mental Block Stopping You (`mental-block-dissolve`) | Yes — name the block, separate real from catastrophic, minimum move, start. | Yes |

### Presence
| Practice | Truly mindset? | Right pillar? |
|---|---|---|
| Break Out of Linear Thinking on a Stuck Problem (`creativity-unlock-protocol`) | Yes — question framing, first principles, perspective shift, adjacent idea. | Yes |
| Receive Difficult Feedback Without Shutting Down (`feedback-receive-openly`) | Yes — identity/information split, learner frame, listen for the grain of truth. 3 steps. | Yes |
| Debias Your Thinking Before a Major Judgment Call (`high-stakes-judgment-clarity`) | Yes — name the decision, bias scan, steelman the opposite, confidence level. | Yes |

### Power Up
| Practice | Truly mindset? | Right pillar? |
|---|---|---|
| Take the Courageous Action You're Hesitating On (`courage-activation-threshold`) | Yes — fear naming and the regret test. Step 3 adds three breaths, but the practice is a courage reframe, not nervous-system work. | Yes |
| Break the Inertia (`momentum-generator-stuck`) | Yes — name what's stuck, atomic start, begin. | Yes |
| Create Your Peak Performance State, Right Now (`performance-state-activation`) | Yes — state diagnosis, peak reference recall, declaration. Step 2 is a brief physiology shift inside an otherwise written protocol. The v2 upload now carries the correct `power-up` category, so the earlier typo is resolved. | Yes |

Every one keeps the writing box — each has at least one written step. None is a rest/recovery tool like The Executive Power Nap, which we correctly moved to somatic.

## Naming challenges

Source titles are long or instruction-flavoured for a list card. Proposed plain names:

- Reset Your Boundaries
- Break Decision Paralysis
- Dissolve the Block
- Break Out of Linear Thinking
- Receive Feedback Without Shutting Down
- Debias a Major Judgment Call
- Take the Courageous Action
- Break the Inertia
- Create Your Peak State

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

`src/data/practicesAndSoundscapes.ts`, `src/data/cardDeckIds.ts`, `src/data/reflectionCaptureIds.ts`, `src/pages/MicroPracticePlayerCards.tsx`, `supabase/functions/_shared/content/surfaced-content.ts` (SURFACED + MINDSET lists), assets under `src/assets/recalibrate/<pillar>/`, one insert-only migration.

## After this batch

Nine remain (three per pillar), to follow in a final batch, audited the same way first.
