# Plan must only source practices that already have a home in Recalibrate

No new content, no new layouts, no renames invented. One allowlist, one display name per practice.

## What I verified

- Today's plan slots are `harmonic-calm`, `grounding-touch`, `fudoshin-immovable-mind` (from `mastery_plan_snapshots.horizon_modules`).
- `grounding-touch` ("Instant Calm Through Somatic Touch") is **explicitly hidden** from the Recalibrate Pause list (`excludedIds = ['grounding-touch', 'pranayama-clarity']`). It is legacy: the practice the user sees in Recalibrate is `presence-grounding-new` ("Presence Through Grounding"), which is a separate content item with its own card deck and the same hero image.
- The plan selector fetches every `sanctuary_content` row with `is_active = true`, so it can pick items Recalibrate never lists. `sanctuary_content` also contains rows with no catalogue entry at all (e.g. `energy-reframe`, `kapalabhati-pranayama`) — no house, no page.
- Naming is not shared: Recalibrate list titles run through per-page `getOutcomeFocusedTitle` / `titleMap` overrides, while the plan card and the practice page use the raw catalogue/DB title. Same practice, up to three different names.
- The plan routes all micro-practices to `/micro-practice/:id/cards` regardless of whether a card deck exists for that id, which is how a plan click can land on a different-looking screen than the practice's own page.

## The fix

### 1. One eligibility allowlist ("has a house")
Create a single source of truth listing the content ids actually surfaced by the shipped features (the three Recalibrate outcome pages), derived from the existing catalogue minus the existing hidden ids. No content is added or renamed.
- Frontend: `src/data/contentSurfacing.ts` exporting `SURFACED_CONTENT_IDS` and `isSurfacedContent(id)`, built from the same exclusion rules the Recalibrate pages already apply.
- Recalibrate pages switch to that helper instead of their local `excludedIds` arrays, so the list and the allowlist can never drift.
- Backend: mirror the same id list in `supabase/functions/_shared/plan/surfaced-content.ts`; the plan selector filters its content library through it after the `is_active` query.
- Database cleanup in the same change: set `is_active = false` for rows that have no Recalibrate home (`grounding-touch`, `pranayama-clarity`, plus DB-only rows with no catalogue entry such as `energy-reframe`, `kapalabhati-pranayama`). This stops legacy items being selected by any surface, not just the plan.

### 2. One display name per practice
Add `getDisplayTitle(id)` to the content module, seeded with the exact override strings already used by the Recalibrate pages (`titleMap` entries and the per-id titles in the Power-Up page). Then:
- Recalibrate cards call `getDisplayTitle`.
- Plan slot cards call `getDisplayTitle(contentId)` and fall back to the module title only for plan-native items.
- The practice detail page and the cards player headline use `getDisplayTitle`.
Result: plan card, Recalibrate list, and practice page always read the same name. No new copy is written, with one explicit rename below.

Named rename: `stoic-reflection` currently reads "Stoic Evening Reflection" in the list/plan and "Daily Virtue Alignment" inside its card deck. Both become **"Stoic Evening Clarity & Reflection"** — set once in `getDisplayTitle`, applied to the Recalibrate card, the plan slot, the practice page, and the deck's own title card, plus the `sanctuary_content.title` row so server-generated copy matches.


### 3. Route each slot to the page that already exists
Export a `hasCardDeck(id)` check from the cards player and use it in the plan/JIT/ritual navigation:
- soundbath → `/soundscapes/:id` (unchanged)
- guided-practice → `/guided-practices/:id` (unchanged)
- micro-practice with a deck → `/micro-practice/:id/cards`
- micro-practice without a deck → `/micro-practice/:id`
Also stop the detail page's "Begin" from bouncing to `/cards` when no deck exists, and stop the cards player's resolver from ever substituting a queue item when the URL id already resolves to a catalogue practice (that substitution is what can render another practice's deck).

### 4. Documented exception
`Evening Gratitude Note` (and the existing reflection/tiny-win slot) stays plan-native and is exempt from the allowlist. Coach/Role-play sources can be added to the allowlist file post-MVP without touching the selector.

## Verification

- Regenerate today's plan and confirm no slot references `grounding-touch`; the Pause recommendation resolves to `presence-grounding-new` (the item the user actually sees in Recalibrate).
- Click every slot in the preview: each lands on that practice's existing page, with the same title shown on the plan card, the Recalibrate list, and the practice page.
- Tests: a guard test asserting every plan-selectable id is in `SURFACED_CONTENT_IDS` and resolves to a catalogue entry; a routing test for deck vs detail; the existing suite plus typecheck must pass.
