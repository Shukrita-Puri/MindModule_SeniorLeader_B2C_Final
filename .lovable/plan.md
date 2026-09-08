# Final batch: the last nine mindset protocols (3 per pillar)

Same route as the 21 already shipped. Purely additive. This completes all 30.

## Audit — all nine are true mindset protocols, in the right pillar

### Pause
| Practice | Truly mindset? | Right pillar? |
|---|---|---|
| Enter Their Frame to Move Them (`influence-reframe-protocol`) | Yes — three written steps: their concern, the connecting thread, their language. No body work. | Yes |
| Think Two Moves Ahead Before You Act (`avoiding-ramification-think`) | Yes — state the action, first-order, second-order, pre-mortem. All writing. | Yes — a deliberate stop before acting |
| Stay Composed in an Acute Crisis (`crisis-composure-anchor`) | Yes — one regulating breath, then two written steps (facts, one move). The breath is a cue inside a thinking protocol, not the practice itself. | Yes |

### Presence
| Practice | Truly mindset? | Right pillar? |
|---|---|---|
| Why This Still Matters (`purpose-meaning-reconnect`) | Yes — what went quiet, one person affected, your original yes, today's meaning. | Yes |
| Rewrite the Story That's Holding You Back (`narrative-control-reframe`) | Yes — name the story, test it, write the alternative. Classic reframe. | Yes |
| Turn Leadership Loneliness Into Clarity (`loneliness-leader-grounding`) | Yes — allow, recognise the choice, find the resource, choose dignity. One closing breath only. | Yes |

### Power Up
| Practice | Truly mindset? | Right pillar? |
|---|---|---|
| Command the Room Before You Say a Word (`board-authority-prime`) | Yes — posture is 30 seconds of step 1; steps 2 and 3 are identity framing and deliberate silence. Same reasoning as Own the Room, already shipped. | Yes |
| Recover Your Resilience Fast After a Blow (`resilience-restore-fast`) | Yes — name the feeling, ground in what is still true, extract the lesson, choose return. | Yes |
| Restore Your Decision-Making Energy (`decisive-energy-activation`) | Yes — step 1 is a short physical reset, but the practice is decision triage and making one call. | Yes |

None of these is a rest/recovery tool like The Executive Power Nap, so all nine keep the micro-practice template with the writing box.

## Naming

Source titles trimmed to list-card length, same convention as the earlier batches:

- Enter Their Frame
- Think Two Moves Ahead
- Stay Composed in a Crisis
- Why This Still Matters
- Rewrite the Story
- Turn Loneliness Into Clarity
- Command the Room
- Recover After a Blow
- Restore Decision Energy

Say the word and they ship with the source titles verbatim instead.

## What gets built (per practice)

1. Catalogue entry: title, pillar, duration, difficulty, creator/origin, story hook, essence, cue, why-this-works, used-by, and the steps with timings and wisdom notes.
2. A card deck in the existing player, registered in the deck id list.
3. Reflection capture enabled (client allowlist + server mindset mirror kept in sync).
4. Surfacing allowlists (client and server) so each appears on its pillar page and becomes plan-eligible.
5. One illustration in the existing Recalibrate engraving style, held to the pillar palette — Pause steel blue, Presence deep teal, Power Up warm charcoal/ochre.
6. Database rows in the three content tables, values matching the catalogue exactly, tags mapped from the uploaded CSVs into the app's structured-tag shape.

## Safety

Additive only. No existing practice, title, tag, image, list order, button, route or player behaviour is touched. No change to scoring, JIT, Brief, Plan, MRS or navigation. Database work is inserts only. Full test suite plus typecheck before hand-off, and the three Recalibrate lists checked visually.

## Technical notes

`src/data/practicesAndSoundscapes.ts`, `src/data/cardDeckIds.ts`, `src/data/reflectionCaptureIds.ts`, `src/pages/MicroPracticePlayerCards.tsx`, `supabase/functions/_shared/content/surfaced-content.ts` (SURFACED + MINDSET lists), assets under `src/assets/recalibrate/<pillar>/`, one insert-only migration. Source `energy_direction` values `upshift`/`downshift` are mapped to the database-valid equivalents, as in the previous batches.

## After this batch

All 30 protocols are live: 10 per pillar.
