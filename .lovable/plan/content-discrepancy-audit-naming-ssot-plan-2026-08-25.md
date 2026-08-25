# Content discrepancy audit + naming SSOT plan

Audit findings first (read-only, verified this run), then the agreed fix.

## AUDIT 1 — DB vs static catalogue titles
43 active rows in `sanctuary_content`, 40 ids in `src/data/practicesAndSoundscapes.ts`. **Zero title mismatches** between DB and catalogue for ids present in both.

## AUDIT 2 — Recalibrate list overrides vs catalogue
Overrides live in `getOutcomeFocusedTitle` per outcome page. Micro-practices return `item.title`; soundbath/guided-practice run through a `titleMap` keyed on title.

| Content ID | Recalibrate list | Catalogue / DB | Mismatch |
|---|---|---|---|
| deep-focus-monastic-resonance | Sustained Focus with Monastic Chant | Deep Focus with Monastic Resonance | list override |
| sustained-focus-choir-harmonic | Sustained Focus with Cathedral Choir | Sustained Focus with Choir Harmonic | list override |
| ina-night-fields | Nature's Perfect Rhythm | Ina Night Fields (Tsukiyomi) | list override |
| bhramari-pranayama | (same) | (same) | no-op entry |
| trataka-flame-gaze | (same) | (same) | no-op entry |

15 dead map keys never fire (Tibetan Bowl Resonance, Pre-Mission Calm, Forest Bathing, Himalayan Mountain Monastery, Cathedral Choir Flow, Earth Resonance, Tonglen Compassion Practice, Vipassana Body Scan, Tactical Pause, Grounding Touch, Athletic Activation, Kapalabhati Pranayama, The Spartan Battle Breath, Box Breathing Reset, Wim Hof Power Breathing). The Presence-page mapping of "Stoic Evening Reflection" → "Daily Virtue Alignment" is also unreachable (micro-practices return early), so the list reads "Stoic Evening Reflection".

## AUDIT 3 — Card deck titles vs catalogue
24 of 29 deck cases match. Mismatches: `stoic-reflection` (deck "Daily Virtue Alignment" vs "Stoic Evening Reflection") and `buddhist-phoenix` (deck "Resilience Through The Phoenix" vs DB "Resilience Through the Buddhist Phoenix"). Five dead legacy deck aliases: `presence-grounding`, `release-exhale`, `stillness-gap`, `detachment-observer`, `softness-release`. Every catalogue micro-practice has a deck **except `grounding-touch`**.

## AUDIT 4 — Practice detail page
`MicroPracticePlayer.tsx` renders `practice.title` from the catalogue (falling back to DB). No overrides.

## AUDIT 5 — Plan slot titles
`TodayThreePriorities.tsx` renders `module.title` from the plan payload (DB titles). `getContentById` is used only for thumbnails. So plan cards match DB and therefore differ from every list/deck override.

## AUDIT 6 — Active DB ids with no frontend home
`energy-reframe`, `kapalabhati-pranayama`, `wim-hof-cold-fire` — active in DB, no catalogue entry, no page. Kept in the DB for future use, excluded from plan selection.

## AUDIT 7 — Excluded-but-active ids, and whether they have a home
- `grounding-touch` — catalogue entry and a detail page exist, but it is excluded from the Recalibrate Pause list and has no card deck. **Not user-visible → no home → excluded from the plan.**
- `pranayama-clarity` — catalogue entry (soundbath) exists but is filtered out of every Recalibrate list. **Not user-visible → no home → excluded from the plan.**

Both stay in the DB as `is_active = true`; they simply stop being plan-eligible.

## Fix plan

### 1. Frontend visibility, not `is_active`, decides plan eligibility
A practice is plan-eligible only if the user can actually reach it in the shipped frontend: it appears in a Recalibrate outcome list (or is a plan-native item, see 4). `is_active` in the DB no longer implies eligibility, so no rows are deactivated.

- `src/data/contentSurfacing.ts`: `SURFACED_CONTENT_IDS` / `isSurfacedContent(id)`, derived from the catalogue minus the Recalibrate exclusions (`grounding-touch`, `pranayama-clarity`). The three outcome pages consume it instead of their local `excludedIds`, so list and allowlist can't drift.
- Mirror the id list in `supabase/functions/_shared/plan/surfaced-content.ts`; the plan selector filters its content library through it after the `is_active` query. This drops `energy-reframe`, `kapalabhati-pranayama`, `wim-hof-cold-fire`, `grounding-touch`, `pranayama-clarity` from plan selection while leaving them in the database.

### 2. One display name per practice — the Recalibrate list name wins
`getDisplayTitle(id)` in the content module becomes the single title source for the Recalibrate card, plan slot, practice detail page, and deck overview card. Catalogue/DB titles are updated to the same string so server-generated copy matches. Dead titleMap keys and dead deck aliases are deleted.

Agreed names:

| Content ID | Name everywhere (list, plan, page, deck, DB) |
|---|---|
| deep-focus-monastic-resonance | Sustained Focus with Monastic Chant |
| sustained-focus-choir-harmonic | Grounding Focus with Cathedral Choir |
| ina-night-fields | Nature's Rhythm for Stillness |
| buddhist-phoenix | Resilience Through The Phoenix Approach |
| stoic-reflection | Stoic Evening Clarity & Reflection |

All other ids keep their current catalogue title, which already matches list, page, and deck.

### 3. Route each slot to the page that already exists
Export `hasCardDeck(id)`: soundbath → `/soundscapes/:id`, guided-practice → `/guided-practices/:id`, micro-practice with a deck → `/micro-practice/:id/cards`, micro-practice without a deck → `/micro-practice/:id`. The detail page's "Begin" stops bouncing to `/cards` when no deck exists, and the cards resolver stops substituting a queue item when the URL id already resolves to a catalogue practice.

### 4. Documented exception
`Evening Gratitude Note` / the Tiny Win reflection slot stays plan-native and exempt from the allowlist. Coach and Role-play sources get added to the allowlist file post-MVP, without touching the selector.

## Verification
- Regenerate today's plan: no slot references a non-surfaced id; the Pause pick resolves to `presence-grounding-new`.
- Click each slot: lands on that practice's existing page, with one identical title on plan card, Recalibrate list, practice page, and deck.
- Guard test: every plan-selectable id is in `SURFACED_CONTENT_IDS`, resolves in the catalogue, and routes to `/cards` only when a deck exists. Typecheck and the full suite pass.
