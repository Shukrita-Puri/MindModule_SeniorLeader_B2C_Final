# Static B&W Engraving Hero on /executive-home

Visual-only change. No DB, scoring, brief logic, or routing touched.

## What changes

The top hero on `/executive-home` currently loops an MP4 (`/all-visuals/videos/{tier}-{timeOfDay}.mp4`) plus divergence variants (`recovery-*`, `masked-*`). It looks subtly dynamic but isn't — and on iOS it adds load + perceived motion.

Replace it with a **static B&W woodcut/engraving image**, in the same Active Calm aesthetic as the onboarding hero and Reset Studio:
- Pure black & white (no colour wash)
- Nature-true scenes (mountains, horizon, mist, sky), no human figures
- 19th-century scientific engraving / woodcut linework
- One still per tier × time-of-day (same matrix as today's videos), plus the two divergence variants

## Variant matrix (kept identical to today)

```text
tiers:        depleted | managing | strong | peak | very_high | default
timeOfDay:    morning  | afternoon | evening
divergence:   recovery-{morning|afternoon|evening}
              masked-{morning|afternoon|evening}
```

Mapping rules stay byte-for-byte the same as the current `heroVideoUrl` useMemo — only the file extension/path changes.

## Files affected

1. **`src/pages/ExecutiveHome.tsx`**
   - Rename `heroVideoUrl` → `heroImageUrl`. Map to `/all-visuals/images/{tier}-{timeOfDay}.webp` (with `.jpg` fallback handled by browser via single `<img>` tag — we'll ship `.webp` only since we control the assets).
   - Replace the `<video … autoPlay loop muted playsInline preload="auto">` block with a single `<img>` element using the same fade-in pattern (`onLoad` → opacity 0.4) so the existing tier gradient overlay and bottom fade keep working unchanged.
   - Delete `videoRef`, `videoFadedIn`, `fadeInVideo`'s video-specific branches; keep an equivalent `fadeInImage` ref to preserve the soft entrance.
   - Keep `getTierGradient()`, the bottom `bg-gradient-to-b from-background/5 via-background/30 to-background` overlay, header layout, greeting, and everything below untouched.

2. **`public/all-visuals/images/`** — new directory. Drop in 24 stills:
   - `{depleted,managing,strong,peak,very_high,default}-{morning,afternoon,evening}.webp` (18)
   - `recovery-{morning,afternoon,evening}.webp` (3)
   - `masked-{morning,afternoon,evening}.webp` (3)
   - Generated via the existing Remotion / engraving pipeline used for onboarding so the line-art style matches exactly. Each scene is the same composition currently used in the corresponding video, but rendered as a single still frame at the most "settled" moment.

3. **Memory update** — refresh `mem://style/active-calm-visual-language/hero-visual-system-v3` to reflect static stills instead of loops (single line edit, same scene mapping).

## What is NOT touched

- DB / migrations / RLS
- `compute-outer-readiness`, `generate-mastery-plan`, any edge function
- Brief, pills, scoring, plan ledger
- `useOuterReadiness`, `persistentBriefCache`, refetch hardening
- Bottom navigation, greeting, headline, brief card, priorities
- The existing MP4s in `public/all-visuals/videos/` stay on disk (unreferenced) so we can revert instantly by swapping the component back

## Acceptance

- Hero shows a still B&W engraving on every load — no playback, no flicker
- Tier change (e.g. depleted → strong) cross-fades to the matching still using the same opacity transition as today
- Divergence (`recovery` / `masked`) overrides still apply
- No `<video>` element in the DOM on `/executive-home`
- Network tab shows one image request, no `.mp4` fetch
- iOS Safari / Capacitor: zero motion, no autoplay battery cost
