## Scope
UI-only changes to `/insights`. No edge functions, scoring, queries, or data shape touched. **Item 4 (chart consistency) is explicitly excluded** — existing chart treatments stay as-is.

## 1. Suppress "Your Momentum" card
In `src/pages/Insights.tsx`, wrap the entire "Your Momentum" `LuxuryInsightCard` block (Patterns tab, ~lines 1035–1170) in `{false && (...)}` — same pattern used for `DailyShowUpCalendar`. Imports, state, and fetch logic stay intact for easy re-enable.

## 2. Apple Health-style stacked cards + per-card detail pages

**New behaviour:** `/insights` becomes a single vertical stack of **collapsed summary rows** (icon, eyebrow, title, one-line value, chevron). Tapping a row navigates to a dedicated page that renders the full existing card unchanged.

**Stack order (Progress + Patterns tabs merged into one feed):**
1. Leadership Patterns → `/insights/leadership-patterns`
2. When You Perform Best (renamed from Performance Rhythm) → `/insights/performance-rhythm`
3. What Drains Your Performance (renamed from Performance Causality) → `/insights/performance-causality`
4. What Restores Your Performance (renamed from Practice Effectiveness) → `/insights/practice-effectiveness`

Two-tab bar (Progress / Patterns) removed.

**Implementation:**
- New `src/components/insights/InsightSummaryRow.tsx` — collapsed row primitive (presentational only).
- New `src/pages/InsightDetail.tsx` — route `/insights/:cardId`. Resolves cardId → renders the matching existing card component verbatim. Header has back chevron, centered title, and share button (see §3).
- Route registered in `src/App.tsx` and added to `PILL_NAV_VISIBLE_ROUTES`.
- `Insights.tsx` becomes a thin stack of `InsightSummaryRow`s hydrated from the already-fetched `statePatterns` / existing prefetched data. Existing fetch, caching, and loader logic stay in place; they now feed the one-line summaries.

## 3. Native iOS sharing per card view

Detail page header gets a share icon (top-right, matching Apple Health placement).

**Behaviour:** Tapping share opens the native iOS Share Sheet (AirDrop, Messages, Mail, WhatsApp, Notes, Copy — all native, no per-channel UI). Payload = rendered PNG snapshot of the currently visible card + short text caption (e.g. "My Mind Module — When I Perform Best").

**Implementation:**
- New `src/utils/shareInsightCard.ts`:
  - Uses `html-to-image` to snapshot the card DOM node → PNG blob.
  - Native (`Capacitor.isNativePlatform()`): writes blob to temp file via `@capacitor/filesystem`, then `@capacitor/share` with `files: [uri]`, `text`, `title`. iOS handles channel selection natively.
  - Web fallback: `navigator.share({ files })` if available, else clipboard copy + toast.
- Deps to install: `@capacitor/share`, `@capacitor/filesystem`, `html-to-image`. User runs `npx cap sync` after pulling.

## 5. Renames (copy only)

| Old | New |
|---|---|
| Practice Effectiveness | What Restores Your Performance |
| Performance Causality | What Drains Your Performance |
| Performance Rhythm / Mind Readiness | When You Perform Best |

Edits: card header strings + `InsightInfoModal` titles + new detail page titles. Component file names unchanged. No logic touched.

## Reminder: previously suppressed in Causality card
Per `mem/features/insights/performance-causality.md`: **Sleep Disruption** and **Recovery Cost** matrices are computed by the engine (`ENGINE_VERSION = 3`) and stored in payload, but the card currently renders only **Stress Load** and **Burnout Risk** tabs. The other two were intentionally held back for a follow-up.

## Files touched
- `src/pages/Insights.tsx` — collapse to stacked summary rows, remove tab bar, suppress Momentum, apply renames.
- `src/pages/InsightDetail.tsx` *(new)* — per-card detail page with share button.
- `src/App.tsx` — add `/insights/:cardId` route + nav visibility.
- `src/components/insights/InsightSummaryRow.tsx` *(new)*.
- `src/components/insights/PracticeEffectiveness.tsx` — header rename only.
- `src/components/insights/PerformanceCausalityCard.tsx` — header rename only.
- `src/components/insights/PerformanceRhythmCard.tsx` — header rename only.
- `src/utils/shareInsightCard.ts` *(new)*.
- `package.json` — add `@capacitor/share`, `@capacitor/filesystem`, `html-to-image`.

No edge function, migration, or backend changes. Chart styles unchanged.
