# Plan-slot practice routing: send each practice to its own existing page

## What I found (verified)

- Today's plan snapshot slots carry contentIds `harmonic-calm`, `grounding-touch`, `fudoshin-immovable-mind` (confirmed in `mastery_plan_snapshots.horizon_modules`).
- `TodayThreePriorities` routes every non-soundbath, non-guided module to the **cards** player: `/micro-practice/<contentId>/cards`. It never checks whether a card deck exists for that practice.
- The card player only has decks for a fixed list of ids (`getCardsForPractice`). `grounding-touch` has **no** deck; `fudoshin-immovable-mind` and `presence-grounding-new` do.
- There are two distinct grounding practices in both catalogue and `sanctuary_content`:
  - `grounding-touch` — "Instant Calm Through Somatic Touch" (the page in screenshot 1)
  - `presence-grounding-new` — "Presence Through Grounding" (the cards deck in screenshot 2)
  They share the same hero image, which is why the cards screen looks like the same practice with different copy.
- The current card player, when no deck exists, redirects to `/micro-practice/<id>` (the existing detail page). But that page's "Begin" button sends card-capable practices back to `/micro-practice/<id>/cards`, which redirects straight back — so `grounding-touch` can bounce between the two views instead of playing.
- The resolver in the card player also falls back to the practice at the stored **queue index** when the URL id doesn't match a queue entry. That fallback can resolve a *different* practice than the URL asked for — the mechanism by which a grounding-touch click can end up showing another practice's deck.

## What I will change (frontend routing only, no new layouts)

1. **Single source of truth for "does this practice have a card deck".**
   Export the deck-id list from the cards player (e.g. `hasCardDeck(id)`) so navigation can ask before routing.

2. **Route at click time, not by redirect.**
   In `TodayThreePriorities` (and the same navigation in `DailyRitual` and `JitCarousel`, so all slots behave identically):
   - soundbath → `/soundscapes/:id` (unchanged)
   - guided-practice → `/guided-practices/:id` (unchanged)
   - micro-practice **with** a deck → `/micro-practice/:id/cards`
   - micro-practice **without** a deck → `/micro-practice/:id` (the existing practice page)
   No layout is changed; each practice simply lands on the page that already exists for it.

3. **Stop the bounce on the detail page.**
   In `MicroPracticePlayer`, "Begin" only navigates to `/cards` when a deck actually exists; otherwise it stays in the existing in-page flow and completes there.

4. **Never render the wrong practice.**
   In the card player's resolver: if the URL id resolves to a catalogue micro-practice, use it and stop. Queue-based ids remain only as a fallback for ids that do not resolve (coach-generated slots), and the queue-**index** fallback is used only when no id candidate resolves at all.

5. **Keep the safety net.**
   The existing "no deck → redirect to the detail page" guard stays, so any route reached directly still lands somewhere valid rather than "Practice not found".

## Verification

- Walk the three current plan slots in the preview: Tibetan bowls → soundscape page; Instant Calm Through Somatic Touch → its existing micro-practice page (4 steps, screenshot 1 layout); Fudoshin → its existing cards deck. Confirm the queue's next/previous navigation still advances after completion.
- Confirm no slot renders a different practice's title or deck.
- Typecheck plus the full test suite; add a small unit test asserting deck-vs-detail route selection and that a resolvable URL id is never overridden by queue entries.
