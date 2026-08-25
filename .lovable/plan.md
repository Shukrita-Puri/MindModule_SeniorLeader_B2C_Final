# Content discrepancy audit + naming SSOT plan

Audit only — nothing changed. Every claim below comes from a query or file read in this run.

## AUDIT 1 — DB vs static catalogue titles

43 active rows in `sanctuary_content`; 40 ids in `src/data/practicesAndSoundscapes.ts`.

**Zero title mismatches** for ids present in both. DB and catalogue titles are byte-identical (spot-checked `harmonic-calm`, `stoic-reflection`, `energy-through-reframe`).

## AUDIT 2 — Recalibrate list overrides vs catalogue

Overrides live in `getOutcomeFocusedTitle` in each of the three outcome pages. Micro-practices return `item.title` unchanged; only soundbath/guided-practice run through `titleMap`, which is keyed on **title**, not id.

Live overrides (the only 5 that still match a real catalogue title):

| Content ID | Recalibrate list | Catalogue / DB | Mismatch type |
|---|---|---|---|
| deep-focus-monastic-resonance | Sustained Focus with Monastic Chant | Deep Focus with Monastic Resonance | list override |
| sustained-focus-choir-harmonic | Sustained Focus with Cathedral Choir | Sustained Focus with Choir Harmonic | list override |
| ina-night-fields | Nature's Perfect Rhythm | Ina Night Fields (Tsukiyomi) | list override |
| bhramari-pranayama | Deep Focus Through Bhramari Pranayama | same | no-op entry |
| trataka-flame-gaze | One-Pointed Focus Through Trataka | same | no-op entry |

Dead map keys (no catalogue item carries these titles any more, so the override never fires): Tibetan Bowl Resonance, Pre-Mission Calm, Forest Bathing, Himalayan Mountain Monastery, Cathedral Choir Flow, Earth Resonance, Tonglen Compassion Practice, Vipassana Body Scan, Tactical Pause, Grounding Touch, Athletic Activation, Kapalabhati Pranayama, The Spartan Battle Breath, Box Breathing Reset, Wim Hof Power Breathing.

Per-id overrides in the Power-Up page (`buddhist-phoenix`, `energy-through-reframe`, `courage-future-self`, `confidence-through-evidence`, `energy-through-completion`, `courage-arena`) all match the catalogue **except** `buddhist-phoenix` → see Audit 3.

`stoic-reflection` maps to "Daily Virtue Alignment" in the Presence page `titleMap`, but that code path is unreachable: `stoic-reflection` is a `micro-practice`, so the function returns `item.title` first. The list shows "Stoic Evening Reflection".

## AUDIT 3 — Card deck titles vs catalogue

Each deck's overview card carries its own hardcoded `title`. 24 of 29 deck cases match the catalogue exactly. Mismatches:

| Content ID | Card deck | Catalogue / DB | Mismatch type |
|---|---|---|---|
| stoic-reflection | Daily Virtue Alignment | Stoic Evening Reflection | deck override |
| buddhist-phoenix | Resilience Through The Phoenix | Resilience Through the Buddhist Phoenix | deck override (list agrees with deck, DB does not) |

Legacy deck aliases with no catalogue/DB entry (dead switch cases): `presence-grounding`, `release-exhale`, `stillness-gap`, `detachment-observer`, `softness-release` — each duplicated by the `-new` id that is real.

Deck coverage: every catalogue micro-practice has a deck **except `grounding-touch`** ("Instant Calm Through Somatic Touch"). The plan routes all micro-practices to `/micro-practice/:id/cards`, so this one id has no deck to render — the "Practice not found"/wrong-layout case the user hit.

## AUDIT 4 — Practice detail page

`MicroPracticePlayer.tsx` resolves `staticPractice` from the catalogue first, falls back to `dbPractice`, then renders `practice.title` (line 318, plus completion metadata and alt text). No hardcoded overrides. So the detail page shows the catalogue title, which is why it read "Instant Calm Through Somatic Touch" while the deck screen read "Presence Through Grounding".

## AUDIT 5 — Plan slot titles

`TodayThreePriorities.tsx` renders `module.title` straight from the plan payload (server-side, sourced from `sanctuary_content.title`). `getContentById` is imported only for thumbnails, not titles. Consequence: plan cards agree with DB/catalogue and therefore disagree with every deck or list override above.

## AUDIT 6 — Homeless active DB ids (no catalogue entry, no page)

| Content ID | DB title |
|---|---|
| energy-reframe | Energy Through Reframe |
| kapalabhati-pranayama | Energy Surge Through Kapalabhati Pranayama |
| wim-hof-cold-fire | Wim Hof Cold Fire Activation |

All three are `is_active = true` and therefore selectable by the plan. `energy-reframe` is also a near-duplicate of the real `energy-through-reframe`.

## AUDIT 7 — Recalibrate-excluded but still active

`PauseOutcomePage.tsx`: `excludedIds = ['grounding-touch', 'pranayama-clarity']`, plus `pranayama-clarity` filtered out of both soundscape and practice lists. Both rows are `is_active = true` in the DB, so the plan can select content the user can never find in Recalibrate.

## Total discrepancy set to fix

1. Legacy/homeless active ids selectable by the plan: `grounding-touch`, `pranayama-clarity`, `energy-reframe`, `kapalabhati-pranayama`, `wim-hof-cold-fire`.
2. Three names per practice for `stoic-reflection` and `buddhist-phoenix`.
3. Three live list overrides that differ from DB (`deep-focus-monastic-resonance`, `sustained-focus-choir-harmonic`, `ina-night-fields`) plus 15 dead map keys.
4. Blind `/cards` routing for a micro-practice with no deck.
5. Five dead deck aliases.

## Fix plan (for approval)

### 1. One eligibility allowlist ("has a house")
- `src/data/contentSurfacing.ts`: `SURFACED_CONTENT_IDS` / `isSurfacedContent(id)`, derived from the catalogue minus the Recalibrate exclusions. The three outcome pages consume it instead of local `excludedIds`.
- Mirror it in `supabase/functions/_shared/plan/surfaced-content.ts`; the plan selector filters the content library through it.
- Migration: `is_active = false` for `grounding-touch`, `pranayama-clarity`, `energy-reframe`, `kapalabhati-pranayama`, `wim-hof-cold-fire`.

### 2. One display name per practice
`getDisplayTitle(id)` in the content module becomes the only title source for the Recalibrate card, the plan slot, the practice page, and the deck overview card. Seeded with the three live overrides above; dead map keys and dead deck aliases deleted. Two agreed names:
- `stoic-reflection` → **"Stoic Evening Clarity & Reflection"** everywhere (list, plan, page, deck), and `sanctuary_content.title` updated to match.
- `buddhist-phoenix` → keep the shipped "Resilience Through The Phoenix" in all four places, including the DB row.

### 3. Route each slot to the page that already exists
Export `hasCardDeck(id)` and use it in plan/JIT/ritual navigation: soundbath → `/soundscapes/:id`, guided-practice → `/guided-practices/:id`, micro-practice with deck → `/micro-practice/:id/cards`, otherwise `/micro-practice/:id`. The detail page's "Begin" stops bouncing to `/cards` without a deck, and the cards resolver stops substituting a queue item when the URL id already resolves.

### 4. Documented exception
`Evening Gratitude Note` / the Tiny Win reflection slot stays plan-native and exempt. Coach and Role-play sources get added to the allowlist file post-MVP.

## Verification
- Regenerate today's plan: no slot references a de-activated id; the Pause pick resolves to `presence-grounding-new`.
- Click each slot: lands on that practice's existing page, one identical title on plan card, Recalibrate list, practice page, and deck.
- Guard test: every plan-selectable id is in `SURFACED_CONTENT_IDS`, has a catalogue entry, and routes to a deck only if one exists. Typecheck + full suite pass.
