
# /executive-home MRS redesign

Scope: visual + layout refinement of `MrsPage`, a small data-only addition for the weekly delta (no change to MRS scoring), and relocation of the deep trend chart into the existing Insights trajectory card. Brief and Plan pages untouched. Brief/MRS scoring untouched.

## 1. Always land on the MRS page

`ExecutiveHome.tsx` already passes `initialIndex={0}` to `HomeSwipeShell`, but the horizontal scroller can retain a non-zero `scrollLeft` after navigation/back-forward, leaving the user on Brief or Plan.

- In `HomeSwipeShell`, force `scrollerRef.current.scrollLeft = 0` on every mount (not just first) and on `pathname` change, so visiting `/executive-home` always snaps back to page 0 (MRS).
- Keep snap/swipe behaviour unchanged.

## 2. MRS page structural redesign

File: `src/components/home/mrs/MrsPage.tsx`.

New vertical order, single column, mobile-first:

```text
[ MENTAL READINESS SCORE ]   ← bold eyebrow, same style as the
                               Performance Readiness Brief eyebrow
        ◯ 50  out of 100      ← existing MrsGauge (kept)
          Managing            ← tier label only (no "Current tier ·")
           refined            ← small caption: "baseline" or "refined"
                               based on outerBrief.readinessState
                               (fallback "baseline" when no check-in)

  [  Take assessment  ]       ← left-aligned saffron pulsing pill
                               (no icon)

  ╭──────────── Half-Dial Trend ───────────╮
  │   glass half-dial, green fill          │
  │           +4 pts                       │
  │     vs last week · baseline            │
  ╰────────────────────────────────────────╯
```

Removed from this page:
- The old "Vs your baseline" Lower/Current/Higher slider card.
- The old line-chart `Trend` card with `1W / 1M / 6M` toggle (relocated — see §5).
- "Building your trend history" italic caption beneath the gauge.
- The `CURRENT TIER · MANAGING` footer line.

Preserved:
- `useOuterReadiness` as data source for score + tier + readinessState (no change to MRS computation pipeline).
- Hero, greeting, swipe shell, brief, plan — untouched.

### 2a. Title styling
Replace the current eyebrow `text-[11px] uppercase tracking-[0.22em] text-muted-foreground` with the same treatment used by the brief eyebrow (`text-[13px] font-semibold tracking-[0.14em] uppercase text-foreground`), so "MENTAL READINESS SCORE" reads as a section title, not a faint label.

### 2b. Tier color fix
`MrsGauge.tierColorVar` currently maps `moderate / manageable` to `--tier-moderate` (amber). The displayed tier from the brief is `"managing"`, which falls through to `--tier-neutral` (grey) — the bug shown in the screenshot. Per `docs/MRS_V3_SPECIFICATION.md` §6 (50–64 = Mixed → Amber family), add explicit cases for the MRS v3 tier labels and their displayed synonyms:

| Tier value (any-case) | Token |
|---|---|
| `peak`, `optimal`, `strong` | `--tier-strong` |
| `mixed`, `moderate`, `manageable`, `managing` | `--tier-moderate` |
| `compromised`, `low`, `depleted` | `--tier-low` |
| anything else / null | `--tier-neutral` |

Normalize to lowercase before matching. The same map will be reused by the half-dial and the "Managing" text under the score.

### 2c. Tier + state caption
Below the gauge:
- Line 1: tier label only, e.g. `Managing` — title-case, tier color, medium weight, ~`text-base` so it reads as a status, not a footer.
- Line 2: smaller muted caption, `baseline` when `readinessState !== 'refined'`, `refined` when the user has completed a check-in today.

## 3. Take Assessment pill

- Remove `ClipboardCheck` icon entirely.
- Left-align inside the page max-width container (replace `flex-col items-center text-center` for this row only).
- Saffron background using the existing brand saffron token (per `mem://brand/color-palette/button-roles-v3`): use the existing `bg-saffron` / `text-saffron-foreground` utilities if present, otherwise add a one-line token alias in `index.css` referring to the existing `--brand-saffron` / `--saffron` HSL var. No new colors.
- Pulsing: subtle Tailwind `animate-pulse` on a soft saffron halo ring (`ring-2 ring-[hsl(var(--saffron)/0.35)]`) so the pill itself stays readable; respect `prefers-reduced-motion`.
- Copy: `Take assessment` when score exists, `Check in to generate your score` when not.
- Action unchanged: `navigate('/daily-check-in')`.

## 4. Half-dial weekly delta (replaces "Vs your baseline" card)

New component: `src/components/home/mrs/WeeklyDeltaDial.tsx`.

Visual: 180° glass half-dial, ~220×120, matching the reference aesthetic.
- Outer frosted track (`bg-white/30 backdrop-blur` + soft inner shadow).
- Filled green arc proportional to `|delta|` capped at 20 pts → full arc.
- Center label: `+4 pts` (or `−3 pts`), large tabular numerals.
- Sub-caption: `vs last week · baseline` or `vs last week · refined`.
- Delta text color (per user spec):
  - `> +1`  → green `hsl(var(--tier-strong))`
  - `< −1`  → red `hsl(var(--tier-low))`
  - `−1..+1` → neutral muted
- Null/insufficient data → render placeholder dial with caption `Building your weekly trend` (no number).

### Data source — new hook `useWeeklyMrsDelta`
File: `src/hooks/useWeeklyMrsDelta.ts`.

Backed by a new lightweight action on the existing `mental-fitness-scores` edge function: `GET_WEEKLY_DELTA`. The function reads `daily_context_snapshot` for the calling user via service role (RLS-safe; user is authenticated via Auth0/Supabase JWT as today's actions are).

SQL the edge function will run (two windows, Monday-anchored in user-local time passed from client):

```sql
SELECT local_date,
       readiness_score_baseline,
       readiness_score_refined
FROM daily_context_snapshot
WHERE user_id = :uid
  AND local_date >= :last_week_monday
  AND local_date <= :today;
```

Client computes (per the user-provided formulas, unchanged):

```text
baselineWeekAvg_this = AVG(baseline)  where local_date in [this_mon, today]
baselineWeekAvg_last = AVG(baseline)  where local_date in [last_mon, last_sun]
baselineWeekDelta    = ROUND(this − last)

refinedWeekAvg_this  = AVG(refined NOT NULL) over same windows
refinedWeekAvg_last  = AVG(refined NOT NULL) over same windows
refinedWeekDelta     = ROUND(this − last)

shownDelta = readiness_state(today) === 'refined' ? refinedWeekDelta : baselineWeekDelta
shownMode  = same — drives the "baseline" / "refined" caption
```

Edge cases (per spec):
- Last-week AVG missing → delta = null → dial shows "Building your weekly trend".
- Refined never recorded → falls back to baseline delta automatically.
- No data at all → null state.

This hook is independent of `useMrsTrend`; the MRS scoring pipeline and `compute-inner-readiness` are not touched.

## 5. Move deep trend chart into Insights

Out of scope from the home page but required by the request.

File: `src/components/insights/InnerReadinessDial.tsx` (the "Your Performance Trajectory · Inner Readiness Streak · This Week" card).

- Wrap the existing card body in a button/disclosure. Default state: today's card as it is now.
- On click, expand a panel below it that mounts the existing `MrsSparkline` + `1W / 1M / 6M` toggle (extracted from the old MrsPage block — same `useMrsTrend` hook, no new data path).
- State: simple local `useState<boolean>`; remember last open via `sessionStorage` key `insights.trajectory.expanded` so navigating in/out of Insights feels stable.
- A11y: `aria-expanded`, chevron icon, keyboard-toggleable.

Nothing else on Insights changes.

## Technical details

- Files added:
  - `src/components/home/mrs/WeeklyDeltaDial.tsx`
  - `src/hooks/useWeeklyMrsDelta.ts`
- Files modified:
  - `src/components/home/mrs/MrsPage.tsx` — full restructure per §2.
  - `src/components/home/mrs/MrsGauge.tsx` — tier color map per §2b only.
  - `src/components/home/swipe/HomeSwipeShell.tsx` — force `scrollLeft = 0` on mount/pathname change.
  - `src/components/insights/InnerReadinessDial.tsx` — wrap content in disclosure + mount sparkline panel.
  - `supabase/functions/mental-fitness-scores/index.ts` — add `GET_WEEKLY_DELTA` action reading `daily_context_snapshot`.
  - `src/index.css` — only if a `--saffron` token alias is needed (single line).
- Files removed: none.
- Hooks/components retained for fallback but no longer mounted on MrsPage: `BaselineBar`, the `useMrsTrend`-driven `Trend` block (now in Insights), `MrsSparkline` (mounted in Insights instead).
- No MRS scoring change. No brief change. No plan change. No nav change.
- Brand: HSL semantic tokens only; no raw hex.
- Motion: `animate-pulse` on saffron ring; CSS transition on dial arc; respect `prefers-reduced-motion`.

## QA checklist
- Cold start (no score / no history): MRS = "—", tier hidden gracefully, dial shows "Building your weekly trend", CTA reads "Check in to generate your score".
- Baseline only (wearable user, no check-in today): tier color correct, caption "baseline", dial shows baseline weekly delta.
- Refined (check-in today): caption "refined", dial uses refined delta.
- "Managing" tier renders amber, not grey.
- Pill is left-aligned, saffron, no icon, pulses, navigates to `/daily-check-in`.
- Reloading or navigating back to `/executive-home` always lands on the MRS page.
- Insights trajectory card: click to reveal the sparkline + 1W/1M/6M toggle; data identical to the old MrsPage chart.
- No regressions to Brief or Plan pages, swipe gestures, or sidebar.
