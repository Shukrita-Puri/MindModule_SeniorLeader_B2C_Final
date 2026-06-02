## Root cause

Both `SoundscapePlayer.tsx` (line 518) and `GuidedPracticePlayer.tsx` (line 1095, audio view) wrap the full-screen hero in:

```tsx
<div className="fixed inset-0 -z-10">
  <img src={contentData.thumbnail} ... />
  <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-taupe-rich/30 to-black/50" />
</div>
```

The app's `body` has `@apply bg-background` (white in light mode). A `fixed` element with `-z-10` is painted **behind** any opaque ancestor that establishes a stacking context, including the root `<div id="root">` / body background. Result:

- The per-practice thumbnail `<img>` is hidden behind the white app background → user only sees white.
- The dark gradient overlay is hidden too → white text (`text-white drop-shadow-…`) sits on a white background and becomes effectively invisible (the faint ghosting in the screenshot is only the drop-shadow leaking through).
- This affects **every** Soundscape (pause / flow / power-up) and **every** audio-view Guided Practice — exactly the symptom reported.

It is **not** a missing-asset issue: `src/assets/recalibrate/pause/harmonic-calm.jpg` exists, is imported via Vite in `practicesAndSoundscapes.ts`, and is bundled correctly. The image simply never gets a chance to paint.

## Guiding principle (per user)

Every Soundscape and Guided Practice **must keep using its own dedicated visual** as authored in `practicesAndSoundscapes.ts` (`thumbnail` field). No single visual is ever shared across practices. Per-category fallbacks only engage in the rare case the practice's own image fails to load (e.g., network error, broken URL), so the page still has dark contrast for text — never as the primary visual.

## Fix (UI-only, minimal)

### 1. New shared component `src/components/recalibrate/PlayerBackground.tsx`

A single hardened background used by both players. The image source is **always** the practice's own `thumbnail`. Responsibilities:

- Wrapper `<div className="absolute inset-0 z-0 bg-stone-900 overflow-hidden">` — no negative z-index; dark fallback color guarantees text contrast during load.
- Primary `<img src={thumbnail}>` (the practice's own visual) with:
  - `loading="eager"`, `fetchPriority="high"`, `decoding="async"` so the hero paints quickly.
  - `alt=""` (decorative — the visible H1 is the real title).
  - Existing per-category color filter (`saturate/sepia/hue-rotate/brightness/contrast`) preserved.
  - `onLoad` flips `loaded=true`; image fades in over the dark backdrop.
  - `onError` swaps **only this single `<img>`** to a per-category bundled fallback so the page still has a usable backdrop:
    - `pause` → `soundscape-pause-visual.jpg`
    - `presence` / `flow` → `soundscape-flow-visual.jpg`
    - `power-up` → `soundscape-renewal-visual.jpg`
  - Fallback is per-render only; it never overwrites the practice's authored `thumbnail` in data and never appears unless the practice's own asset errors.
- Always-on dark gradient overlay (`from-black/20 via-taupe-rich/30 to-black/50`) so white text stays readable in all states (loading, loaded, errored-to-fallback).

Props: `{ thumbnail: string; category: 'pause' | 'power-up' | 'presence' | 'flow' }`.

### 2. Wire it into both players (no change to which image each practice uses)

- `src/pages/SoundscapePlayer.tsx` (~line 516–526): replace the `fixed inset-0 -z-10` block with `<PlayerBackground thumbnail={soundscape.thumbnail} category={soundscape.category} />`. Add `relative z-10` to the content blocks (`!hasStarted` initial state, playing-state header, bottom control bar) so they stack above the background.
- `src/pages/GuidedPracticePlayer.tsx` (~line 1093–1103, audio view): same replacement, passing `contentData.thumbnail` (the practice's own visual) and `practice.category`. Same `relative z-10` adjustment on inner content.

Each practice continues to render its own dedicated `thumbnail` from `practicesAndSoundscapes.ts` — the change is purely how that image is stacked and how a load failure is contained.

### 3. Guard against future regressions

- Centralising the background in `PlayerBackground` means any future Recalibrate player drops in the same component and inherits: correct stacking, dark fallback color, eager loading of the practice's own visual, always-on dark overlay.
- JSDoc on `PlayerBackground` explicitly forbids negative `z-index` and documents that the per-category image is **only** an error fallback, never the default.

## Out of scope

- No backend, data, audio, navigation, queue, or scoring changes.
- No edits to `practicesAndSoundscapes.ts` content, thumbnail mappings, or imports — each practice's authored visual stays exactly as today.
- No design-system token changes.

## Files touched

- **New**: `src/components/recalibrate/PlayerBackground.tsx`
- **Edited**: `src/pages/SoundscapePlayer.tsx` (background block + `z-10` on content wrappers)
- **Edited**: `src/pages/GuidedPracticePlayer.tsx` (audio-view background block + `z-10` on content wrappers)

## QA checklist after implementation

1. Visit `/soundscapes/harmonic-calm` → the authored `harmonic-calm.jpg` is visible, title + subtitle clearly readable.
2. Spot-check one practice per category (pause, presence/flow, power-up) for both Soundscapes and audio Guided Practices → each shows its **own** unique authored visual, not a shared one.
3. Force-break one practice's thumbnail (DevTools → block the asset URL) → only that page falls back to the category image; all other practices still render their own visuals; text remains readable.
4. Light and dark theme both render correctly.
5. No regression to playback controls, queue progress, rating modal, or back navigation.
