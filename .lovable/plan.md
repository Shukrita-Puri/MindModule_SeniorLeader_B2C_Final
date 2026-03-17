

# Root Cause: Hero Video Not Showing on Mobile (Capacitor/iOS)

## The Bug

The hero visual relies on `<video autoPlay>` with `style={{ opacity: 0 }}` that only transitions to `opacity: 0.4` when the `onCanPlay` event fires. On iOS (WKWebView used by Capacitor), **autoplay of video is heavily restricted** — even with `muted` and `playsInline`, WKWebView often blocks autoplay or delays the `canplay` event indefinitely, especially on cellular connections or when the app first loads.

**Result:** The video never fires `onCanPlay` → opacity stays at `0` → the tier gradient behind it (`from-blue-900/30` etc.) is extremely subtle (30% opacity on a dark color) → the hero area appears blank/white.

Two compounding factors:

1. **iOS WKWebView autoplay restrictions**: `canplay` may never fire if the video doesn't start loading, so the fade-in callback never executes.
2. **Gradient too subtle as fallback**: The tier gradient uses very low opacity values (`/25`, `/30`) so even when visible, it's barely perceptible without the video behind it.

## Fix

1. **Make the gradient fallback visible enough to stand alone** — increase gradient opacity so the hero looks intentional even without video.
2. **Add an `onLoadedData` fallback** alongside `onCanPlay` — `loadeddata` fires more reliably on iOS.
3. **Add a timeout fallback** — if neither event fires within 3 seconds, fade the video in anyway (or keep the gradient as the visual).
4. **Boost gradient opacities** in `TIER_GRADIENTS` from `/25-30` to `/40-50` so the ambient color is visible as a standalone hero even if video never loads.

### Files to change

| File | Change |
|------|--------|
| `src/pages/ExecutiveHome.tsx` | Add `onLoadedData` handler, add 3s timeout fallback to set gradient visible, increase `TIER_GRADIENTS` opacity values |

