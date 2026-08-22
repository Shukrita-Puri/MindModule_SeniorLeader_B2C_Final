# Share Export + "When You Perform Best" Polish

## A. How sharing works today

Each detail card renders a share icon inside its title row. Tapping it snapshots the card's DOM node to a PNG (`html-to-image`), hides share-only chrome, expands horizontal scrollers so off-screen content is included, then hands the file to the iOS share sheet (WhatsApp, Mail, Messages, etc.). So it already shares more than the visible screen — but the expansion is where the current defects come from.

### A1. Washed-out charts on "When You Perform Best"

Cause (to confirm during the fix): the level pills carry a coloured `boxShadow` glow and each day column has an inline pinned pixel width. When the capture expands the scroller, the pinned widths no longer match the new layout, so the glow trails to the right of each pill and reads as a blurred/faded ghost. "What Drains Your Performance" has no glow and no pinned widths, so it exports cleanly.

Fix: add a share-capture mode that, for the duration of the snapshot only, drops the glow shadow, removes the pinned inline column widths, and lets the grid lay out naturally. Nothing changes in the live on-screen chart.

### A2. Full month in the export — recommendation

Recommended: **vertical calendar for the share export only.** During capture, the month strip re-renders as rows (one row per day: date label + Morning / Midday / Evening pills). This gives a portrait card that fits a phone screen in WhatsApp or email, shows the entire month with no cropping, keeps every pattern sentence underneath, and needs no horizontal scrolling by the recipient.

Why not the "T view" (visible week centred, rest of the month bleeding out sideways): it produces a very wide landscape image that WhatsApp downsizes to an unreadable strip on a phone, and the "outside the screen" framing reads as a rendering bug rather than a design choice to a PA opening it cold.

The on-screen experience is unchanged — horizontal week strip with scroll, exactly as today.

### A3. Two screenshots instead of one

"When You Perform Best" and "What Restores Your Performance" currently produce two images in the share sheet; "What Drains" produces one. The share call itself only ever passes a single file, so the duplicate comes from either a double invocation (two rapid activations of the handler) or the text payload being promoted to a second attachment. Fix: add an in-flight lock so a second capture cannot start while one is running, pass only the file plus a title (no separate text item when a file is attached), and verify each of the four cards produces exactly one attachment.

## B. Card content changes

1. **No-check-in days**: keep the white pill but give it a visible outline in the same tone used for the dashed future-day pills, so empty days read as empty rather than as background. Applies to all four tabs.

2. **Section 1 sentences**: widen check-in pattern coverage so window-level findings surface, e.g. "Evenings are your clearest Clarity window — 74% vs 41% in the morning." Templates, polarity words, tier tone (strong = definitive, emerging = "trending" / "pattern still forming"), the observation guard (n and gap thresholds), the ranking overrides and the caps all follow the spec already agreed. Section 1 stays scoped to the active tab's dimension.

3. **Headers**: remove the sparkle icons. Sections become:
   - **A. Mental Performance Patterns** — "Based on check-in data"
   - **B. Mental Performance Patterns** — "Based on physiology and demand data"

   Sub-headline type size goes up to a mobile-legible size (currently too small), header size and spacing tuned for iPhone width.

4. **Bullets**: drop the arrow glyphs. Use a small neutral dot marker aligned to the first line of text — standard mobile list treatment, no PowerPoint feel.

## Technical notes

- `src/utils/shareInsightCard.ts` — add capture-mode class toggling (`data-share-*` hooks), neutralise pill glow and pinned widths, single-flight lock, single-attachment share payload.
- `src/components/insights/LevelTrendCalendar.tsx` — outlined empty pills; vertical layout branch driven by a share-capture flag (presentation only, no data change).
- `src/components/insights/PerformanceRhythmCard.tsx` — A/B headers, typography, bullet markers, sparkle removal.
- `src/lib/insights/patternSentences.ts` — peak-window / cell-peak template coverage per the spec.
- Verification: unit tests for the sentence templates, plus an export run of all four cards checked for one attachment each, no wash-out, and the full month present.
